import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../shared/fish-nft-manifest.json' with { type: 'json' };
import {
  shouldCreateOpportunity,
  tokenEntryForId,
  nextUnassignedTokenIdFromRows,
  applyCatchToOpportunity,
} from '../nft/opportunities.js';

test('creates first nft opportunity at first threshold only when no active opportunity exists', () => {
  assert.equal(shouldCreateOpportunity({ verifiedCatchCount: 9, hasActiveOpportunity: false }), false);
  assert.equal(shouldCreateOpportunity({ verifiedCatchCount: 10, hasActiveOpportunity: false }), true);
  assert.equal(shouldCreateOpportunity({ verifiedCatchCount: 10, hasActiveOpportunity: true }), false);
});

test('creates recurring nft opportunity every configured catch interval', () => {
  assert.equal(shouldCreateOpportunity({ verifiedCatchCount: 24, hasActiveOpportunity: false }), false);
  assert.equal(shouldCreateOpportunity({ verifiedCatchCount: 25, hasActiveOpportunity: false }), true);
  assert.equal(shouldCreateOpportunity({ verifiedCatchCount: 50, hasActiveOpportunity: false }), true);
  assert.equal(shouldCreateOpportunity({ verifiedCatchCount: 51, hasActiveOpportunity: false }), false);
});

test('finds manifest token entry by id', () => {
  const token = tokenEntryForId(manifest, 1);
  assert.equal(token.tokenId, 1);
  assert.ok(token.speciesId);
  assert.ok(token.metadata.endsWith('/1.json'));
});

test('selects the first unassigned token id', () => {
  assert.equal(nextUnassignedTokenIdFromRows([], 500), 1);
  assert.equal(nextUnassignedTokenIdFromRows([{ token_id: 1 }, { token_id: 2 }], 500), 3);
  assert.equal(nextUnassignedTokenIdFromRows([{ token_id: 2 }], 500), 1);
});

test('target species catch makes active opportunity eligible', () => {
  const active = { id: 1, status: 'active', target_species_id: 'creekfish_albino', catches_after_trigger: 0 };
  const result = applyCatchToOpportunity({ opportunity: active, speciesId: 'creekfish_albino' });
  assert.equal(result.status, 'eligible');
});

test('wrong species increments active opportunity progress and can expire', () => {
  const active = { id: 1, status: 'active', target_species_id: 'creekfish_albino', catches_after_trigger: 14 };
  const result = applyCatchToOpportunity({ opportunity: active, speciesId: 'darttail' });
  assert.equal(result.status, 'expired');
  assert.equal(result.catches_after_trigger, 15);
});
