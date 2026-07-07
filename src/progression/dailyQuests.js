import { S, events } from "../state/gameState.js";
import { saveGame } from "../state/saveLoad.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function localDayKey(t = Date.now()) {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextMidnightMs(t = Date.now()) {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

function baseQuestSet(dayKey = localDayKey()) {
  return {
    dayKey,
    quests: [
      { id: "cast", label: "Cast 5 times", desc: "Get lines in the water.", icon: "🎯", target: 5, progress: 0 },
      { id: "catch", label: "Catch 3 fish", desc: "Any landed fish counts.", icon: "🐟", target: 3, progress: 0 },
      { id: "xp", label: "Earn 75 XP", desc: "Landing fish grants XP in Casual or Pro.", icon: "⭐", target: 75, progress: 0 },
    ],
    completed: false,
    completedAt: null,
  };
}

export function initDailyQuests(save = S) {
  const dayKey = localDayKey();
  save.dailyQuests ??= {
    current: baseQuestSet(dayKey),
    completedDays: [],
    rewardChoices: 0,
    lastRewardAt: null,
  };
  save.dailyQuests.completedDays = Array.isArray(save.dailyQuests.completedDays)
    ? save.dailyQuests.completedDays
    : [];
  save.dailyQuests.rewardChoices = Math.max(0, Math.floor(save.dailyQuests.rewardChoices || 0));
  if (!save.dailyQuests.current || save.dailyQuests.current.dayKey !== dayKey) {
    save.dailyQuests.current = baseQuestSet(dayKey);
  } else {
    const fresh = baseQuestSet(dayKey).quests;
    const byId = new Map((save.dailyQuests.current.quests || []).map((q) => [q.id, q]));
    save.dailyQuests.current.quests = fresh.map((q) => ({
      ...q,
      progress: Math.max(0, Math.floor(byId.get(q.id)?.progress || 0)),
    }));
    save.dailyQuests.current.completed = !!save.dailyQuests.current.completed;
    save.dailyQuests.current.completedAt = save.dailyQuests.current.completedAt || null;
  }
  return save.dailyQuests;
}

export function ensureTodayQuests() {
  S.dailyQuests = initDailyQuests(S);
  return S.dailyQuests;
}

export function questSnapshot() {
  const dq = ensureTodayQuests();
  const current = dq.current;
  const quests = current.quests.map((q) => ({
    ...q,
    progress: Math.min(q.target, Math.max(0, Math.floor(q.progress || 0))),
    done: Math.max(0, Math.floor(q.progress || 0)) >= q.target,
  }));
  return {
    dayKey: current.dayKey,
    quests,
    completed: !!current.completed,
    completedDays: [...dq.completedDays],
    weekProgress: Math.min(7, dq.completedDays.length),
    rewardChoices: Math.max(0, Math.floor(dq.rewardChoices || 0)),
    nextResetMs: nextMidnightMs(),
  };
}

export function recordQuestEvent(kind, amount = 1) {
  const dq = ensureTodayQuests();
  const q = dq.current.quests.find((item) => item.id === kind);
  if (!q || dq.current.completed) return questSnapshot();
  const addRaw = Math.floor(Number(amount));
  const add = Number.isFinite(addRaw) ? Math.max(0, addRaw) : 0;
  if (add <= 0) return questSnapshot();
  q.progress = Math.min(q.target, Math.max(0, Math.floor(q.progress || 0)) + add);
  maybeCompleteDay(dq);
  saveGame();
  events.emit("quests:update", questSnapshot());
  return questSnapshot();
}

function maybeCompleteDay(dq) {
  const current = dq.current;
  if (current.completed) return false;
  const allDone = current.quests.every((q) => Math.max(0, Math.floor(q.progress || 0)) >= q.target);
  if (!allDone) return false;

  current.completed = true;
  current.completedAt = Date.now();
  if (!dq.completedDays.includes(current.dayKey)) dq.completedDays.push(current.dayKey);

  if (dq.completedDays.length >= 7) {
    dq.completedDays = [];
    dq.rewardChoices = Math.max(0, Math.floor(dq.rewardChoices || 0)) + 1;
    dq.lastRewardAt = Date.now();
    events.emit("quests:reward", { rewardChoices: dq.rewardChoices });
  }

  events.emit("toast", {
    msg: dq.rewardChoices > 0
      ? "Weekly quests complete — choose a free angler!"
      : `Daily quests complete · ${dq.completedDays.length}/7 days toward a free angler`,
    kind: "gold",
  });
  return true;
}

export function spendQuestRewardChoice() {
  const dq = ensureTodayQuests();
  if ((dq.rewardChoices || 0) <= 0) return false;
  dq.rewardChoices -= 1;
  saveGame();
  events.emit("quests:update", questSnapshot());
  return true;
}

export function formatResetTime(ms = nextMidnightMs() - Date.now()) {
  const safe = Math.max(0, Math.floor(ms));
  const h = Math.floor(safe / 3_600_000);
  const m = Math.floor((safe % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
