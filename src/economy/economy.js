// Money, XP/levels, inventory, journal records, gear purchases and location
// unlocks. Operates on the central state S and emits UI events.

import { CONFIG } from "../data/config.js";
import { S, events } from "../state/gameState.js";
import { GEAR } from "../data/gearData.js";
import { LOCATIONS } from "../data/locationData.js";
import { FISH_BY_ID } from "../data/fishData.js";
import { saveGame } from "../state/saveLoad.js";
import { recordCatch as recordJournalCatch } from "../progression/journal.js";
import { updateChallengeProgress } from "../progression/challenges.js";
import { checkAchievements } from "../progression/achievements.js";
import { updateTournamentScore } from "../progression/tournament.js";
import { recordCatch as recordCatchDB } from "../web3/database.js";
import { currentPublicKey } from "../web3/wallet.js";
import { canCatch, recordCatchAntiBot, recordEarnings } from "../security/antiFarming.js";
import { validateCatch, showBanMessage } from "../web3/catchValidation.js";

export const xpToNext = (level) => Math.round(CONFIG.economy.xpBase * Math.pow(level, CONFIG.economy.xpPow));

export function getEquipped() {
  return {
    rod: GEAR.rods[S.gear.equipped.rods],
    reel: GEAR.reels[S.gear.equipped.reels],
    line: GEAR.lines[S.gear.equipped.lines],
    bait: GEAR.baits[S.gear.equipped.baits],
  };
}

/** Flattened gameplay modifiers from the currently equipped gear. */
export function getStats() {
  const eq = getEquipped();
  return {
    castMult: eq.rod.castMult,
    control: eq.rod.control,
    reelSpeed: eq.reel.speed,
    lineStrength: eq.line.strength,
    biteSpeed: eq.bait.biteSpeed,
    bait: eq.bait,
  };
}

function emitMoney(delta) {
  events.emit("money", { money: S.profile.money, delta });
}

/**
 * Add money to player's balance (from rewards, claims, etc)
 */
export function addMoney(amount) {
  const add = Math.max(0, Math.floor(amount));
  if (add <= 0) return 0;
  
  // ANTI-FARMING: Record earnings
  recordEarnings(add);
  
  S.profile.money += add;
  S.stats.earned += add;
  emitMoney(add);
  saveGame();
  return add;
}

/**
 * Subtract `amount` from the in-game earned $TIDE bucket. Used after a
 * confirmed on-chain withdrawal so the off-chain balance reflects what was
 * moved to the wallet. Clamped at zero — never overdraws.
 */
export function deductMoney(amount) {
  const take = Math.min(S.profile.money, Math.max(0, Math.floor(amount)));
  if (take <= 0) return 0;
  S.profile.money -= take;
  emitMoney(-take);
  saveGame();
  return take;
}

function emitXp(gained = 0) {
  events.emit("xp", {
    xp: S.profile.xp,
    level: S.profile.level,
    next: xpToNext(S.profile.level),
    gained,
  });
}

/** Adds XP, processes any level-ups and announces newly available unlocks. */
export function addXp(amount) {
  S.profile.xp += amount;
  let levels = 0;
  while (S.profile.xp >= xpToNext(S.profile.level)) {
    S.profile.xp -= xpToNext(S.profile.level);
    S.profile.level += 1;
    levels += 1;

    const unlocks = [];
    for (const [cat, items] of Object.entries(GEAR)) {
      for (const item of items) {
        if (item.level === S.profile.level && item.price > 0) {
          unlocks.push(`${item.name} available in the shop`);
        }
      }
      void cat;
    }
    for (const loc of LOCATIONS) {
      if (loc.unlock.level === S.profile.level && !S.world.unlocked.includes(loc.id)) {
        unlocks.push(`${loc.name} can now be unlocked on the Map`);
      }
    }
    events.emit("levelup", { level: S.profile.level, unlocks });
  }
  emitXp(amount);
  return levels;
}

/** Registers a landed fish: inventory, journal, records, XP. Jackpot species
 *  (fish.jackpot === true) bypass the catch bag entirely and credit their
 *  full value to the player on the spot.
 *  
 *  NOW REQUIRES SERVER VALIDATION - prevents offline fishing.
 */
