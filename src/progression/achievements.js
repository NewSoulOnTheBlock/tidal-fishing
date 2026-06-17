// Achievement System - milestone tracking and badge unlocks

export const ACHIEVEMENTS = [
  // Catch milestones - NO REWARDS (fish catches are the only income source)
  { id: 'first_catch', label: 'First Catch', desc: 'Catch your first fish', check: (stats) => stats.totalCaught >= 1, icon: '🎣', reward: 0 },
  { id: 'catch_10', label: 'Getting Started', desc: 'Catch 10 fish', check: (stats) => stats.totalCaught >= 10, icon: '🐟', reward: 0 },
  { id: 'catch_50', label: 'Experienced Angler', desc: 'Catch 50 fish', check: (stats) => stats.totalCaught >= 50, icon: '🎏', reward: 0 },
  { id: 'catch_100', label: 'Master Fisher', desc: 'Catch 100 fish', check: (stats) => stats.totalCaught >= 100, icon: '🏆', reward: 0 },
  { id: 'catch_500', label: 'Fishing Legend', desc: 'Catch 500 fish', check: (stats) => stats.totalCaught >= 500, icon: '👑', reward: 0 },

  // Rarity achievements - NO REWARDS
  { id: 'first_uncommon', label: 'Something Special', desc: 'Catch an uncommon fish', check: (stats) => stats.rarityCounts.uncommon >= 1, icon: '💚', reward: 0 },
  { id: 'first_rare', label: 'Rare Find', desc: 'Catch a rare fish', check: (stats) => stats.rarityCounts.rare >= 1, icon: '💙', reward: 0 },
  { id: 'first_epic', label: 'Epic Catch!', desc: 'Catch an epic fish', check: (stats) => stats.rarityCounts.epic >= 1, icon: '💜', reward: 0 },
  { id: 'first_legendary', label: 'Living Legend', desc: 'Catch a legendary fish', check: (stats) => stats.rarityCounts.legendary >= 1, icon: '⭐', reward: 0 },

  // Collection achievements - NO REWARDS
  { id: 'journal_5', label: 'Collector', desc: 'Catch 5 different species', check: (stats) => stats.uniqueSpecies >= 5, icon: '📖', reward: 0 },
  { id: 'journal_10', label: 'Field Researcher', desc: 'Catch 10 different species', check: (stats) => stats.uniqueSpecies >= 10, icon: '📚', reward: 0 },
  { id: 'journal_15', label: 'Ichthyologist', desc: 'Catch 15 different species', check: (stats) => stats.uniqueSpecies >= 15, icon: '🔬', reward: 0 },
  { id: 'complete_all', label: 'Pokédex Complete', desc: 'Catch every species', check: (stats) => stats.uniqueSpecies >= 22, icon: '🌟', reward: 0 },

  // Money achievements - NO REWARDS
  { id: 'earn_1k', label: 'First Grand', desc: 'Earn 1,000 $TIDE', check: (stats) => stats.lifetimeEarnings >= 1000, icon: '💰', reward: 0 },
  { id: 'earn_10k', label: 'Big Earner', desc: 'Earn 10,000 $TIDE', check: (stats) => stats.lifetimeEarnings >= 10000, icon: '💵', reward: 0 },
  { id: 'earn_100k', label: 'Six Figures', desc: 'Earn 100,000 $TIDE', check: (stats) => stats.lifetimeEarnings >= 100000, icon: '💸', reward: 0 },
  { id: 'earn_1m', label: 'Millionaire', desc: 'Earn 1,000,000 $TIDE', check: (stats) => stats.lifetimeEarnings >= 1000000, icon: '🤑', reward: 0 },

  // Location achievements - NO REWARDS
  { id: 'unlock_river', label: 'River Explorer', desc: 'Unlock River Bend', check: (stats) => stats.unlockedLocations.includes('river'), icon: '🌊', reward: 0 },
  { id: 'unlock_pier', label: 'Coastal Angler', desc: 'Unlock Coastal Pier', check: (stats) => stats.unlockedLocations.includes('pier'), icon: '🏖️', reward: 0 },
  { id: 'unlock_ocean', label: 'Deep Sea Captain', desc: 'Unlock Deep Ocean', check: (stats) => stats.unlockedLocations.includes('ocean'), icon: '🌊', reward: 0 },

  // Special achievements - NO REWARDS
  { id: 'perfect_hook_10', label: 'Quick Reflexes', desc: 'Land 10 perfect hooks', check: (stats) => stats.perfectHooks >= 10, icon: '⚡', reward: 0 },
  { id: 'jackpot_winner', label: 'I Won The Lottery', desc: 'Catch the Smoking Chicken Fish', check: (stats) => stats.jackpotCaught, icon: '🐔', reward: 0 },
  { id: 'daily_streak_7', label: 'Week Warrior', desc: 'Login 7 days in a row', check: (stats) => stats.loginStreak >= 7, icon: '🔥', reward: 0 },
  { id: 'daily_streak_30', label: 'Monthly Devotion', desc: 'Login 30 days in a row', check: (stats) => stats.loginStreak >= 30, icon: '🔥', reward: 0 },
];

export function initAchievements(save) {
  if (!save.achievements) {
    save.achievements = {
      unlocked: [],           // Array of achievement IDs
      totalCompleted: 0,
      lastChecked: Date.now(),
    };
  }
  return save.achievements;
}

export function checkAchievements(achievements, stats) {
  const newlyUnlocked = [];

  ACHIEVEMENTS.forEach(ach => {
    if (achievements.unlocked.includes(ach.id)) return; // already unlocked

    if (ach.check(stats)) {
      achievements.unlocked.push(ach.id);
      achievements.totalCompleted += 1;
      newlyUnlocked.push(ach);
    }
  });

  achievements.lastChecked = Date.now();
  return newlyUnlocked;
}

export function getAchievementProgress(stats) {
  return ACHIEVEMENTS.map(ach => ({
    ...ach,
    unlocked: false, // will be set by caller
    progress: getProgress(ach, stats),
  }));
}

function getProgress(ach, stats) {
  // Try to extract numeric progress for UI bars
  if (ach.id.startsWith('catch_')) {
    const target = parseInt(ach.id.split('_')[1]) || 0;
    return { current: stats.totalCaught, target };
  }
  if (ach.id.startsWith('journal_')) {
    const target = parseInt(ach.id.split('_')[1]) || 0;
    return { current: stats.uniqueSpecies, target };
  }
  if (ach.id.startsWith('earn_')) {
    const target = ach.id.includes('1m') ? 1000000 : ach.id.includes('100k') ? 100000 : ach.id.includes('10k') ? 10000 : 1000;
    return { current: stats.lifetimeEarnings, target };
  }
  return null;
}
