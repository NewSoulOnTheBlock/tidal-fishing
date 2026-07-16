import test from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY, NFT_HUNT } from '../config/economyConfig.js';

test('economy fee split totals 100%', () => {
  const total = ECONOMY.platformFeeBps + ECONOMY.rewardPoolBps + ECONOMY.lpFeeBps + ECONOMY.sponsorBps;
  assert.equal(total, 10000);
});

test('nft collection is exactly 500 fish', () => {
  assert.equal(NFT_HUNT.enabled, true);
  assert.equal(NFT_HUNT.collectionSize, 500);
});

test('nft opportunity cadence is positive and non-spammable', () => {
  assert.ok(NFT_HUNT.firstOpportunityAfterCatches >= 10);
  assert.ok(NFT_HUNT.catchesPerOpportunity >= 25);
  assert.equal(NFT_HUNT.maxPendingOpportunitiesPerWallet, 1);
  assert.equal(NFT_HUNT.mintPriceWei, '0');
});
