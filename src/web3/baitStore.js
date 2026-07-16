import { Interface, parseUnits } from 'ethers';
import { sendTransaction, call, currentAddress } from './wallet.js';
import { BAIT_STORE_ADDRESS, GAME_TOKEN_ADDRESS, GAME_TOKEN_DECIMALS } from './chain.js';

export const BAIT_STORE_ABI = [
  'function asset() view returns (address)',
  'function buyBaitPack(uint256 packId,uint256 quantity)',
  'function packs(uint256 packId) view returns (uint256 price,bool active)',
];
const baitStoreIface = new Interface(BAIT_STORE_ABI);
const erc20Iface = new Interface([
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
]);

export function baitPackIdForBait(bait) { return Number(bait?.packId || bait?.tier || 1); }
export function encodeBuyBaitPack(packId, quantity) { return baitStoreIface.encodeFunctionData('buyBaitPack', [BigInt(packId), BigInt(quantity)]); }
export async function fetchBaitStoreAsset() {
  if (!BAIT_STORE_ADDRESS) return null;
  const data = baitStoreIface.encodeFunctionData('asset', []);
  const raw = await call({ to: BAIT_STORE_ADDRESS, data });
  return String(baitStoreIface.decodeFunctionResult('asset', raw)[0]);
}
export async function fetchBaitPack(packId) {
  if (!BAIT_STORE_ADDRESS) return null;
  const data = baitStoreIface.encodeFunctionData('packs', [BigInt(packId)]);
  const raw = await call({ to: BAIT_STORE_ADDRESS, data });
  const [price, active] = baitStoreIface.decodeFunctionResult('packs', raw);
  return { packId, price, active };
}
async function readErc20(fn, args) {
  const data = erc20Iface.encodeFunctionData(fn, args);
  const raw = await call({ to: GAME_TOKEN_ADDRESS, data });
  return erc20Iface.decodeFunctionResult(fn, raw)[0];
}
export async function ensureBaitStoreAllowance(rawAmount) {
  const owner = currentAddress();
  if (!owner) throw new Error('Wallet not connected');
  const [balance, allowance] = await Promise.all([
    readErc20('balanceOf', [owner]),
    readErc20('allowance', [owner, BAIT_STORE_ADDRESS]),
  ]);
  if (balance < rawAmount) throw new Error('Not enough $TIDAL for this bait purchase');
  if (allowance >= rawAmount) return null;
  const data = erc20Iface.encodeFunctionData('approve', [BAIT_STORE_ADDRESS, rawAmount]);
  return sendTransaction({ to: GAME_TOKEN_ADDRESS, data, value: '0x0' });
}
export async function buyBaitPackOnChain(bait, quantity) {
  if (!BAIT_STORE_ADDRESS) throw new Error('BaitStore is not deployed/configured');
  const packId = baitPackIdForBait(bait);
  const [storeAsset, pack] = await Promise.all([fetchBaitStoreAsset(), fetchBaitPack(packId)]);
  if (storeAsset && storeAsset.toLowerCase() !== GAME_TOKEN_ADDRESS.toLowerCase()) {
    throw new Error('BaitStore was deployed for the previous token and must be redeployed for $TIDAL before on-chain bait purchases can run.');
  }
  if (!pack?.active) throw new Error(`Bait pack ${packId} is inactive`);
  const rawGross = pack.price * BigInt(quantity);
  await ensureBaitStoreAllowance(rawGross);
  const data = encodeBuyBaitPack(packId, quantity);
  return sendTransaction({ to: BAIT_STORE_ADDRESS, data, value: '0x0' });
}
export function rawUsdForDisplay(uiAmount) { return parseUnits(String(uiAmount), GAME_TOKEN_DECIMALS); }
