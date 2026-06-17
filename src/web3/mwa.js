// Solana Mobile Wallet Adapter (MWA) registration.
//
// MWA lets users connect their *installed* mobile wallet (Phantom, Solflare,
// etc.) directly from an ordinary mobile browser — no extension and no
// wallet-app in-app browser required. It registers itself as a Wallet Standard
// wallet, so it shows up automatically in listWallets() / the connect modal
// alongside detected injected wallets. None of the connect/sign flows in
// wallet.js need to change.
//
// Platform behaviour is enforced by registerMwa() itself
// (@solana-mobile/wallet-standard-mobile):
//   - No-op unless running in a secure (https) browser context.
//   - Android browser        -> registers a "local association" wallet that
//                               opens the user's installed wallet app. This is
//                               the big win: mobile-web users who previously saw
//                               "No wallets detected" now get a real option.
//   - Desktop                -> registers NOTHING unless VITE_MWA_REMOTE_HOST is
//                               set, in which case a QR-code "remote
//                               association" wallet is offered (scan with the
//                               phone wallet). Opt-in only, so desktop with
//                               extension wallets is unaffected by default.
//   - iOS / in-app webviews  -> registers nothing; existing fallbacks apply.

import {
  registerMwa,
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-standard-mobile";

const APP_NAME = "Tidal";
const APP_URI = "https://tidalfishing.fun";
const APP_ICON = "icon-192.png"; // resolved relative to APP_URI by the wallet

// Optional desktop QR relay host. When unset (the default), desktop is left
// completely untouched. Set VITE_MWA_REMOTE_HOST at build time to enable the
// scan-with-phone QR flow on desktop.
const REMOTE_HOST =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_MWA_REMOTE_HOST) ||
  undefined;

let _initialized = false;

// Register the Mobile Wallet Adapter as a Wallet Standard wallet. Idempotent and
// safe to call before the wallet UI mounts — registerMwa() self-guards on
// platform/secure-context, so this is a no-op where MWA is unsupported.
export function initMobileWalletAdapter() {
  if (_initialized) return;
  _initialized = true;

  if (typeof window === "undefined") return;

  try {
    registerMwa({
      appIdentity: { name: APP_NAME, uri: APP_URI, icon: APP_ICON },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ["solana:mainnet"],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
      remoteHostAuthority: REMOTE_HOST,
    });
    console.log(
      `[mwa] initialized${REMOTE_HOST ? " (desktop QR enabled)" : ""}`
    );
  } catch (e) {
    console.warn("[mwa] registration failed", e);
  }
}
