// Unit tests for the auditable weighted winner selector.
//
//   node --test test/weightedWinnerSelector.test.mjs
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectWinner,
  aggregate,
  winningTicket,
  makeSeed,
} from '../raffle/weightedWinnerSelector.js';

test('empty raffle (no tickets) returns null', () => {
  assert.equal(selectWinner([], makeSeed()), null);
  assert.equal(selectWinner([{ userId: 1, tickets: 0 }], makeSeed()), null);
});

test('a single entrant always wins', () => {
  for (let i = 0; i < 50; i += 1) {
    const r = selectWinner([{ userId: 42, tickets: 7 }], makeSeed());
    assert.equal(r.winnerUserId, 42);
    assert.equal(r.totalTickets, 7);
    assert.ok(r.winningTicket >= 0 && r.winningTicket < 7);
  }
});

test('selection is deterministic for a given seed (re-verifiable)', () => {
  const entries = [
    { userId: 1, tickets: 10 },
    { userId: 2, tickets: 90 },
    { userId: 3, tickets: 25 },
  ];
  const seed = 'a3f1c09b77d4e2510000000000000000000000000000000000000000deadbeef';
  const a = selectWinner(entries, seed);
  const b = selectWinner(entries, seed);
  assert.deepEqual(a, b);
});

test('aggregate sums a user across multiple entries and drops non-positive tickets', () => {
  const agg = aggregate([
    { userId: 5, tickets: 3 },
    { userId: 5, tickets: 4 },
    { userId: 9, tickets: 0 },
    { userId: 7, tickets: 2 },
  ]);
  const five = agg.find((e) => e.userId === 5);
  assert.equal(five.tickets, 7);
  assert.ok(!agg.some((e) => e.userId === 9)); // zero-ticket user excluded
});

test('ranges are contiguous, half-open, and cover exactly [0, total)', () => {
  const { ranges, totalTickets } = selectWinner(
    [
      { userId: 1, tickets: 10 },
      { userId: 2, tickets: 90 },
    ],
    makeSeed(),
  );
  assert.equal(totalTickets, 100);
  let cursor = 0;
  for (const r of ranges) {
    assert.equal(r.start, cursor);
    assert.equal(r.end, r.start + r.tickets);
    cursor = r.end;
  }
  assert.equal(cursor, 100);
});

test('the winning ticket lands inside the winner\'s range', () => {
  const entries = [
    { userId: 1, tickets: 33 },
    { userId: 2, tickets: 67 },
  ];
  for (let i = 0; i < 200; i += 1) {
    const r = selectWinner(entries, makeSeed());
    const win = r.ranges.find((x) => x.userId === r.winnerUserId);
    assert.ok(r.winningTicket >= win.start && r.winningTicket < win.end);
  }
});

test('win probability is proportional to ticket share (~90/10 over many draws)', () => {
  const entries = [
    { userId: 1, tickets: 10 }, // 10%
    { userId: 2, tickets: 90 }, // 90%
  ];
  const N = 20_000;
  let winsForBig = 0;
  for (let i = 0; i < N; i += 1) {
    const r = selectWinner(entries, makeSeed());
    if (r.winnerUserId === 2) winsForBig += 1;
  }
  const share = winsForBig / N;
  // 90% expected; allow a generous tolerance for randomness.
  assert.ok(share > 0.86 && share < 0.94, `big-holder win share was ${share}`);
});

test('every ticket counts — the 1%% holder still wins sometimes', () => {
  const entries = [
    { userId: 1, tickets: 1 },
    { userId: 2, tickets: 99 },
  ];
  let smallWins = 0;
  for (let i = 0; i < 5_000; i += 1) {
    const r = selectWinner(entries, makeSeed());
    if (r.winnerUserId === 1) smallWins += 1;
  }
  assert.ok(smallWins > 0, 'the single-ticket holder should win at least once in 5000 draws');
});

test('winningTicket() reduces a seed into [0,total) and is null for empty pools', () => {
  assert.equal(winningTicket('ff'.repeat(32), 0), null);
  for (const total of [1, 7, 100, 999_999]) {
    const t = winningTicket(makeSeed(), total);
    assert.ok(Number.isInteger(t) && t >= 0 && t < total);
  }
});

test('makeSeed produces distinct 64-hex-char seeds', () => {
  const a = makeSeed();
  const b = makeSeed();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});
