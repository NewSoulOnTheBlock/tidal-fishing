// Title-screen dashboard meta: the live $TIDE market cap pill.
//
// It lives on the main menu (#screen-menu) — the landing "dashboard" players
// see before/after a session. The market cap auto-refreshes while the menu is
// visible and pauses when the tab is hidden to avoid needless polling.

import { TIDE_MINT_ADDRESS, fetchTideMarket, formatUsdCompact, formatUsdPrice } from "../web3/marketcap.js";

const REFRESH_MS = 60_000;
const DEXSCREENER_PAGE = `https://dexscreener.com/solana/${TIDE_MINT_ADDRESS}`;

// Live market data (DexScreener pill + link) is OFF until a new $TIDE contract
// is configured. While off, the pill shows a neutral "---" placeholder and does
// not fetch or link out. Flip back to true once the new mint is set.
const MARKET_DATA_ENABLED = false;

export class MarketCapUI {
  constructor() {
    this.mcap = null;
    this.timer = null;
    this.fetching = false;
  }

  init() {
    this.mcap = document.querySelector("#menu-marketcap");
    if (!this.mcap) return;

    if (!MARKET_DATA_ENABLED) {
      // DexScreener data is turned off — show a neutral placeholder, no link.
      this.mcap.removeAttribute("href");
      this.mcap.removeAttribute("target");
      this.mcap.removeAttribute("title");
      this.mcap.textContent = "---";
      this.mcap.classList.remove("hidden");
      return;
    }

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
      // Leave any previously rendered value in place; only hide if we never had one.
      if (!this.mcap.dataset.loaded) this.mcap.classList.add("hidden");
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
}
