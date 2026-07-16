import test from 'node:test';
import assert from 'node:assert/strict';
import economy from '../shared/economy.json' with { type: 'json' };

test('economy fee split totals 100%', () => {
  const total = economy.platformFeeBps + economy.rewardPoolBps + economy.lpFeeBps + economy.sponsorBps;
  assert.equal(total, 10000);
});

test('fish nft hunt is configured for exactly 500 fish', () => {
  assert.equal(economy.nftHunt.enabled, true);
  assert.equal(economy.nftHunt.collectionSize, 500);
  assert.equal(economy.nftHunt.maxPendingOpportunitiesPerWallet, 1);
});

test('fish nft hunt cadence is profitable and non-spammable', () => {
  assert.ok(economy.nftHunt.firstOpportunityAfterCatches >= 10);
  assert.ok(economy.nftHunt.catchesPerOpportunity >= 25);
  assert.ok(economy.nftHunt.opportunityExpiresAfterCatches > 0);
  assert.equal(economy.nftHunt.mintPriceWei, '0');
});
