// Wallet HUD panel — connect/disconnect, address pill, ETH + USDG balances.
//
// Lives in the top-right HUD column under the clock card. Renders as plain DOM
// so it slots into the existing tideline aesthetic with zero extra runtime
// (no React shell).

import { listWallets, connect, disconnect, onChange } from "../web3/wallet.js";
import {
  fetchSolBalance,
  fetchTideBalance,
  formatSol,
  formatTokens,
} from "../web3/token.js";
import { shortAddress, explorerAddressUrl, explorerTxUrl, NETWORK, TIDE_MINT, TIDE_SYMBOL, NATIVE_SYMBOL } from "../web3/chain.js";
import { withdrawTide, withdrawSol } from "../web3/withdraw.js";
import { tideToSolLive } from "../web3/priceConvert.js";
import { onWalletConnect, onWalletDisconnect } from "../web3/databaseIntegration.js";
import { S, events } from "../state/gameState.js";
import * as economy from "../economy/economy.js";
import { formatMoney } from "../utils/utils.js";

const REFRESH_INTERVAL_MS = 60_000;

// Players must HOLD this much game token in their connected wallet before the
// earned-token withdraw faucet unlocks. Enforced on the withdraw tap (splash
// popup when unmet); the disclaimer also shows on the wallet-connect screen.
const MIN_HOLD_REQUIREMENT = 1_000_000; // 1,000,000 USDG

export class WalletPanel {
  constructor() {
    this.root = document.getElementById("wallet-panel");
    if (!this.root) {
      this.root = document.createElement("div");
      this.root.id = "wallet-panel";
      this.root.className = "hud-card wallet-card";
      // Mount in its own always-visible top-right slot (so it works in the
      // menu, pause screen and shop too — the regular #hud is hidden there).
      let mount = document.getElementById("wallet-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "wallet-mount";
        document.getElementById("app").appendChild(mount);
      }
      mount.appendChild(this.root);
    }
    this.modal = null;
    this.refreshTimer = null;
    this.account = null;
    this.lastTideBalanceUi = 0; // on-chain USDG (UI units) for the hold gate
    this._splash = null;        // active withdraw-locked splash, if any
    this._lastHudTop = 0;     // cached --hud-topright-top to avoid redundant writes

    this.render();
    onChange((state) => {
      this.account = state.account ?? null;
      this.render();
      this.refreshBalances();
      
      // Trigger database sync on wallet connect/disconnect
      if (state.account) {
        onWalletConnect();
      } else {
        onWalletDisconnect();
      }
    });

    events.on("wallet:refresh", () => this.refreshBalances());
    events.on("withdraw:request", () => this.handleHudWithdrawRequest());
    // Resume balance polling immediately when the tab becomes visible again
    // (the interval is paused while hidden to avoid background RPC spam).
    this._onVis = () => { if (!document.hidden) this.refreshBalances(); };
    document.addEventListener("visibilitychange", this._onVis);
    // Re-render when the player's earned USDG changes so the Withdraw row
    // tracks the running balance live.
    events.on("money", () => this.render());
    events.on("solSale", () => this.render());
    // Re-sync the HUD offset when the viewport changes (breakpoints alter the
    // panel's height/position).
    window.addEventListener("resize", () => this.syncHudOffset());
  }

  /**
   * Show or hide the entire shared #wallet-mount slot. Used to keep the floating
   * wallet card out of the full-screen panel overlays (shop / map / journal),
   * where it sat above the panel header and intercepted clicks on the Close
   * button. It stays visible in the menu and the gameplay HUD.
   */
  setMountHidden(hidden) {
    const mount = document.getElementById("wallet-mount");
    if (mount) mount.classList.toggle("wallet-mount-hidden", Boolean(hidden));
  }

