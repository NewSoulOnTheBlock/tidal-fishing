// Unit tests for the cheapest-per-card-type gacha machine selector.
//
//   node --test test/gachaMachineSelector.test.mjs
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardType,
  cheapestPerType,
  pickPrizeMachine,
} from '../raffle/gachaMachineSelector.js';

const MACHINES = [
  { code: 'pokemon_50', name: 'Elite Pack', price: 50, public: true, stock: { common: 10, epic: 2 } },
  { code: 'pokemon_250', name: 'Legendary Pack', price: 250, public: true, stock: { common: 5 } },
  { code: 'sports', name: 'Sports Pack', price: 75, public: true, stock: { rare: 4 } },
];

test('cardType strips the trailing price suffix', () => {
  assert.equal(cardType('pokemon_50'), 'pokemon');
  assert.equal(cardType('pokemon_250'), 'pokemon');
  assert.equal(cardType('elite_100'), 'elite');
  assert.equal(cardType('sports'), 'sports');
  assert.equal(cardType('POKEMON_50'), 'pokemon');
});

test('cheapestPerType keeps only the lowest-priced pack of each type', () => {
  const pool = cheapestPerType(MACHINES);
  const codes = pool.map((m) => m.code).sort();
  assert.deepEqual(codes, ['pokemon_50', 'sports']); // 250 dropped (pokemon_50 is cheaper)
});

test('pickPrizeMachine only ever returns a cheapest-per-type machine', () => {
  for (let i = 0; i < 500; i += 1) {
    const m = pickPrizeMachine(MACHINES);
    assert.ok(['pokemon_50', 'sports'].includes(m.code));
    assert.notEqual(m.code, 'pokemon_250'); // the pricey pack is never selected
  }
});

test('selection shuffles across every card type over many cycles', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(pickPrizeMachine(MACHINES).code);
  assert.ok(seen.has('pokemon_50'));
  assert.ok(seen.has('sports'));
});

test('a seeded rng makes selection reproducible', () => {
  const rng = () => 0; // always first in the stable-sorted pool
  const a = pickPrizeMachine(MACHINES, { rng });
  const b = pickPrizeMachine(MACHINES, { rng });
  assert.equal(a.code, b.code);
});

test('out-of-stock and non-public machines are excluded', () => {
  const machines = [
    { code: 'pokemon_50', price: 50, public: true, stock: { common: 0, epic: 0 } }, // empty
    { code: 'pokemon_250', price: 250, public: true, stock: { common: 3 } },
    { code: 'secret_10', price: 10, public: false, stock: { common: 9 } }, // hidden
  ];
  const pool = cheapestPerType(machines);
  // pokemon_50 empty -> next cheapest pokemon is the 250; secret excluded entirely.
  assert.deepEqual(pool.map((m) => m.code), ['pokemon_250']);
});

test('openCodes filter restricts to currently-open machines', () => {
  const open = new Set(['sports']);
  const pool = cheapestPerType(MACHINES, open);
  assert.deepEqual(pool.map((m) => m.code), ['sports']);
});

test('no eligible machines -> null', () => {
  assert.equal(pickPrizeMachine([]), null);
  assert.equal(pickPrizeMachine([{ code: 'x_5', price: 5, public: false }]), null);
});
