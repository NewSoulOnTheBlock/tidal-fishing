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
export const GAME_TREASURY = ENV.VITE_GAME_TREASURY || '0x793a5e8b8Ff431cC2D8eE41e8ec2D9ad70247E60';
export const GAME_TOKEN_SYMBOL = ENV.VITE_GAME_TOKEN_SYMBOL || 'USDG';
export const GAME_TOKEN_DECIMALS = Number(ENV.VITE_GAME_TOKEN_DECIMALS || 18);
export const NATIVE_SYMBOL = 'ETH';
export const BAIT_STORE_ADDRESS = ENV.VITE_BAIT_STORE_ADDRESS || '0x760b0b30a69763516dD46167F9a6211Ed172cc35';
export const REWARD_ESCROW_ADDRESS = ENV.VITE_REWARD_ESCROW_ADDRESS || '0xCe81b8730D897Bf4B3581C541a9A3B788402E565';
export const HOUSE_RESERVE_VAULT_ADDRESS = ENV.VITE_HOUSE_RESERVE_VAULT_ADDRESS || '0xf6F25BC8E234C5a58B791fbF22cBA2D43AffB67f';
export const TOURNAMENT_VAULT_ADDRESS = ENV.VITE_TOURNAMENT_VAULT_ADDRESS || '0x484fF0082f2F3B2a185423848d2927B3fA765ECd';
export const SPONSORED_HOTSPOTS_ADDRESS = ENV.VITE_SPONSORED_HOTSPOTS_ADDRESS || '0x54be4CCe1641B802aD4A410227873d1b9F3859E4';

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
