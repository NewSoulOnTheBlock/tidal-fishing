import { Interface } from 'ethers';
import { sendTransaction } from './wallet.js';

export const REWARD_ESCROW_ABI = [
  'function claim(uint256 amount,uint256 claimId,uint256 expiresAt,bytes signature)',
  'event RewardClaimed(address indexed player,uint256 indexed claimId,uint256 amount)',
];
const iface = new Interface(REWARD_ESCROW_ABI);

export function encodeClaimCall(amount, claimId, expiresAt, signature) {
  return iface.encodeFunctionData('claim', [BigInt(amount), BigInt(claimId), BigInt(expiresAt), signature]);
}

export async function claimRewardOnChain({ rewardEscrow, amount, claimId, expiresAt, signature }) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(rewardEscrow || ''))) throw new Error('RewardEscrow address not configured');
  const data = encodeClaimCall(amount, claimId, expiresAt, signature);
  return sendTransaction({ to: rewardEscrow, data, value: '0x0' });
}
