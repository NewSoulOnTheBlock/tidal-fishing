// Controls / button-mapping guide. A quick-reference overlay listing every
// keyboard + mouse binding, grouped by what you're doing. Reachable from the
// HUD "Keys" button, the title menu, or by pressing "?" anytime.

import { audio } from "../audio/audioManager.js";

const GROUPS = [
  {
    title: "🎣 Casting",
    rows: [
      { keys: ["Move Mouse"], desc: "Aim your cast direction" },
      { keys: ["Hold Click", "Space"], desc: "Charge the power meter — release to cast" },
      { keys: ["Click", "Space"], desc: "Set the hook the instant you see the !" },
      { keys: ["R"], desc: "Reel the line back in while you wait" },
    ],
  },
  {
    title: "🐟 Fighting a Fish",
    rows: [
      { keys: ["Hold Click", "Space"], desc: "Reel it in — let go to ease the tension" },
      { keys: ["Move Mouse", "◄ ►", "A / D"], desc: "Fight its runs — lean the rod the way it bolts" },
      { keys: ["Pull Back", "▲", "W"], desc: "Heave the fish out of the water to land it" },
      { keys: ["Shift"], desc: "Dodge / give line when it surges" },
    ],
  },
  {
    title: "📂 Menus & Panels",
    rows: [
      { keys: ["M"], desc: "Map — travel to new waters" },
      { keys: ["B"], desc: "Shop — gear, bait & Anglers" },
      { keys: ["J"], desc: "Fish Journal" },
      { keys: ["C"], desc: "Collection" },
      { keys: ["A"], desc: "Achievements" },
      { keys: ["L"], desc: "Leaderboard" },
      { keys: ["P"], desc: "Profile" },
      { keys: ["Esc"], desc: "Pause / close a panel" },
    ],
  },
];

export class ControlsUI {
  constructor() {
    this.panel = null;
    this._onKey = this._onKey.bind(this);
  }

  toggle() {
    if (this.panel) this.hide();
    else this.show();
  }

  show() {
    if (this.panel) return;
    try { audio.play("click"); } catch {}

    this.panel = document.createElement("div");
    this.panel.id = "controls-panel";
    this.panel.className = "modal-overlay";
    this.panel.innerHTML = `
      <div class="modal-content controls-modal">
        <div class="modal-header">
          <h2>⌨️ Controls</h2>
          <button class="btn-close" type="button">×</button>
        </div>
        <div class="controls-body">
          ${GROUPS.map((g) => `
            <div class="controls-group">
              <h3 class="controls-group-title">${g.title}</h3>
              ${g.rows.map((r) => `
                <div class="controls-row">
                  <span class="controls-keys">${r.keys.map((k) => `<kbd>${k}</kbd>`).join('<span class="controls-or">or</span>')}</span>
                  <span class="controls-desc">${r.desc}</span>
                </div>
              `).join("")}
            </div>
          `).join("")}
        </div>
        <div class="controls-foot">Press <kbd>?</kbd> anytime to open this guide</div>
      </div>
    `;

    document.body.appendChild(this.panel);

    this.panel.querySelector(".btn-close").addEventListener("click", () => this.hide());
    this.panel.addEventListener("click", (e) => {
      if (e.target === this.panel) this.hide();
    });
    // Capture keys while open so game shortcuts (Space cast, etc.) don't fire
    // behind the guide; Esc / ? close it.
    window.addEventListener("keydown", this._onKey, true);
  }

  _onKey(e) {
    if (e.code === "Escape" || e.code === "Slash" || e.code === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      return;
    }
    // Swallow everything else so the game underneath stays put.
    e.stopPropagation();
  }

  hide() {
    if (!this.panel) return;
    window.removeEventListener("keydown", this._onKey, true);
    this.panel.remove();
    this.panel = null;
  }
}