  render() {
    if (this.account) {
      const addr = this.account.address;
      const earned = Math.floor(S.profile.money);
      const solSaleValue = Math.max(0, Math.floor(S.profile.solSaleValue || 0));
      const solSaleAmount = tideToSolLive(solSaleValue);
      const mintConfigured = !!TIDE_MINT;

      // Compact withdraw button only — no permanent disclaimer (that lives on the
      // connect screen now). The hold gate is enforced on tap via a
      // splash popup so the HUD stays small.
      let withdrawHtml = "";
      if (mintConfigured && earned > 0) {
        const label = this.withdrawing ? "Withdrawing…" : `Withdraw ${formatMoney(earned)}`;
        withdrawHtml += `<button class="btn btn-withdraw btn-withdraw-compact" data-withdraw ${this.withdrawing ? "disabled" : ""}>${label}</button>`;
      } else if (!mintConfigured && earned > 0) {
        withdrawHtml += `<button class="btn btn-withdraw btn-withdraw-compact" disabled title="Withdrawals activate once USDG goes live">Withdraw soon™</button>`;
      }
      if (solSaleValue > 0) {
        const solLabel = this.withdrawingSol ? "Sending ETH…" : `Withdraw ${formatSol(solSaleAmount)} from fish sales`;
        withdrawHtml += `<button class="btn btn-sol btn-withdraw-compact" data-withdraw-sol ${this.withdrawingSol ? "disabled" : ""}>${solLabel}</button>`;
      }

      this.root.innerHTML = `
        <div class="wallet-row">
          <span class="wallet-dot" title="Connected to ${NETWORK}"></span>
          <a class="wallet-addr" href="${explorerAddressUrl(addr)}" target="_blank" rel="noopener" title="${addr}">${shortAddress(addr)}</a>
          <button class="wallet-disconnect" title="Disconnect">×</button>
        </div>
        <div class="wallet-balances">
          <div class="wallet-bal"><span class="wallet-bal-tag">${NATIVE_SYMBOL}</span><span class="wallet-bal-val" data-bal="sol">—</span></div>
          <div class="wallet-bal"><span class="wallet-bal-tag">${TIDE_SYMBOL}</span><span class="wallet-bal-val" data-bal="tide">—</span></div>
        </div>
        ${withdrawHtml}
      `;
      this.root.querySelector(".wallet-disconnect").addEventListener("click", () => disconnect());
      const wBtn = this.root.querySelector("[data-withdraw]");
      if (wBtn && !wBtn.disabled) {
        wBtn.addEventListener("click", () => this.handleWithdrawClick(earned));
      }
      const solBtn = this.root.querySelector("[data-withdraw-sol]");
      if (solBtn && !solBtn.disabled) {
        solBtn.addEventListener("click", () => this.doSolWithdraw(solSaleValue));
      }
    } else {
      this.root.innerHTML = `
        <div class="wallet-row">
          <span class="wallet-net">${NETWORK}</span>
          <button class="btn btn-primary wallet-connect">Connect Wallet</button>
        </div>
        <div class="wallet-sub">Earn ${TIDE_SYMBOL} · own your catches · withdraw to wallet</div>
      `;
      this.root.querySelector(".wallet-connect").addEventListener("click", () => this.openModal());
    }
    // Keep the gameplay HUD top-right column clear of this (variable-height)
    // panel — it grows tall when connected (balances + withdraw button).
    this.syncHudOffset();
  }

  /**
   * Publish the wallet panel's real bottom edge as the --hud-topright-top CSS
   * variable so the gameplay HUD column (clock + location + buttons) flows just
   * beneath it instead of being covered. Measured after layout (rAF) so the
   * just-rendered height is accurate.
   */
  syncHudOffset() {
    const apply = () => {
      if (!this.root) return;
      const rect = this.root.getBoundingClientRect();
      if (!rect.height) return;
      const top = Math.max(60, Math.round(rect.bottom + 14));
      if (top === this._lastHudTop) return;
      this._lastHudTop = top;
      document.documentElement.style.setProperty("--hud-topright-top", `${top}px`);
    };
    apply();
    requestAnimationFrame(apply);
  }

