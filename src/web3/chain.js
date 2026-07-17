// Robinhood Chain EVM config and explorer helpers.
const ENV = import.meta.env || {};

export const NETWORK = 'Robinhood Chain';
export const CHAIN_ID = 4663;
export const CHAIN_ID_HEX = '0x1237';
export const RPC_URL = ENV.VITE_ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
export const EXPLORER_BASE = 'https://robinhoodchain.blockscout.com';

export const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
export const TIDAL_TOKEN_ADDRESS = '0x6E6e926AAEC6dCD0EDBD49CfC5BC49062Ae80923';

export const GAME_TOKEN_ADDRESS = ENV.VITE_GAME_TOKEN_ADDRESS || TIDAL_TOKEN_ADDRESS;
export const GAME_TREASURY = ENV.VITE_GAME_TREASURY || '0x793a5e8b8Ff431cC2D8eE41e8ec2D9ad70247E60';
export const GAME_TOKEN_SYMBOL = ENV.VITE_GAME_TOKEN_SYMBOL || '$TIDAL';
export const GAME_TOKEN_DECIMALS = Number(ENV.VITE_GAME_TOKEN_DECIMALS || 18);
export const NATIVE_SYMBOL = 'ETH';
export const BAIT_STORE_ADDRESS = ENV.VITE_BAIT_STORE_ADDRESS || '0x9b899e09429750a75BF0a492593b11E42a77Cb0E';
export const REWARD_ESCROW_ADDRESS = ENV.VITE_REWARD_ESCROW_ADDRESS || '0xe5Fa543D9DfF6c3c8deE59A9406896d5470781dA';
export const HOUSE_RESERVE_VAULT_ADDRESS = ENV.VITE_HOUSE_RESERVE_VAULT_ADDRESS || '0xab291894E18f083F45E0fD951b939F5bbaEB5e5a';
export const TOURNAMENT_VAULT_ADDRESS = ENV.VITE_TOURNAMENT_VAULT_ADDRESS || '0xb056A7938E97614Ef30a9C3A850e9c0F0Df643EB';
export const SPONSORED_HOTSPOTS_ADDRESS = ENV.VITE_SPONSORED_HOTSPOTS_ADDRESS || '0xD84bF6567d1D720c5af49b173fa9B6a0f2204dee';

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
