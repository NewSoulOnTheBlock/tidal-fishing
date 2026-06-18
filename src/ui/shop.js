// Shop screen: four gear categories with tiered upgrades plus a Sell tab for
// the catch bag. Renders from data; all transactions go through economy.js.
// Now with DUAL PAYMENT OPTIONS: pay with $TIDE or SOL!

import { S, events } from "../state/gameState.js";
import { GEAR, GEAR_CATS, gearStatLines } from "../data/gearData.js";
import { lookSwatch } from "../data/gearLooks.js";
import { FISH_BY_ID, RARITIES } from "../data/fishData.js";
import { PREMIUM_ANGLERS, getCharacter } from "../data/characters.js";
import * as economy from "../economy/economy.js";
import { audio } from "../audio/audioManager.js";
import { formatMoney, formatLength, formatWeight } from "../utils/utils.js";
import { fishSVG } from "./fishSvg.js";
import { isOnChainPayEnabled, payTide } from "../web3/payment.js";
import { isSolPayEnabled, paySol, tideToSol, formatSol } from "../web3/solPayment.js";
import { explorerTxUrl, shortAddress } from "../web3/solana.js";
import { currentPublicKey } from "../web3/wallet.js";

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
    else if (this.tab === "anglers") this.renderAnglers();
    else this.renderGear(this.tab);
  }

  renderTabs() {
    this.tabsEl.innerHTML = "";
    const tabs = [
      ...GEAR_CATS.map((c) => ({ key: c.key, label: c.label })),
      { key: "anglers", label: "Anglers" },
      { key: "sell", label: `Sell (${S.inventory.length})` },
    ];
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

      const swatch = `#${lookSwatch(item.look).toString(16).padStart(6, "0")}`;

      row.innerHTML = `
        <div class="shop-item-info">
          <div class="shop-item-name"><span class="gear-swatch" style="background:${swatch}"></span>${item.name} <span class="tier-badge">TIER ${item.tier}</span></div>
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
      } else if (!levelOk) {
        action.innerHTML = `<span class="locked-tag">Level ${item.level}</span>`;
      } else {
        // Show dual payment buttons if wallet connected
        const walletConnected = Boolean(currentPublicKey());
        const solPayAvailable = isSolPayEnabled();
        const tidePayAvailable = isOnChainPayEnabled();
        
        if (walletConnected && (solPayAvailable || tidePayAvailable)) {
          // Create payment options container
          const paymentOptions = document.createElement("div");
          paymentOptions.className = "payment-options";
          
          // Off-chain $TIDE button (always available)
          const offChainBtn = document.createElement("button");
          offChainBtn.className = `btn btn-primary ${afford ? "" : "btn-disabled"}`;
          offChainBtn.innerHTML = `
            <span class="pay-label">Pay with $TIDE</span>
            <span class="pay-amount">${formatMoney(item.price)}</span>
          `;
          if (afford) {
            offChainBtn.addEventListener("click", () => this.buyGear(catKey, idx, 'tide-offchain'));
          } else {
            offChainBtn.disabled = true;
            offChainBtn.title = "Not enough $TIDE";
          }
          paymentOptions.appendChild(offChainBtn);
          
          // SOL button
          if (solPayAvailable) {
            const solAmount = tideToSol(item.price);
            const solBtn = document.createElement("button");
            solBtn.className = "btn btn-sol";
            solBtn.innerHTML = `
              <span class="pay-label">Pay with SOL</span>
              <span class="pay-amount">${formatSol(solAmount)}</span>
            `;
            solBtn.addEventListener("click", () => this.buyGear(catKey, idx, 'sol', solAmount));
            paymentOptions.appendChild(solBtn);
          }
          
          // On-chain $TIDE button (if token deployed)
          if (tidePayAvailable) {
            const onChainBtn = document.createElement("button");
            onChainBtn.className = "btn btn-tide";
            onChainBtn.innerHTML = `
              <span class="pay-label">Pay with $TIDE (on-chain)</span>
              <span class="pay-amount">${formatMoney(item.price)}</span>
            `;
            onChainBtn.addEventListener("click", () => this.buyGear(catKey, idx, 'tide-onchain'));
            paymentOptions.appendChild(onChainBtn);
          }
          
          action.appendChild(paymentOptions);
        } else {
          // No wallet connected - standard buy button
          const btn = document.createElement("button");
          btn.className = `btn ${afford ? "" : "btn-disabled"}`;
          btn.textContent = afford ? `Buy ${formatMoney(item.price)}` : "Not enough $TIDE";
          btn.disabled = !afford;
          if (afford) {
            btn.addEventListener("click", () => this.buyGear(catKey, idx, 'tide-offchain'));
          }
          action.appendChild(btn);
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

  renderAnglers() {
    this.contentEl.innerHTML = "";
    const intro = document.createElement("div");
    intro.className = "shop-anglers-intro";
    intro.innerHTML = `Unlock animated anglers to fish as. Each is yours forever once bought.`;
    this.contentEl.appendChild(intro);

    const selected = S.profile.character;
    PREMIUM_ANGLERS.forEach((c) => {
      const owned = economy.isAnglerOwned(c.id);
      const isSelected = selected === c.id;
      const afford = S.profile.money >= c.price;

      const row = document.createElement("div");
      row.className = `shop-item${isSelected ? " equipped" : ""}${!owned ? " locked" : ""}`;
      row.innerHTML = `
        <div class="shop-item-info">
          <div class="shop-item-name"><span class="angler-emoji">${c.emoji || "🎣"}</span>${c.name} <span class="tier-badge">ANGLER</span></div>
          <div class="shop-item-blurb">${c.blurb || ""}</div>
        </div>
        <div class="shop-item-action"></div>
      `;

      const action = row.querySelector(".shop-item-action");
      if (isSelected) {
        action.innerHTML = `<span class="equipped-tag">Selected</span>`;
      } else if (owned) {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = "Select";
        btn.addEventListener("click", () => {
          audio.play("click");
          economy.selectAngler(c.id);
          events.emit("toast", { msg: `Now fishing as ${c.name}`, kind: "success" });
          this.render();
        });
        action.appendChild(btn);
      } else {
        const walletConnected = Boolean(currentPublicKey());
        const solPayAvailable = isSolPayEnabled();
        const tidePayAvailable = isOnChainPayEnabled();

        if (walletConnected && (solPayAvailable || tidePayAvailable)) {
          const paymentOptions = document.createElement("div");
          paymentOptions.className = "payment-options";

          const offChainBtn = document.createElement("button");
          offChainBtn.className = `btn btn-primary ${afford ? "" : "btn-disabled"}`;
          offChainBtn.innerHTML = `
            <span class="pay-label">Pay with $TIDE</span>
            <span class="pay-amount">${formatMoney(c.price)}</span>
          `;
          if (afford) {
            offChainBtn.addEventListener("click", () => this.buyAngler(c.id, "tide-offchain"));
          } else {
            offChainBtn.disabled = true;
            offChainBtn.title = "Not enough $TIDE";
          }
          paymentOptions.appendChild(offChainBtn);

          if (solPayAvailable) {
            const solAmount = c.solPrice ?? tideToSol(c.price);
            const solBtn = document.createElement("button");
            solBtn.className = "btn btn-sol";
            solBtn.innerHTML = `
              <span class="pay-label">Pay with SOL</span>
              <span class="pay-amount">${formatSol(solAmount)}</span>
            `;
            solBtn.addEventListener("click", () => this.buyAngler(c.id, "sol", solAmount));
            paymentOptions.appendChild(solBtn);
          }

          if (tidePayAvailable) {
            const onChainBtn = document.createElement("button");
            onChainBtn.className = "btn btn-tide";
            onChainBtn.innerHTML = `
              <span class="pay-label">Pay with $TIDE (on-chain)</span>
              <span class="pay-amount">${formatMoney(c.price)}</span>
            `;
            onChainBtn.addEventListener("click", () => this.buyAngler(c.id, "tide-onchain"));
            paymentOptions.appendChild(onChainBtn);
          }

          action.appendChild(paymentOptions);
        } else {
          const btn = document.createElement("button");
          btn.className = `btn ${afford ? "" : "btn-disabled"}`;
          btn.textContent = afford ? `Buy ${formatMoney(c.price)}` : "Not enough $TIDE";
          btn.disabled = !afford;
          if (afford) {
            btn.addEventListener("click", () => this.buyAngler(c.id, "tide-offchain"));
          }
          action.appendChild(btn);
        }
      }
      this.contentEl.appendChild(row);
    });
  }

  /**
   * Buy a premium angler with the selected payment method, then auto-select it.
   * @param {string} id - Angler/character id
   * @param {string} method - 'tide-offchain', 'sol', or 'tide-onchain'
   * @param {number} solAmount - SOL amount if method is 'sol'
   */
  async buyAngler(id, method, solAmount = 0) {
    const c = getCharacter(id);

    if (method === "tide-offchain") {
      const res = economy.buyAngler(id);
      if (res.ok) {
        audio.play("buy");
        economy.selectAngler(id);
        events.emit("toast", { msg: `${c.name} unlocked — now fishing as ${c.name}!`, kind: "success" });
      } else {
        audio.play("error");
        events.emit("toast", { msg: res.reason, kind: "warn" });
      }
      this.render();
    } else if (method === "sol") {
      try {
        events.emit("toast", { msg: "Processing SOL payment...", kind: "info" });
        const sig = await paySol(solAmount, { memo: `tidal:angler:${id}` });
        economy.grantAnglerOnChain(id, sig);
        economy.selectAngler(id);
        audio.play("buy");
        events.emit("toast", {
          msg: `${c.name} unlocked with ${formatSol(solAmount)} · ${shortAddress(sig, 6, 6)}`,
          kind: "gold",
          href: explorerTxUrl(sig),
        });
        events.emit("wallet:refresh");
      } catch (e) {
        console.error("[tidal] SOL angler payment failed", e);
        audio.play("error");
        events.emit("toast", { msg: e?.message ?? "SOL payment failed", kind: "warn" });
      } finally {
        this.render();
      }
    } else if (method === "tide-onchain") {
      try {
        events.emit("toast", { msg: "Processing $TIDE transfer...", kind: "info" });
        const sig = await payTide(c.price, { memo: `tidal:angler:${id}` });
        economy.grantAnglerOnChain(id, sig);
        economy.selectAngler(id);
        audio.play("buy");
        events.emit("toast", {
          msg: `${c.name} unlocked with $TIDE · ${shortAddress(sig, 6, 6)}`,
          kind: "gold",
          href: explorerTxUrl(sig),
        });
        events.emit("wallet:refresh");
      } catch (e) {
        console.error("[tidal] on-chain $TIDE angler payment failed", e);
        audio.play("error");
        events.emit("toast", { msg: e?.message ?? "On-chain payment failed", kind: "warn" });
      } finally {
        this.render();
      }
    }
  }

  /**
   * Buy gear with selected payment method
   * @param {string} catKey - Category key (rods, reels, etc)
   * @param {number} idx - Item index
   * @param {string} method - Payment method: 'tide-offchain', 'sol', or 'tide-onchain'
   * @param {number} solAmount - SOL amount if method is 'sol'
   */
  async buyGear(catKey, idx, method, solAmount = 0) {
    const item = GEAR[catKey][idx];
    
    if (method === 'tide-offchain') {
      // Standard off-chain $TIDE purchase
      const res = economy.buyGear(catKey, idx);
      if (res.ok) {
        audio.play("buy");
        events.emit("toast", { msg: `${item.name} purchased with $TIDE`, kind: "success" });
      } else {
        audio.play("error");
        events.emit("toast", { msg: res.reason, kind: "warn" });
      }
      this.render();
      
    } else if (method === 'sol') {
      // SOL payment
      try {
        events.emit("toast", { msg: "Processing SOL payment...", kind: "info" });
        const sig = await paySol(solAmount, { memo: `tidal:gear:${catKey}:${idx}` });
        
        // Grant gear after successful payment
        economy.grantGearOnChain(catKey, idx, sig);
        audio.play("buy");
        events.emit("toast", {
          msg: `${item.name} unlocked with ${formatSol(solAmount)} · ${shortAddress(sig, 6, 6)}`,
          kind: "gold",
          href: explorerTxUrl(sig),
        });
        events.emit("wallet:refresh");
      } catch (e) {
        console.error("[tidal] SOL payment failed", e);
        audio.play("error");
        events.emit("toast", { msg: e?.message ?? "SOL payment failed", kind: "warn" });
      } finally {
        this.render();
      }
      
    } else if (method === 'tide-onchain') {
      // On-chain $TIDE payment (treasury transfer)
      try {
        events.emit("toast", { msg: "Processing $TIDE transfer...", kind: "info" });
        const sig = await payTide(item.price, { memo: `tidal:gear:${catKey}:${idx}` });
        
        economy.grantGearOnChain(catKey, idx, sig);
        audio.play("buy");
        events.emit("toast", {
          msg: `${item.name} unlocked with $TIDE · ${shortAddress(sig, 6, 6)}`,
          kind: "gold",
          href: explorerTxUrl(sig),
        });
        events.emit("wallet:refresh");
      } catch (e) {
        console.error("[tidal] on-chain $TIDE payment failed", e);
        audio.play("error");
        events.emit("toast", { msg: e?.message ?? "On-chain payment failed", kind: "warn" });
      } finally {
        this.render();
      }
    }
  }
}
