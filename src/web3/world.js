// Shared-world client: presence heartbeat, online angler count, the daily hot
// spot, and the catch of the day. Pure data + polling — the UI lives in
// socialUI.js and reacts to the "world:update" event.

import { apiFetch } from "../utils/api.js";
import { events } from "../state/gameState.js";
import { currentPublicKey } from "./wallet.js";

const PRESENCE_MS = 30000; // heartbeat cadence (server TTL is 60s)
const WORLD_MS = 60000;    // world snapshot (catch of the day) refresh

// Stable per-tab id so each open tab counts as exactly one angler.
function tabId() {
  try {
    let id = sessionStorage.getItem("tidal_tab_id");
    if (!id) {
      id = "t_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("tidal_tab_id", id);
    }
    return id;
  } catch {
    return "t_" + Math.random().toString(36).slice(2);
  }
}

const state = {
  online: 0,
  hotSpot: null,
  hotSpotLabel: null,
  catchOfDay: null,
};

let presenceTimer = null;
let worldTimer = null;
let started = false;

export function getOnline() { return state.online; }
export function getHotSpot() { return state.hotSpot; }
export function getHotSpotLabel() { return state.hotSpotLabel; }
export function getCatchOfDay() { return state.catchOfDay; }
export function isHotSpot(loc) { return !!loc && loc === state.hotSpot; }
export function getWorld() { return { ...state }; }

function emit() { events.emit("world:update", { ...state }); }

async function pingPresence() {
  try {
    const wallet = currentPublicKey()?.toString() || undefined;
    const res = await apiFetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tabId(), walletAddress: wallet }),
      timeoutMs: 8000,
    });
    if (!res.ok) return;
    const data = await res.json();
    let changed = false;
    if (typeof data.online === "number" && data.online !== state.online) {
      state.online = data.online; changed = true;
    }
    if (data.hotSpot && data.hotSpot !== state.hotSpot) {
      state.hotSpot = data.hotSpot; changed = true;
    }
    if (changed) emit();
  } catch { /* transient — next heartbeat retries */ }
}

async function fetchWorld() {
  try {
    const res = await apiFetch("/api/world", { timeoutMs: 8000 });
    if (!res.ok) return;
    const data = await res.json();
    state.online = typeof data.online === "number" ? data.online : state.online;
    state.hotSpot = data.hotSpot || state.hotSpot;
    state.hotSpotLabel = data.hotSpotLabel || state.hotSpotLabel;
    state.catchOfDay = data.catchOfDay || null;
    emit();
  } catch { /* transient */ }
}

function startTimers() {
  if (!presenceTimer) { pingPresence(); presenceTimer = setInterval(pingPresence, PRESENCE_MS); }
  if (!worldTimer) { fetchWorld(); worldTimer = setInterval(fetchWorld, WORLD_MS); }
}

function stopTimers() {
  if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
  if (worldTimer) { clearInterval(worldTimer); worldTimer = null; }
}

export function startWorld() {
  if (started) return;
  started = true;
  startTimers();
  // Pause polling while the tab is hidden to avoid needless network churn.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimers();
    else startTimers();
  });
}
