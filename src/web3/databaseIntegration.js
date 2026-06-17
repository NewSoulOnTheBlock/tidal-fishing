// Database integration layer - wires game state to PostgreSQL backend
// Auto-saves player state, records catches, syncs on wallet connect

import { authenticatePlayer, savePlayerState, recordCatch } from "./database.js";
import { currentPublicKey } from "./wallet.js";
import { S, events } from "../state/gameState.js";
import { saveGame } from "../state/saveLoad.js";

let autoSaveInterval = null;
let isAuthenticated = false;
let isSyncing = false;
let lastSyncTime = 0;

/**
 * Authenticate player on wallet connect and start auto-save
 */
export async function onWalletConnect() {
  const publicKey = currentPublicKey();
  if (!publicKey) {
    console.warn("[db] Cannot authenticate: no public key");
    return;
  }

  const walletAddress = publicKey.toString();
  console.log("[db] Authenticating player:", walletAddress);

  // Authenticate player (creates if new). The endpoint returns { player }.
  const authResult = await authenticatePlayer(walletAddress);
  const player = authResult?.player || authResult;
  if (!player) {
    console.error("[db] Authentication failed - database may be unavailable");
    return;
  }

  isAuthenticated = true;
  console.log("[db] ✅ Player authenticated:", player);

  // Emit toast notification (hud's toast listener expects { msg, kind }).
  events.emit("toast", {
    msg: "🗄️ Connected! Progress will auto-save.",
    kind: "success",
  });

  // First-time sign-in: no name chosen yet on the server or locally — force
  // the onboarding flow so every wallet picks an angler name.
  if (!player.username && !S.profile.username) {
    events.emit("onboarding:needed", { walletAddress });
  }

  // If this is first time connecting AND player has local progress,
  // push it to database immediately
  if ((player.level ?? 1) === 1 && (player.xp ?? 0) === 0 && S.profile.level > 1) {
    console.log("[db] Migrating localStorage progress to database");
    events.emit("toast", {
      msg: "📤 Syncing local progress to cloud...",
      kind: "info",
    });
    await syncPlayerState();
    events.emit("toast", {
      msg: "✅ Progress synced! You're all set!",
      kind: "success",
    });
  }

  // Start auto-save every 30s
  startAutoSave();
}

/**
 * Stop auto-save on wallet disconnect
 */
export function onWalletDisconnect() {
  stopAutoSave();
  isAuthenticated = false;
  console.log("[db] Wallet disconnected, auto-save stopped");
}

/**
 * Start auto-save interval (30 seconds)
 */
function startAutoSave() {
  if (autoSaveInterval) return;
  
  autoSaveInterval = setInterval(async () => {
    if (isAuthenticated && !isSyncing) {
      await syncPlayerState();
    }
  }, 30000); // 30 seconds

  console.log("[db] Auto-save started (30s interval)");
}

/**
 * Stop auto-save interval
 */
function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
    console.log("[db] Auto-save stopped");
  }
}

/**
 * Sync current player state to database
 */
export async function syncPlayerState() {
  const publicKey = currentPublicKey();
  if (!publicKey) return;

  if (isSyncing) {
    console.log("[db] Sync already in progress, skipping");
    return;
  }

  // Don't sync more than once every 5 seconds (debounce rapid saves)
  const now = Date.now();
  if (now - lastSyncTime < 5000) {
    console.log("[db] Sync debounced (too soon since last sync)");
    return;
  }

  isSyncing = true;
  lastSyncTime = now;
  const walletAddress = publicKey.toString();

  try {
    // Also save to localStorage
    saveGame();

    const success = await savePlayerState({
      walletAddress,
      level: S.profile.level,
      xp: S.profile.xp,
      money: S.profile.money,
      totalCatches: S.stats.catches,
      totalEarned: S.stats.totalEarned || S.stats.earned || S.profile.money,
      perfectHooks: S.stats.perfectHooks || 0,
      unlockedLocations: S.world.unlockedLocations,
      equippedGear: S.inventory?.equipped || S.gear?.equipped,
      ownedGear: S.inventory?.owned || S.gear?.owned,
      loginStreak: S.dailyLogin?.streak || 0,
    });

    if (success?.success) {
      console.log("[db] ✅ Player state synced successfully");
    } else {
      console.warn("[db] ⚠️ Player state sync failed:", success?.error);
    }
  } catch (error) {
    console.error("[db] Failed to sync player state:", error);
  } finally {
    isSyncing = false;
  }
}

/**
 * Record a fish catch to database
 */
export async function recordCatchToDB(fish, isPerfect = false) {
  const publicKey = currentPublicKey();
  if (!publicKey || !isAuthenticated) return;

  const walletAddress = publicKey.toString();

  try {
    const success = await recordCatch({
      walletAddress,
      speciesId: fish.speciesId,
      location: S.world.location,
      rarity: fish.rarity,
      sizeCm: fish.sizeCm,
      weightKg: fish.weightKg,
      value: fish.value,
      perfectHook: isPerfect,
    });

    if (success) {
      console.log("[db] ✅ Catch recorded:", fish.speciesId);
    }
  } catch (error) {
    console.error("[db] Failed to record catch:", error);
  }
}

/**
 * Manual sync trigger (for major state changes)
 */
export async function forceSyncNow() {
  if (!isAuthenticated) {
    console.log("[db] Not authenticated, skipping force sync");
    return;
  }
  
  console.log("[db] Force sync triggered");
  await syncPlayerState();
}

// Listen for level up events to force immediate sync
events.on("xp:levelup", () => {
  forceSyncNow();
});

// Listen for location unlock to force sync
events.on("location:unlock", () => {
  forceSyncNow();
});

// Listen for gear purchase to force sync
events.on("inventory:purchase", () => {
  forceSyncNow();
});