  async doWithdraw(amount) {
    if (this.withdrawing) return;
    this.withdrawing = true;
    this.render();
    try {
      const sig = await withdrawTide(amount);
      // Deduct from the in-game earned bucket only after on-chain confirmation.
      economy.deductMoney(amount);
      events.emit("toast", {
        msg: `Withdrew ${formatMoney(amount)} to wallet · ${shortAddress(sig, 6, 6)}`,
        kind: "gold",
        href: explorerTxUrl(sig),
      });
      this.refreshBalances();
    } catch (e) {
      console.error("[withdraw] failed:", e);
      events.emit("toast", { msg: e?.message ?? "Withdraw failed", kind: "warn" });
    } finally {
      this.withdrawing = false;
      this.render();
    }
  }

  async doSolWithdraw(amountSbfValue) {
    if (this.withdrawingSol) return;
    const amount = Math.max(0, Math.floor(amountSbfValue || 0));
    if (amount <= 0) return;
    this.withdrawingSol = true;
    this.render();
    try {
      const result = await withdrawSol(amount);
      economy.deductSolSaleValue(amount);
      const solText = Number.isFinite(result?.solAmount) ? formatSol(result.solAmount) : "ETH";
      events.emit("toast", {
        msg: `Sold fish for ${solText} · ${shortAddress(result.signature, 6, 6)}`,
        kind: "gold",
        href: explorerTxUrl(result.signature),
      });
      this.refreshBalances();
    } catch (e) {
      console.error("[withdraw-sol] failed:", e);
      events.emit("toast", { msg: e?.message ?? "ETH payout failed", kind: "warn" });
    } finally {
      this.withdrawingSol = false;
      this.render();
    }
  }

  handleHudWithdrawRequest() {
    const earned = Math.floor(S.profile.money);
    if (earned <= 0) {
      events.emit("toast", { msg: `Earn ${TIDE_SYMBOL} before withdrawing`, kind: "warn" });
      return;
    }
    if (!this.account) {
      events.emit("toast", { msg: "Connect your wallet to withdraw", kind: "warn" });
      this.openModal();
      return;
    }
    if (!TIDE_MINT) {
      events.emit("toast", { msg: `Withdrawals activate once ${TIDE_SYMBOL} is configured`, kind: "warn" });
      return;
    }
    this.handleWithdrawClick(earned);
  }

  /**
   * Withdraw tap handler. Enforces the wallet-hold requirement:
   * if the connected wallet holds less, a splash popup explains it instead of
   * starting a withdraw. Otherwise the withdraw proceeds.
   */
  handleWithdrawClick(amount) {
    if (this.withdrawing) return;
    const tideUi = this.lastTideBalanceUi || 0;
    if (tideUi < MIN_HOLD_REQUIREMENT) {
      this.showWithdrawSplash(tideUi);
      return;
    }
    this.doWithdraw(amount);
  }

  /** Splash popup explaining the hold-to-withdraw requirement (shown when unmet). */
  showWithdrawSplash(tideUi) {
    if (this._splash) return;
    const remaining = Math.max(0, MIN_HOLD_REQUIREMENT - tideUi);
    const splash = document.createElement("div");
    splash.className = "screen withdraw-splash";
    splash.innerHTML = `
      <div class="panel panel-narrow withdraw-splash-panel">
        <div class="withdraw-splash-icon">💧🔒</div>
        <h2 class="panel-title">Withdrawals Locked</h2>
        <p class="withdraw-splash-text">Hold <strong>${MIN_HOLD_REQUIREMENT.toLocaleString()} ${TIDE_SYMBOL}</strong> in your connected wallet to unlock withdrawals of your earned ${TIDE_SYMBOL}.</p>
        <div class="withdraw-splash-stats">
          <div class="ws-stat"><span class="ws-num">${formatTokens(tideUi, 0, 0)}</span><span class="ws-lbl">You hold</span></div>
          <div class="ws-stat"><span class="ws-num">${formatTokens(remaining, 0, 0)}</span><span class="ws-lbl">More needed</span></div>
        </div>
        <p class="withdraw-splash-sub">Your earned ${TIDE_SYMBOL} is safe — keep fishing and stacking. Withdrawals open the moment your wallet crosses the threshold.</p>
        <button class="btn btn-primary withdraw-splash-close">Got it</button>
      </div>
    `;
    const close = () => { splash.remove(); this._splash = null; };
    splash.addEventListener("click", (ev) => { if (ev.target === splash) close(); });
    splash.querySelector(".withdraw-splash-close").addEventListener("click", close);
    document.getElementById("app").appendChild(splash);
    this._splash = splash;
  }

