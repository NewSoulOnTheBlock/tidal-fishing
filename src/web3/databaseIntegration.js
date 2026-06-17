// Database integration layer - wires game state to PostgreSQL backend
// Auto-saves player state, records catches, syncs on wallet connect

import { authenticatePlayer, savePlayerState, recordCatch } from "./database.js";
import { currentPublicKey } from "./wallet.js";
import { establishSession, clearSession, getSessionToken } from "./session.js";
import { S, events } from "../state/gameState.js";
import { saveGame } from "../state/saveLoad.js";
import { apiFetch } from "../utils/api.js";
import { addMoney } from "../economy/economy.js";

let autoSaveInterval = null;
let isAuthenticated = false;
let isSyncing = false;
let lastSyncTime = 0;
let sessionPromptWallet = null;
let lastCheckinWallet = null;

/**
 * Kick off the one-time Sign-In With Solana signature for this wallet. Shows a
 * single explanatory toast (once per wallet) so the signature prompt isn't a
 * surprise. Fire-and-forget — never blocks the connect flow or gameplay.
 */
function ensureSession(walletAddress) {
  if (getSessionToken()) return Promise.resolve(true);
  if (sessionPromptWallet !== walletAddress) {
    sessionPromptWallet = walletAddress;
    events.emit("toast", {
      msg: "✍️ Approve the signature to enable chat & cloud save",
      kind: "info",
    });
  }
  return establishSession().then((ok) => {
    if (ok) {
      events.emit("toast", { msg: "✅ Signed in — chat & cloud save active", kind: "success" });
    }
    return !!ok;
  }).catch(() => false /* user dismissed; will retry on next explicit action */);
}

/**
 * Daily check-in: advances the consecutive-day streak and, once per UTC day,
 * credits a small $TIDE bonus (server-authoritative). Runs once per connect and
 * only after a session token exists. Non-interactive so it never pops a wallet
 * prompt on its own.
 */
async function checkInDaily(walletAddress) {
  if (lastCheckinWallet === walletAddress) return;
  lastCheckinWallet = walletAddress;
  try {
    const res = await apiFetch("/api/player/checkin", {
      method: "POST",
      auth: true,
      interactive: false,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    if (data.bonus > 0) {
      // Reflect the server-credited bonus in the local display balance.
      addMoney(data.bonus);
      const streak = data.streak || 1;
      events.emit("toast", {
        msg: `🔥 ${streak}-day streak! +${data.bonus} $TIDE daily bonus`,
        kind: "success",
      });
    }
  } catch { /* best-effort flavor */ }
}

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

  // Sign-In With Solana: prompt for the session signature RIGHT NOW, while the
  // user is in the "just connected" context. Fired independently of (and before)
  // the DB authenticate call below, which can cold-start or fail — a slow/empty
  // database must never suppress or delay the sign-in prompt.
  const sessionReady = ensureSession(walletAddress);
  // Once a session exists, run the daily streak check-in (non-interactive).
  sessionReady.then((ok) => { if (ok) checkInDaily(walletAddress); });

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
  sessionPromptWallet = null;
  lastCheckinWallet = null;
  clearSession();
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
      location: S.world.current,
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
