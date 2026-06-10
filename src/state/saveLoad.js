// localStorage persistence with graceful fallback when storage is unavailable
// (private browsing, blocked storage, etc.). Falls back to in-memory only.

import { CONFIG } from "../data/config.js";
import { S, createDefaultState, assignState, events } from "./gameState.js";
import { deepMerge } from "../utils/utils.js";

let storageOk = true;
try {
  const probe = "__tideline_probe__";
  localStorage.setItem(probe, "1");
  localStorage.removeItem(probe);
} catch {
  storageOk = false;
}

export function hasSave() {
  if (!storageOk) return false;
  try {
    return localStorage.getItem(CONFIG.saveKey) !== null;
  } catch {
    return false;
  }
}

export function saveGame() {
  if (!storageOk) return false;
  try {
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(S));
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
    const raw = localStorage.getItem(CONFIG.saveKey);
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
      localStorage.removeItem(CONFIG.saveKey);
    } catch {
      /* storage may be blocked; in-memory reset still proceeds */
    }
  }
  assignState(createDefaultState());
}
