import { REWARD_ESCROW_ADDRESS } from './chain.js';
import { currentWalletAddress } from './wallet.js';
import { apiFetch } from '../utils/api.js';
import { claimRewardOnChain } from './rewardEscrow.js';

export function isWithdrawConfigured() { return Boolean(REWARD_ESCROW_ADDRESS && currentWalletAddress()); }
export function isSolWithdrawConfigured() { return false; }

export async function requestRewardClaim(amount) {
  const wallet = currentWalletAddress()?.toString?.();
  if (!wallet) throw new Error('Wallet not connected');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount');
  const res = await apiFetch('/api/withdraw', {
    method: 'POST', auth: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount, walletAddress: wallet }), timeoutMs: 60_000,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Withdraw failed (${res.status})`);
  return body;
}

export async function withdrawTide(amount) {
  const claim = await requestRewardClaim(amount);
  return claimRewardOnChain({
    rewardEscrow: claim.rewardEscrow || REWARD_ESCROW_ADDRESS,
    amount: claim.amount,
    claimId: claim.claimId,
    expiresAt: claim.expiresAt,
    signature: claim.signature,
  });
}

export async function withdrawSol() { throw new Error('Native ETH payouts are disabled; rewards claim through RewardEscrow in $TIDAL.'); }
