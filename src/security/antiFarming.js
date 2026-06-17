// Anti-Farming Security System
// Prevents treasury draining and exploitative behavior

import { S, events } from "../state/gameState.js";

// Account suspension (automatic anti-farming ban) master switch. Disabled for
// now — flip to true to re-enable auto-suspension after excessive warnings.
// Warning tracking + soft rate limiting/breaks stay active regardless.
const ACCOUNT_SUSPENSION_ENABLED = false;

// Rate limiting config
const RATE_LIMITS = {
  // Maximum catches per time period
  maxCatchesPerMinute: 5,    // Reduced from 10
  maxCatchesPerHour: 150,    // Reduced from 300
  maxCatchesPerDay: 800,     // Reduced from 2000
  
  // Maximum earnings per time period
  maxEarningsPerHour: 5000,   // 5k $TIDE per hour (reduced from 16.7k)
  maxEarningsPerDay: 30000,   // 30k $TIDE per day (reduced from 100k)
  
  // Cooldowns
  minCatchInterval: 5000,     // 5 seconds between catches (increased from 3s)
  suspiciousInterval: 2000,   // < 2 seconds is suspicious (increased from 1s)
  
  // Pattern detection
  maxIdenticalCatchesInRow: 3,  // Same fish repeatedly (reduced from 5)
  maxPerfectHooksInRow: 5,      // Too many perfect hooks (reduced from 10)
  
  // Session limits
  maxSessionDuration: 14400000, // 4 hours max session before forced break (new)
  requiredBreakDuration: 1800000, // 30 minute break required (new)
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
  sessionStartTime: Date.now(),
  onBreak: false,
  breakStartTime: 0,
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
  
  // Check if on required break
  if (antiFarmingState.onBreak) {
    const breakElapsed = now - antiFarmingState.breakStartTime;
    if (breakElapsed < RATE_LIMITS.requiredBreakDuration) {
      const remaining = Math.ceil((RATE_LIMITS.requiredBreakDuration - breakElapsed) / 60000);
      return {
        allowed: false,
        reason: `Required break time. Resume in ${remaining} minutes.`
      };
    } else {
      // Break is over, reset session
      antiFarmingState.onBreak = false;
      antiFarmingState.sessionStartTime = now;
      console.log("[AntiBot] Break complete, session reset");
    }
  }
  
  // Check session duration (force break after 4 hours)
  const sessionDuration = now - antiFarmingState.sessionStartTime;
  if (sessionDuration > RATE_LIMITS.maxSessionDuration) {
    antiFarmingState.onBreak = true;
    antiFarmingState.breakStartTime = now;
    return {
      allowed: false,
      reason: "Max session time reached. Take a 30 minute break!"
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
    antiFarmingState.warningCount++;
    return {
      allowed: false,
      reason: "Catch rate too high. Slow down!"
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
    antiFarmingState.warningCount += 2;
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
  
  // More aggressive ban threshold (gated by master switch — off for now)
  if (ACCOUNT_SUSPENSION_ENABLED && antiFarmingState.warningCount >= 5) {  // Reduced from 10
    antiFarmingState.banned = true;
    events.emit("toast", {
      msg: "⚠️ Account suspended for suspicious activity",
      kind: "error"
    });
    console.error("[AntiBot] Account banned for excessive warnings");
  }
  
  // Log suspicious patterns to console for monitoring
  if (antiFarmingState.suspiciousActivity) {
    console.warn("[AntiBot] Suspicious pattern detected:", {
      warnings: antiFarmingState.warningCount,
      perfectHooksInRow: antiFarmingState.perfectHooksInRow,
      identicalCatches: antiFarmingState.identicalCatches.length,
    });
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
    sessionStartTime: Date.now(),
    onBreak: false,
    breakStartTime: 0,
  };
}

/**
 * Get session info
 */
export function getSessionInfo() {
  const now = Date.now();
  const sessionDuration = now - antiFarmingState.sessionStartTime;
  const sessionRemaining = RATE_LIMITS.maxSessionDuration - sessionDuration;
  
  return {
    sessionDuration,
    sessionRemaining,
    sessionMaxDuration: RATE_LIMITS.maxSessionDuration,
    onBreak: antiFarmingState.onBreak,
    breakRemaining: antiFarmingState.onBreak 
      ? RATE_LIMITS.requiredBreakDuration - (now - antiFarmingState.breakStartTime)
      : 0,
  };
}
