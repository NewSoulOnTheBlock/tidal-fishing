// HTTP routes + scheduler for the 24-Hour Fish Raffle Gacha Prize System.
//
// One entry point — installRaffleSystem(...) — builds the gacha client + service,
// initializes the schema, mounts the routes, and starts the rolling-cycle
// scheduler. server.js calls it once so the monolith stays small.
//
// Auth model:
//   • exchange-fish / user  -> requireSession (wallet-bound bearer token)
//   • current / history     -> public reads
//   • draw / fulfill / pending -> admin only (ADMIN_SECRET), server-authoritative
//
// Money model (mainnet-safe): the scheduler + /draw only CHOOSE a winner
// automatically (no spend). The real-USDC gacha purchase is /fulfill, executed
// MANUALLY by an admin (unless RAFFLE_AUTO_FULFILL=true).

import { CollectorsCryptApi } from './collectorsCryptApi.js';
import { RaffleService } from './raffleService.js';

function sendErr(res, e, fallback = 500) {
  // Only surface a message for INTENTIONAL errors (httpError sets .status); raw
  // infra/DB errors get a generic message so internals never leak to clients.
  const intentional = Number.isFinite(Number(e?.status));
  const status = intentional ? Number(e.status) : fallback;
  const message = intentional ? (e.message || 'Request failed')
    : (status >= 500 ? 'Raffle service error' : 'Request failed');
  res.status(status).json({ error: message, code: e?.code || 'RAFFLE_ERROR' });
}

/**
 * @param {object} deps
 * @param {import('express').Express} deps.app
 * @param {import('pg').Pool} deps.pool
 * @param {import('@solana/web3.js').Connection} deps.connection
 * @param {import('@solana/web3.js').Keypair|null} deps.treasuryKeypair
 * @param {import('express').RequestHandler} deps.requireSession
 * @param {(key:string)=>boolean} deps.adminKeyValid
 * @param {import('express').RequestHandler} [deps.writeLimiter]
 * @param {(v:string)=>import('express').RequestHandler} [deps.cacheControl]
 * @param {(msg:string,kind?:string)=>void} [deps.announce]
 * @returns {RaffleService}
 */
