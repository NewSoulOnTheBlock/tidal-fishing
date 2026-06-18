// "Fishing Now" modal: opened from the world badge. Shows exactly which anglers
// are online right now (named, deduped by wallet) plus the all-time total number
// of anglers ever to have played. Data comes from GET /api/anglers/online.

import { audio } from "../audio/audioManager.js";
import { apiFetch } from "../utils/api.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class AnglersModal {
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
    this.panel.id = "anglers-panel";
    this.panel.className = "modal-overlay";
    this.panel.innerHTML = `
      <div class="modal-content anglers-modal">
        <div class="modal-header">
          <h2>🌊 Fishing Now</h2>
          <button class="btn-close" type="button">×</button>
        </div>
        <div class="anglers-body">
          <div class="anglers-loading">Casting a line to the server…</div>
        </div>
        <div class="anglers-foot"></div>
      </div>
    `;

    document.body.appendChild(this.panel);

    this.panel.querySelector(".btn-close").addEventListener("click", () => this.hide());
    this.panel.addEventListener("click", (e) => {
      if (e.target === this.panel) this.hide();
    });
    window.addEventListener("keydown", this._onKey, true);

    this._load();
  }

  async _load() {
    let data = null;
    try {
      const res = await apiFetch("/api/anglers/online", { timeoutMs: 8000 });
      if (res.ok) data = await res.json();
    } catch { /* render the offline state below */ }
    if (!this.panel) return; // closed while in-flight
    this._render(data);
  }

  _render(data) {
    const body = this.panel.querySelector(".anglers-body");
    const foot = this.panel.querySelector(".anglers-foot");
    if (!body || !foot) return;

    if (!data) {
      body.innerHTML = `<div class="anglers-empty">Couldn't reach the server — try again in a moment.</div>`;
      foot.textContent = "";
      return;
    }

    const online = Number(data.online) || 0;
    const guests = Number(data.guests) || 0;
    const total = Number(data.totalEver) || 0;
    const anglers = Array.isArray(data.anglers) ? data.anglers : [];

    let list;
    if (anglers.length) {
      list = `<ul class="anglers-list">` +
        anglers.map((a) => `<li><span class="ang-dot"></span>${esc(a.name)}</li>`).join("") +
        `</ul>`;
    } else {
      list = `<div class="anglers-empty">No named anglers online right now — connect a wallet to show up here.</div>`;
    }

    const guestLine = guests > 0
      ? `<div class="anglers-guests">+ ${guests} anonymous angler${guests === 1 ? "" : "s"} (no wallet connected)</div>`
      : "";

    body.innerHTML = `
      <div class="anglers-count"><b>${online}</b> fishing now</div>
      ${list}
      ${guestLine}
    `;
    foot.innerHTML = `🏆 <b>${total.toLocaleString()}</b> anglers all-time`;
  }

  _onKey(e) {
    if (e.code === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      return;
    }
    // Swallow other keys so game shortcuts don't fire behind the modal.
    e.stopPropagation();
  }

  hide() {
    if (!this.panel) return;
    window.removeEventListener("keydown", this._onKey, true);
    this.panel.remove();
    this.panel = null;
  }
}

export const anglersModal = new AnglersModal();
