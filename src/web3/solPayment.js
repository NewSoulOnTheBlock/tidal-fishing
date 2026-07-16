// Robinhood Chain native ETH payment helper. Function names retain the old
// Solana API so the shop can be converted incrementally.

import { TIDE_TREASURY, NATIVE_SYMBOL } from "./solana.js";
import { currentPublicKey, sendTransaction, rpc } from "./wallet.js";

const SOL_TO_TIDE_RATE = 3500; // legacy name: USDG-equivalent per ETH fallback
const WEI_PER_ETH = 10n ** 18n;

export function tideToSol(tideAmount) { return Number(tideAmount) / SOL_TO_TIDE_RATE; }
export function solToTide(solAmount) { return Number(solAmount) * SOL_TO_TIDE_RATE; }
export function getConversionRate() { return SOL_TO_TIDE_RATE; }

function parseEth(amount) {
  const [whole, frac = ""] = String(amount).split(".");
  return BigInt(whole || "0") * WEI_PER_ETH + BigInt((frac + "0".repeat(18)).slice(0, 18) || "0");
}
function hexQuantity(v) { return `0x${BigInt(v).toString(16)}`; }

export async function paySol(solAmount, { memo, split } = {}) {
  if (!TIDE_TREASURY) throw new Error("Treasury wallet not configured");
  const payer = currentPublicKey();
  const from = payer?.address || payer?.toString?.();
  if (!from) throw new Error("Wallet not connected");
  const totalWei = parseEth(solAmount);
  if (totalWei <= 0n) throw new Error("Invalid ETH amount");

  const balanceHex = await rpc("eth_getBalance", [from, "latest"]);
  if (BigInt(balanceHex) <= totalWei) throw new Error(`Not enough ${NATIVE_SYMBOL} for payment plus gas`);

  let splitWei = 0n;
  let splitTo = split?.to ? String(split.to) : "";
  if (splitTo && /^0x[a-fA-F0-9]{40}$/.test(splitTo)) {
    const ratio = Number.isFinite(split.ratio) ? Math.min(1, Math.max(0, split.ratio)) : 0.5;
    splitWei = BigInt(Math.floor(Number(totalWei) * ratio));
    if (splitTo.toLowerCase() === TIDE_TREASURY.toLowerCase()) splitWei = 0n;
  }
  const treasuryWei = totalWei - splitWei;
  let firstHash = null;
  if (treasuryWei > 0n) firstHash = await sendTransaction({ to: TIDE_TREASURY, value: hexQuantity(treasuryWei) });
  if (splitWei > 0n) await sendTransaction({ to: splitTo, value: hexQuantity(splitWei) });
  return firstHash;
}

export function isSolPayEnabled() { return Boolean(currentPublicKey() && TIDE_TREASURY); }
export function formatSol(solAmount) {
  const n = Number(solAmount);
  if (!Number.isFinite(n)) return `— ${NATIVE_SYMBOL}`;
  if (n >= 1) return `${n.toFixed(3)} ${NATIVE_SYMBOL}`;
  if (n >= 0.001) return `${n.toFixed(4)} ${NATIVE_SYMBOL}`;
  return `${n.toFixed(6)} ${NATIVE_SYMBOL}`;
}
