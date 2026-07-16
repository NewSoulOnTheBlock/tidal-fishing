import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, Interface, getAddress, parseUnits } from 'ethers';
import { canIssueReward, clampCatchValue, payoutCeilingForBait } from '../rewards/risk.js';
import { signRewardClaim, buildRewardClaimTypedData } from '../rewards/signClaims.js';
import { decodeBaitPurchaseLog, verifyBaitPurchaseReceipt } from '../chain/baitStoreEvents.js';

test('reward risk blocks reward above utilization cap', () => {
  const result = canIssueReward({ rewardPoolBalanceUi: 1000, pendingClaimsUi: 700, requestedUi: 100, maxUtilizationBps: 7500 });
  assert.equal(result.ok, false);
});

test('reward risk allows reward under utilization cap and clamps catch by bait', () => {
  assert.equal(canIssueReward({ rewardPoolBalanceUi: 1000, pendingClaimsUi: 600, requestedUi: 100, maxUtilizationBps: 7500 }).ok, true);
  assert.equal(clampCatchValue({ value: 1000, baitCost: 10, maxPayoutMultiplier: 20 }), 200);
  assert.equal(payoutCeilingForBait({ tokenPrice: 5, maxPayoutMultiplier: 15 }), 75);
});

test('signRewardClaim produces EIP-712 payload and signature for RewardEscrow', async () => {
  const wallet = Wallet.createRandom();
  const escrow = Wallet.createRandom().address;
  const claim = { player: Wallet.createRandom().address, amount: parseUnits('10', 18).toString(), claimId: '123', expiresAt: 2000000000 };
  const typed = buildRewardClaimTypedData({ ...claim, chainId: 4663, rewardEscrow: escrow });
  assert.equal(typed.domain.name, 'BullFishBlitzRewards');
  assert.equal(typed.domain.chainId, 4663);
  const signed = await signRewardClaim({ ...claim, chainId: 4663, rewardEscrow: escrow, signerPrivateKey: wallet.privateKey });
  assert.equal(signed.rewardSigner, wallet.address);
  assert.match(signed.signature, /^0x[0-9a-f]+$/i);
});

test('decode and verify BaitPackPurchased receipt logs', () => {
  const buyer = Wallet.createRandom().address;
  const store = Wallet.createRandom().address;
  const iface = new Interface(['event BaitPackPurchased(address indexed buyer,uint256 indexed packId,uint256 quantity,uint256 grossAmount)']);
  const event = iface.encodeEventLog(iface.getEvent('BaitPackPurchased'), [buyer, 2n, 3n, parseUnits('75', 18)]);
  const log = { address: store, topics: event.topics, data: event.data };
  const decoded = decodeBaitPurchaseLog(log);
  assert.equal(decoded.buyer, getAddress(buyer));
  assert.equal(decoded.packId, '2');
  assert.equal(decoded.quantity, 3);
  const verified = verifyBaitPurchaseReceipt({ receipt: { status: '0x1', logs: [log] }, baitStoreAddress: store, expectedBuyer: buyer });
  assert.equal(verified.ok, true);
  assert.equal(verified.purchase.quantity, 3);
  assert.equal(verifyBaitPurchaseReceipt({ receipt: { status: '0x0', logs: [log] }, baitStoreAddress: store, expectedBuyer: buyer }).ok, false);
});
