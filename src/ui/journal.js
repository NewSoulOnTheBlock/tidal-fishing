// Fish Journal: full species collection grouped by rarity. Uncaught species
// show a silhouette plus where/when to find them.

import { S } from "../state/gameState.js";
import { FISH_SPECIES, RARITIES } from "../data/fishData.js";
import { LOCATION_BY_ID } from "../data/locationData.js";
import { CONFIG } from "../data/config.js";
import { audio } from "../audio/audioManager.js";
import { formatLength, formatWeight } from "../utils/utils.js";
import { fishSVG } from "./fishSvg.js";

const $ = (id) => document.getElementById(id);

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export class JournalUI {
  constructor(onClose) {
    this.onClose = onClose;
    this.screen = $("screen-journal");
    this.grid = $("journal-grid");
    this.stats = $("journal-stats");
    $("journal-close").addEventListener("click", () => {
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
    const discovered = Object.keys(S.journal).length;
    let header = `${discovered} / ${FISH_SPECIES.length} species · ${S.stats.catches} total catches`;
    if (S.stats.bestSpecies) {
      const sp = FISH_SPECIES.find((f) => f.id === S.stats.bestSpecies);
      if (sp) header += ` · biggest: ${sp.name} ${formatLength(S.stats.bestSize)}`;
    }
    this.stats.textContent = header;

    this.grid.innerHTML = "";
    const byRarity = Object.values(RARITIES).sort((a, b) => a.order - b.order);
    for (const rarity of byRarity) {
      const species = FISH_SPECIES.filter((f) => f.rarity === rarity.id);
      if (!species.length) continue;

      const section = document.createElement("div");
      section.className = "rarity-section";
      const head = document.createElement("div");
      head.className = "rarity-head";
      head.style.color = rarity.color;
      head.textContent = rarity.label;
      section.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "journal-grid";
      for (const sp of species) {
        const entry = S.journal[sp.id];
        const card = document.createElement("div");
        card.className = `journal-card${entry ? "" : " locked"}`;
        if (entry) {
          card.innerHTML = `
            ${fishSVG(sp.look)}
            <div class="jc-name" style="color:${rarity.color}">${sp.name}</div>
            <div class="jc-meta">
              Caught <span class="jc-count">×${entry.count}</span><br/>
              Best: ${formatLength(entry.bestSize)} · ${formatWeight(entry.bestWeight)}
            </div>
            <div class="jc-hint">${sp.desc}</div>
          `;
        } else {
          const locs = sp.locations.map((l) => LOCATION_BY_ID[l]?.name ?? l).join(", ");
          const times = sp.time.length === 4 ? "Any time" : sp.time.map(cap).join("/");
          const zones = sp.zones.map((z) => CONFIG.zones.labels[z]).join("/");
          card.innerHTML = `
            ${fishSVG(sp.look)}
            <div class="jc-name">???</div>
            <div class="jc-hint">${locs}<br/>${times} · ${zones} water</div>
          `;
        }
        grid.appendChild(card);
      }
      section.appendChild(grid);
      this.grid.appendChild(section);
    }
  }
}
