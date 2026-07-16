import { existsSync, statSync, readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, DEFAULT_CHARACTER } from '../src/data/characters.js';

const requiredAssets = [
  'public/brand/tidal-robinhood-logo.png',
  'public/music/robin-hood-and-the-tanner.mp3',
  'public/models/characters/robin-hood.glb',
  'public/models/characters/little-john.glb',
];

test('Robin Hood sign-in/logo/music/model assets are shipped from public', () => {
  for (const path of requiredAssets) {
    assert.equal(existsSync(path), true, `${path} should exist`);
    assert.ok(statSync(path).size > 1000, `${path} should not be empty`);
  }
  assert.equal(readFileSync('public/models/characters/robin-hood.glb').subarray(0, 4).toString('utf8'), 'glTF');
  assert.equal(readFileSync('public/models/characters/little-john.glb').subarray(0, 4).toString('utf8'), 'glTF');
});

test('Robin Hood and Little John are free starting-roster characters', () => {
  const robin = CHARACTERS.find((c) => c.id === 'robin-hood');
  const littleJohn = CHARACTERS.find((c) => c.id === 'little-john');
  assert.ok(robin, 'Robin Hood character exists');
  assert.ok(littleJohn, 'Little John character exists');
  assert.equal(robin.premium, undefined);
  assert.equal(littleJohn.premium, undefined);
  assert.equal(robin.url, '/models/characters/robin-hood.glb');
  assert.equal(littleJohn.url, '/models/characters/little-john.glb');
  assert.equal(robin.glbAnims, true);
  assert.equal(littleJohn.glbAnims, true);
  assert.equal(robin.anims.idle, '/anim/fishing-idle.fbx');
  assert.equal(robin.anims.cast, '/anim/fishing-cast.fbx');
  assert.equal(littleJohn.anims.idle, '/anim/fishing-idle.fbx');
  assert.equal(littleJohn.anims.cast, '/anim/fishing-cast.fbx');
  assert.equal(robin.height, 0.35);
  assert.equal(robin.yawDeg, 0);
  assert.equal(DEFAULT_CHARACTER, 'robin-hood');
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
