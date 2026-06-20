// Unit tests for the raffle ticket calculator.
//
//   node --test test/ticketCalculator.test.mjs
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcTickets,
  rarityMultiplier,
  sizeWeight,
  RARITY_MULTIPLIERS,
  MIN_TICKETS,
} from '../raffle/ticketCalculator.js';

test('rarity multipliers follow the spec ladder', () => {
  assert.equal(rarityMultiplier('common'), 1);
  assert.equal(rarityMultiplier('uncommon'), 2);
  assert.equal(rarityMultiplier('rare'), 5);
  assert.equal(rarityMultiplier('epic'), 10);
  assert.equal(rarityMultiplier('legendary'), 25);
  assert.equal(rarityMultiplier('mythic'), 50);
});

test('rarity lookup is case-insensitive and unknowns fall back to common (never inflate)', () => {
  assert.equal(rarityMultiplier('LEGENDARY'), 25);
  assert.equal(rarityMultiplier('Mythic'), 50);
  assert.equal(rarityMultiplier('totally-made-up'), RARITY_MULTIPLIERS.common);
  assert.equal(rarityMultiplier(undefined), RARITY_MULTIPLIERS.common);
  assert.equal(rarityMultiplier(null), RARITY_MULTIPLIERS.common);
});

test('ticketValue = floor(sizeWeight * rarityMultiplier)', () => {
  const fish = { rarity: 'rare', weightKg: 2, sizeCm: 40 };
  const base = sizeWeight(fish); // 2*6 + 40*0.4 = 28
  assert.equal(base, 28);
  assert.equal(calcTickets(fish), Math.floor(28 * 5)); // 140
});

test('every exchanged fish is worth at least MIN_TICKETS', () => {
  assert.equal(calcTickets({ rarity: 'common', weightKg: 0, sizeCm: 0 }), MIN_TICKETS);
  assert.equal(calcTickets({}), MIN_TICKETS);
  assert.ok(calcTickets({ rarity: 'common', weightKg: 0.01, sizeCm: 0.1 }) >= MIN_TICKETS);
});

test('a legendary is worth far more than a common of identical size', () => {
  const common = calcTickets({ rarity: 'common', weightKg: 5, sizeCm: 60 });
  const legendary = calcTickets({ rarity: 'legendary', weightKg: 5, sizeCm: 60 });
  const mythic = calcTickets({ rarity: 'mythic', weightKg: 5, sizeCm: 60 });
  assert.equal(legendary, common * 25);
  assert.equal(mythic, common * 50);
  assert.ok(legendary > common * 10);
});

test('tickets are monotonic in weight and in length', () => {
  const small = calcTickets({ rarity: 'epic', weightKg: 1, sizeCm: 20 });
  const heavier = calcTickets({ rarity: 'epic', weightKg: 5, sizeCm: 20 });
  const longer = calcTickets({ rarity: 'epic', weightKg: 1, sizeCm: 80 });
  assert.ok(heavier > small);
  assert.ok(longer > small);
});

test('a tiny common is not worth more than a big rare (rarity + size both matter)', () => {
  const tinyCommon = calcTickets({ rarity: 'common', weightKg: 0.3, sizeCm: 18 });
  const bigRare = calcTickets({ rarity: 'rare', weightKg: 12, sizeCm: 90 });
  assert.ok(bigRare > tinyCommon * 20);
});

test('result is always an integer', () => {
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) {
    const t = calcTickets({ rarity: r, weightKg: 3.33, sizeCm: 47.7 });
    assert.equal(t, Math.floor(t));
  }
});
