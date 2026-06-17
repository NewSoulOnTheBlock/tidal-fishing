// Daily Challenges - randomized daily goals (NO REWARDS - fish catches are the only income source)

import { FISH_SPECIES, RARITIES } from "../data/fishData.js";
import { LOCATIONS } from "../data/locationData.js";

// Challenge templates with dynamic generation - ALL REWARDS SET TO 0
const CHALLENGE_TEMPLATES = [
  { id: 'catch_count', label: 'Catch {n} fish', check: (prog, n) => prog >= n, targets: [5, 10, 15, 20], rewards: [0, 0, 0, 0] },
  { id: 'catch_location', label: 'Catch {n} fish in {location}', check: (prog, n) => prog >= n, targets: [3, 5, 8], rewards: [0, 0, 0] },
  { id: 'catch_rarity', label: 'Catch {n} {rarity} fish', check: (prog, n) => prog >= n, targets: [2, 3, 5], rewards: [0, 0, 0] },
  { id: 'catch_species', label: 'Catch a {species}', check: (prog) => prog >= 1, targets: [1], rewards: [0] },
  { id: 'catch_value', label: 'Earn {n} $TIDE from catches', check: (prog, n) => prog >= n, targets: [1000, 5000, 10000], rewards: [0, 0, 0] },
  { id: 'perfect_hooks', label: 'Land {n} perfect hooks', check: (prog, n) => prog >= n, targets: [3, 5, 10], rewards: [0, 0, 0] },
];

export function initChallenges(save) {
  if (!save.challenges) {
    save.challenges = {
      dailySet: [],         // today's 3 challenges
      lastRollDate: null,   // YYYY-MM-DD of last roll
      completed: [],        // IDs of completed challenges
      totalCompleted: 0,
    };
  }
  return save.challenges;
}

export function rollDailyChallenges(challenges) {
  const today = new Date().toISOString().split('T')[0];
  
  if (challenges.lastRollDate === today && challenges.dailySet.length > 0) {
    return challenges.dailySet; // already rolled today
  }

  // Roll new set of 3 challenges
  const seed = Date.now();
  const rng = seededRandom(seed);
  
  const newSet = [];
  const used = new Set();

  while (newSet.length < 3) {
    const template = CHALLENGE_TEMPLATES[Math.floor(rng() * CHALLENGE_TEMPLATES.length)];
    const challengeId = `${template.id}_${Date.now()}_${newSet.length}`;
    
    if (used.has(template.id)) continue; // avoid duplicates
    used.add(template.id);

    let challenge = { ...template, id: challengeId, progress: 0, completed: false };

    // Fill in dynamic params
    if (template.id === 'catch_count') {
      const idx = Math.floor(rng() * template.targets.length);
      challenge.target = template.targets[idx];
      challenge.reward = template.rewards[idx];
      challenge.label = template.label.replace('{n}', challenge.target);
    } else if (template.id === 'catch_location') {
      const locations = ['lake', 'river', 'pier', 'ocean'];
      const loc = locations[Math.floor(rng() * locations.length)];
      const idx = Math.floor(rng() * template.targets.length);
      challenge.target = template.targets[idx];
      challenge.reward = template.rewards[idx];
      challenge.location = loc;
      challenge.label = template.label.replace('{n}', challenge.target).replace('{location}', loc);
    } else if (template.id === 'catch_rarity') {
      const rarities = ['uncommon', 'rare', 'epic'];
      const rarity = rarities[Math.floor(rng() * rarities.length)];
      const idx = Math.floor(rng() * template.targets.length);
      challenge.target = template.targets[idx];
      challenge.reward = template.rewards[idx];
      challenge.rarity = rarity;
      challenge.label = template.label.replace('{n}', challenge.target).replace('{rarity}', RARITIES[rarity].label);
    } else if (template.id === 'catch_species') {
      const species = FISH_SPECIES.filter(s => s.rarity !== 'common');
      const sp = species[Math.floor(rng() * species.length)];
      challenge.target = 1;
      challenge.reward = template.rewards[0] * (sp.rarity === 'legendary' ? 3 : sp.rarity === 'epic' ? 2 : 1);
      challenge.species = sp.id;
      challenge.label = template.label.replace('{species}', sp.name);
    } else if (template.id === 'catch_value') {
      const idx = Math.floor(rng() * template.targets.length);
      challenge.target = template.targets[idx];
      challenge.reward = template.rewards[idx];
      challenge.label = template.label.replace('{n}', challenge.target);
    } else if (template.id === 'perfect_hooks') {
      const idx = Math.floor(rng() * template.targets.length);
      challenge.target = template.targets[idx];
      challenge.reward = template.rewards[idx];
      challenge.label = template.label.replace('{n}', challenge.target);
    }

    newSet.push(challenge);
  }

  challenges.dailySet = newSet;
  challenges.lastRollDate = today;
  challenges.completed = [];
  
  return newSet;
}

export function updateChallengeProgress(challenges, event) {
  const { type, species, location, rarity, value, perfectHook } = event;
  let anyCompleted = false;

  challenges.dailySet.forEach(ch => {
    if (ch.completed) return;

    // Restore check function if missing (from localStorage)
    if (!ch.check) {
      const template = CHALLENGE_TEMPLATES.find(t => ch.id.startsWith(t.id));
      if (template) {
        ch.check = template.check;
      } else {
        console.warn('[challenges] No template found for:', ch.id);
        return;
      }
    }

    if (type === 'catch') {
      if (ch.id.startsWith('catch_count_')) {
        ch.progress += 1;
      } else if (ch.id.startsWith('catch_location_') && ch.location === location) {
        ch.progress += 1;
      } else if (ch.id.startsWith('catch_rarity_') && ch.rarity === rarity) {
        ch.progress += 1;
      } else if (ch.id.startsWith('catch_species_') && ch.species === species) {
        ch.progress += 1;
      } else if (ch.id.startsWith('catch_value_')) {
        ch.progress += value;
      }
    } else if (type === 'hook' && perfectHook && ch.id.startsWith('perfect_hooks_')) {
      ch.progress += 1;
    }

    // Check completion
    if (ch.check(ch.progress, ch.target) && !ch.completed) {
      ch.completed = true;
      challenges.completed.push(ch.id);
      challenges.totalCompleted += 1;
      anyCompleted = true;
    }
  });

  return anyCompleted;
}

export function getCompletedChallenges(challenges) {
  return challenges.dailySet.filter(ch => ch.completed && !challenges.completed.includes(ch.id));
}

// Simple seeded RNG
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
