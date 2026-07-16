// Robinhood Chain game token market widget. Defaults to USDG; for custom game
// token economics set VITE_GAME_TOKEN_ADDRESS and optionally wire a real market
// data source. No fake market cap is shown.

import { TIDE_MINT, TIDE_SYMBOL } from "./chain.js";
export const TIDE_MINT_ADDRESS = TIDE_MINT;

export async function fetchTideMarket() {
  return {
    priceUsd: TIDE_SYMBOL === "USDG" ? 1 : null,
    marketCap: null,
    change24h: null,
    symbol: TIDE_SYMBOL,
    source: "robinhood-config",
  };
}

export function formatUsdCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}
export function formatUsdPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(3)}`;
}
