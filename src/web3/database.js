// Database API client for Tidal Fishing
// Handles player authentication, state persistence, and leaderboards

import { apiFetch } from '../utils/api.js';

/**
 * Authenticate player with wallet address
 * Creates new player if doesn't exist, updates last_login if exists
 */
export async function authenticatePlayer(walletAddress) {
  try {
    const res = await apiFetch('/api/player/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Authentication failed');
    }
    
    return await res.json();
  } catch (error) {
    console.error('[database] Auth error:', error);
    throw error;
  }
}

/**
 * Save player state to database
 * @param {string} walletAddress 
 * @param {Object} state - Player state object
 */
export async function savePlayerState(playerState = {}) {
  const {
    walletAddress,
    level,
    xp,
    money,
    totalCatches,
    totalEarned,
    perfectHooks = 0,
    snaps = 0,
    unlockedLocations,
    equippedGear = {},
    ownedGear,
  } = playerState;

  try {
    const res = await apiFetch('/api/player/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        state: {
          level,
          xp,
          money,
          totalCatches,
          totalEarned,
          perfectHooks,
          snaps,
          unlockedLocations,
          equippedRod: equippedGear.rods,
          equippedReel: equippedGear.reels,
          equippedLine: equippedGear.lines,
          equippedBait: equippedGear.baits,
          ownedGear,
        }
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Save failed (HTTP ${res.status})`);
    }

    return await res.json();
  } catch (error) {
    console.error('[database] Save error:', error);
    // Don't throw - saving is best-effort
    return { success: false, error: error.message };
  }
}

/**
 * Record a fish catch to database
 * @param {string} walletAddress 
 * @param {Object} catchData - Catch details
 */
export async function recordCatch(catchInfo = {}) {
  const {
    walletAddress,
    speciesId,
    location,
    rarity,
    sizeCm,
    weightKg,
    value,
    perfectHook = false,
  } = catchInfo;

  try {
    const res = await apiFetch('/api/player/catch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        catch: {
          speciesId,
          location,
          rarity,
          sizeCm,
          weightKg,
          value,
          perfectHook,
        }
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Failed to record catch (HTTP ${res.status})`);
    }

    return await res.json();
  } catch (error) {
    console.error('[database] Record catch error:', error);
    // Don't throw - recording is best-effort
    return { success: false, error: error.message };
  }
}

/**
 * Get top 100 leaderboard
 */
export async function getLeaderboard() {
  try {
    const res = await apiFetch('/api/leaderboard');
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch leaderboard');
    }
    
    return await res.json();
  } catch (error) {
    console.error('[database] Leaderboard error:', error);
    return { leaderboard: [] };
  }
}

/**
 * Get player stats
 * @param {string} walletAddress 
 */
export async function getPlayerStats(walletAddress) {
  try {
    const res = await apiFetch(`/api/player/stats/${walletAddress}`);
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch stats');
    }
    
    return await res.json();
  } catch (error) {
    console.error('[database] Stats error:', error);
    return null;
  }
}

/**
 * Get player journal
 * @param {string} walletAddress 
 */
export async function getPlayerJournal(walletAddress) {
  try {
    const res = await apiFetch(`/api/player/journal/${walletAddress}`);
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch journal');
    }
    
    return await res.json();
  } catch (error) {
    console.error('[database] Journal error:', error);
    return { journal: [] };
  }
}

/**
 * Update player profile (username, profile picture, bio)
 * @param {string} walletAddress
 * @param {Object} updates - { username, profilePicture, bio }
 */
export async function updateProfile(walletAddress, updates) {
  try {
    const res = await apiFetch('/api/player/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        walletAddress, 
        ...updates 
      }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update profile');
    }
    
    return await res.json();
  } catch (error) {
    console.error('[database] Profile update error:', error);
    throw error;
  }
}

/**
 * Get player profile (public view with achievements)
 * @param {string} walletAddress
 */
export async function getPlayerProfile(walletAddress) {
  try {
    const res = await apiFetch(`/api/player/profile/${walletAddress}`);
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to fetch profile');
    }
    
    return await res.json();
  } catch (error) {
    console.error('[database] Profile fetch error:', error);
    return null;
  }
}
