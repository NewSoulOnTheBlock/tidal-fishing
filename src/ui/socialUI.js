// Shared-world UI: the "🌊 N fishing now" badge + daily hot spot indicator, and
// the Catch of the Day banner on the title screen. Reacts to "world:update".

import { events, S } from "../state/gameState.js";
import { startWorld, getWorld } from "../web3/world.js";
import { anglersModal } from "./anglersModal.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class SocialUI {
  constructor() {
    this.badge = null;
    this.last = null;
  }

  mount() {
    if (this.badge) return;
    this.badge = document.createElement("div");
    this.badge.id = "world-badge";
    this.badge.className = "world-badge hidden";
    this.badge.title = "See who's fishing now";
    document.body.appendChild(this.badge);

    // The badge is the "Fishing Now" button — open the online-anglers modal.
    this.badge.addEventListener("click", () => anglersModal.show());

    events.on("world:update", (w) => this.render(w));
    // Re-render the "you're here" highlight when the player travels.
    events.on("location", () => this.render(this.last));

    startWorld();
    this.render(getWorld());
  }

  render(w) {
    if (!w) return;
    this.last = w;

    const online = w.online || 0;
    const hotLabel = w.hotSpotLabel || (w.hotSpot ? w.hotSpot[0].toUpperCase() + w.hotSpot.slice(1) : null);
    const here = w.hotSpot && S.world?.current === w.hotSpot;

    let html = `<span class="wb-online"><span class="wb-dot"></span>${online} fishing now</span>`;
    if (hotLabel) {
      html += `<span class="wb-hot${here ? " wb-here" : ""}">🔥 Hot: ${esc(hotLabel)}` +
        `<span class="wb-hot-sub">${here ? "you're here · +10%" : "+10% $TIDE"}</span></span>`;
    }
    this.badge.innerHTML = html;
    this.badge.classList.toggle("hidden", online <= 0 && !hotLabel);

    this.renderCatchOfDay(w.catchOfDay);
  }

  renderCatchOfDay(cod) {
    const host = document.querySelector("#menu-catch-of-day");
    if (!host) return;
    if (!cod || !cod.species) {
      host.classList.add("hidden");
      host.innerHTML = "";
      return;
    }
    host.classList.remove("hidden");
    host.innerHTML =
      `🏆 <span class="cod-label">Catch of the Day</span> ` +
      `<b>${Number(cod.sizeCm) || 0}cm ${esc(cod.species)}</b> by ${esc(cod.who)}`;
  }
}
