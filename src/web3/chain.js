// Robinhood Chain EVM config and explorer helpers.

const ENV = import.meta.env || {};

export const NETWORK = 'Robinhood Chain';
export const CHAIN_ID = 4663;
export const CHAIN_ID_HEX = '0x1237';
export const RPC_URL = ENV.VITE_ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
export const EXPLORER_BASE = 'https://robinhoodchain.blockscout.com';

export const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
export const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';

export const GAME_TOKEN_ADDRESS = ENV.VITE_GAME_TOKEN_ADDRESS || USDG_ADDRESS;
export const GAME_TREASURY = ENV.VITE_GAME_TREASURY || '';
export const GAME_TOKEN_SYMBOL = ENV.VITE_GAME_TOKEN_SYMBOL || 'USDG';
export const GAME_TOKEN_DECIMALS = Number(ENV.VITE_GAME_TOKEN_DECIMALS || 18);
export const NATIVE_SYMBOL = 'ETH';
export const BAIT_STORE_ADDRESS = ENV.VITE_BAIT_STORE_ADDRESS || '';
export const REWARD_ESCROW_ADDRESS = ENV.VITE_REWARD_ESCROW_ADDRESS || '';
export const HOUSE_RESERVE_VAULT_ADDRESS = ENV.VITE_HOUSE_RESERVE_VAULT_ADDRESS || '';
export const TOURNAMENT_VAULT_ADDRESS = ENV.VITE_TOURNAMENT_VAULT_ADDRESS || '';
export const SPONSORED_HOTSPOTS_ADDRESS = ENV.VITE_SPONSORED_HOTSPOTS_ADDRESS || '';

// Back-compat names while older game modules finish migrating.
export const TIDE_MINT = GAME_TOKEN_ADDRESS;
export const TIDE_TREASURY = GAME_TREASURY;
export const TIDE_SYMBOL = GAME_TOKEN_SYMBOL;

export function explorerAddressUrl(address) { return `${EXPLORER_BASE}/address/${address}`; }
export function explorerTxUrl(hash) { return `${EXPLORER_BASE}/tx/${hash}`; }
export function explorerTokenUrl(address) { return `${EXPLORER_BASE}/token/${address}`; }
export function shortAddress(addr, head = 4, tail = 4) {
  const s = typeof addr === 'string' ? addr : addr?.address || addr?.toString?.();
  if (!s) return '—';
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
export function toChecksumish(address) { return typeof address === 'string' ? address : address?.toString?.() || ''; }
