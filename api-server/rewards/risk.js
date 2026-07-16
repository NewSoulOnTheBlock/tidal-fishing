export function canIssueReward({ rewardPoolBalanceUi, pendingClaimsUi, requestedUi, maxUtilizationBps }) {
  if (requestedUi <= 0) return { ok: false, reason: 'Invalid amount' };
  const utilized = Number(pendingClaimsUi || 0) + Number(requestedUi || 0);
  const max = Number(rewardPoolBalanceUi || 0) * Number(maxUtilizationBps || 0) / 10000;
  if (utilized > max) return { ok: false, reason: 'Reward pool utilization limit reached' };
  return { ok: true };
}
export function clampCatchValue({ value, baitCost, maxPayoutMultiplier }) {
  const max = Number(baitCost || 0) * Number(maxPayoutMultiplier || 0);
  return Math.max(0, Math.min(Number(value || 0), max));
}
export function payoutCeilingForBait(bait) { return Number(bait?.tokenPrice || 0) * Number(bait?.maxPayoutMultiplier || 0); }
