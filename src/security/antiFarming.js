// Anti-Farming Security System
// Prevents treasury draining and exploitative behavior

import { S, events } from "../state/gameState.js";

// Rate limiting config
const RATE_LIMITS = {
  // Maximum catches per time period
  maxCatchesPerMinute: 10,
  maxCatchesPerHour: 300,
  maxCatchesPerDay: 2000,
  
  // Maximum earnings per time period
  maxEarningsPerHour: 50000,  // 50k $TIDE per hour
  maxEarningsPerDay: 300000,  // 300k $TIDE per day
  
  // Cooldowns
  minCatchInterval: 3000,  // 3 seconds between catches
  suspiciousInterval: 1000, // < 1 second is suspicious
  
  // Pattern detection
  maxIdenticalCatchesInRow: 5, // Same fish repeatedly
  maxPerfectHooksInRow: 10,    // Too many perfect hooks
};

// Anti-farming state (stored in memory per session)
let antiFarmingState = {
  catches: [],  // timestamp array
  earnings: [], // { timestamp, amount } array
  lastCatch: 0,
  perfectHooksInRow: 0,
  identicalCatches: [],
  suspiciousActivity: false,
  warningCount: 0,
  banned: false,
};

/**
 * Check if user can catch a fish (rate limiting)
 */
export function canCatch() {
  const now = Date.now();
  
  // Check if banned
  if (antiFarmingState.banned) {
    return {
      allowed: false,
      reason: "Account suspended for suspicious activity. Contact support."
    };
  }
  
  // Check minimum interval
  const timeSinceLastCatch = now - antiFarmingState.lastCatch;
  if (timeSinceLastCatch < RATE_LIMITS.minCatchInterval) {
    return {
      allowed: false,
      reason: `Please wait ${((RATE_LIMITS.minCatchInterval - timeSinceLastCatch) / 1000).toFixed(1)}s before catching again.`
    };
  }
  
  // Check catches per minute
  const catchesLastMinute = antiFarmingState.catches.filter(t => now - t < 60000).length;
  if (catchesLastMinute >= RATE_LIMITS.maxCatchesPerMinute) {
    return {
      allowed: false,
      reason: "Catch rate too high. Take a breather!"
    };
  }
  
  // Check catches per hour
  const catchesLastHour = antiFarmingState.catches.filter(t => now - t < 3600000).length;
  if (catchesLastHour >= RATE_LIMITS.maxCatchesPerHour) {
    antiFarmingState.warningCount++;
    return {
      allowed: false,
      reason: "Hourly catch limit reached. Try again later!"
    };
  }
  
  // Check catches per day
  const catchesLastDay = antiFarmingState.catches.filter(t => now - t < 86400000).length;
  if (catchesLastDay >= RATE_LIMITS.maxCatchesPerDay) {
    antiFarmingState.warningCount++;
    return {
      allowed: false,
      reason: "Daily catch limit reached. Come back tomorrow!"
    };
  }
  
  return { allowed: true };
}

/**
 * Check if earnings are within limits
 */
export function canEarn(amount) {
  const now = Date.now();
  
  // Check hourly earnings
  const earningsLastHour = antiFarmingState.earnings
    .filter(e => now - e.timestamp < 3600000)
    .reduce((sum, e) => sum + e.amount, 0);
    
  if (earningsLastHour + amount > RATE_LIMITS.maxEarningsPerHour) {
    antiFarmingState.warningCount++;
    return {
      allowed: false,
      reason: "Hourly earning limit reached.",
      cappedAmount: Math.max(0, RATE_LIMITS.maxEarningsPerHour - earningsLastHour)
    };
  }
  
  // Check daily earnings
  const earningsLastDay = antiFarmingState.earnings
    .filter(e => now - e.timestamp < 86400000)
    .reduce((sum, e) => sum + e.amount, 0);
    
  if (earningsLastDay + amount > RATE_LIMITS.maxEarningsPerDay) {
    antiFarmingState.warningCount++;
    return {
      allowed: false,
      reason: "Daily earning limit reached. Come back tomorrow!",
      cappedAmount: Math.max(0, RATE_LIMITS.maxEarningsPerDay - earningsLastDay)
    };
  }
  
  return { allowed: true };
}

