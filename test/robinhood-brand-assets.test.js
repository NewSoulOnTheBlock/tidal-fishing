import { existsSync, statSync, readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, DEFAULT_CHARACTER } from '../src/data/characters.js';

const requiredAssets = [
  'public/brand/tidal-robinhood-logo.png',
  'public/music/robin-hood-and-the-tanner.mp3',
];

test('Robinhood sign-in/logo/music assets are shipped from public', () => {
  for (const path of requiredAssets) {
    assert.equal(existsSync(path), true, `${path} should exist`);
    assert.ok(statSync(path).size > 1000, `${path} should not be empty`);
  }
});

test('Robin Hood and Little John are removed from the playable roster', () => {
  assert.equal(CHARACTERS.some((c) => c.id === 'robin-hood'), false);
  assert.equal(CHARACTERS.some((c) => c.id === 'little-john'), false);
  assert.notEqual(DEFAULT_CHARACTER, 'robin-hood');
  assert.notEqual(DEFAULT_CHARACTER, 'little-john');
  assert.equal(DEFAULT_CHARACTER, 'r2d2');
});

test('Robin Hood folk song is first background music track', () => {
  const audioManager = readFileSync('src/audio/audioManager.js', 'utf8');
  const firstTrack = audioManager.match(/this\.musicPlaylist = \[\s*['"]([^'"]+)['"]/s)?.[1];
  assert.equal(firstTrack, '/music/robin-hood-and-the-tanner.mp3');
});

test('main menu and onboarding use the supplied Tidal Robinhood logo', () => {
  const index = readFileSync('index.html', 'utf8');
  const onboarding = readFileSync('src/ui/onboardingUI.js', 'utf8');
  assert.match(index, /title-tidal-logo/);
  assert.match(index, /\/brand\/tidal-robinhood-logo\.png/);
  assert.match(onboarding, /onboarding-brand-logo/);
  assert.match(onboarding, /\/brand\/tidal-robinhood-logo\.png/);
});
