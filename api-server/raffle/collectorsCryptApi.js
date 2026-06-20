// Server-side wrapper around the Collector Crypt Gacha Machine API
// (gacha.collectorcrypt.com). The x-api-key NEVER leaves the server — ONLY this
// module talks to the gacha API; the browser calls our own /api/raffle/* routes,
// which proxy through here. Keeping the key server-side is a hard requirement.
//
// Docs recap: every call sends `x-api-key`. Currency is USDC (6 decimals). A pack
// is bought by signing the partially-signed tx from /api/generatePack, submitting
// it via /api/submitTransaction, then revealing via /api/openPack (idempotent;
// may return code:"WAITING_FOR_WEBHOOK" until the buy confirms on-chain).

const DEFAULT_BASE = 'https://gacha.collectorcrypt.com';
const DEVNET_BASE = 'https://dev-gacha.collectorcrypt.com';

/** USDC base units (6 decimals) -> human dollars. */
export function usdcToDollars(baseUnits) {
  return Number(baseUnits || 0) / 1_000_000;
}

export class CollectorsCryptApi {
  /**
   * @param {object} [opts]
   * @param {string} [opts.apiKey]    defaults to process.env.GACHA_API_KEY
   * @param {string} [opts.baseUrl]   defaults to process.env.GACHA_API_BASE or mainnet
   * @param {typeof fetch} [opts.fetchImpl]  inject for tests
   * @param {number} [opts.timeoutMs]
   */
  constructor({ apiKey, baseUrl, fetchImpl, timeoutMs = 20_000 } = {}) {
    this.apiKey = apiKey ?? process.env.GACHA_API_KEY ?? '';
    this.baseUrl = (baseUrl || process.env.GACHA_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
    this.fetch = fetchImpl || globalThis.fetch;
    this.timeoutMs = timeoutMs;
  }

  /** True once an API key is present — fulfillment is gated on this. */
  get configured() {
    return Boolean(this.apiKey);
  }

  static get MAINNET_BASE() { return DEFAULT_BASE; }
  static get DEVNET_BASE() { return DEVNET_BASE; }

  async _req(path, { method = 'GET', body } = {}) {
    if (typeof this.fetch !== 'function') {
      throw new Error('fetch is not available in this runtime');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }
      if (!res.ok) {
        const err = new Error(`gacha ${path} -> ${res.status}: ${json?.error || text || res.statusText}`);
        err.status = res.status;
        err.body = json;
        throw err;
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- catalog / status (key sent when present; not strictly required) -------
  /** Full machine config + odds + stock + EV. Best single call for picking a prize machine. */
  machines() { return this._req('/api/machines'); }
  /** Per-machine open/closed + emergency-stop. */
  status() { return this._req('/api/status'); }
  /** Per-machine, per-rarity inventory counts. */
  stock() { return this._req('/api/stock'); }
  /** Browse the NFT pool for a machine (chase-card panels). */
  getNfts({ code = 'pokemon_50', rarity, page, limit } = {}) {
    const q = new URLSearchParams({ code });
    if (rarity) q.set('rarity', rarity);
    if (page) q.set('page', String(page));
    if (limit) q.set('limit', String(limit));
    return this._req(`/api/getNfts?${q}`);
  }
  /** Public "recent wins" feed (optionally filtered by slug/packType/etc). */
  getAllWinners(opts = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts)) if (v !== undefined && v !== null) q.set(k, String(v));
    return this._req(`/api/getAllWinners?${q}`);
  }

  // ---- buy / open lifecycle --------------------------------------------------
  /**
   * Build a partially-signed pack-purchase tx. `playerAddress` is the PAYER
   * (our treasury) and `altPlayerAddress` is who RECEIVES the NFT (the winner).
   * @returns {Promise<{memo:string, transaction:string}>}
   */
  generatePack({ playerAddress, packType, turbo, altPlayerAddress }) {
    return this._req('/api/generatePack', {
      method: 'POST',
      body: { playerAddress, packType, turbo, altPlayerAddress },
    });
  }
  /** Forward a fully-signed base64 tx to Solana. */
  submitTransaction(signedTransaction) {
    return this._req('/api/submitTransaction', { method: 'POST', body: { signedTransaction } });
  }
  /** Reveal a purchased pack by memo (idempotent; may return WAITING_FOR_WEBHOOK). */
  openPack(memo) {
    return this._req('/api/openPack', { method: 'POST', body: { memo } });
  }
  /** Full lifecycle audit for one memo (pack / send / buyback). */
  packStatus(memo) {
    const q = new URLSearchParams({ memo });
    return this._req(`/api/pack/status?${q}`);
  }
}
