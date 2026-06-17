// localStorage persistence with graceful fallback when storage is unavailable
// (private browsing, blocked storage, etc.). Falls back to in-memory only.
//
// Tidal extension: when a Solana wallet is connected, saves are keyed by the
// wallet address (`tidal_save_v1:<addr>`) so different wallets get distinct
// progress. On the first connection of a wallet with no save, the anonymous
// local save is migrated into the wallet slot. The anonymous slot
// (`tidal_save_v1`) is still used as the fallback for offline play.

import { CONFIG } from "../data/config.js";
import { S, createDefaultState, assignState, events } from "./gameState.js";
import { deepMerge } from "../utils/utils.js";

let storageOk = true;
try {
  const probe = "__tidal_probe__";
  localStorage.setItem(probe, "1");
  localStorage.removeItem(probe);
} catch {
  storageOk = false;
}

let walletKey = null; // null = anonymous local save

/** Compose the localStorage key for the active slot. */
function activeKey() {
  return walletKey ? `${CONFIG.saveKey}:${walletKey}` : CONFIG.saveKey;
}

/** Read the legacy tideline-era key once for backward compatibility. */
function migrateLegacyIfNeeded() {
  if (!storageOk || !CONFIG.legacySaveKey) return;
  try {
    if (localStorage.getItem(CONFIG.saveKey)) return;
    const legacy = localStorage.getItem(CONFIG.legacySaveKey);
    if (!legacy) return;
    localStorage.setItem(CONFIG.saveKey, legacy);
    localStorage.removeItem(CONFIG.legacySaveKey);
  } catch {
    /* ignore */
  }
}
migrateLegacyIfNeeded();

export function hasSave() {
  if (!storageOk) return false;
  try {
    return localStorage.getItem(activeKey()) !== null;
  } catch {
    return false;
  }
}

export function saveGame() {
  if (!storageOk) return false;
  try {
    localStorage.setItem(activeKey(), JSON.stringify(S));
    events.emit("save:done");
    return true;
  } catch {
    return false;
  }
}

/** Loads the save (if any) into S, merged over defaults. Returns true if loaded. */
export function loadGame() {
  if (!storageOk) return false;
  try {
    const raw = localStorage.getItem(activeKey());
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    assignState(deepMerge(createDefaultState(), parsed));
    return true;
  } catch {
    return false;
  }
}

export function resetSave() {
  if (storageOk) {
    try {
      localStorage.removeItem(activeKey());
    } catch {
      /* storage may be blocked; in-memory reset still proceeds */
    }
  }
  assignState(createDefaultState());
}

/**
 * Switch the active save slot to a wallet address (or back to anonymous).
 *
 *   setWalletSlot("9X...abc")   // load that wallet's save (migrate anon save in if empty)
 *   setWalletSlot(null)          // disconnect: persist current state, load anon save
 *
 * Returns true if a save was loaded into S (false if a fresh default was applied).
 */
export function setWalletSlot(address) {
  if (!storageOk) {
    walletKey = address ?? null;
    return false;
  }
  // Persist current progress to the previously-active slot before switching.
  try {
    localStorage.setItem(activeKey(), JSON.stringify(S));
  } catch {
    /* ignore */
  }

  walletKey = address ?? null;
  const next = activeKey();

  let raw;
  try {
    raw = localStorage.getItem(next);
  } catch {
    raw = null;
  }

  if (!raw) {
    // First time we've seen this wallet on this device.
    // If the player has meaningful progress on the anonymous save, clone it in
    // so connecting a wallet doesn't feel like wiping their account.
    if (walletKey) {
      try {
        const anon = localStorage.getItem(CONFIG.saveKey);
        if (anon) {
          localStorage.setItem(next, anon);
          raw = anon;
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        assignState(deepMerge(createDefaultState(), parsed));
        events.emit("save:slot", { wallet: walletKey });
        return true;
      }
    } catch {
      /* fall through to default state */
    }
  }
  assignState(createDefaultState());
  events.emit("save:slot", { wallet: walletKey });
  return false;
}

export function getActiveWalletSlot() {
  return walletKey;
}
