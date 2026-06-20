// Shop screen: four gear categories with tiered upgrades plus a Sell tab for
// the catch bag. Renders from data; all transactions go through economy.js.
// Now with DUAL PAYMENT OPTIONS: pay with $TIDE or SOL!

import { S, events } from "../state/gameState.js";
import { GEAR, GEAR_CATS, gearStatLines } from "../data/gearData.js";
import { BAITS, BAIT_BY_ID, baitStatLines } from "../data/baitData.js";
import { lookSwatch } from "../data/gearLooks.js";
import { FISH_BY_ID, RARITIES } from "../data/fishData.js";
import { PREMIUM_ANGLERS, getCharacter } from "../data/characters.js";
import * as economy from "../economy/economy.js";
import { audio } from "../audio/audioManager.js";
import { formatMoney, formatLength, formatWeight } from "../utils/utils.js";
import { fishSVG } from "./fishSvg.js";
import { isOnChainPayEnabled, payTide } from "../web3/payment.js";
import { isSolPayEnabled, paySol, tideToSol, formatSol } from "../web3/solPayment.js";
import { solToTideLive, refreshRate, isRateLoaded } from "../web3/priceConvert.js";
import { explorerTxUrl, shortAddress } from "../web3/solana.js";
import { currentPublicKey } from "../web3/wallet.js";
import { getCurrentRaffle, getUserRaffle, getRaffleHistory, exchangeFishForTickets, buyPackWithFish } from "../web3/raffle.js";

const $ = (id) => document.getElementById(id);