export async function registerCatch(fish) {
  // SERVER VALIDATION CHECK (prevents offline fishing)
  const validation = await validateCatch(fish.speciesId, fish.value);
  if (!validation.allowed) {
    console.warn("[economy] Catch blocked by server:", validation.error);
    
    if (validation.banned) {
      showBanMessage(validation.error);
    } else {
      events.emit("toast", { msg: validation.error || "Catch validation failed", kind: "warn" });
    }
    
    return {
      xpGained: 0,
      levels: [],
      moneyGained: 0,
      isNew: false,
      isRecord: false,
      blocked: true,
      serverBlocked: true,
    };
  }
  
  // ANTI-FARMING CHECK
  const catchCheck = canCatch();
  if (!catchCheck.allowed) {
    console.warn("[economy] Catch blocked by anti-farming:", catchCheck.reason);
    events.emit("toast", { msg: catchCheck.reason, kind: "warn" });
    return {
      xpGained: 0,
      levels: [],
      moneyGained: 0,
      isNew: false,
      isRecord: false,
      blocked: true,
    };
  }
  
  // Record catch for anti-bot tracking
  recordCatchAntiBot(fish, fish.isPerfect);
  
  const isJackpot = !!fish.jackpot;

  if (isJackpot) {
    // No inventory entry — auto-credit. This avoids ever having a 10M $TIDE
    // fish sitting in the catch bag (sellable, but losable if the bag is
    // somehow cleared elsewhere).
    S.profile.money += fish.value;
    S.stats.earned += fish.value;
    emitMoney(fish.value);
  } else {
    S.inventory.push({
      speciesId: fish.speciesId,
      sizeCm: fish.sizeCm,
      weightKg: fish.weightKg,
      value: fish.value,
    });
  }

  const entry = S.journal[fish.speciesId];
  const isNew = !entry;
  let isRecord = false;
  if (isNew) {
    S.journal[fish.speciesId] = {
      count: 1,
      bestSize: fish.sizeCm,
      bestWeight: fish.weightKg,
      first: Date.now(),
    };
    events.emit("journal:new", { speciesId: fish.speciesId });
  } else {
    entry.count += 1;
    if (fish.sizeCm > entry.bestSize) {
      entry.bestSize = fish.sizeCm;
      entry.bestWeight = Math.max(entry.bestWeight, fish.weightKg);
      isRecord = true;
    }
  }

  S.stats.catches += 1;
  if (fish.sizeCm > S.stats.bestSize) {
    S.stats.bestSize = fish.sizeCm;
    S.stats.bestSpecies = fish.speciesId;
  }

  const xpGained = Math.round(fish.xp * (isNew ? CONFIG.economy.newSpeciesXpMult : 1));
  const levels = addXp(xpGained);

  // Track in new progression systems
  if (S.progressionJournal) {
    recordJournalCatch(S.progressionJournal, fish.speciesId, fish.sizeCm, fish.weightKg, fish.value);
  }
  
  // Record catch in database (async, best-effort)
  const publicKey = currentPublicKey();
  if (publicKey) {
    recordCatchDB({
      walletAddress: publicKey.toString(),
      speciesId: fish.speciesId,
      location: S.world.current,
      rarity: fish.rarity,
      sizeCm: fish.sizeCm,
      weightKg: fish.weightKg,
      value: fish.value,
      perfectHook: fish.isPerfect || false,
    }).catch(err => console.error('[economy] Failed to record catch to DB:', err));
  }
  
  // Update daily challenges
  if (S.challenges) {
    const completed = updateChallengeProgress(S.challenges, {
      type: 'catch',
      species: fish.speciesId,
      location: S.world.current,
      rarity: fish.rarity,
      value: fish.value,
    });
    if (completed) events.emit("challenge:complete");
  }

  // Check achievements
  if (S.achievements) {
    const stats = getGameStats();
    const newAchievements = checkAchievements(S.achievements, stats);
    if (newAchievements.length > 0) {
      events.emit("achievements:unlocked", newAchievements);
    }
  }

  // Update tournament score if active
  if (S.tournament?.currentTournament?.started && !S.tournament.currentTournament.ended) {
    updateTournamentScore(S.tournament.currentTournament, {
      speciesId: fish.speciesId,
      sizeCm: fish.sizeCm,
      value: fish.value,
      rarity: fish.rarity,
    });
  }

  events.emit("inventory");
  saveGame();
  return { isNew, isRecord, xpGained, levels, isJackpot };
}

export const inventoryValue = () => S.inventory.reduce((sum, f) => sum + f.value, 0);

export function sellFishAt(index) {
  const fish = S.inventory[index];
  if (!fish) return 0;
  S.inventory.splice(index, 1);
  S.profile.money += fish.value;
  S.stats.earned += fish.value;
  emitMoney(fish.value);
  events.emit("inventory");
  saveGame();
  return fish.value;
}

export function sellAll() {
  const total = inventoryValue();
  if (total <= 0) return 0;
  S.inventory.length = 0;
  S.profile.money += total;
  S.stats.earned += total;
  emitMoney(total);
  events.emit("inventory");
  saveGame();
  return total;
}

