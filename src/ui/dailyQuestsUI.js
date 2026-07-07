import { S, events } from "../state/gameState.js";
import { PREMIUM_ANGLERS } from "../data/characters.js";
import * as economy from "../economy/economy.js";
import { audio } from "../audio/audioManager.js";
import { formatResetTime, questSnapshot, spendQuestRewardChoice } from "../progression/dailyQuests.js";

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class DailyQuestsUI {
  constructor() {
    this.screen = $("screen-quests");
    this.content = $("quests-content");
    this.closeBtn = $("quests-close");
    this._timer = null;

    this.closeBtn?.addEventListener("click", () => this.hide());
    this.screen?.addEventListener("click", (e) => {
      if (e.target === this.screen) this.hide();
    });
    events.on("quests:update", () => {
      if (this.isOpen()) this.render();
    });
    events.on("quests:reward", () => {
      if (this.isOpen()) this.render();
    });
  }

  isOpen() {
    return !!this.screen && !this.screen.classList.contains("hidden");
  }

  show() {
    if (!this.screen) return;
    audio.init();
    audio.play("click");
    this.screen.classList.remove("hidden");
    this.render();
    this._timer = setInterval(() => this.updateResetText(), 30_000);
  }

  hide() {
    if (!this.screen) return;
    this.screen.classList.add("hidden");
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  toggle() {
    if (this.isOpen()) this.hide();
    else this.show();
  }

  render() {
    if (!this.content) return;
    const snap = questSnapshot();
    const rewardHtml = snap.rewardChoices > 0
      ? this.renderCharacterChoice(snap.rewardChoices)
      : this.renderWeeklyProgress(snap);

    this.content.innerHTML = `
      <div class="quests-hero">
        <div>
          <div class="quests-kicker">Daily Quests</div>
          <p>Finish all 3 quests on 7 different days. No $SBF rewards — only a free character unlock.</p>
        </div>
        <div class="quests-week-badge" aria-label="Weekly quest progress">${snap.weekProgress}/7</div>
      </div>
      <div class="quests-list">
        ${snap.quests.map((q) => this.renderQuest(q)).join("")}
      </div>
      ${rewardHtml}
    `;

    this.content.querySelectorAll("[data-unlock-angler]").forEach((btn) => {
      btn.addEventListener("click", () => this.unlockAngler(btn.dataset.unlockAngler));
    });
    this.updateResetText();
  }

  renderQuest(q) {
    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
    return `
      <div class="quest-row${q.done ? " is-done" : ""}">
        <div class="quest-icon" aria-hidden="true">${q.icon}</div>
        <div class="quest-main">
          <div class="quest-title-row">
            <strong>${escapeHtml(q.label)}</strong>
            <span>${q.progress}/${q.target}</span>
          </div>
          <div class="quest-desc">${escapeHtml(q.desc)}</div>
          <div class="quest-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
        </div>
        <div class="quest-check" aria-label="${q.done ? "Complete" : "Incomplete"}">${q.done ? "✓" : ""}</div>
      </div>
    `;
  }

  renderWeeklyProgress(snap) {
    const done = snap.completed ? "Today's set is complete." : "Complete today's set to add 1 day.";
    return `
      <div class="quests-footer-card">
        <div>
          <strong>${done}</strong>
          <p>Weekly free angler progress: ${snap.weekProgress}/7 days complete.</p>
          <p class="quest-reset">Resets in <span id="quests-reset">${formatResetTime()}</span></p>
        </div>
      </div>
    `;
  }

  renderCharacterChoice(count) {
    const locked = PREMIUM_ANGLERS.filter((c) => !economy.isAnglerOwned(c.id));
    if (!locked.length) {
      return `
        <div class="quests-footer-card quests-reward-ready">
          <strong>All premium anglers already unlocked.</strong>
          <p>You have ${count} unused free unlock ${count === 1 ? "choice" : "choices"}, but no locked characters remain.</p>
        </div>
      `;
    }
    return `
      <div class="quests-footer-card quests-reward-ready">
        <div class="quests-reward-head">
          <div>
            <strong>Free character unlock ready</strong>
            <p>Choose 1 locked angler. Choices available: ${count}</p>
          </div>
        </div>
        <div class="quest-character-grid">
          ${locked.map((c) => `
            <button class="quest-character-card" type="button" data-unlock-angler="${escapeHtml(c.id)}">
              <span class="quest-character-icon">${escapeHtml(c.emoji || "🎣")}</span>
              <span class="quest-character-name">${escapeHtml(c.name)}</span>
              <span class="quest-character-sub">Unlock free</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  unlockAngler(id) {
    if (!id || (S.dailyQuests?.rewardChoices || 0) <= 0) return;
    const res = economy.grantAnglerFromQuest(id);
    if (!res.ok) {
      events.emit("toast", { msg: res.reason || "Could not unlock angler", kind: "warn" });
      return;
    }
    spendQuestRewardChoice();
    events.emit("toast", { msg: `${res.item.name} unlocked from daily quests!`, kind: "gold" });
    this.render();
  }

  updateResetText() {
    const el = $("quests-reset");
    if (el) el.textContent = formatResetTime();
  }
}
