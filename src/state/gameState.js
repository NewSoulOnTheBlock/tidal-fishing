// Central mutable game state (S), the shared event bus, and the explicit
// finite state machine that drives every gameplay phase transition.

import { EventBus } from "../utils/utils.js";
import { CONFIG } from "../data/config.js";

export const events = new EventBus();

export const Phase = {
  MENU: "MENU",
  IDLE: "IDLE", // aiming, free to open screens
  CHARGING: "CHARGING", // power meter active
  FLYING: "FLYING", // bobber in the air
  WAITING: "WAITING", // bobber floating, bite timers running
  BITE: "BITE", // hook reaction window
  REELING: "REELING", // tension/progress fight (and catch landing anim)
  CATCH: "CATCH", // catch card displayed
  RETRIEVING: "RETRIEVING", // reeling back an untouched bobber
  SHOP: "SHOP",
  JOURNAL: "JOURNAL",
  MAP: "MAP",
};

const GAMEPLAY_PHASES = new Set([
  Phase.IDLE, Phase.CHARGING, Phase.FLYING, Phase.WAITING,
  Phase.BITE, Phase.REELING, Phase.RETRIEVING,
]);

export const isGameplayPhase = (p) => GAMEPLAY_PHASES.has(p);

export class StateMachine {
  constructor() {
    this.defs = {};
    this.current = null;
    this.prev = null;
  }
  register(name, def) {
    this.defs[name] = def || {};
  }
  set(name, data) {
    if (this.current === name) return;
    const from = this.current;
    this.defs[from]?.exit?.(name);
    this.prev = from;
    this.current = name;
    events.emit("phase", { from, to: name, data });
    this.defs[name]?.enter?.(data);
  }
  is(...names) {
    return names.includes(this.current);
  }
}

export const machine = new StateMachine();

export function createDefaultState() {
  return {
    version: 1,
    profile: {
      money: CONFIG.economy.startMoney,
      xp: 0,
      level: 1,
      username: "",
      bio: "",
      avatar: "default",
      tutorialSeen: false,
    },
    gear: {
      owned: { rods: [0], reels: [0], lines: [0], baits: [0] },
      equipped: { rods: 0, reels: 0, lines: 0, baits: 0 },
    },
    world: {
      current: "lake",
      unlocked: ["lake"],
      hour: CONFIG.time.startHour,
      weather: "clear",
    },
    journal: {}, // speciesId -> { count, bestSize, bestWeight, first }
    inventory: [], // { speciesId, sizeCm, weightKg, value }
    stats: { 
      casts: 0, 
      catches: 0, 
      earned: 0, 
      snaps: 0, 
      bestSpecies: null, 
      bestSize: 0,
      perfectHooks: 0,
    },
    settings: { volume: 0.8, muted: false, quality: "high" },
    // Progression systems
    progressionJournal: null,  // Initialized by initJournal()
    dailyLogin: null,          // Initialized by initDailyLogin()
    achievements: null,        // Initialized by initAchievements()
    weather: null,             // Initialized by initWeather()
    onchain: {
      purchases: [],           // { kind, signature, burned, at }
    },
  };
}

export const S = createDefaultState();

/** Replace S's contents in place so existing references stay valid. */
export function assignState(next) {
  for (const key of Object.keys(S)) delete S[key];
  Object.assign(S, next);
}
