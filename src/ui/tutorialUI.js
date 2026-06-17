// First-time "How to Fish" tutorial. Shown once, right after a brand-new
// angler chooses their name in onboarding. A simple swipeable/clickable
// carousel that walks through the full catch loop and the skill mechanics,
// then drops the player straight into the game.

import { S, events } from "../state/gameState.js";
import { saveGame } from "../state/saveLoad.js";

const SLIDES = [
  {
    icon: "🎣",
    title: "Cast your line",
    body: "Aim with your mouse. <b>Hold Click</b> (or <b>Space</b>) to charge the power meter, then release to cast. Cast farther to reach deeper water and bigger fish.",
  },
  {
    icon: "🎯",
    title: "Tempt &amp; hook the bite",
    body: "While you wait, <b>tap</b> to jig your lure — it hurries the bite and nudges your odds toward rarer fish. When one strikes, a ring closes over your bobber: <b>click while it's green</b> for a <b>Perfect Hook</b>.",
  },
  {
    icon: "💪",
    title: "Reel it in",
    body: "<b>Hold</b> to reel. Keep <b>tension in the green zone</b> to haul the fastest — but reel too hard and the line spikes toward a snap. Let go to rest and recover.",
  },
  {
    icon: "🌊",
    title: "Ride the surges",
    body: "Fish fight back with sudden surges. Watch for the warning flash, then <b>ease off</b> — or tap <b>Give Line</b> (press <b>D</b>) to <b>dodge</b> and soften it.",
  },
  {
    icon: "✋",
    title: "Save the line",
    body: "If tension maxes out, <b>let go instantly</b> to save your line — once per fight. Resting at the brink is safe; only <i>reeling</i> at full tension will snap it.",
  },
  {
    icon: "🐟",
    title: "Spots, $TIDE &amp; beyond",
    body: "Spot drifting <b>ripple rings</b> on the water? Cast into one for faster bites and rarer fish. Every catch earns <b>$TIDE</b> and XP — sell your haul, upgrade gear, unlock new waters, and climb the leaderboard. <b>Tight lines!</b>",
  },
];

export class TutorialUI {
  constructor() {
    this.panel = null;
    this.index = 0;
    this._onKey = this._onKey.bind(this);
  }

  /** Show only if the angler hasn't seen it yet. */
  show(force = false) {
    if (this.panel) return;
    if (!force && S.profile?.tutorialSeen) return;

    this.index = 0;
    this.panel = document.createElement("div");
    this.panel.id = "tutorial-panel";
    this.panel.className = "modal-overlay tutorial-overlay";
    this.panel.innerHTML = `
      <div class="modal-content tutorial-modal" role="dialog" aria-label="How to fish">
        <button class="tutorial-skip" aria-label="Skip tutorial">Skip ✕</button>
        <div class="tutorial-stage">
          <div class="tutorial-icon"></div>
          <h2 class="tutorial-title"></h2>
          <p class="tutorial-body"></p>
        </div>
        <div class="tutorial-dots"></div>
        <div class="tutorial-nav">
          <button class="tutorial-back" disabled>← Back</button>
          <button class="tutorial-next">Next →</button>
        </div>
      </div>
    `;

    this.panel.querySelector(".tutorial-dots").innerHTML = SLIDES.map(
      (_, i) => `<span class="tutorial-dot${i === 0 ? " active" : ""}" data-i="${i}"></span>`
    ).join("");

    document.body.appendChild(this.panel);
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    this.panel.querySelector(".tutorial-skip").addEventListener("click", () => this.finish());
    this.panel.querySelector(".tutorial-back").addEventListener("click", () => this.go(-1));
    this.panel.querySelector(".tutorial-next").addEventListener("click", () => {
      if (this.index >= SLIDES.length - 1) this.finish();
      else this.go(1);
    });
    this.panel.querySelectorAll(".tutorial-dot").forEach((d) =>
      d.addEventListener("click", () => this.jump(Number(d.dataset.i)))
    );
    // capture phase so game shortcuts (Space cast, D dodge…) don't fire behind us
    window.addEventListener("keydown", this._onKey, true);
  }

  _onKey(e) {
    if (!this.panel) return;
    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      if (this.index >= SLIDES.length - 1) this.finish();
      else this.go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      this.go(-1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.finish();
    }
    // swallow every other key so it can't reach the game while open
    e.stopPropagation();
  }

  go(dir) {
    this.jump(this.index + dir);
  }

  jump(i) {
    const next = Math.max(0, Math.min(SLIDES.length - 1, i));
    if (next === this.index) return;
    this.index = next;
    this.render();
  }

  render() {
    if (!this.panel) return;
    const s = SLIDES[this.index];
    const stage = this.panel.querySelector(".tutorial-stage");
    this.panel.querySelector(".tutorial-icon").textContent = s.icon;
    this.panel.querySelector(".tutorial-title").innerHTML = s.title;
    this.panel.querySelector(".tutorial-body").innerHTML = s.body;
    // retrigger the slide-in animation
    stage.classList.remove("in");
    void stage.offsetWidth;
    stage.classList.add("in");

    this.panel.querySelectorAll(".tutorial-dot").forEach((d, i) =>
      d.classList.toggle("active", i === this.index)
    );
    this.panel.querySelector(".tutorial-back").disabled = this.index === 0;
    const next = this.panel.querySelector(".tutorial-next");
    next.textContent = this.index >= SLIDES.length - 1 ? "Start Fishing →" : "Next →";
  }

  finish() {
    if (S.profile) S.profile.tutorialSeen = true;
    try {
      saveGame();
    } catch (e) {
      console.warn("[tutorial] save failed:", e?.message);
    }
    this.close();
  }

  close() {
    window.removeEventListener("keydown", this._onKey, true);
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
