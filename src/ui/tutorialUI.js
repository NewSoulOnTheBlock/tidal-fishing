// First-time "How to Fish" tutorial. Shown once, right after a brand-new
// angler chooses their name in onboarding. A simple swipeable/clickable
// carousel that walks through the full catch loop and the skill mechanics,
// then drops the player straight into the game.

import { S, events } from "../state/gameState.js";
import { saveGame } from "../state/saveLoad.js";

// Inline Tabler Icons (MIT licensed, https://tabler.io/icons), rendered as SVG
// so each slide gets a crisp, unique line icon that inherits the cyan accent via
// `currentColor` and works offline in the installed PWA.
const ICON = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const SLIDES = [
  {
    icon: ICON('<path d="M16 3l4 4l-4 4" /><path d="M10 7l10 0" /><path d="M8 13l-4 4l4 4" /><path d="M4 17l9 0" />'),
    title: "Casual or Pro?",
    body: "Tap the <b>mode button</b> (top corner) to switch anytime. <b>🎣 Casual Angler</b> — just fish for fun: <b>no bait needed</b>, cast freely, and every catch still fills your Journal (catch &amp; release, no $TIDE). <b>💰 Pro Angler</b> — the full economy: each cast spends <b>bait</b> and your catches are worth real <b>$TIDE</b> to sell. New anglers start in Casual.",
  },
  {
    icon: ICON('<path d="M16 9v6a5 5 0 0 1 -10 0v-1" /><path d="M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M12 7v2" />'),
    title: "Bait every cast",
    body: "In <b>Pro Angler</b> mode, every cast spends <b>1 bait</b>, so stock up in the <b>Shop</b> first — you start with a little. <b>Cheaper bait</b> lands mostly common fish; <b>pricier bait</b> tilts your odds toward rare, epic &amp; legendary catches. Pay with <b>$TIDE</b> you earn from fishing, or with <b>SOL</b>. <i>(Casual mode needs no bait.)</i>",
  },
  {
    icon: ICON('<path d="M16 9v6a5 5 0 0 1 -10 0v-4l3 3" /><path d="M14 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M16 5v-2" />'),
    title: "Cast your line",
    body: "Aim with your mouse. <b>Hold Click</b> (or <b>Space</b>) to charge the power meter, then release to cast. Cast farther to reach deeper water and bigger fish.",
  },
  {
    icon: ICON('<path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 7a5 5 0 1 0 5 5" /><path d="M13 3.055a9 9 0 1 0 7.941 7.945" /><path d="M15 6v3h3l3 -3h-3v-3l-3 3" /><path d="M15 9l-3 3" />'),
    title: "Tempt &amp; hook the bite",
    body: "While you wait, <b>tap</b> to jig your lure — it hurries the bite and nudges your odds toward rarer fish. When one strikes, a ring closes over your bobber: <b>click while it's green</b> for a <b>Perfect Hook</b>.",
  },
  {
    icon: ICON('<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M13.41 10.59l2.59 -2.59" /><path d="M7 12a5 5 0 0 1 5 -5" />'),
    title: "Reel it in",
    body: "<b>Hold</b> to reel. Keep <b>tension in the green zone</b> to haul the fastest — but reel too hard and the line spikes toward a snap. Let go to rest and recover.",
  },
  {
    icon: ICON('<path d="M3 7c3 -2 6 -2 9 0s6 2 9 0" /><path d="M3 17c3 -2 6 -2 9 0s6 2 9 0" /><path d="M3 12c3 -2 6 -2 9 0s6 2 9 0" />'),
    title: "Ride the surges",
    body: "Fish fight back with sudden surges. Watch for the warning flash, then <b>ease off</b> — or tap <b>Give Line</b> (press <b>Shift</b>) to <b>dodge</b> and soften it.",
  },
  {
    icon: ICON('<path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" /><path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" /><path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" /><path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47" />'),
    title: "Save the line",
    body: "If tension maxes out, <b>let go instantly</b> to save your line — once per fight. Resting at the brink is safe; only <i>reeling</i> at full tension will snap it.",
  },
  {
    icon: ICON('<path d="M16.69 7.44a6.973 6.973 0 0 0 -1.69 4.56c0 1.747 .64 3.345 1.699 4.571" /><path d="M2 9.504c7.715 8.647 14.75 10.265 20 2.498c-5.25 -7.761 -12.285 -6.142 -20 2.504" /><path d="M18 11v.01" /><path d="M11.5 10.5c-.667 1 -.667 2 0 3" />'),
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
    this.panel.querySelector(".tutorial-icon").innerHTML = s.icon;
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
