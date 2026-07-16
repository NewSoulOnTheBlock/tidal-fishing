import { Wallet } from 'ethers';
import { REWARD_ESCROW_ADDRESS, ROBINHOOD_CHAIN_ID, GAME_TOKEN_ADDRESS } from '../chain/robinhood.js';
export function rewardSignerAddress(privateKey = process.env.REWARD_SIGNER_PRIVATE_KEY || '') { return privateKey ? new Wallet(privateKey).address : null; }
export function buildRewardClaimTypedData({ player, amount, claimId, expiresAt, chainId = ROBINHOOD_CHAIN_ID, rewardEscrow = REWARD_ESCROW_ADDRESS }) {
  return { domain: { name: 'BullFishBlitzRewards', version: '1', chainId, verifyingContract: rewardEscrow }, types: { Claim: [ { name: 'player', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'claimId', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' } ] }, value: { player, amount: BigInt(amount).toString(), claimId: BigInt(claimId).toString(), expiresAt: BigInt(expiresAt).toString() } };
}
export async function signRewardClaim({ player, amount, claimId, expiresAt, chainId = ROBINHOOD_CHAIN_ID, rewardEscrow = REWARD_ESCROW_ADDRESS, signerPrivateKey = process.env.REWARD_SIGNER_PRIVATE_KEY || '' }) {
  if (!signerPrivateKey) throw new Error('Reward signer not configured');
  if (!rewardEscrow) throw new Error('RewardEscrow address not configured');
  const signer = new Wallet(signerPrivateKey);
  const typed = buildRewardClaimTypedData({ player, amount, claimId, expiresAt, chainId, rewardEscrow });
  const signature = await signer.signTypedData(typed.domain, typed.types, typed.value);
  return { rewardEscrow, asset: GAME_TOKEN_ADDRESS, amount: typed.value.amount, claimId: typed.value.claimId, expiresAt: typed.value.expiresAt, signature, rewardSigner: signer.address };
}
