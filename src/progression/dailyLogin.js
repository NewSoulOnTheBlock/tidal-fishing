// Daily Login Rewards - streak tracking and daily claim system

export function initDailyLogin(save) {
  if (!save.dailyLogin) {
    save.dailyLogin = {
      lastClaimDate: null,  // YYYY-MM-DD of last claim
      streak: 0,            // consecutive days
      totalLogins: 0,       // lifetime login count
      claimedToday: false,
    };
  }
  return save.dailyLogin;
}

export function checkDailyLogin(dailyLogin) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const lastClaim = dailyLogin.lastClaimDate;

  if (lastClaim === today) {
    // Already claimed today
    dailyLogin.claimedToday = true;
    return { canClaim: false, streak: dailyLogin.streak };
  }

  // Check if streak continues (yesterday) or breaks
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  if (lastClaim === yesterday) {
    // Streak continues
    dailyLogin.claimedToday = false;
    return { canClaim: true, streak: dailyLogin.streak };
  } else if (lastClaim && lastClaim < yesterday) {
    // Streak broken - reset
    dailyLogin.streak = 0;
    dailyLogin.claimedToday = false;
    return { canClaim: true, streak: 0 };
  } else {
    // First login ever
    dailyLogin.claimedToday = false;
    return { canClaim: true, streak: dailyLogin.streak };
  }
}

export function claimDailyReward(dailyLogin) {
  const check = checkDailyLogin(dailyLogin);
  if (!check.canClaim) {
    return null; // already claimed
  }

  // Increment streak
  dailyLogin.streak += 1;
  dailyLogin.totalLogins += 1;
  dailyLogin.lastClaimDate = new Date().toISOString().split('T')[0];
  dailyLogin.claimedToday = true;

  // Calculate reward based on streak
  const streak = dailyLogin.streak;
  const rewards = [];

  // Base daily reward
  const baseTide = 100 + (Math.floor((streak - 1) / 7) * 50); // +50 per week
  rewards.push({ type: 'money', amount: baseTide, label: `Daily $TIDE (Day ${streak})` });

  // Milestone bonuses
  if (streak === 7) {
    rewards.push({ type: 'money', amount: 1000, label: 'Week 1 Bonus!' });
  } else if (streak === 14) {
    rewards.push({ type: 'money', amount: 2500, label: 'Week 2 Bonus!' });
  } else if (streak === 30) {
    rewards.push({ type: 'money', amount: 10000, label: '🎉 Month Bonus!' });
  } else if (streak % 30 === 0) {
    rewards.push({ type: 'money', amount: 10000, label: `🎉 ${streak / 30} Month Bonus!` });
  }

  return { streak, rewards };
}

export function getDailyRewardPreview(streak) {
  const nextStreak = streak + 1;
  const baseTide = 100 + (Math.floor(nextStreak - 1) / 7) * 50;
  const rewards = [{ type: 'money', amount: baseTide }];

  if (nextStreak === 7 || nextStreak === 14 || nextStreak === 30 || nextStreak % 30 === 0) {
    rewards.push({ type: 'bonus', milestone: true });
  }

  return { nextStreak, rewards };
}
