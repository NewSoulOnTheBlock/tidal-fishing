// Fish Collection Journal - tracks which species players have caught and their stats

import { FISH_SPECIES } from "../data/fishData.js";

export function initJournal(save) {
  if (!save.journal) {
    save.journal = {};
    // Initialize all species as uncaught
    FISH_SPECIES.forEach(sp => {
      save.journal[sp.id] = {
        caught: 0,           // total count caught
        biggestSize: 0,      // largest size in cm
        biggestWeight: 0,    // largest weight in kg
        totalValue: 0,       // cumulative $TIDE earned
        firstCaughtAt: null, // timestamp of first catch
      };
    });
  }
  return save.journal;
}

export function recordCatch(journal, speciesId, sizeCm, weightKg, value) {
  const entry = journal[speciesId];
  if (!entry) return; // invalid species

  entry.caught += 1;
  entry.totalValue += value;
  
  if (sizeCm > entry.biggestSize) {
    entry.biggestSize = sizeCm;
  }
  if (weightKg > entry.biggestWeight) {
    entry.biggestWeight = weightKg;
  }
  
  if (!entry.firstCaughtAt) {
    entry.firstCaughtAt = Date.now();
  }
}

export function getJournalStats(journal) {
  const species = FISH_SPECIES.map(sp => ({
    ...sp,
    ...journal[sp.id],
    hasCaught: journal[sp.id].caught > 0,
  }));

  const totalCaught = species.reduce((sum, s) => sum + s.caught, 0);
  const uniqueSpecies = species.filter(s => s.hasCaught).length;
  const totalValue = species.reduce((sum, s) => sum + s.totalValue, 0);
  
  // Collection completion by location
  const byLocation = {};
  species.forEach(sp => {
    sp.locations.forEach(loc => {
      if (!byLocation[loc]) byLocation[loc] = { total: 0, caught: 0 };
      byLocation[loc].total += 1;
      if (sp.hasCaught) byLocation[loc].caught += 1;
    });
  });

  return {
    species,
    totalCaught,
    uniqueSpecies,
    totalSpecies: FISH_SPECIES.length,
    totalValue,
    completionPercent: Math.round((uniqueSpecies / FISH_SPECIES.length) * 100),
    byLocation,
  };
}

export function getCompletionRewards(journal) {
  const stats = getJournalStats(journal);
  const rewards = [];

  // Milestone rewards
  if (stats.uniqueSpecies >= 5 && !journal._reward_5species) {
    rewards.push({ id: '5species', type: 'money', amount: 500, label: 'Caught 5 species!' });
  }
  if (stats.uniqueSpecies >= 10 && !journal._reward_10species) {
    rewards.push({ id: '10species', type: 'money', amount: 2000, label: 'Caught 10 species!' });
  }
  if (stats.uniqueSpecies >= 15 && !journal._reward_15species) {
    rewards.push({ id: '15species', type: 'money', amount: 5000, label: 'Caught 15 species!' });
  }
  if (stats.uniqueSpecies >= 22 && !journal._reward_all) {
    rewards.push({ id: 'all', type: 'money', amount: 50000, label: 'Caught every species!' });
  }

  // Location completion rewards
  Object.entries(stats.byLocation).forEach(([loc, data]) => {
    const rewardId = `complete_${loc}`;
    if (data.caught === data.total && !journal[`_reward_${rewardId}`]) {
      const amounts = { lake: 1000, river: 3000, pier: 8000, ocean: 25000 };
      rewards.push({ 
        id: rewardId, 
        type: 'money', 
        amount: amounts[loc] || 1000, 
        label: `Completed ${loc} collection!` 
      });
    }
  });

  return rewards;
}

export function claimReward(journal, rewardId) {
  journal[`_reward_${rewardId}`] = Date.now();
}
