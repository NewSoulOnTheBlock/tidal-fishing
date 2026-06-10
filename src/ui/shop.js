// Shop screen: four gear categories with tiered upgrades plus a Sell tab for
// the catch bag. Renders from data; all transactions go through economy.js.

import { S, events } from "../state/gameState.js";
import { GEAR, GEAR_CATS, gearStatLines } from "../data/gearData.js";
import { FISH_BY_ID, RARITIES } from "../data/fishData.js";
import * as economy from "../economy/economy.js";
import { audio } from "../audio/audioManager.js";
import { formatMoney, formatLength, formatWeight } from "../utils/utils.js";
import { fishSVG } from "./fishSvg.js";

const $ = (id) => document.getElementById(id);

export class ShopUI {
  constructor(onClose) {
    this.onClose = onClose;
    this.screen = $("screen-shop");
    this.tabsEl = $("shop-tabs");
    this.contentEl = $("shop-content");
    this.moneyEl = $("shop-money");
    this.tab = "rods";
    $("shop-close").addEventListener("click", () => {
      audio.play("click");
      this.onClose();
    });
    events.on("money", () => {
      if (!this.screen.classList.contains("hidden")) this.render();
    });
  }

  open(tab = "rods") {
    this.tab = tab;
    this.screen.classList.remove("hidden");
    this.render();
  }

  close() {
    this.screen.classList.add("hidden");
  }

  render() {
    this.moneyEl.textContent = formatMoney(S.profile.money);
    this.renderTabs();
    if (this.tab === "sell") this.renderSell();
    else this.renderGear(this.tab);
  }

  renderTabs() {
    this.tabsEl.innerHTML = "";
    const tabs = [...GEAR_CATS.map((c) => ({ key: c.key, label: c.label })), { key: "sell", label: `Sell (${S.inventory.length})` }];
    for (const t of tabs) {
      const btn = document.createElement("button");
      btn.className = `tab-btn${this.tab === t.key ? " active" : ""}`;
      btn.textContent = t.label;
      btn.addEventListener("click", () => {
        audio.play("click");
        this.tab = t.key;
        this.render();
      });
      this.tabsEl.appendChild(btn);
    }
  }

  renderGear(catKey) {
    this.contentEl.innerHTML = "";
    const equippedIdx = S.gear.equipped[catKey];
    GEAR[catKey].forEach((item, idx) => {
      const owned = S.gear.owned[catKey].includes(idx);
      const equipped = equippedIdx === idx;
      const levelOk = S.profile.level >= item.level;
      const afford = S.profile.money >= item.price;

      const row = document.createElement("div");
      row.className = `shop-item${equipped ? " equipped" : ""}${!owned && !levelOk ? " locked" : ""}`;

      const stats = gearStatLines(catKey, item)
        .map((s) => `<span class="${idx > equippedIdx ? "stat-up" : ""}">${s}</span>`)
        .join(" · ");

      row.innerHTML = `
        <div class="shop-item-info">
          <div class="shop-item-name">${item.name} <span class="tier-badge">TIER ${item.tier}</span></div>
          <div class="shop-item-stats">${stats}</div>
          <div class="shop-item-blurb">${item.blurb}</div>
        </div>
        <div class="shop-item-action"></div>
      `;

      const action = row.querySelector(".shop-item-action");
      if (equipped) {
        action.innerHTML = `<span class="equipped-tag">Equipped</span>`;
      } else if (owned) {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = "Equip";
        btn.addEventListener("click", () => {
          audio.play("click");
          economy.equipGear(catKey, idx);
          this.render();
        });
        action.appendChild(btn);
      } else {
        const btn = document.createElement("button");
        btn.className = "btn btn-buy";
        btn.textContent = `Buy ${formatMoney(item.price)}`;
        btn.disabled = !levelOk || !afford;
        btn.addEventListener("click", () => {
          const res = economy.buyGear(catKey, idx);
          if (res.ok) {
            audio.play("buy");
            events.emit("toast", { msg: `${item.name} purchased and equipped`, kind: "success" });
          } else {
            audio.play("error");
            events.emit("toast", { msg: res.reason, kind: "warn" });
          }
          this.render();
        });
        action.appendChild(btn);
        if (!levelOk) {
          const note = document.createElement("span");
          note.className = "lock-note";
          note.textContent = `Requires level ${item.level}`;
          action.appendChild(note);
        }
      }
      this.contentEl.appendChild(row);
    });
  }

  renderSell() {
    this.contentEl.innerHTML = "";
    if (S.inventory.length === 0) {
      this.contentEl.innerHTML = `<div class="shop-empty">Your catch bag is empty.<br/>Go land something worth bragging about.</div>`;
      return;
    }

    S.inventory.forEach((fish, idx) => {
      const sp = FISH_BY_ID[fish.speciesId];
      const rarity = RARITIES[sp.rarity];
      const row = document.createElement("div");
      row.className = "sell-row";
      row.innerHTML = `
        <div class="fish-mini">${fishSVG(sp.look)}</div>
        <span class="sell-name" style="color:${rarity.color}">${sp.name}</span>
        <span class="sell-meta">${formatLength(fish.sizeCm)} · ${formatWeight(fish.weightKg)}</span>
        <span class="sell-value">${formatMoney(fish.value)}</span>
      `;
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Sell";
      btn.addEventListener("click", () => {
        audio.play("sell");
        economy.sellFishAt(idx);
        this.render();
      });
      row.appendChild(btn);
      this.contentEl.appendChild(row);
    });

    const footer = document.createElement("div");
    footer.className = "sell-footer";
    footer.innerHTML = `<span class="sell-total">Total: <span style="color:var(--gold)">${formatMoney(economy.inventoryValue())}</span></span>`;
    const sellAllBtn = document.createElement("button");
    sellAllBtn.className = "btn btn-buy";
    sellAllBtn.textContent = "Sell All";
    sellAllBtn.addEventListener("click", () => {
      const total = economy.sellAll();
      audio.play("sell");
      events.emit("toast", { msg: `Sold everything for ${formatMoney(total)}`, kind: "success" });
      this.render();
    });
    footer.appendChild(sellAllBtn);
    this.contentEl.appendChild(footer);
  }
}