  openModal() {
    if (this.modal) return;
    const wallets = listWallets();
    this.modal = document.createElement("div");
    this.modal.className = "screen wallet-modal";
    
    // Check if mobile/tablet
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    const list = wallets.length
      ? wallets
          .map(
            (w) => `
        <button class="wallet-pick" data-name="${escapeAttr(w.name)}">
          <img class="wallet-pick-icon" src="${w.icon}" alt="" />
          <span class="wallet-pick-name">${escapeHtml(w.name)}</span>
        </button>`
          )
          .join("")
      : isMobile
        ? `<p class="wallet-empty wallet-mobile-hint">
            <strong>No wallets detected!</strong><br><br>
            Open this site inside an EVM wallet browser (MetaMask, Rabby, Coinbase Wallet) or install a browser wallet first.
          </p>`
        : `<p class="wallet-empty">No EVM wallet detected. Install <a href="https://metamask.io" target="_blank" rel="noopener">MetaMask</a>, <a href="https://rabby.io" target="_blank" rel="noopener">Rabby</a>, or <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener">Coinbase Wallet</a> and reload.</p>`;
    
    this.modal.innerHTML = `
      <div class="panel panel-narrow wallet-pick-panel">
        <h2 class="panel-title">Connect a Robinhood Chain Wallet</h2>
        <p class="wallet-warn">${NETWORK} mainnet — your transactions are real. Tidal will never ask you to sign anything you didn't initiate.</p>
        <p class="wallet-withdraw-note">💧 Withdrawals of earned ${TIDE_SYMBOL} unlock once you <strong>hold ${MIN_HOLD_REQUIREMENT.toLocaleString()} ${TIDE_SYMBOL}</strong> in your wallet.</p>
        <div class="wallet-pick-list">${list}</div>
        <button class="btn wallet-pick-cancel">Cancel</button>
      </div>
    `;
    document.getElementById("app").appendChild(this.modal);
    this.modal.querySelector(".wallet-pick-cancel").addEventListener("click", () => this.closeModal());
    this.modal.querySelectorAll(".wallet-pick").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const name = btn.dataset.name;
        const w = listWallets().find((x) => x.name === name);
        if (!w) return;
        btn.disabled = true;
        try {
          await connect(w);
          this.closeModal();
        } catch (e) {
          console.error("[wallet] connect failed", e);
          btn.disabled = false;
          const err = document.createElement("p");
          err.className = "wallet-err";
          err.textContent = e?.message ?? String(e);
          this.modal.querySelector(".wallet-pick-panel").appendChild(err);
        }
      })
    );
  }

  closeModal() {
    this.modal?.remove();
    this.modal = null;
  }

  async refreshBalances() {
    clearTimeout(this.refreshTimer);
    if (!this.account) return;
    // Pause RPC polling while the tab is hidden; re-arm so it resumes on return.
    if (document.hidden) {
      this.refreshTimer = setTimeout(() => this.refreshBalances(), REFRESH_INTERVAL_MS);
      return;
    }
    const address = this.account.address;
    if (!address) return;
    const [sol, tide] = await Promise.all([fetchSolBalance(address), fetchTideBalance(address)]);
    if (!this.account) return; // disconnected mid-flight
    const solEl = this.root.querySelector('[data-bal="sol"]');
    const tideEl = this.root.querySelector('[data-bal="tide"]');
    if (solEl) solEl.textContent = formatSol(sol);
    if (tideEl) tideEl.textContent = tide ? formatTokens(tide.raw, tide.decimals) : "—";
    
    // Store balance (UI units) for the hold-to-withdraw gate.
    this.lastTideBalanceUi = tide ? tide.ui : 0;
    
    this.refreshTimer = setTimeout(() => this.refreshBalances(), REFRESH_INTERVAL_MS);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
