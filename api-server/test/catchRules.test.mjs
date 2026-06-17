// Unit tests for the authoritative catch-validation logic. Runs against the
// REAL shipped fishValues.json catalog so the reachability gate is tested with
// the same data the live server trusts.
//
//   node --test test/catchRules.test.mjs
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateCatch, SERVER_CAPS } from '../catchRules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(readFileSync(join(__dirname, '..', 'fishValues.json'), 'utf8'));
const SP = CATALOG.species;
const VALID = new Set(CATALOG.locations || ['lake', 'river', 'pier', 'ocean']);

// Convenience wrapper mirroring how server.js calls evaluateCatch.
function evalCatch(speciesId, location, catchData = {}, counts = {}, isHotSpot = false) {
  return evaluateCatch({
    cap: SP[speciesId],
    location,
    validLocation: VALID.has(location),
    isHotSpot,
    catchData: { value: 1, sizeCm: 0, weightKg: 0, ...catchData },
    counts,
  });
}

const ZERO = { m: 0, h: 0, d: 0, eh: 0, ed: 0, lh: 0, ld: 0, js: 0 };

test('legit lake catch (bluegill in lake) is accepted', () => {
  const r = evalCatch('bluegill', 'lake', { value: 4, sizeCm: 20, weightKg: 0.5 }, ZERO);
  assert.equal(r.ok, true);
  assert.equal(r.rarity, 'common');
  assert.equal(r.value, 4);
  assert.equal(r.sizeCm, 20);
});

test('legit ocean legendary (marlin in ocean) is accepted', () => {
  const r = evalCatch('marlin', 'ocean', { value: 527, sizeCm: 300, weightKg: 200 }, ZERO);
  assert.equal(r.ok, true);
  assert.equal(r.rarity, 'legendary');
  assert.ok(r.value > 0);
});

test('fantasy fish (moonfish) is rejected everywhere — unreachable', () => {
  for (const loc of ['lake', 'river', 'pier', 'ocean']) {
    const r = evalCatch('moonfish', loc, { value: 27699 }, ZERO);
    assert.equal(r.ok, false, `moonfish should be rejected at ${loc}`);
    assert.equal(r.code, 'BAD_SPECIES_LOCATION');
    assert.equal(r.status, 400);
  }
});

test('all four fantasy legendaries are globally unreachable', () => {
  for (const id of ['moonfish', 'blackholefish', 'bitcoinfish', 'laptopfish']) {
    assert.deepEqual(SP[id].spawn, {}, `${id} should have an empty spawn map`);
    const r = evalCatch(id, 'ocean', { value: SP[id].max }, ZERO);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BAD_SPECIES_LOCATION');
  }
});

test('real species claimed at the wrong location is rejected', () => {
  // marlin only spawns in ocean — claiming it in the lake must fail.
  const r = evalCatch('marlin', 'lake', { value: 527 }, ZERO);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BAD_SPECIES_LOCATION');
});

test('unknown species is rejected', () => {
  const r = evalCatch('definitelyNotAFish', 'lake', { value: 100 }, ZERO);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BAD_SPECIES');
});

test('invalid location is rejected', () => {
  const r = evalCatch('bluegill', 'volcano', { value: 4 }, ZERO);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BAD_LOCATION');
});

test('oversized size and weight are clamped to species headroom', () => {
  const cap = SP.bluegill; // sizeMax≈26, weightMax≈0.87
  const r = evalCatch('bluegill', 'lake', { value: 4, sizeCm: 100000, weightKg: 100000 }, ZERO);
  assert.equal(r.ok, true);
  assert.ok(r.sizeCm <= cap.sizeMax * 1.25 + 5, `sizeCm ${r.sizeCm} should be clamped`);
  assert.ok(r.weightKg <= cap.weightMax * 1.5 + 1, `weightKg ${r.weightKg} should be clamped`);
});

test('value is clamped to the species ceiling', () => {
  // bluegill max is tiny; a client claiming a huge value gets clamped hard.
  const r = evalCatch('bluegill', 'lake', { value: 9_999_999, sizeCm: 20, weightKg: 0.5 }, ZERO);
  assert.equal(r.ok, true);
  assert.ok(r.value <= Math.ceil(SP.bluegill.max * 1.02) + 2, `value ${r.value} exceeds ceiling`);
});

test('jackpot streak (Nth smoking-chicken in a day) is rejected', () => {
  const counts = { ...ZERO, js: SERVER_CAPS.jackpotDay };
  const r = evalCatch('smokingchicken', 'ocean', { value: 400000 }, counts);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'RARITY_LIMIT');
  assert.equal(r.status, 429);
});

test('jackpot just under the cap is still accepted', () => {
  const counts = { ...ZERO, js: SERVER_CAPS.jackpotDay - 1 };
  const r = evalCatch('smokingchicken', 'ocean', { value: 400000, sizeCm: 70, weightKg: 5 }, counts);
  assert.equal(r.ok, true);
});

test('legendary hourly streak is rejected', () => {
  const counts = { ...ZERO, lh: SERVER_CAPS.legendaryHour };
  const r = evalCatch('marlin', 'ocean', { value: 527 }, counts);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'RARITY_LIMIT');
});

test('legendary daily streak is rejected', () => {
  const counts = { ...ZERO, ld: SERVER_CAPS.legendaryDay };
  const r = evalCatch('marlin', 'ocean', { value: 527 }, counts);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'RARITY_LIMIT');
});

test('rate limit (per-minute) is enforced', () => {
  const counts = { ...ZERO, m: SERVER_CAPS.perMin };
  const r = evalCatch('bluegill', 'lake', { value: 4 }, counts);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'RATE_LIMIT');
});

test('value is capped by remaining hourly earnings allowance', () => {
  // already earned the full hourly allowance -> next catch credits 0.
  const counts = { ...ZERO, eh: SERVER_CAPS.earnHour, ed: SERVER_CAPS.earnHour };
  const r = evalCatch('marlin', 'ocean', { value: 527, sizeCm: 300, weightKg: 200 }, counts);
  assert.equal(r.ok, true);
  assert.equal(r.value, 0);
});

test('hot spot raises the value ceiling by ~10%', () => {
  const base = evalCatch('marlin', 'ocean', { value: 999999 }, ZERO, false);
  const hot = evalCatch('marlin', 'ocean', { value: 999999 }, ZERO, true);
  assert.ok(hot.value > base.value, 'hot-spot ceiling should exceed base ceiling');
});

test('client-asserted rarity is ignored — server forces catalog rarity', () => {
  // claim a common fish is "legendary"; server must report it as common.
  const r = evalCatch('bluegill', 'lake', { value: 4, rarity: 'legendary' }, ZERO);
  assert.equal(r.ok, true);
  assert.equal(r.rarity, 'common');
});
