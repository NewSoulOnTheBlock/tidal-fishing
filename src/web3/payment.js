// Robinhood Chain ERC-20 payment helpers. Keeps legacy $SBF function names so
// shop/economy code can migrate without a full rewrite.

import { TIDE_MINT, TIDE_TREASURY, TIDE_SYMBOL } from "./solana.js";
import { currentAddress, currentPublicKey, sendTransaction, call } from "./wallet.js";
import { fetchErc20Balance } from "./token.js";

const DEFAULT_DECIMALS = Number(import.meta.env.VITE_GAME_TOKEN_DECIMALS ?? 18);
const TRANSFER_SELECTOR = "0xa9059cbb";

function padAddress(address) { return String(address).toLowerCase().replace(/^0x/, "").padStart(64, "0"); }
function padUint(v) { return BigInt(v).toString(16).padStart(64, "0"); }
function parseUnits(value, decimals = DEFAULT_DECIMALS) {
  const [whole, frac = ""] = String(value).split(".");
  const cleanFrac = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(cleanFrac || "0");
}

export function isOnChainPayEnabled() { return Boolean(TIDE_MINT && TIDE_TREASURY && currentPublicKey()); }

export function paymentConfig() {
  return { mint: TIDE_MINT || null, model: "erc20_transfer_to_treasury", treasury: TIDE_TREASURY || null, decimals: DEFAULT_DECIMALS, symbol: TIDE_SYMBOL, enabled: isOnChainPayEnabled() };
}

export async function payTide(uiAmount, { memo } = {}) {
  if (!isOnChainPayEnabled()) throw new Error(`On-chain ${TIDE_SYMBOL} payment is not configured`);
  const payer = currentAddress();
  if (!payer) throw new Error("Wallet not connected");
  const balance = await fetchErc20Balance(payer, TIDE_MINT);
  const rawAmount = parseUnits(uiAmount, balance?.decimals ?? DEFAULT_DECIMALS);
  if (!balance || balance.raw < rawAmount) throw new Error(`Not enough ${TIDE_SYMBOL} (have ${balance?.ui ?? 0}, need ${uiAmount})`);
  const data = TRANSFER_SELECTOR + padAddress(TIDE_TREASURY) + padUint(rawAmount);
  return sendTransaction({ to: TIDE_MINT, data, value: "0x0" });
}
