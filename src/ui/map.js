// Location-select screen: travel between unlocked waters, unlock new ones
// with money + level, and see collection progress per spot.

import { S, events } from "../state/gameState.js";
import { LOCATIONS } from "../data/locationData.js";
import { FISH_SPECIES } from "../data/fishData.js";
import * as economy from "../economy/economy.js";
import { audio } from "../audio/audioManager.js";
import { formatMoney } from "../utils/utils.js";

const $ = (id) => document.getElementById(id);

export class MapUI {
  constructor(onClose, onTravel) {
    this.onClose = onClose;
    this.onTravel = onTravel;
    this.screen = $("screen-map");
    this.grid = $("map-grid");
    $("map-close").addEventListener("click", () => {
      audio.play("click");
      this.onClose();
    });
  }

  open() {
    this.screen.classList.remove("hidden");
    this.render();
  }

  close() {
    this.screen.classList.add("hidden");
  }

  render() {
    this.grid.innerHTML = "";
    for (const loc of LOCATIONS) {
      const unlocked = S.world.unlocked.includes(loc.id);
      const current = S.world.current === loc.id;
      const speciesHere = FISH_SPECIES.filter((f) => f.locations.includes(loc.id));
      const discovered = speciesHere.filter((f) => S.journal[f.id]).length;

      const card = document.createElement("div");
      card.className = "map-card";
      card.innerHTML = `
        <div class="map-thumb" data-loc="${loc.id}"></div>
        <div class="map-card-body">
          <div class="map-card-name">${loc.name}${current ? ' <span class="current-tag">YOU ARE HERE</span>' : ""}</div>
          <div class="map-card-blurb">${loc.blurb}</div>
          <div class="map-card-fish">Species discovered: ${discovered} / ${speciesHere.length}</div>
          <div class="map-req"></div>
        </div>
      `;
      const req = card.querySelector(".map-req");
      const body = card.querySelector(".map-card-body");

      if (current) {
        req.textContent = "Currently fishing here.";
      } else if (unlocked) {
        const btn = document.createElement("button");
        btn.className = "btn btn-primary";
        btn.textContent = "Travel";
        btn.addEventListener("click", () => {
          audio.play("click");
          this.onTravel(loc.id);
        });
        body.appendChild(btn);
      } else {
        const lvlOk = S.profile.level >= loc.unlock.level;
        const costOk = S.profile.money >= loc.unlock.cost;
        req.innerHTML = `Unlock: <span class="${lvlOk ? "ok" : "bad"}">Level ${loc.unlock.level}</span> + <span class="${costOk ? "ok" : "bad"}">${formatMoney(loc.unlock.cost)}</span>`;
        const btn = document.createElement("button");
        btn.className = "btn btn-buy";
        btn.textContent = `Unlock for ${formatMoney(loc.unlock.cost)}`;
        btn.disabled = !lvlOk || !costOk;
        btn.addEventListener("click", () => {
          const res = economy.unlockLocation(loc);
          if (res.ok) {
            audio.play("buy");
          } else {
            audio.play("error");
            events.emit("toast", { msg: res.reason, kind: "warn" });
          }
          this.render();
        });
        body.appendChild(btn);
      }
      this.grid.appendChild(card);
    }
  }
}
