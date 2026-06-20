// Title-screen dashboard meta: live $TIDE market cap pill + the contract-address
// footer (with copy button and explorer/DexScreener links).
//
// Both live on the main menu (#screen-menu) — the landing "dashboard" players
// see before/after a session. The market cap auto-refreshes while the menu is
// visible and pauses when the tab is hidden to avoid needless polling.

import { TIDE_MINT_ADDRESS, fetchTideMarket, formatUsdCompact, formatUsdPrice } from "../web3/marketcap.js";

const REFRESH_MS = 60_000;
const DEXSCREENER_PAGE = `https://dexscreener.com/solana/${TIDE_MINT_ADDRESS}`;
const SOLSCAN_TOKEN = `https://solscan.io/token/${TIDE_MINT_ADDRESS}`;

// Local short-address helper (avoids importing web3/solana.js, which would pull
// the @solana/web3.js + wallet-standard graph into this lightweight UI module).
function shortAddr(s, head = 6, tail = 6) {
  if (!s) return "—";
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// Minimal toast that reuses the existing #toasts container + .toast styles.
// Kept dependency-free so this lazy widget shares no module with the main entry
// chunk (which would otherwise drag the wallet adapter graph in eagerly).
function flashToast(msg, kind = "success") {
  const host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2600);
  while (host.children.length > 4) host.firstChild.remove();
}

export class MarketCapUI {
  constructor() {
    this.mcap = null;
    this.timer = null;
    this.fetching = false;
  }

  init() {
    this.mcap = document.querySelector("#menu-marketcap");
    this.setupFooter();

    if (this.mcap) {
      this.mcap.href = DEXSCREENER_PAGE;
      this.refresh();
      // Refresh whenever the tab becomes visible again, plus a steady interval.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.refresh();
      });
      this.timer = setInterval(() => {
        if (document.visibilityState === "visible") this.refresh();
      }, REFRESH_MS);
    }
  }

  async refresh() {
    if (this.fetching || !this.mcap) return;
    this.fetching = true;
    try {
      const m = await fetchTideMarket();
      this.render(m);
    } finally {
      this.fetching = false;
    }
  }

  render(m) {
    if (!this.mcap) return;
    if (!m || !Number.isFinite(m.marketCap)) {
      // No market data yet (e.g. token not yet live / no trading pairs): show a
      // neutral "---" placeholder rather than hiding, so the pill is never blank.
      if (!this.mcap.dataset.loaded) {
        this.mcap.textContent = "---";
        this.mcap.classList.remove("hidden");
      }
      return;
    }

    const cap = formatUsdCompact(m.marketCap);
    const price = formatUsdPrice(m.priceUsd);
    const ch = Number(m.change24h);
    const hasCh = Number.isFinite(ch);
    const chCls = hasCh ? (ch >= 0 ? "mcap-up" : "mcap-down") : "";
    const chTxt = hasCh ? `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%` : "";

    this.mcap.innerHTML =
      `<span class="mcap-label">$TIDE Market Cap</span>` +
      `<span class="mcap-value">${cap}</span>` +
      `<span class="mcap-price">${price}` +
      (hasCh ? ` <span class="mcap-change ${chCls}">${chTxt}</span>` : "") +
      `</span>`;
    this.mcap.title = `Live on DexScreener · ${price} per $TIDE`;
    this.mcap.dataset.loaded = "1";
    this.mcap.classList.remove("hidden");
  }

  setupFooter() {
    const addrEl = document.querySelector("#ca-address");
    const copyBtn = document.querySelector("#ca-copy");
    const dexLink = document.querySelector("#ca-dexscreener");
    const scanLink = document.querySelector("#ca-solscan");

    if (!TIDE_MINT_ADDRESS) return;

    if (addrEl) {
      addrEl.textContent = shortAddr(TIDE_MINT_ADDRESS, 6, 6);
      addrEl.title = TIDE_MINT_ADDRESS;
    }
    if (dexLink) dexLink.href = DEXSCREENER_PAGE;
    if (scanLink) scanLink.href = SOLSCAN_TOKEN;

    if (copyBtn) {
      copyBtn.addEventListener("click", () => this.copyAddress());
    }
    // Tapping the address itself also copies.
    if (addrEl) {
      addrEl.style.cursor = "pointer";
      addrEl.addEventListener("click", () => this.copyAddress());
    }
  }

  async copyAddress() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(TIDE_MINT_ADDRESS);
      } else {
        const ta = document.createElement("textarea");
        ta.value = TIDE_MINT_ADDRESS;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      flashToast("📋 Contract address copied", "success");
    } catch {
      flashToast("Couldn't copy — long-press to select", "warn");
    }
  }
}
