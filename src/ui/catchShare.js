// Records a short, branded video clip of the animated voxel fish so the catch
// can be SHARED as media (the fish is visible in the post), not just text.
//
// Why a video file: Twitter/X web-intent URLs cannot attach media — the only
// way to attach the fish to a social post from the browser is the Web Share API
// with a File. So we render the spinning voxel fish to an offscreen canvas,
// composite the catch details + watermark on top, capture it with MediaRecorder,
// and hand the resulting clip to navigator.share().

import { createFishPreview } from "./fishPreview.js";

// Prefer MP4/H.264 (what X accepts natively); fall back to WebM where MP4
// muxing isn't available in MediaRecorder (e.g. Firefox).
function pickVideoMime() {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* isTypeSupported can throw on bad input — ignore */
    }
  }
  return "";
}

const extFor = (mime) => (mime.includes("mp4") ? "mp4" : "webm");

function shrinkFont(ctx, text, weight, startPx, maxWidth) {
  let px = startPx;
  do {
    ctx.font = `${weight} ${px}px 'Segoe UI', system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || px <= 16) break;
    px -= 2;
  } while (px > 16);
  return px;
}

/**
 * Record a square clip of the spinning voxel fish with the catch details burned
 * in. Owns a temporary high-res preview (its own WebGL context) and disposes it
 * when finished, so it never disturbs the on-screen card preview.
 *
 * @param {string} speciesId
 * @param {object} info { name, rarityLabel, rarityColor, statsText, valueText, durationMs }
 * @returns {Promise<{ blob: Blob, ext: string, type: string } | null>} null when
 *          MediaRecorder/WebGL is unavailable — caller should fall back to an image.
 */
export async function recordCatchClip(speciesId, info = {}) {
  const mime = pickVideoMime();
  if (!mime) return null;

  const SIZE = 600;
  const preview = createFishPreview(speciesId, { width: SIZE, height: SIZE, preserveBuffer: true });
  if (!preview) return null;

  const {
    name = "Fish",
    rarityLabel = "",
    rarityColor = "#58a6ff",
    statsText = "",
    valueText = "",
    durationMs = 3500,
  } = info;

  const composite = document.createElement("canvas");
  composite.width = SIZE;
  composite.height = SIZE;
  const ctx = composite.getContext("2d");

  function drawFrame() {
    // Opaque rarity-tinted background (video has no alpha channel).
    const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
    bg.addColorStop(0, "#0c1a28");
    bg.addColorStop(1, "#06101a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Soft rarity glow behind the fish.
    ctx.save();
    ctx.globalAlpha = 0.28;
    const glow = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 30, SIZE / 2, SIZE / 2, SIZE * 0.55);
    glow.addColorStop(0, rarityColor);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();

    // The live spinning voxel fish (preserveDrawingBuffer keeps it readable).
    try {
      ctx.drawImage(preview.canvas, 0, 0, SIZE, SIZE);
    } catch {
      /* context not ready on the first frame — background still shows */
    }

    // Top band + name + rarity.
    const topBand = ctx.createLinearGradient(0, 0, 0, 150);
    topBand.addColorStop(0, "rgba(6,16,26,0.92)");
    topBand.addColorStop(1, "rgba(6,16,26,0)");
    ctx.fillStyle = topBand;
    ctx.fillRect(0, 0, SIZE, 150);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (rarityLabel) {
      ctx.font = "800 22px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = rarityColor;
      ctx.fillText(rarityLabel.toUpperCase(), SIZE / 2, 42);
    }
    shrinkFont(ctx, name, "800", 46, SIZE - 70);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, SIZE / 2, 90);

    // Bottom band + stats + value + watermark.
    const botBand = ctx.createLinearGradient(0, SIZE - 170, 0, SIZE);
    botBand.addColorStop(0, "rgba(6,16,26,0)");
    botBand.addColorStop(1, "rgba(6,16,26,0.95)");
    ctx.fillStyle = botBand;
    ctx.fillRect(0, SIZE - 170, SIZE, 170);

    if (statsText) {
      ctx.font = "600 24px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#cfe6ff";
      ctx.fillText(statsText, SIZE / 2, SIZE - 96);
    }
    if (valueText) {
      ctx.font = "800 30px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#ffd66e";
      ctx.fillText(valueText, SIZE / 2, SIZE - 58);
    }
    ctx.font = "700 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(190,214,235,0.85)";
    ctx.fillText("🎣 tidalfishing.fun", SIZE / 2, SIZE - 22);
  }

  // Let the fish render a couple of frames before recording so frame 1 isn't blank.
  await new Promise((r) => setTimeout(r, 180));

  let rafId = 0;
  const loop = () => {
    drawFrame();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  const stream = composite.captureStream(30);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  } catch {
    cancelAnimationFrame(rafId);
    preview.dispose();
    return null;
  }

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  try {
    recorder.start();
    // Stop after the clip duration, with a hard safety cap so it can never hang.
    const stopTimer = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, durationMs);
    await stopped;
    clearTimeout(stopTimer);
  } catch (err) {
    console.error("[catchShare] recording failed:", err);
    return null;
  } finally {
    cancelAnimationFrame(rafId);
    preview.dispose();
  }

  if (!chunks.length) return null;
  const type = mime.split(";")[0] || "video/webm";
  return { blob: new Blob(chunks, { type }), ext: extFor(mime), type };
}

/**
 * Share a recorded clip. On mobile we attach the actual video FILE to the post
 * via the Web Share API (the only way the browser can hand media to X). On
 * desktop — where web intents can't carry media and the OS share sheet rarely
 * lists X — we save the clip and redirect into the X composer so the user drops
 * the saved video onto their post.
 *
 * `xWin` is a tab opened during the click gesture (see openPendingShareWindow);
 * redirecting it dodges the popup blocker that would otherwise kill a
 * window.open fired ~3.5s later, after the recording await.
 *
 * @returns {Promise<"shared"|"downloaded"|"cancelled">}
 */
export async function shareClip({ blob, ext, type, name, preferNativeShare, xWin = null }) {
  const file = new File([blob], `tidal-catch-${Date.now()}.${ext}`, { type });
  const text = catchTweetText(name);

  // Best path (mobile / PWA): attach the real video file to the post.
  if (preferNativeShare && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      closeWindow(xWin);
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") {
        closeWindow(xWin);
        return "cancelled";
      }
      // any other failure → fall through to download + X composer
    }
  }

  // Desktop / unsupported: save the clip, then redirect into the X composer.
  downloadBlob(blob, file.name);
  redirectToX(text, xWin);
  return "downloaded";
}

/** Standard tweet copy for a catch, with the play link in the body. */
export function catchTweetText(name) {
  const origin =
    (typeof window !== "undefined" && window.location && window.location.origin) ||
    "https://tidalfishing.fun";
  return `I just caught a ${name} on Tidal! 🎣 #Tidal #Solana\n\nPlay at ${origin}`;
}

/** Build the X/Twitter web-intent URL for the given text. */
export function xIntentUrl(text) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/**
 * True when we should hand the video file to the OS/app share sheet instead of
 * the web intent — i.e. on a real mobile device that supports file sharing.
 * Desktop browsers (even those that support navigator.share) are excluded so the
 * share always lands in the X composer there.
 */
export function prefersNativeShare() {
  return isMobileLike() && canShareVideoFiles();
}

function isMobileLike() {
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
      return navigator.userAgentData.mobile;
    }
  } catch {
    /* userAgentData not available */
  }
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent || "");
}

