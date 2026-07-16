import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH_SPECIES } from '../src/data/fishData.js';
import { buildFishNftCollection } from '../scripts/fish-nft-metadata-lib.mjs';

test('builds exactly 500 fish nft metadata entries from existing species', () => {
  const collection = buildFishNftCollection({ species: FISH_SPECIES, collectionSize: 500 });
  assert.equal(collection.manifest.collectionSize, 500);
  assert.equal(collection.manifest.tokens.length, 500);
  assert.equal(collection.metadata.length, 500);
  assert.ok(collection.manifest.speciesCount >= 70, 'expected current gameplay fish species to be present');
});

test('metadata reuses species art but gives repeated fish unique properties', () => {
  const collection = buildFishNftCollection({ species: FISH_SPECIES, collectionSize: 500 });
  const bySpecies = new Map();
  for (const token of collection.metadata) {
    const species = token.attributes.find((a) => a.trait_type === 'Species ID')?.value;
    if (!bySpecies.has(species)) bySpecies.set(species, []);
    bySpecies.get(species).push(token);
  }
  const repeated = [...bySpecies.values()].find((items) => items.length > 1);
  assert.ok(repeated, 'expected at least one species art file to repeat');
  const traitFingerprints = new Set(repeated.map((item) => JSON.stringify(item.attributes)));
  assert.ok(traitFingerprints.size > 1, 'repeated art should have different metadata traits');
});

test('every token has rarity score and a unique rarity rank', () => {
  const collection = buildFishNftCollection({ species: FISH_SPECIES, collectionSize: 500 });
  const ranks = new Set();
  for (const token of collection.metadata) {
    const score = token.attributes.find((a) => a.trait_type === 'Rarity Score');
    const rank = token.attributes.find((a) => a.trait_type === 'Rarity Rank');
    assert.ok(Number(score?.value) > 0, `missing rarity score for ${token.name}`);
    assert.ok(Number(rank?.value) >= 1 && Number(rank?.value) <= 500, `bad rarity rank for ${token.name}`);
    ranks.add(rank.value);
  }
  assert.equal(ranks.size, 500);
});
