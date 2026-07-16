import { apiFetch } from '../utils/api.js';
import { currentWalletAddress } from '../web3/wallet.js';

export const TERMS_VERSION = 'bfb-pro-v1';
export const RESPONSIBLE_GAMING_COPY = [
  'Reward-bearing Pro mode involves paid entries and variable outcomes.',
  'Not guaranteed profit.',
  'Do not play with funds you cannot afford to lose.',
  'Availability may depend on your jurisdiction.',
  'Stock Tokens, if ever supported, provide economic exposure only and are not shares.',
];

const keyFor = (wallet) => `bfb_terms_${TERMS_VERSION}_${wallet || 'guest'}`;
export function hasAcceptedCompliance(wallet = currentWalletAddress()?.toString?.()) { try { return localStorage.getItem(keyFor(wallet)) === 'yes'; } catch { return false; } }
export async function acceptCompliance(wallet = currentWalletAddress()?.toString?.()) {
  try { localStorage.setItem(keyFor(wallet), 'yes'); } catch {}
  await apiFetch('/api/compliance/accept', { method: 'POST', auth: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ walletAddress: wallet, termsVersion: TERMS_VERSION }) }).catch(() => null);
  return true;
}
export async function requireCompliance() {
  const wallet = currentWalletAddress()?.toString?.();
  if (hasAcceptedCompliance(wallet)) return true;
  const ok = typeof window === 'undefined' ? true : window.confirm(`${RESPONSIBLE_GAMING_COPY.join('\n')}\n\nAccept Pro mode terms?`);
  if (!ok) return false;
  return acceptCompliance(wallet);
}
export class ComplianceGate { async ensure() { return requireCompliance(); } }
