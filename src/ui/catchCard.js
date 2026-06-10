// The celebratory catch-result card: species, size, weight, rarity, value,
// NEW/RECORD ribbons and confetti for special catches.

import { FISH_BY_ID, RARITIES } from "../data/fishData.js";
import { audio } from "../audio/audioManager.js";
import { formatMoney, formatLength, formatWeight, randRange } from "../utils/utils.js";
import { fishSVG } from "./fishSvg.js";

const CONFETTI_COLORS = ["#5fd4ff", "#ffc857", "#62d98b", "#c08bff", "#ff8da3"];

export class CatchCard {
  constructor() {
    this.root = document.getElementById("catch-root");
    this.active = false;
    this.onDone = null;
    this.keyHandler = (e) => {
      if (!this.active) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
        e.preventDefault();
        this.dismiss();
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  /**
   * @param {object} fish   rolled fish instance
   * @param {object} flags  { isNew, isRecord, xpGained }
   * @param {Function} onDone
   */
  show(fish, flags, onDone) {
    this.active = true;
    this.onDone = onDone;
    const sp = FISH_BY_ID[fish.speciesId];
    const rarity = RARITIES[fish.rarity];

    const overlay = document.createElement("div");
    overlay.className = "catch-overlay";

    let ribbon = "";
    if (flags.isNew) ribbon = `<div class="catch-ribbon">NEW SPECIES!</div>`;
    else if (flags.isRecord) ribbon = `<div class="catch-ribbon record">NEW RECORD!</div>`;

    overlay.innerHTML = `
      <div class="catch-card" style="--rarity:${rarity.color}">
        ${ribbon}
        <div class="catch-rarity">${rarity.label}</div>
        <div class="catch-name">${sp.name}</div>
        ${fishSVG(sp.look)}
        <div class="catch-stats">
          <div class="catch-stat"><span class="cs-label">Length</span><span class="cs-value">${formatLength(fish.sizeCm)}</span></div>
          <div class="catch-stat"><span class="cs-label">Weight</span><span class="cs-value">${formatWeight(fish.weightKg)}</span></div>
        </div>
        <div class="catch-value">Worth ${formatMoney(fish.value)}</div>
        <div class="catch-xp">+${flags.xpGained} XP${flags.isNew ? " (first catch bonus)" : ""}</div>
        <button class="btn btn-primary btn-big">Keep it</button>
      </div>
    `;

    overlay.querySelector("button").addEventListener("click", () => this.dismiss());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.dismiss();
    });

    this.root.appendChild(overlay);
    this.overlay = overlay;

    audio.play(fish.rarity === "legendary" ? "legendary" : "catch");
    if (flags.isNew || flags.isRecord || RARITIES[fish.rarity].order >= 3) {
      this.confetti(overlay.querySelector(".catch-card"));
    }
  }

  confetti(cardEl) {
    for (let i = 0; i < 26; i++) {
      const bit = document.createElement("span");
      bit.className = "confetti-bit";
      bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      bit.style.left = `${randRange(20, 80)}%`;
      bit.style.top = "30%";
      bit.style.setProperty("--cx", `${randRange(-160, 160)}px`);
      bit.style.setProperty("--cy", `${randRange(60, 280)}px`);
      bit.style.animationDelay = `${randRange(0, 0.25)}s`;
      cardEl.appendChild(bit);
    }
  }

  dismiss() {
    if (!this.active) return;
    this.active = false;
    audio.play("click");
    this.overlay?.remove();
    this.overlay = null;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }
}