export function installRaffleSystem(deps) {
  const {
    app, pool, connection, treasuryKeypair,
    requireSession, adminKeyValid,
    writeLimiter = (req, res, next) => next(),
    cacheControl = () => (req, res, next) => next(),
    announce = null,
    logger = console,
  } = deps;

  const gacha = new CollectorsCryptApi({
    apiKey: process.env.GACHA_API_KEY || '',
    baseUrl: process.env.GACHA_API_BASE || undefined,
  });

  const service = new RaffleService({
    pool,
    gacha,
    connection,
    treasuryKeypair,
    announce,
    logger,
    config: {
      durationHours: Number(process.env.RAFFLE_DURATION_HOURS) || 24,
      defaultPackType: process.env.RAFFLE_DEFAULT_PACK || 'pokemon_50',
      defaultPackName: process.env.RAFFLE_DEFAULT_PACK_NAME || 'Elite Pack',
      defaultPackPrice: Number(process.env.RAFFLE_DEFAULT_PACK_PRICE) || 50,
      usdcMint: process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      autoFulfill: String(process.env.RAFFLE_AUTO_FULFILL || 'false').toLowerCase() === 'true',
      packFishCost: Number(process.env.RAFFLE_PACK_FISH_COST) || 1000,
    },
  });

  const adminAuthed = (req) => adminKeyValid(req.body?.adminKey || req.headers['x-admin-key'] || req.query?.adminKey);

  // -- Initialize schema + open the first raffle (non-fatal on failure). -------
  service.initSchema()
    .then(() => service.ensureActiveRaffle())
    .then((r) => logger.log?.(`[raffle] active raffle #${r.id} (${r.gacha_machine_id})`))
    .catch((e) => logger.error?.('[raffle] init failed:', e.message));

  // ===========================================================================
  // PUBLIC READS
  // ===========================================================================

  // Current raffle: countdown, prize machine, totals (+ this user's tickets when ?wallet=).
  app.get('/api/raffle/current', cacheControl('no-store'), async (req, res) => {
    try {
      const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : null;
      res.json(await service.getCurrent(wallet));
    } catch (e) { sendErr(res, e); }
  });

  // Past raffles + winners.
  app.get('/api/raffle/history', cacheControl('public, max-age=30'), async (req, res) => {
    try {
      res.json({ raffles: await service.getHistory(req.query.limit) });
    } catch (e) { sendErr(res, e); }
  });

  // ===========================================================================
  // PLAYER ACTIONS (wallet-bound session required)
  // ===========================================================================

  // Exchange a caught fish for raffle tickets.
  app.post('/api/raffle/exchange-fish', writeLimiter, requireSession, async (req, res) => {
    try {
      const walletAddress = req.authWallet || req.body?.walletAddress;
      if (!walletAddress) return res.status(401).json({ error: 'Sign in to enter the raffle', code: 'SESSION_REQUIRED' });
      const out = await service.exchangeFish({ walletAddress, fishId: req.body?.fishId });
      res.json(out);
    } catch (e) { sendErr(res, e, 400); }
  });

  // This user's tickets, entries, inventory, win history + claim status.
  app.get('/api/raffle/user', cacheControl('no-store'), requireSession, async (req, res) => {
    try {
      const wallet = req.authWallet || (typeof req.query.wallet === 'string' ? req.query.wallet : null);
      if (!wallet) return res.status(401).json({ error: 'Sign in to view your raffle status', code: 'SESSION_REQUIRED' });
      res.json(await service.getUserView(wallet));
    } catch (e) { sendErr(res, e); }
  });

  // Spend fish (default 1000) for a treasury-funded mystery gacha pack; NFT to wallet.
  app.post('/api/raffle/buy-pack', writeLimiter, requireSession, async (req, res) => {
    try {
      const walletAddress = req.authWallet || req.body?.walletAddress;
      if (!walletAddress) return res.status(401).json({ error: 'Sign in to buy a pack', code: 'SESSION_REQUIRED' });
      const out = await service.buyPackWithFish({ walletAddress, packType: req.body?.packType });
      res.json(out);
    } catch (e) { sendErr(res, e, 400); }
  });

  // ===========================================================================
  // ADMIN / SERVER-ONLY
  // ===========================================================================

  // Run the draw NOW (automatic weighted selection of any expired raffle). No spend.
  app.post('/api/raffle/draw', async (req, res) => {
    if (!adminAuthed(req)) return res.status(401).json({ error: 'Unauthorized', code: 'ADMIN_REQUIRED' });
    try {
      const results = await service.drawExpired();
      res.json({ ok: true, drawn: results });
    } catch (e) { sendErr(res, e); }
  });

  // List raffles whose winner is chosen but whose prize hasn't been purchased.
  app.get('/api/raffle/admin/pending', async (req, res) => {
    if (!adminAuthed(req)) return res.status(401).json({ error: 'Unauthorized', code: 'ADMIN_REQUIRED' });
    try {
      res.json({ pending: await service.listPendingFulfillment() });
    } catch (e) { sendErr(res, e); }
  });

  // MANUAL execution: buy + open the gacha pack and deliver the NFT to the winner.
  app.post('/api/raffle/fulfill', async (req, res) => {
    if (!adminAuthed(req)) return res.status(401).json({ error: 'Unauthorized', code: 'ADMIN_REQUIRED' });
    const raffleId = Math.floor(Number(req.body?.raffleId));
    if (!Number.isFinite(raffleId) || raffleId <= 0) {
      return res.status(400).json({ error: 'raffleId required', code: 'BAD_INPUT' });
    }
    try {
      res.json(await service.fulfillRaffle(raffleId));
    } catch (e) { sendErr(res, e, 502); }
  });

  // Pack purchases that paid USDC but haven't delivered the NFT (need a retry).
  app.get('/api/raffle/admin/pending-packs', async (req, res) => {
    if (!adminAuthed(req)) return res.status(401).json({ error: 'Unauthorized', code: 'ADMIN_REQUIRED' });
    try {
      res.json({ pending: await service.listPendingPackDeliveries() });
    } catch (e) { sendErr(res, e); }
  });

  // Resume delivery of a purchased-but-undelivered pack (no new fish spent).
  app.post('/api/raffle/retry-pack', async (req, res) => {
    if (!adminAuthed(req)) return res.status(401).json({ error: 'Unauthorized', code: 'ADMIN_REQUIRED' });
    const purchaseId = Math.floor(Number(req.body?.purchaseId));
    if (!Number.isFinite(purchaseId) || purchaseId <= 0) {
      return res.status(400).json({ error: 'purchaseId required', code: 'BAD_INPUT' });
    }
    try {
      res.json(await service.retryPackDelivery(purchaseId));
    } catch (e) { sendErr(res, e, 502); }
  });

  // ===========================================================================
  // SCHEDULER — checks every few minutes; auto-draws expired raffles + opens next.
  // ===========================================================================
  const tickMs = Math.max(60_000, Number(process.env.RAFFLE_TICK_MS) || 300_000);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const drawn = await service.drawExpired();
      if (drawn.some((d) => d && (d.winnerUserId || d.empty))) {
        logger.log?.(`[raffle] scheduler drew ${drawn.length} raffle(s)`);
      }
    } catch (e) {
      logger.error?.('[raffle] scheduler tick failed:', e.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, tickMs);
  timer.unref?.();
  // Kick once shortly after boot (after schema init has had a moment).
  setTimeout(tick, 15_000).unref?.();

  logger.log?.(
    `[raffle] installed — cycle ${service.config.durationHours}h, tick ${Math.round(tickMs / 1000)}s, ` +
    `gacha ${gacha.configured ? '✅ key set' : '❌ no key'}, autoFulfill ${service.config.autoFulfill}`
  );

  return service;
}