export function buyGear(catKey, index) {
  const item = GEAR[catKey]?.[index];
  if (!item) return { ok: false, reason: "Unknown item" };
  if (S.gear.owned[catKey].includes(index)) return { ok: false, reason: "Already owned" };
  if (S.profile.level < item.level) return { ok: false, reason: `Requires level ${item.level}` };
  if (S.profile.money < item.price) return { ok: false, reason: "Not enough $TIDE" };
  S.profile.money -= item.price;
  S.gear.owned[catKey].push(index);
  S.gear.equipped[catKey] = index; // auto-equip new purchases
  emitMoney(-item.price);
  events.emit("gear");
  saveGame();
  return { ok: true, item };
}

/**
 * Grant gear after a successful on-chain $TIDE burn. Skips the in-game
 * balance check/deduction since the player has burned real $TIDE supply.
 * The burn signature is recorded in the save for audit.
 */
export function grantGearOnChain(catKey, index, signature) {
  const item = GEAR[catKey]?.[index];
  if (!item) return { ok: false, reason: "Unknown item" };
  if (S.gear.owned[catKey].includes(index)) return { ok: false, reason: "Already owned" };
  if (S.profile.level < item.level) return { ok: false, reason: `Requires level ${item.level}` };
  S.gear.owned[catKey].push(index);
  S.gear.equipped[catKey] = index;
  S.onchain ??= { purchases: [] };
  S.onchain.purchases.push({ kind: "gear", catKey, index, burned: item.price, signature, at: Date.now() });
  events.emit("gear");
  saveGame();
  return { ok: true, item };
}

export function equipGear(catKey, index) {
  if (!S.gear.owned[catKey]?.includes(index)) return false;
  S.gear.equipped[catKey] = index;
  events.emit("gear");
  saveGame();
  return true;
}

export function canUnlockLocation(loc) {
  if (S.world.unlocked.includes(loc.id)) return { ok: false, reason: "Already unlocked" };
  if (S.profile.level < loc.unlock.level) return { ok: false, reason: `Requires level ${loc.unlock.level}` };
  if (S.profile.money < loc.unlock.cost) return { ok: false, reason: "Not enough $TIDE" };
  return { ok: true };
}

/** Helper to build stats object for achievement checks */
export function getGameStats() {
  const uniqueSpecies = Object.values(S.journal).filter(e => e.count > 0).length;
  const rarityCounts = {};
  
  for (const [speciesId, entry] of Object.entries(S.journal)) {
    if (entry.count > 0) {
      const species = FISH_BY_ID[speciesId];
      if (species) {
        rarityCounts[species.rarity] = (rarityCounts[species.rarity] || 0) + entry.count;
      }
    }
  }

  return {
    totalCaught: S.stats.catches,
    uniqueSpecies,
    rarityCounts: {
      common: rarityCounts.common || 0,
      uncommon: rarityCounts.uncommon || 0,
      rare: rarityCounts.rare || 0,
      epic: rarityCounts.epic || 0,
      legendary: rarityCounts.legendary || 0,
    },
    lifetimeEarnings: S.stats.earned,
    unlockedLocations: S.world.unlocked,
    perfectHooks: S.stats.perfectHooks || 0,
    jackpotCaught: S.journal.smokingchicken?.count > 0,
    loginStreak: S.dailyLogin?.streak || 0,
  };
}

export function unlockLocation(loc) {
  const check = canUnlockLocation(loc);
  if (!check.ok) return check;
  S.profile.money -= loc.unlock.cost;
  S.world.unlocked.push(loc.id);
  emitMoney(-loc.unlock.cost);
  events.emit("toast", { msg: `${loc.name} unlocked!`, kind: "gold" });
  saveGame();
  return { ok: true };
}

/**
 * Unlock a location after a successful on-chain $TIDE burn. Skips the
 * in-game balance check/deduction since the player has burned real $TIDE.
 */
export function grantLocationOnChain(loc, signature) {
  if (S.world.unlocked.includes(loc.id)) return { ok: false, reason: "Already unlocked" };
  if (S.profile.level < loc.unlock.level) return { ok: false, reason: `Requires level ${loc.unlock.level}` };
  S.world.unlocked.push(loc.id);
  S.onchain ??= { purchases: [] };
  S.onchain.purchases.push({ kind: "location", id: loc.id, burned: loc.unlock.cost, signature, at: Date.now() });
  events.emit("toast", { msg: `${loc.name} unlocked on-chain!`, kind: "gold" });
  saveGame();
  return { ok: true };
}