/**
 * Record a catch for rate limiting
 */
export function recordCatchAntiBot(fish, perfectHook = false) {
  const now = Date.now();
  
  // Check for suspicious rapid catching
  if (now - antiFarmingState.lastCatch < RATE_LIMITS.suspiciousInterval) {
    antiFarmingState.suspiciousActivity = true;
    antiFarmingState.warningCount++;
    console.warn("[AntiBot] Suspicious rapid catch detected");
  }
  
  // Record catch
  antiFarmingState.catches.push(now);
  antiFarmingState.lastCatch = now;
  
  // Track perfect hooks
  if (perfectHook) {
    antiFarmingState.perfectHooksInRow++;
    if (antiFarmingState.perfectHooksInRow > RATE_LIMITS.maxPerfectHooksInRow) {
      antiFarmingState.suspiciousActivity = true;
      antiFarmingState.warningCount++;
      console.warn("[AntiBot] Too many perfect hooks in a row");
    }
  } else {
    antiFarmingState.perfectHooksInRow = 0;
  }
  
  // Track identical catches
  antiFarmingState.identicalCatches.push(fish.speciesId);
  if (antiFarmingState.identicalCatches.length > RATE_LIMITS.maxIdenticalCatchesInRow) {
    antiFarmingState.identicalCatches.shift();
  }
  const allSame = antiFarmingState.identicalCatches.every(id => id === fish.speciesId);
  if (allSame && antiFarmingState.identicalCatches.length >= RATE_LIMITS.maxIdenticalCatchesInRow) {
    antiFarmingState.suspiciousActivity = true;
    antiFarmingState.warningCount++;
    console.warn("[AntiBot] Identical catches pattern detected");
  }
  
  // Cleanup old catches (older than 24 hours)
  antiFarmingState.catches = antiFarmingState.catches.filter(t => now - t < 86400000);
  
  // Ban if too many warnings
  if (antiFarmingState.warningCount >= 10) {
    antiFarmingState.banned = true;
    events.emit("toast", {
      msg: "⚠️ Account suspended for suspicious activity",
      kind: "error"
    });
    console.error("[AntiBot] Account banned for excessive warnings");
  }
}

/**
 * Record earnings for rate limiting
 */
export function recordEarnings(amount) {
  const now = Date.now();
  antiFarmingState.earnings.push({ timestamp: now, amount });
  
  // Cleanup old earnings (older than 24 hours)
  antiFarmingState.earnings = antiFarmingState.earnings.filter(e => now - e.timestamp < 86400000);
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus() {
  const now = Date.now();
  
  const catchesLastMinute = antiFarmingState.catches.filter(t => now - t < 60000).length;
  const catchesLastHour = antiFarmingState.catches.filter(t => now - t < 3600000).length;
  const catchesLastDay = antiFarmingState.catches.filter(t => now - t < 86400000).length;
  
  const earningsLastHour = antiFarmingState.earnings
    .filter(e => now - e.timestamp < 3600000)
    .reduce((sum, e) => sum + e.amount, 0);
  const earningsLastDay = antiFarmingState.earnings
    .filter(e => now - e.timestamp < 86400000)
    .reduce((sum, e) => sum + e.amount, 0);
  
  return {
    catchesLastMinute,
    catchesLastHour,
    catchesLastDay,
    earningsLastHour,
    earningsLastDay,
    warningCount: antiFarmingState.warningCount,
    suspiciousActivity: antiFarmingState.suspiciousActivity,
    banned: antiFarmingState.banned,
  };
}

/**
 * Reset anti-farming state (on wallet change)
 */
export function resetAntiFarming() {
  antiFarmingState = {
    catches: [],
    earnings: [],
    lastCatch: 0,
    perfectHooksInRow: 0,
    identicalCatches: [],
    suspiciousActivity: false,
    warningCount: 0,
    banned: false,
  };
}