function canShareVideoFiles() {
  try {
    const probe = new File([new Uint8Array(1)], "p.mp4", { type: "video/mp4" });
    return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

/**
 * Open a placeholder tab DURING the click gesture so the eventual redirect to
 * the X composer (after the recording await) isn't blocked as an unsolicited
 * popup. Returns the window handle, or null if the browser blocked it.
 */
export function openPendingShareWindow() {
  let w = null;
  try {
    w = window.open("about:blank", "_blank", "width=600,height=540");
  } catch {
    w = null;
  }
  if (w) {
    try {
      w.document.write(
        `<!doctype html><meta charset="utf-8"><title>Sharing your catch…</title>` +
          `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;` +
          `background:#06101a;color:#cfe6ff;font:600 18px system-ui,sans-serif">` +
          `🎣 Preparing your post… one moment</body>`
      );
    } catch {
      /* cross-origin write guard — ignore, we still navigate it later */
    }
  }
  return w;
}

/**
 * Send the user to the X composer. Prefers a tab pre-opened during the click
 * gesture; otherwise tries a fresh popup, then a same-tab navigation as a last
 * resort (game state is persisted in localStorage).
 */
export function redirectToX(text, preopened) {
  const url = xIntentUrl(text);
  if (preopened && !preopened.closed) {
    try {
      preopened.location.href = url;
      return true;
    } catch {
      /* window closed or blocked — fall through */
    }
  }
  const w = window.open(url, "_blank", "noopener,width=600,height=540");
  if (w) return true;
  try {
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function closeWindow(w) {
  if (w && !w.closed) {
    try {
      w.close();
    } catch {
      /* ignore */
    }
  }
}
