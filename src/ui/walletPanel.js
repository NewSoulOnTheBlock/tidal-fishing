// Wallet HUD panel — connect/disconnect, address pill, SOL + $TIDE balances.
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
import { shortAddress, explorerAddressUrl, explorerTxUrl, NETWORK, TIDE_MINT } from "../web3/solana.js";
import { withdrawTide } from "../web3/withdraw.js";
import { onWalletConnect, onWalletDisconnect } from "../web3/databaseIntegration.js";
import { PublicKey } from "@solana/web3.js";
import { S, events } from "../state/gameState.js";
import * as economy from "../economy/economy.js";
import { formatMoney } from "../utils/utils.js";

const REFRESH_INTERVAL_MS = 25_000;

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
    this.lastTideBalance = 0; // Track on-chain balance for hold requirement
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
    // Re-render when the player's earned $TIDE changes so the Withdraw row
    // tracks the running balance live.
    events.on("money", () => this.render());
    // Re-sync the HUD offset when the viewport changes (breakpoints alter the
    // panel's height/position).
    window.addEventListener("resize", () => this.syncHudOffset());
  }

  render() {
    if (this.account) {
      const addr = this.account.address;
      const earned = Math.floor(S.profile.money);
      const mintConfigured = !!TIDE_MINT;
      
      // NEW: Check on-chain $TIDE balance for 2.5M requirement
      const tideBalance = this.lastTideBalance || 0;
      const MIN_HOLD_REQUIREMENT = 2_500_000; // 2.5 million $TIDE
      const meetsHoldRequirement = tideBalance >= MIN_HOLD_REQUIREMENT;
      
      const canWithdraw = mintConfigured && earned > 0 && !this.withdrawing && meetsHoldRequirement;

      let withdrawHtml = "";
      if (earned > 0 || mintConfigured) {
        const label = !mintConfigured
          ? "Withdraw soon™"
          : this.withdrawing
            ? "Withdrawing…"
            : !meetsHoldRequirement
              ? `Hold 2.5M $TIDE to Withdraw`
              : `Withdraw ${formatMoney(earned)}`;
        const subnote = !mintConfigured
          ? `Withdrawals activate once $TIDE goes live`
          : !meetsHoldRequirement
            ? `You need ${formatTokens(MIN_HOLD_REQUIREMENT - tideBalance, 6)} more $TIDE to unlock withdrawals`
            : earned === 0
              ? `Fish to earn $TIDE`
              : `Pulls earned $TIDE from the Tidal treasury`;
        withdrawHtml = `
          <div class="wallet-withdraw">
            <button class="btn btn-withdraw" data-withdraw ${canWithdraw ? "" : "disabled"} title="${subnote}">${label}</button>
            <div class="wallet-withdraw-sub">${subnote}</div>
          </div>
        `;
      }

      this.root.innerHTML = `
        <div class="wallet-row">
          <span class="wallet-dot" title="Connected to ${NETWORK}"></span>
          <a class="wallet-addr" href="${explorerAddressUrl(addr)}" target="_blank" rel="noopener" title="${addr}">${shortAddress(addr)}</a>
          <button class="wallet-disconnect" title="Disconnect">×</button>
        </div>
        <div class="wallet-balances">
          <div class="wallet-bal"><span class="wallet-bal-tag">SOL</span><span class="wallet-bal-val" data-bal="sol">—</span></div>
          <div class="wallet-bal"><span class="wallet-bal-tag">$TIDE</span><span class="wallet-bal-val" data-bal="tide">—</span></div>
        </div>
        ${withdrawHtml}
      `;
      this.root.querySelector(".wallet-disconnect").addEventListener("click", () => disconnect());
      const wBtn = this.root.querySelector("[data-withdraw]");
      if (wBtn && canWithdraw) {
        wBtn.addEventListener("click", () => this.doWithdraw(earned));
      }
    } else {
      this.root.innerHTML = `
        <div class="wallet-row">
          <span class="wallet-net">${NETWORK}</span>
          <button class="btn btn-primary wallet-connect">Connect Wallet</button>
        </div>
        <div class="wallet-sub">Earn $TIDE · own your catches · withdraw to wallet</div>
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
            To use your Solana wallet on mobile, please open <strong>tidalfishing.fun</strong> in your wallet's built-in browser:<br><br>
            📱 <strong>Phantom:</strong> Tap Browser → enter URL<br>
            📱 <strong>Backpack:</strong> Tap Browser → enter URL<br>
            📱 <strong>Solflare:</strong> Tap DApp Browser → enter URL<br>
            📱 <strong>Jupiter:</strong> Open in-app browser<br><br>
            Or install a mobile wallet app first!
          </p>`
        : `<p class="wallet-empty">No Solana wallets detected. Install <a href="https://phantom.app" target="_blank" rel="noopener">Phantom</a>, <a href="https://solflare.com" target="_blank" rel="noopener">Solflare</a> or <a href="https://backpack.app" target="_blank" rel="noopener">Backpack</a> and reload.</p>`;
    
    this.modal.innerHTML = `
      <div class="panel panel-narrow wallet-pick-panel">
        <h2 class="panel-title">Connect a Solana Wallet</h2>
        <p class="wallet-warn">Mainnet — your transactions are real. Tidal will never ask you to sign anything you didn't initiate.</p>
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
    const pubkey = safePubkey(this.account.address);
    if (!pubkey) return;
    const [sol, tide] = await Promise.all([fetchSolBalance(pubkey), fetchTideBalance(pubkey)]);
    if (!this.account) return; // disconnected mid-flight
    const solEl = this.root.querySelector('[data-bal="sol"]');
    const tideEl = this.root.querySelector('[data-bal="tide"]');
    if (solEl) solEl.textContent = formatSol(sol);
    if (tideEl) tideEl.textContent = tide ? formatTokens(tide.raw, tide.decimals) : "—";
    
    // Store balance for hold requirement check
    this.lastTideBalance = tide ? tide.raw : 0;
    
    this.refreshTimer = setTimeout(() => this.refreshBalances(), REFRESH_INTERVAL_MS);
  }
}

function safePubkey(s) {
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
