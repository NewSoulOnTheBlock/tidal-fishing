// Telegram Mini App integration.
//
// Tidal runs as a normal PWA in the browser AND, unchanged, inside Telegram's
// in-app webview as a Mini App. Everything in this module is a guarded no-op
// when we are NOT inside Telegram, so the same bundle ships to both targets.
//
// The Telegram WebApp SDK (telegram-web-app.js) is loaded synchronously in
// index.html's <head>, so `window.Telegram.WebApp` exists by the time this
// module's init runs. Note: that global also exists when the page is opened in
// a normal browser (platform === "unknown"); isTelegram() distinguishes the two.

const THEME_BG = "#0a1722"; // deep-water background, matches the app shell

function WA() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

// True only when actually running inside a Telegram client. The SDK reports a
// real platform string (android/ios/tdesktop/weba/macos/…) there; outside
// Telegram it is "unknown" and initData is empty.
export function isTelegram() {
  const wa = WA();
  if (!wa) return false;
  const platform = wa.platform || "unknown";
  return platform !== "unknown" || !!wa.initData;
}

// Best-effort call: many WebApp methods are version-gated and throw
// WebAppMethodUnsupported on older Telegram clients. Never let that bubble.
function tryWA(fn) {
  try {
    return fn();
  } catch (e) {
    // Silent — unsupported on this client version. Core play is unaffected.
    return undefined;
  }
}

// The Telegram user behind this session (id/username/first_name/last_name…),
// or null. Read from initDataUnsafe (convenient but unsigned; for trusted
// identity the raw initData string must be HMAC-verified server-side).
export function tgUser() {
  return WA()?.initDataUnsafe?.user || null;
}

// Raw, signed init data string for optional server-side validation.
export function tgInitData() {
  return WA()?.initData || "";
}

// Derive a clean default angler name from the Telegram profile. Prefers the
// @username, falls back to the first name. Sanitized to match onboarding rules
// (no markup, trimmed, length-capped). Returns "" if nothing usable.
export function tgSuggestedName() {
  const u = tgUser();
  if (!u) return "";
  let raw = (u.username || u.first_name || "").toString();
  raw = raw
    .replace(/[\u0000-\u001f<>]/g, "") // strip control chars + angle brackets
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
  return raw.length >= 2 ? raw : "";
}

// Haptic feedback. `kind` accepts impact styles (light/medium/heavy/rigid/soft),
// notification types (success/warning/error), or "select".
export function tgHaptic(kind = "light") {
  const wa = WA();
  if (!wa?.HapticFeedback) return;
  const h = wa.HapticFeedback;
  tryWA(() => {
    switch (kind) {
      case "success":
      case "warning":
      case "error":
        h.notificationOccurred(kind);
        break;
      case "select":
        h.selectionChanged();
        break;
      default:
        h.impactOccurred(kind);
    }
  });
}

// Open an external link without breaking out of the Telegram webview.
// target=_blank / window.open are unreliable inside Telegram; WebApp.openLink
// (or openTelegramLink for t.me URLs) is the supported path.
export function tgOpenLink(url) {
  const wa = WA();
  if (!wa || !url) {
    if (url) window.open(url, "_blank", "noopener");
    return;
  }
  tryWA(() => {
    if (/^https?:\/\/t\.me\//i.test(url) && wa.openTelegramLink) {
      wa.openTelegramLink(url);
    } else {
      wa.openLink(url, { try_instant_view: false });
    }
  });
}

// Telegram's hardware/Back button — used as a native "close this screen"
// affordance. Toggled from main.js as the player opens/closes full screens.
let backHandler = null;
export function tgSetBackButton(visible, onClick) {
  const wa = WA();
  if (!wa?.BackButton) return;
  tryWA(() => {
    if (onClick && onClick !== backHandler) {
      if (backHandler) wa.BackButton.offClick(backHandler);
      backHandler = onClick;
      wa.BackButton.onClick(backHandler);
    }
    if (visible) wa.BackButton.show();
    else wa.BackButton.hide();
  });
}

// Push Telegram's reported safe-area + content-safe-area insets into CSS custom
// properties so HUD corners clear the device notch AND Telegram's own header.
function applySafeArea() {
  const wa = WA();
  if (!wa) return;
  const root = document.documentElement;
  const sa = wa.safeAreaInset || {};
  const ca = wa.contentSafeAreaInset || {};
  const top = Math.max(0, (sa.top || 0) + (ca.top || 0));
  const bottom = Math.max(0, (sa.bottom || 0) + (ca.bottom || 0));
  const left = Math.max(0, (sa.left || 0) + (ca.left || 0));
  const right = Math.max(0, (sa.right || 0) + (ca.right || 0));
  root.style.setProperty("--tg-safe-top", `${top}px`);
  root.style.setProperty("--tg-safe-bottom", `${bottom}px`);
  root.style.setProperty("--tg-safe-left", `${left}px`);
  root.style.setProperty("--tg-safe-right", `${right}px`);
}

// Route any target=_blank external link through WebApp.openLink. Capture phase
// so it runs before the browser's default navigation.
function wireExternalLinks() {
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const opensNew = a.target === "_blank" || a.hasAttribute("data-external");
      if (opensNew && /^https?:\/\//i.test(href)) {
        e.preventDefault();
        tgOpenLink(href);
      }
    },
    true
  );
}

let inited = false;

// Initialize the Mini App. Safe to call unconditionally; no-ops outside
// Telegram. Returns true when we actually configured a Telegram session.
export function initTelegram() {
  if (inited) return isTelegram();
  inited = true;

  const wa = WA();
  if (!wa || !isTelegram()) return false;

  // Mark the DOM so CSS can apply Telegram-only layout (safe areas, etc.).
  document.documentElement.classList.add("tg");
  document.body?.classList.add("tg");

  tryWA(() => wa.ready());
  tryWA(() => wa.expand());
  tryWA(() => wa.setHeaderColor(THEME_BG));
  tryWA(() => wa.setBackgroundColor(THEME_BG));
  // Fishing relies on vertical drag gestures; without this, swiping down would
  // minimize/close the Mini App instead of casting/reeling.
  tryWA(() => wa.disableVerticalSwipes());
  // Guard against an accidental close mid-session losing unsaved progress.
  tryWA(() => wa.enableClosingConfirmation());

  applySafeArea();
  wireExternalLinks();

  // Keep CSS insets in sync as the viewport / safe areas change.
  tryWA(() => wa.onEvent("viewportChanged", applySafeArea));
  tryWA(() => wa.onEvent("safeAreaChanged", applySafeArea));
  tryWA(() => wa.onEvent("contentSafeAreaChanged", applySafeArea));

  console.log(`[telegram] Mini App initialized (platform=${wa.platform})`);
  return true;
}
