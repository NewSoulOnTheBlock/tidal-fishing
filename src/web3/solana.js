// Robinhood Chain config kept behind the legacy solana.js import path so the
// older game UI can be migrated incrementally without touching every import.

const ENV = import.meta.env || {};

export const NETWORK = "Robinhood Chain";
export const CHAIN_ID = 4663;
export const CHAIN_ID_HEX = "0x1237";
export const RPC_URL = ENV.VITE_ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER_BASE = "https://robinhoodchain.blockscout.com";

// Canonical Robinhood Chain core assets from docs. Override for staging.
export const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const TIDE_MINT = ENV.VITE_GAME_TOKEN_ADDRESS || USDG_ADDRESS;
export const TIDE_TREASURY = ENV.VITE_GAME_TREASURY || "";
export const TIDE_SYMBOL = ENV.VITE_GAME_TOKEN_SYMBOL || "USDG";
export const NATIVE_SYMBOL = "ETH";

export function explorerAddressUrl(address) {
  return `${EXPLORER_BASE}/address/${address}`;
}

export function explorerTxUrl(hash) {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

export function shortAddress(addr, head = 4, tail = 4) {
  const s = typeof addr === "string" ? addr : addr?.address || addr?.toString?.();
  if (!s) return "—";
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function toChecksumish(address) {
  return typeof address === "string" ? address : address?.toString?.() || "";
}
