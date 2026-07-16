import { apiFetch } from '../utils/api.js';

export async function verifyBaitPurchase(txHash) {
  const res = await apiFetch('/api/purchases/bait/verify', {
    method: 'POST', auth: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txHash }), timeoutMs: 60_000,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Verify failed (${res.status})`);
  return body;
}

export async function verifyStorePurchase({ txHash, kind = 'item' }) {
  const res = await apiFetch('/api/purchases/store/verify', {
    method: 'POST', auth: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txHash, kind }), timeoutMs: 60_000,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Store verification failed (${res.status})`);
  return body;
}