// Half of every SOL bait purchase is routed to this address; the rest goes to
// the treasury. (Set on owner request.)
const BAIT_SOL_SPLIT_ADDRESS = "31qQLYJxoo8rXT3HfUPmZAeT5mvsERHqBhG2VypueDLz";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRemaining(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "Closing…";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export class ShopUI {
  constructor(onClose) {
    this.onClose = onClose;
    this.screen = $("screen-shop");
    this.tabsEl = $("shop-tabs");
    this.contentEl = $("shop-content");
    this.moneyEl = $("shop-money");
    this.tab = "rods";
    this.baitQty = 10;
    $("shop-close").addEventListener("click", () => {
      audio.play("click");
      this.onClose();
    });
    events.on("money", () => {
      if (!this.screen.classList.contains("hidden")) this.render();
    });
    events.on("bait", () => {
      if (!this.screen.classList.contains("hidden") && this.tab === "bait") this.render();
    });
  }

  open(tab = "rods") {
    this.tab = tab;
    this.screen.classList.remove("hidden");
    this.render();
  }

  close() {
    this._clearRaffleTimer();
    this.screen.classList.add("hidden");
  }

  render() {
    this.moneyEl.textContent = formatMoney(S.profile.money);
    if (this.tab !== "raffle") this._clearRaffleTimer();
    this.renderTabs();
    if (this.tab === "sell") this.renderSell();
    else if (this.tab === "anglers") this.renderAnglers();
    else if (this.tab === "bait") this.renderBait();
    else if (this.tab === "raffle") this.renderLuckyCatch();
    else this.renderGear(this.tab);
  }

  renderTabs() {
    this.tabsEl.innerHTML = "";
    const tabs = [
      ...GEAR_CATS.map((c) => ({ key: c.key, label: c.label })),
      { key: "bait", label: "Bait" },
      { key: "anglers", label: "Anglers" },
      { key: "raffle", label: "🎟️ Lucky Catch" },
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
    // Option-A pricing: each item is anchored to a SOL price and its $TIDE cost is
    // the LIVE Jupiter SOL-equivalent (same model as bait), so paying in $TIDE always
    // costs the same value as the SOL price. Ensure a rate is loaded; re-render once
    // it arrives so prices reflect the live market instead of the cold-start fallback.
    const rateWasLoaded = isRateLoaded();
    refreshRate().then(() => {
      if (this.tab === catKey && !rateWasLoaded && isRateLoaded()) this.render();
    });
    const equippedIdx = S.gear.equipped[catKey];
    GEAR[catKey].forEach((item, idx) => {
      const owned = S.gear.owned[catKey].includes(idx);
      const equipped = equippedIdx === idx;
      const levelOk = S.profile.level >= item.level;
      const solAmount = item.solPrice ?? tideToSol(item.price);
      const tideCost = solToTideLive(solAmount);
      const afford = S.profile.money >= tideCost;

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
            <span class="pay-amount">${formatMoney(tideCost)}</span>
          `;
          if (afford) {
            offChainBtn.addEventListener("click", () => this.buyGear(catKey, idx, 'tide-offchain', solAmount, tideCost));
          } else {
            offChainBtn.disabled = true;
            offChainBtn.title = "Not enough $TIDE";
          }
          paymentOptions.appendChild(offChainBtn);
          
          // SOL button
          if (solPayAvailable) {
            const solBtn = document.createElement("button");
            solBtn.className = "btn btn-sol";
            solBtn.innerHTML = `
              <span class="pay-label">Pay with SOL</span>
              <span class="pay-amount">${formatSol(solAmount)}</span>
            `;
            solBtn.addEventListener("click", () => this.buyGear(catKey, idx, 'sol', solAmount, tideCost));
            paymentOptions.appendChild(solBtn);
          }
          
          // On-chain $TIDE button (if token deployed)
          if (tidePayAvailable) {
            const onChainBtn = document.createElement("button");
            onChainBtn.className = "btn btn-tide";
            onChainBtn.innerHTML = `
              <span class="pay-label">Pay with $TIDE (on-chain)</span>
              <span class="pay-amount">${formatMoney(tideCost)}</span>
            `;
            onChainBtn.addEventListener("click", () => this.buyGear(catKey, idx, 'tide-onchain', solAmount, tideCost));
            paymentOptions.appendChild(onChainBtn);
          }
          
          action.appendChild(paymentOptions);
        } else {
          // No wallet connected - standard buy button
          const btn = document.createElement("button");
          btn.className = `btn ${afford ? "" : "btn-disabled"}`;
          btn.textContent = afford ? `Buy ${formatMoney(tideCost)}` : "Not enough $TIDE";
          btn.disabled = !afford;
          if (afford) {
            btn.addEventListener("click", () => this.buyGear(catKey, idx, 'tide-offchain', solAmount, tideCost));
          }
          action.appendChild(btn);
        }
      }
      this.contentEl.appendChild(row);
    });
  }

  renderBait() {
    this.contentEl.innerHTML = "";
    const intro = document.createElement("div");
    intro.className = "shop-anglers-intro";
    intro.innerHTML =
      `Every cast spends <b>1 bait</b>. Cheaper bait lands mostly common fish; pricier bait lifts your odds for rare, epic & legendary catches. Stock up in bulk below.`;
    this.contentEl.appendChild(intro);

    // Bulk-quantity selector (applies to every buy button on the tab).
    const presets = [10, 25, 50, 100];
    if (!presets.includes(this.baitQty)) this.baitQty = 10;
    const qtyRow = document.createElement("div");
    qtyRow.className = "bait-qty-row";
    const qtyLabel = document.createElement("span");
    qtyLabel.className = "bait-qty-label";
    qtyLabel.textContent = "Quantity:";
    qtyRow.appendChild(qtyLabel);
    for (const q of presets) {
      const b = document.createElement("button");
      b.className = `tab-btn${this.baitQty === q ? " active" : ""}`;
      b.textContent = `×${q}`;
      b.addEventListener("click", () => {
        audio.play("click");
        this.baitQty = q;
        this.render();
      });
      qtyRow.appendChild(b);
    }
    this.contentEl.appendChild(qtyRow);

    const qty = this.baitQty;
    const selected = S.bait?.selected;
    const walletConnected = Boolean(currentPublicKey());
    const solPayAvailable = isSolPayEnabled();

    // $TIDE bait prices are the LIVE SOL-equivalent (Jupiter rate) so paying in
    // $TIDE always costs the same value as paying the SOL price. Ensure we have a
    // rate; if it loads while this tab is open, re-render so prices reflect the
    // live market instead of the cold-start fallback.
    const rateWasLoaded = isRateLoaded();
    refreshRate().then(() => {
      if (this.tab === "bait" && !rateWasLoaded && isRateLoaded()) this.render();
    });

    BAITS.forEach((b) => {
      const count = economy.baitCount(b.id);
      const isActive = selected === b.id;
      const solCost = Number((b.solPrice * qty).toFixed(4));
      const tideCost = solToTideLive(solCost);
      const afford = S.profile.money >= tideCost;

      const row = document.createElement("div");
      row.className = `shop-item${isActive ? " equipped" : ""}`;
      const stats = baitStatLines(b)
        .map((s) => `<span>${s}</span>`)
        .join(" · ");
      const swatch = `#${lookSwatch(b.look).toString(16).padStart(6, "0")}`;
      row.innerHTML = `
        <div class="shop-item-info">
          <div class="shop-item-name"><span class="gear-swatch" style="background:${swatch}"></span>${b.name} <span class="tier-badge">×${count} owned</span></div>
          <div class="shop-item-stats">${stats}</div>
          <div class="shop-item-blurb">${b.blurb}</div>
        </div>
        <div class="shop-item-action"></div>
      `;

      const action = row.querySelector(".shop-item-action");

      // Make-active control.
      if (isActive) {
        const tag = document.createElement("span");
        tag.className = "equipped-tag";
        tag.textContent = "Active";
        action.appendChild(tag);
      } else if (count > 0) {
        const selBtn = document.createElement("button");
        selBtn.className = "btn";
        selBtn.textContent = "Use this";
        selBtn.addEventListener("click", () => {
          audio.play("click");
          economy.selectBait(b.id);
          events.emit("toast", { msg: `Now baiting with ${b.name}`, kind: "success" });
          this.render();
        });
        action.appendChild(selBtn);
      }

      // Purchase options — SOL is the headline price; $TIDE is the f2p fallback.
      const paymentOptions = document.createElement("div");
      paymentOptions.className = "payment-options";

      const tideBtn = document.createElement("button");
      tideBtn.className = `btn btn-primary ${afford ? "" : "btn-disabled"}`;
      tideBtn.innerHTML = `
        <span class="pay-label">Buy ×${qty} · $TIDE</span>
        <span class="pay-amount">${formatMoney(tideCost)}</span>
      `;
      if (afford) {
        tideBtn.addEventListener("click", () => this.buyBaitWith(b.id, qty, "tide-offchain", 0, tideCost));
      } else {
        tideBtn.disabled = true;
        tideBtn.title = "Not enough $TIDE";
      }
      paymentOptions.appendChild(tideBtn);

      if (walletConnected && solPayAvailable) {
        const solBtn = document.createElement("button");
        solBtn.className = "btn btn-sol";
        solBtn.innerHTML = `
          <span class="pay-label">Buy ×${qty} · SOL</span>
          <span class="pay-amount">${formatSol(solCost)}</span>
        `;
        solBtn.addEventListener("click", () => this.buyBaitWith(b.id, qty, "sol", solCost));
        paymentOptions.appendChild(solBtn);
      }

      // Pay with on-chain wallet $TIDE (transfer to treasury). Same value as the
      // off-chain button, but spends the real token instead of earned in-game
      // $TIDE — so a player can stock bait straight from their wallet holdings.
      if (walletConnected && isOnChainPayEnabled()) {
        const onChainTideBtn = document.createElement("button");
        onChainTideBtn.className = "btn btn-tide";
        onChainTideBtn.innerHTML = `
          <span class="pay-label">Buy ×${qty} · $TIDE (on-chain)</span>
          <span class="pay-amount">${formatMoney(tideCost)}</span>
        `;
        onChainTideBtn.addEventListener("click", () => this.buyBaitWith(b.id, qty, "tide-onchain", 0, tideCost));
        paymentOptions.appendChild(onChainTideBtn);
      }

      action.appendChild(paymentOptions);
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
      // A save can hold fish whose species id was since renamed (the catalog has
      // been reworked over time). Render a safe fallback so a single orphaned
      // catch can't throw and blank the entire Sell tab — it stays fully
      // sellable via its stored value.
      const sp = FISH_BY_ID[fish.speciesId];
      const rarity = sp ? RARITIES[sp.rarity] : null;
      const name = sp ? sp.name : "Mystery catch";
      const color = rarity ? rarity.color : "var(--text-secondary, #9bb0c0)";
      const art = sp ? fishSVG(sp.look) : "🐟";
      const meta =
        Number.isFinite(fish.sizeCm) && Number.isFinite(fish.weightKg)
          ? `${formatLength(fish.sizeCm)} · ${formatWeight(fish.weightKg)}`
          : "Legacy catch";
      const value = Number.isFinite(fish.value) ? fish.value : 0;
      const row = document.createElement("div");
      row.className = "sell-row";
      row.innerHTML = `
        <div class="fish-mini">${art}</div>
        <span class="sell-name" style="color:${color}">${name}</span>
        <span class="sell-meta">${meta}</span>
        <span class="sell-value">${formatMoney(value)}</span>
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

  _clearRaffleTimer() {
    if (this._raffleTimer) {
      clearInterval(this._raffleTimer);
      this._raffleTimer = null;
    }
  }

  _startCountdown(endMs) {
    this._clearRaffleTimer();
    const tick = () => {
      const el = document.getElementById("lucky-countdown");
      if (!el || this.tab !== "raffle" || this.screen.classList.contains("hidden")) {
        this._clearRaffleTimer();
        return;
      }
      el.textContent = formatRemaining(endMs - Date.now());
    };
    tick();
    this._raffleTimer = setInterval(tick, 1000);
  }

  // "Lucky Catch": exchange caught fish for weighted raffle tickets. Every 24h a
  // winner is auto-picked server-side and an admin fulfills the Collector Crypt
  // gacha NFT prize. All ticket math is server-authoritative; this only displays
  // server data and posts exchange requests.
  async renderLuckyCatch() {
    this._clearRaffleTimer();
    const el = this.contentEl;
    el.innerHTML = `<div class="lucky-loading">Loading the Lucky Catch raffle…</div>`;

    const wallet = currentPublicKey();
    let current = null;
    let user = null;
    let history = [];
    try {
      [current, user, history] = await Promise.all([
        getCurrentRaffle(wallet),
        wallet ? getUserRaffle(wallet).catch(() => null) : Promise.resolve(null),
        getRaffleHistory(6).catch(() => []),
      ]);
    } catch (e) {
      if (this.tab === "raffle") {
        el.innerHTML = `<div class="shop-empty">The Lucky Catch raffle is taking a nap.<br/>${escapeHtml(e.message || "Try again shortly.")}</div>`;
      }
      return;
    }
    if (this.tab !== "raffle" || this.screen.classList.contains("hidden")) return;

    const tickets = Number(user?.tickets ?? current.userTickets ?? 0);
    const total = Number(current.totalTickets ?? 0);
    const chance = total > 0 ? (tickets / total) * 100 : 0;
    const inv = Array.isArray(user?.inventory) ? user.inventory : [];
    const wins = Array.isArray(user?.wins) ? user.wins : [];
    const machineName = current.machine?.name || "Mystery Pack";

    // "$50 mystery pack for fish" — treasury-funded instant gacha (separate from the raffle).
    const packInfo = user?.pack || null;
    const packCost = Number(packInfo?.fishCost) || 1000;
    const availableFish = Number(user?.availableFish ?? inv.length) || 0;
    const packAvailable = Boolean(packInfo?.available);
    const canBuyPack = Boolean(wallet) && packAvailable && availableFish >= packCost;
    const packPct = Math.min(100, Math.round((availableFish / packCost) * 100));

    const parts = [];
    parts.push(`<div class="lucky-wrap">`);

    // Header: prize + live countdown.
    parts.push(`
      <div class="lucky-header">
        <div class="lucky-prize">
          <div class="lucky-prize-label">Today's Gacha Prize</div>
          <div class="lucky-prize-name">🎁 ${escapeHtml(machineName)}</div>
          <div class="lucky-prize-sub">A real NFT pulled live from Collector Crypt — awarded to one weighted winner.</div>
        </div>
        <div class="lucky-clock">
          <div class="lucky-clock-label">Draw in</div>
          <div id="lucky-countdown" class="lucky-clock-time">${formatRemaining(current.timeRemainingMs)}</div>
        </div>
      </div>`);

    // Stats: your tickets / total / win chance.
    parts.push(`
      <div class="lucky-stats">
        <div class="lucky-stat"><span class="ls-num">${tickets.toLocaleString()}</span><span class="ls-lbl">Your Tickets</span></div>
        <div class="lucky-stat"><span class="ls-num">${total.toLocaleString()}</span><span class="ls-lbl">Total Tickets</span></div>
        <div class="lucky-stat"><span class="ls-num">${chance >= 10 ? chance.toFixed(0) : chance.toFixed(1)}%</span><span class="ls-lbl">Win Chance</span></div>
      </div>`);

    // Instant $50 mystery pack — pay with fish, treasury covers the USDC, NFT to wallet.
    {
      let packBtnLabel;
      if (!wallet) packBtnLabel = "Connect wallet";
      else if (!packAvailable) packBtnLabel = "Coming soon";
      else if (availableFish < packCost) packBtnLabel = `Need ${(packCost - availableFish).toLocaleString()} more fish`;
      else packBtnLabel = `Open pack — ${packCost.toLocaleString()} fish`;
      parts.push(`
        <div class="lucky-pack-card${canBuyPack ? " ready" : ""}">
          <div class="lucky-pack-art">🎰</div>
          <div class="lucky-pack-body">
            <div class="lucky-pack-title">$50 Mystery Pack</div>
            <div class="lucky-pack-sub">Skip the wait — crack a Collector Crypt pack instantly for ${packCost.toLocaleString()} fish. A real NFT drops straight into your wallet.</div>
            <div class="lucky-pack-progress">
              <div class="lucky-pack-bar"><span style="width:${packPct}%"></span></div>
              <div class="lucky-pack-count">${availableFish.toLocaleString()} / ${packCost.toLocaleString()} fish</div>
            </div>
          </div>
          <button class="btn btn-buy lucky-pack-btn" ${canBuyPack ? "" : "disabled"}>${escapeHtml(packBtnLabel)}</button>
        </div>`);
    }

    // Prize reveal if this player has already won a past raffle.
    const prizeWin = wins.find((w) => w.prize && (w.prize.metadata || w.prize.nftId));
    if (prizeWin) {
      const pname = prizeWin.prize.metadata?.name || prizeWin.prize.nftId || "your NFT prize";
      const claimTxt = prizeWin.status === "completed"
        ? "Delivered to your wallet 🎉"
        : "Prize is being prepared — it'll arrive in your wallet soon.";
      parts.push(`
        <div class="lucky-reveal">
          <div class="lucky-reveal-burst">🎉</div>
          <div class="lucky-reveal-title">You won the raffle!</div>
          <div class="lucky-reveal-prize">${escapeHtml(pname)}</div>
          <div class="lucky-reveal-sub">${escapeHtml(claimTxt)}</div>
        </div>`);
    }

    // Exchange inventory.
    parts.push(`<div class="lucky-section-title">Exchange fish for tickets</div>`);
    if (!wallet) {
      parts.push(`<div class="shop-empty">Connect your wallet to exchange fish for raffle tickets.</div>`);
    } else if (inv.length === 0) {
      parts.push(`<div class="shop-empty">No fresh catches to exchange.<br/>Land some fish, then trade them here — bigger &amp; rarer = more tickets.</div>`);
    } else {
      parts.push(`<div class="lucky-fish-list">`);
      for (const item of inv) {
        const sp = FISH_BY_ID[item.speciesId];
        const rarity = RARITIES[item.rarity];
        const name = sp ? sp.name : "Mystery catch";
        const color = rarity ? rarity.color : "var(--text-secondary, #9bb0c0)";
        const rarityLabel = rarity ? rarity.label : (item.rarity || "");
        const art = sp ? fishSVG(sp.look) : "🐟";
        const meta = `${escapeHtml(rarityLabel)} · ${formatLength(item.sizeCm)} · ${formatWeight(item.weightKg)}`;
        parts.push(`
          <div class="lucky-fish-row">
            <div class="fish-mini">${art}</div>
            <div class="lucky-fish-info">
              <span class="lucky-fish-name" style="color:${color}">${escapeHtml(name)}</span>
              <span class="lucky-fish-meta">${meta}</span>
            </div>
            <div class="lucky-fish-tickets" title="Raffle tickets">🎟️ ${Number(item.tickets || 0).toLocaleString()}</div>
            <button class="btn btn-buy lucky-exchange-btn" data-fish="${item.fishId}">Exchange</button>
          </div>`);
      }
      parts.push(`</div>`);
    }

    // Recent winners.
    parts.push(`<div class="lucky-section-title">Recent winners</div>`);
    const settled = history.filter((r) => r.winnerWallet);
    if (settled.length === 0) {
      parts.push(`<div class="shop-empty">No past raffles yet — you could be the first winner!</div>`);
    } else {
      parts.push(`<div class="lucky-winners">`);
      for (const r of settled) {
        const who = r.winnerUsername || (r.winnerWallet ? shortAddress(r.winnerWallet) : "—");
        const prize = r.prize?.metadata?.name || r.prize?.nftId || r.machine?.name || "NFT prize";
        parts.push(`
          <div class="lucky-winner-row">
            <span class="lw-who">🏆 ${escapeHtml(who)}</span>
            <span class="lw-prize">${escapeHtml(prize)}</span>
          </div>`);
      }
      parts.push(`</div>`);
    }

    parts.push(`</div>`); // .lucky-wrap
    el.innerHTML = parts.join("");

    // Wire exchange buttons.
    el.querySelectorAll(".lucky-exchange-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const fishId = Number(btn.dataset.fish);
        if (!fishId) return;
        btn.disabled = true;
        const prev = btn.textContent;
        btn.textContent = "…";
        try {
          const r = await exchangeFishForTickets(wallet, fishId);
          audio.play("sell");
          events.emit("toast", {
            msg: `+${Number(r.ticketsAwarded).toLocaleString()} tickets! You now hold ${Number(r.userTickets).toLocaleString()}.`,
            kind: "gold",
          });
          if (this.tab === "raffle") this.renderLuckyCatch();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = prev;
          events.emit("toast", { msg: e.message || "Exchange failed", kind: "warn" });
        }
      });
    });

    // Live countdown (anchored to server-reported remaining time, skew-proof).
    this._startCountdown(Date.now() + Math.max(0, Number(current.timeRemainingMs) || 0));

    // Wire the $50 mystery-pack buy button (spend fish → treasury-funded NFT).
    const packBtn = el.querySelector(".lucky-pack-btn");
    if (packBtn && !packBtn.disabled) {
      packBtn.addEventListener("click", async () => {
        packBtn.disabled = true;
        const prev = packBtn.textContent;
        packBtn.textContent = "Opening pack…";
        events.emit("toast", { msg: "Cracking your mystery pack…", kind: "info" });
        try {
          const r = await buyPackWithFish(wallet);
          if (r?.pending) {
            events.emit("toast", { msg: r.message || "Pack purchased — your NFT is on the way!", kind: "gold" });
          } else {
            audio.play("sell");
            const name = r?.prize?.metadata?.name || "a mystery NFT";
            const rarity = r?.prize?.rarity || "";
            this._showPackReveal(r?.prize);
            events.emit("toast", { msg: `🎉 You pulled ${name}${rarity ? ` (${rarity})` : ""}!`, kind: "gold" });
          }
          if (this.tab === "raffle") this.renderLuckyCatch();
        } catch (e) {
          packBtn.disabled = false;
          packBtn.textContent = prev;
          events.emit("toast", { msg: e.message || "Pack purchase failed", kind: "warn" });
        }
      });
    }
  }

  /** Full-screen reveal overlay for a freshly opened mystery pack. */
  _showPackReveal(prize) {
    const name = prize?.metadata?.name || prize?.nftId || "Mystery NFT";
    const rarity = prize?.rarity || "";
    const img = prize?.metadata?.image || prize?.metadata?.content?.links?.image || null;
    const overlay = document.createElement("div");
    overlay.className = "pack-reveal-overlay";
    overlay.innerHTML = `
      <div class="pack-reveal-card">
        <div class="pack-reveal-burst">🎉</div>
        <div class="pack-reveal-title">Pack opened!</div>
        ${img ? `<img class="pack-reveal-img" src="${escapeHtml(img)}" alt="${escapeHtml(name)}"/>` : `<div class="pack-reveal-art">🃏</div>`}
        <div class="pack-reveal-name">${escapeHtml(name)}</div>
        ${rarity ? `<div class="pack-reveal-rarity">${escapeHtml(rarity)}</div>` : ""}
        <div class="pack-reveal-sub">Delivered to your wallet.</div>
        <button class="btn btn-primary pack-reveal-close">Nice!</button>
      </div>`;
    const close = () => overlay.remove();
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector(".pack-reveal-close")?.addEventListener("click", close);
    document.body.appendChild(overlay);
  }

  renderAnglers() {
    this.contentEl.innerHTML = "";
    const intro = document.createElement("div");
    intro.className = "shop-anglers-intro";
    intro.innerHTML = `Unlock animated anglers to fish as. Each is yours forever once bought.`;
    this.contentEl.appendChild(intro);

    // Option-A pricing: $TIDE cost is the LIVE Jupiter SOL-equivalent of each angler's
    // SOL price. Re-render once the rate loads so prices leave the cold-start fallback.
    const rateWasLoaded = isRateLoaded();
    refreshRate().then(() => {
      if (this.tab === "anglers" && !rateWasLoaded && isRateLoaded()) this.render();
    });

    const selected = S.profile.character;
    PREMIUM_ANGLERS.forEach((c) => {
      const owned = economy.isAnglerOwned(c.id);
      const isSelected = selected === c.id;
      const solAmount = c.solPrice ?? tideToSol(c.price);
      const tideCost = solToTideLive(solAmount);
      const afford = S.profile.money >= tideCost;

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
            <span class="pay-amount">${formatMoney(tideCost)}</span>
          `;
          if (afford) {
            offChainBtn.addEventListener("click", () => this.buyAngler(c.id, "tide-offchain", solAmount, tideCost));
          } else {
            offChainBtn.disabled = true;
            offChainBtn.title = "Not enough $TIDE";
          }
          paymentOptions.appendChild(offChainBtn);

          if (solPayAvailable) {
            const solBtn = document.createElement("button");
            solBtn.className = "btn btn-sol";
            solBtn.innerHTML = `
              <span class="pay-label">Pay with SOL</span>
              <span class="pay-amount">${formatSol(solAmount)}</span>
            `;
            solBtn.addEventListener("click", () => this.buyAngler(c.id, "sol", solAmount, tideCost));
            paymentOptions.appendChild(solBtn);
          }

          if (tidePayAvailable) {
            const onChainBtn = document.createElement("button");
            onChainBtn.className = "btn btn-tide";
            onChainBtn.innerHTML = `
              <span class="pay-label">Pay with $TIDE (on-chain)</span>
              <span class="pay-amount">${formatMoney(tideCost)}</span>
            `;
            onChainBtn.addEventListener("click", () => this.buyAngler(c.id, "tide-onchain", solAmount, tideCost));
            paymentOptions.appendChild(onChainBtn);
          }

          action.appendChild(paymentOptions);
        } else {
          const btn = document.createElement("button");
          btn.className = `btn ${afford ? "" : "btn-disabled"}`;
          btn.textContent = afford ? `Buy ${formatMoney(tideCost)}` : "Not enough $TIDE";
          btn.disabled = !afford;
          if (afford) {
            btn.addEventListener("click", () => this.buyAngler(c.id, "tide-offchain", solAmount, tideCost));
          }
          action.appendChild(btn);
        }
      }
      this.contentEl.appendChild(row);
    });
  }

  /**
   * Buy bait with the selected payment method.
   * @param {string} id - Bait id
   * @param {number} qty - Quantity to buy
   * @param {string} method - 'tide-offchain', 'sol', or 'tide-onchain'
   * @param {number} solAmount - SOL amount if method is 'sol'
   */
  async buyBaitWith(id, qty, method, solAmount = 0, tideCost = 0) {
    const b = BAIT_BY_ID[id];
    if (method === "tide-offchain") {
      const res = economy.buyBait(id, qty, tideCost);
      if (res.ok) {
        audio.play("buy");
        events.emit("toast", { msg: `Bought ×${res.qty} ${b.name}`, kind: "success" });
      } else {
        audio.play("error");
        events.emit("toast", { msg: res.reason, kind: "warn" });
      }
      this.render();
    } else if (method === "sol") {
      try {
        events.emit("toast", { msg: "Processing SOL payment...", kind: "info" });
        const sig = await paySol(solAmount, {
          memo: `tidal:bait:${id}:${qty}`,
          split: { to: BAIT_SOL_SPLIT_ADDRESS, ratio: 0.5 },
        });
        economy.grantBaitOnChain(id, qty, sig);
        audio.play("buy");
        events.emit("toast", {
          msg: `Bought ×${qty} ${b.name} with ${formatSol(solAmount)} · ${shortAddress(sig, 6, 6)}`,
          kind: "gold",
          href: explorerTxUrl(sig),
        });
        events.emit("wallet:refresh");
      } catch (e) {
        console.error("[tidal] SOL bait payment failed", e);
        audio.play("error");
        events.emit("toast", { msg: e?.message ?? "SOL payment failed", kind: "warn" });
      } finally {
        this.render();
      }
    } else if (method === "tide-onchain") {
      try {
        events.emit("toast", { msg: "Processing $TIDE transfer...", kind: "info" });
        const sig = await payTide(tideCost, { memo: `tidal:bait:${id}:${qty}` });
        economy.grantBaitOnChain(id, qty, sig);
        audio.play("buy");
        events.emit("toast", {
          msg: `Bought ×${qty} ${b.name} with $TIDE · ${shortAddress(sig, 6, 6)}`,
          kind: "gold",
          href: explorerTxUrl(sig),
        });
        events.emit("wallet:refresh");
      } catch (e) {
        console.error("[tidal] on-chain $TIDE bait payment failed", e);
        audio.play("error");
        events.emit("toast", { msg: e?.message ?? "On-chain payment failed", kind: "warn" });
      } finally {
        this.render();
      }
    }
  }

  /**
   * Buy a premium angler with the selected payment method, then auto-select it.
   * @param {string} id - Angler/character id
   * @param {string} method - 'tide-offchain', 'sol', or 'tide-onchain'
   * @param {number} solAmount - SOL amount if method is 'sol'
   */
  async buyAngler(id, method, solAmount = 0, tideCost = 0) {
    const c = getCharacter(id);

    if (method === "tide-offchain") {
      const res = economy.buyAngler(id, tideCost);
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
        const sig = await payTide(tideCost, { memo: `tidal:angler:${id}` });
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
  async buyGear(catKey, idx, method, solAmount = 0, tideCost = 0) {
    const item = GEAR[catKey][idx];
    
    if (method === 'tide-offchain') {
      // Standard off-chain $TIDE purchase
      const res = economy.buyGear(catKey, idx, tideCost);
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
        const sig = await payTide(tideCost, { memo: `tidal:gear:${catKey}:${idx}` });
        
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
