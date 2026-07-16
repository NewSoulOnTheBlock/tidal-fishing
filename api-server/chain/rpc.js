import { ROBINHOOD_RPC_URL } from './robinhood.js';
export async function rpc(method, params = []) {
  const res = await fetch(ROBINHOOD_RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'bull-fish-blitz-api' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || `${method} failed`);
  return json.result;
}
export const getTransactionReceipt = (hash) => rpc('eth_getTransactionReceipt', [hash]);
export const getCode = (address) => rpc('eth_getCode', [address, 'latest']);
