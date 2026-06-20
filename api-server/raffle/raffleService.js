// Raffle orchestration service for the 24-Hour Fish Raffle Gacha Prize System.
//
// Owns the schema, the fish→ticket exchange, the rolling 24h cycle, the
// AUTOMATIC weighted winner selection, and the MANUAL gacha-prize fulfillment.
//
// Design note (mainnet-safe): the winner + prize machine are chosen
// AUTOMATICALLY by the scheduler (drawExpired -> drawRaffle), but the actual
// real-USDC gacha purchase is executed MANUALLY by an admin (fulfillRaffle).
// Set config.autoFulfill=true only if you want the scheduler to also spend.
//
// All money/ownership decisions are server-authoritative:
//   • ticket counts are recomputed here from the server's own `catches` row,
//   • fish ownership is verified against catches.player_id,
//   • a fish can be exchanged at most once (UNIQUE(fish_id) + a flag column),
//   • winner selection runs only here and stores a re-verifiable audit trail.

import { Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { calcTickets } from './ticketCalculator.js';
import { selectWinner, makeSeed } from './weightedWinnerSelector.js';
import { pickPrizeMachine } from './gachaMachineSelector.js';

const MAINNET_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// Namespace for Postgres advisory locks so exchange + draw serialize per-raffle
// without colliding with the catch route's per-player locks.
const RAFFLE_LOCK_NS = 919_191;

const RAFFLE_INVENTORY_LIMIT = 60;

export class RaffleService {
  /**
   * @param {object} deps
   * @param {import('pg').Pool} deps.pool
   * @param {import('./collectorsCryptApi.js').CollectorsCryptApi} deps.gacha
   * @param {import('@solana/web3.js').Connection} [deps.connection]
   * @param {import('@solana/web3.js').Keypair|null} [deps.treasuryKeypair]
   * @param {object} [deps.config]
   * @param {(msg:string, kind?:string)=>void} [deps.announce]  optional system-chat hook
   * @param {Console} [deps.logger]
   */
  constructor({ pool, gacha, connection = null, treasuryKeypair = null, config = {}, announce = null, logger = console } = {}) {
    this.pool = pool;
    this.gacha = gacha;
    this.connection = connection;
    this.treasury = treasuryKeypair;
    this.announce = announce;
    this.log = logger;
    this.config = {
      durationHours: Number(config.durationHours) || 24,
      defaultPackType: config.defaultPackType || 'pokemon_50',
      defaultPackName: config.defaultPackName || 'Elite Pack',
      defaultPackPrice: Number(config.defaultPackPrice) || 50,
      usdcMint: config.usdcMint || MAINNET_USDC,
      autoFulfill: Boolean(config.autoFulfill),
      openTimeoutMs: Number(config.openTimeoutMs) || 90_000,
    };
    this._machineCache = { at: 0, machine: null };
  }

  // ==========================================================================
  // SCHEMA
  // ==========================================================================

  async initSchema() {
    const ddl = `
      CREATE TABLE IF NOT EXISTS raffles (
        id SERIAL PRIMARY KEY,
        start_time TIMESTAMP NOT NULL DEFAULT NOW(),
        end_time TIMESTAMP NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'active',
        gacha_machine_id VARCHAR(48),
        gacha_machine_name VARCHAR(80),
        gacha_machine_price INTEGER,
        total_tickets BIGINT DEFAULT 0,
        entry_count INTEGER DEFAULT 0,
        winner_user_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        winner_wallet VARCHAR(44),
        prize_nft_id VARCHAR(96),
        prize_mint_address VARCHAR(96),
        prize_metadata JSONB,
        prize_rarity VARCHAR(20),
        random_seed VARCHAR(80),
        winning_ticket_number BIGINT,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_raffles_status ON raffles(status);
      CREATE INDEX IF NOT EXISTS idx_raffles_end ON raffles(end_time);
      CREATE INDEX IF NOT EXISTS idx_raffles_winner ON raffles(winner_user_id);

      CREATE TABLE IF NOT EXISTS raffle_entries (
        id SERIAL PRIMARY KEY,
        raffle_id INTEGER NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        wallet_address VARCHAR(44),
        fish_id INTEGER NOT NULL,
        species_id VARCHAR(50),
        rarity VARCHAR(20),
        weight_kg NUMERIC(8,3),
        size_cm NUMERIC(6,2),
        tickets_awarded INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_raffle_entry_fish UNIQUE (fish_id)
      );
      CREATE INDEX IF NOT EXISTS idx_raffle_entries_raffle ON raffle_entries(raffle_id);
      CREATE INDEX IF NOT EXISTS idx_raffle_entries_player ON raffle_entries(player_id, raffle_id);

      CREATE TABLE IF NOT EXISTS gacha_prize_claims (
        id SERIAL PRIMARY KEY,
        raffle_id INTEGER NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
        player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        wallet_address VARCHAR(44),
        gacha_machine_id VARCHAR(48),
        api_memo VARCHAR(120),
        purchase_signature VARCHAR(120),
        nft_id VARCHAR(96),
        mint_address VARCHAR(96),
        metadata JSONB,
        status VARCHAR(24) DEFAULT 'pending',
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_gacha_claims_raffle ON gacha_prize_claims(raffle_id);
      CREATE INDEX IF NOT EXISTS idx_gacha_claims_status ON gacha_prize_claims(status);
    `;
    await this.pool.query(ddl);
    // Mark the existing catch history as exchangeable inventory. Idempotent.
    await this.pool.query('ALTER TABLE catches ADD COLUMN IF NOT EXISTS exchanged_for_raffle BOOLEAN DEFAULT FALSE');
    await this.pool.query('ALTER TABLE catches ADD COLUMN IF NOT EXISTS exchanged_at TIMESTAMP');
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_catches_unexchanged ON catches(player_id) WHERE exchanged_for_raffle = FALSE"
    );
    this.log.log('[raffle] schema ready');
  }

  // ==========================================================================
  // MACHINE SELECTION (cheapest pack per card type, shuffled)
  // ==========================================================================

  /**
   * Pick the prize machine for a NEW raffle: the cheapest pack of each card type
   * the gacha offers, randomly shuffled. Falls back to the configured default
   * pack when the gacha API is unreachable/unconfigured so the cycle never stalls.
   * @returns {Promise<{code:string,name:string,price:number}>}
   */
  async pickMachine() {
    try {
      const [machinesRes, statusRes] = await Promise.allSettled([this.gacha.machines(), this.gacha.status()]);
      const machines = machinesRes.status === 'fulfilled' ? machinesRes.value?.machines || [] : [];
      let openCodes = null;
      if (statusRes.status === 'fulfilled') {
        const gachas = statusRes.value?.gachas || [];
        if (gachas.length) openCodes = new Set(gachas.filter((g) => g.isOpen || g.status === 'open').map((g) => g.code));
      }
      const chosen = pickPrizeMachine(machines, { openCodes });
      if (chosen) {
        return { code: chosen.code, name: chosen.name || chosen.code, price: Number(chosen.price) || this.config.defaultPackPrice };
      }
    } catch (e) {
      this.log.warn?.('[raffle] pickMachine failed, using default:', e.message);
    }
    return {
      code: this.config.defaultPackType,
      name: this.config.defaultPackName,
      price: this.config.defaultPackPrice,
    };
  }

  // ==========================================================================
  // RAFFLE LIFECYCLE
  // ==========================================================================

  /** Get the current active raffle, creating one if none exists. */
  async ensureActiveRaffle() {
    const existing = await this.pool.query(
      "SELECT * FROM raffles WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    if (existing.rows.length) return existing.rows[0];
    return this.createRaffle();
  }

  /** Create a fresh 24h raffle with an auto-selected prize machine. */
  async createRaffle() {
    const machine = await this.pickMachine();
    const hours = this.config.durationHours;
    const res = await this.pool.query(
      `INSERT INTO raffles (start_time, end_time, status, gacha_machine_id, gacha_machine_name, gacha_machine_price)
       VALUES (NOW(), NOW() + ($1 || ' hours')::interval, 'active', $2, $3, $4)
       RETURNING *`,
      [String(hours), machine.code, machine.name, machine.price]
    );
    this.log.log(`[raffle] opened #${res.rows[0].id} prize=${machine.code} ($${machine.price}) for ${hours}h`);
    return res.rows[0];
  }

  // ==========================================================================
  // FISH EXCHANGE
  // ==========================================================================

  /**
   * Exchange one server-recorded catch for raffle tickets in the active raffle.
   * @param {{walletAddress:string, fishId:number}} args
   * @returns {Promise<object>} resolves with { ok, ... } or throws a tagged error
   */
  async exchangeFish({ walletAddress, fishId }) {
    const fid = Math.floor(Number(fishId));
    if (!walletAddress || !Number.isFinite(fid) || fid <= 0) {
      throw httpError(400, 'BAD_INPUT', 'A valid fishId is required');
    }

    const playerRes = await this.pool.query('SELECT id FROM players WHERE wallet_address = $1', [walletAddress]);
    if (!playerRes.rows.length) throw httpError(404, 'NO_PLAYER', 'Player not found');
    const playerId = playerRes.rows[0].id;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Resolve + lock the active raffle, then take a per-raffle advisory lock so
      // concurrent exchanges/draws on the same raffle serialize their total bumps.
      const raffleRes = await client.query(
        "SELECT * FROM raffles WHERE status = 'active' ORDER BY id DESC LIMIT 1 FOR UPDATE"
      );
      if (!raffleRes.rows.length) {
        await client.query('ROLLBACK');
        throw httpError(409, 'NO_RAFFLE', 'No active raffle right now — check back shortly');
      }
      const raffle = raffleRes.rows[0];
      if (new Date(raffle.end_time).getTime() <= Date.now()) {
        await client.query('ROLLBACK');
        throw httpError(409, 'RAFFLE_CLOSED', 'This raffle has closed — the draw is about to run');
      }
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [RAFFLE_LOCK_NS, raffle.id]);

      // Verify ownership + not-already-exchanged, locking the catch row.
      const catchRes = await client.query(
        `SELECT id, player_id, species_id, rarity, size_cm, weight_kg, exchanged_for_raffle
         FROM catches WHERE id = $1 FOR UPDATE`,
        [fid]
      );
      if (!catchRes.rows.length) {
        await client.query('ROLLBACK');
        throw httpError(404, 'NO_FISH', 'That catch does not exist');
      }
      const fish = catchRes.rows[0];
      if (fish.player_id !== playerId) {
        await client.query('ROLLBACK');
        throw httpError(403, 'NOT_OWNER', 'That catch is not yours');
      }
      if (fish.exchanged_for_raffle) {
        await client.query('ROLLBACK');
        throw httpError(409, 'ALREADY_EXCHANGED', 'That fish was already exchanged for tickets');
      }

      // SERVER-AUTHORITATIVE ticket value from the stored rarity/size/weight.
      const tickets = calcTickets({
        rarity: fish.rarity,
        weightKg: Number(fish.weight_kg),
        sizeCm: Number(fish.size_cm),
      });

      // Insert the entry. UNIQUE(fish_id) is the hard backstop against a double
      // exchange slipping through a race the row lock didn't cover.
      try {
        await client.query(
          `INSERT INTO raffle_entries
             (raffle_id, player_id, wallet_address, fish_id, species_id, rarity, weight_kg, size_cm, tickets_awarded)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [raffle.id, playerId, walletAddress, fid, fish.species_id, fish.rarity, fish.weight_kg, fish.size_cm, tickets]
        );
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') throw httpError(409, 'ALREADY_EXCHANGED', 'That fish was already exchanged for tickets');
        throw e;
      }

      await client.query(
        'UPDATE catches SET exchanged_for_raffle = TRUE, exchanged_at = NOW() WHERE id = $1',
        [fid]
      );
      const upd = await client.query(
        `UPDATE raffles SET total_tickets = total_tickets + $2, entry_count = entry_count + 1
         WHERE id = $1 RETURNING total_tickets, entry_count`,
        [raffle.id, tickets]
      );

      await client.query('COMMIT');

      const userTickets = await this.pool.query(
        'SELECT COALESCE(SUM(tickets_awarded),0)::bigint AS t FROM raffle_entries WHERE raffle_id = $1 AND player_id = $2',
        [raffle.id, playerId]
      );

      return {
        ok: true,
        raffleId: raffle.id,
        fishId: fid,
        ticketsAwarded: tickets,
        userTickets: Number(userTickets.rows[0].t),
        totalTickets: Number(upd.rows[0].total_tickets),
      };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
      throw e;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // READ MODELS
  // ==========================================================================

  /** Public view of the current raffle (+ this user's tickets when wallet given). */
  async getCurrent(walletAddress = null) {
    const raffle = await this.ensureActiveRaffle();
    const out = this._publicRaffle(raffle);
    if (walletAddress) {
      const p = await this.pool.query('SELECT id FROM players WHERE wallet_address = $1', [walletAddress]);
      if (p.rows.length) {
        const t = await this.pool.query(
          'SELECT COALESCE(SUM(tickets_awarded),0)::bigint AS t, COUNT(*)::int AS n FROM raffle_entries WHERE raffle_id = $1 AND player_id = $2',
          [raffle.id, p.rows[0].id]
        );
        out.userTickets = Number(t.rows[0].t);
        out.userEntries = Number(t.rows[0].n);
        out.userWinChance = out.totalTickets > 0 ? out.userTickets / out.totalTickets : 0;
      }
    }
    return out;
  }

  /** Past raffles + winners (most recent first). */
  async getHistory(limit = 20) {
    const lim = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
    const res = await this.pool.query(
      `SELECT r.*, p.username AS winner_username
       FROM raffles r LEFT JOIN players p ON p.id = r.winner_user_id
       WHERE r.status IN ('completed','awaiting_fulfillment','failed')
       ORDER BY COALESCE(r.completed_at, r.end_time) DESC LIMIT $1`,
      [lim]
    );
    return res.rows.map((r) => this._publicRaffle(r, true));
  }

  /** Everything this user needs: tickets, exchanged fish, win history, claim status, inventory. */
  async getUserView(walletAddress) {
    const p = await this.pool.query('SELECT id FROM players WHERE wallet_address = $1', [walletAddress]);
    if (!p.rows.length) {
      return { tickets: 0, entries: [], wins: [], inventory: [] };
    }
    const playerId = p.rows[0].id;
    const raffle = await this.ensureActiveRaffle();

    const [entriesRes, invRes, winsRes, ticketRes] = await Promise.all([
      this.pool.query(
        `SELECT id, fish_id, species_id, rarity, weight_kg, size_cm, tickets_awarded, created_at
         FROM raffle_entries WHERE raffle_id = $1 AND player_id = $2 ORDER BY id DESC`,
        [raffle.id, playerId]
      ),
      this.pool.query(
        `SELECT id, species_id, rarity, size_cm, weight_kg, value, caught_at
         FROM catches WHERE player_id = $1 AND exchanged_for_raffle = FALSE
         ORDER BY value DESC, caught_at DESC LIMIT $2`,
        [playerId, RAFFLE_INVENTORY_LIMIT]
      ),
      this.pool.query(
        `SELECT r.id, r.gacha_machine_name, r.prize_nft_id, r.prize_mint_address, r.prize_metadata,
                r.prize_rarity, r.status, r.completed_at, c.status AS claim_status, c.error AS claim_error
         FROM raffles r
         LEFT JOIN gacha_prize_claims c ON c.raffle_id = r.id AND c.player_id = $1
         WHERE r.winner_user_id = $1 ORDER BY r.id DESC LIMIT 20`,
        [playerId]
      ),
      this.pool.query(
        'SELECT COALESCE(SUM(tickets_awarded),0)::bigint AS t FROM raffle_entries WHERE raffle_id = $1 AND player_id = $2',
        [raffle.id, playerId]
      ),
    ]);

    const tickets = Number(ticketRes.rows[0].t);
    const total = Number(raffle.total_tickets) || 0;
    return {
      raffleId: raffle.id,
      tickets,
      winChance: total > 0 ? tickets / total : 0,
      totalTickets: total,
      entries: entriesRes.rows.map((e) => ({
        fishId: e.fish_id,
        speciesId: e.species_id,
        rarity: e.rarity,
        weightKg: Number(e.weight_kg),
        sizeCm: Number(e.size_cm),
        tickets: e.tickets_awarded,
        at: e.created_at,
      })),
      inventory: invRes.rows.map((c) => ({
        fishId: c.id,
        speciesId: c.species_id,
        rarity: c.rarity,
        sizeCm: Number(c.size_cm),
        weightKg: Number(c.weight_kg),
        value: Number(c.value),
        caughtAt: c.caught_at,
        tickets: calcTickets({ rarity: c.rarity, weightKg: Number(c.weight_kg), sizeCm: Number(c.size_cm) }),
      })),
      wins: winsRes.rows.map((w) => ({
        raffleId: w.id,
        machine: w.gacha_machine_name,
        status: w.status,
        claimStatus: w.claim_status,
        claimError: w.claim_error,
        prize: w.prize_nft_id
          ? { nftId: w.prize_nft_id, mint: w.prize_mint_address, rarity: w.prize_rarity, metadata: w.prize_metadata }
          : null,
        completedAt: w.completed_at,
      })),
    };
  }

  // ==========================================================================
  // DRAW (automatic winner selection — NO money spent here)
  // ==========================================================================

  /** Draw every expired-but-active raffle, then open the next cycle. */
  async drawExpired() {
    const due = await this.pool.query(
      "SELECT id FROM raffles WHERE status = 'active' AND end_time <= NOW() ORDER BY id ASC"
    );
    const results = [];
    for (const row of due.rows) {
      try {
        results.push(await this.drawRaffle(row.id));
      } catch (e) {
        this.log.error('[raffle] draw failed for', row.id, e.message);
        results.push({ raffleId: row.id, error: e.message });
      }
    }
    // Always make sure the next cycle is open.
    await this.ensureActiveRaffle();

    // Optional fully-automatic fulfillment (OFF by default — mainnet spends real USDC).
    if (this.config.autoFulfill) {
      for (const r of results) {
        if (r && r.winnerUserId) {
          try { await this.fulfillRaffle(r.raffleId); } catch (e) { this.log.error('[raffle] auto-fulfill failed', r.raffleId, e.message); }
        }
      }
    }
    return results;
  }

  /**
   * Close one raffle and AUTOMATICALLY select a weighted winner. Moves the raffle
   * to 'awaiting_fulfillment' (winner chosen, prize NOT yet purchased) or
   * 'completed' when there were no entries. Idempotent for already-drawn raffles.
   */
  async drawRaffle(raffleId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [RAFFLE_LOCK_NS, raffleId]);

      const res = await client.query('SELECT * FROM raffles WHERE id = $1 FOR UPDATE', [raffleId]);
      if (!res.rows.length) { await client.query('ROLLBACK'); throw httpError(404, 'NO_RAFFLE', 'Raffle not found'); }
      const raffle = res.rows[0];
      if (raffle.status !== 'active') {
        await client.query('ROLLBACK');
        return { raffleId, alreadyDrawn: true, status: raffle.status, winnerUserId: raffle.winner_user_id };
      }

      await client.query("UPDATE raffles SET status = 'drawing' WHERE id = $1", [raffleId]);

      const entriesRes = await client.query(
        `SELECT player_id, wallet_address, SUM(tickets_awarded)::int AS tickets
         FROM raffle_entries WHERE raffle_id = $1 GROUP BY player_id, wallet_address`,
        [raffleId]
      );

      // No entries → close immediately with no winner.
      if (!entriesRes.rows.length) {
        await client.query(
          "UPDATE raffles SET status = 'completed', total_tickets = 0, completed_at = NOW() WHERE id = $1",
          [raffleId]
        );
        await client.query('COMMIT');
        this.log.log(`[raffle] #${raffleId} drawn with NO entries — closed empty`);
        return { raffleId, winnerUserId: null, empty: true };
      }

      const walletById = new Map(entriesRes.rows.map((r) => [r.player_id, r.wallet_address]));
      const seed = makeSeed();
      const selection = selectWinner(
        entriesRes.rows.map((r) => ({ userId: r.player_id, tickets: r.tickets })),
        seed
      );

      const winnerWallet = walletById.get(selection.winnerUserId) || null;
      await client.query(
        `UPDATE raffles
           SET status = 'awaiting_fulfillment',
               winner_user_id = $2, winner_wallet = $3,
               total_tickets = $4, random_seed = $5, winning_ticket_number = $6
         WHERE id = $1`,
        [raffleId, selection.winnerUserId, winnerWallet, selection.totalTickets, selection.seed, selection.winningTicket]
      );
      await client.query(
        `INSERT INTO gacha_prize_claims (raffle_id, player_id, wallet_address, gacha_machine_id, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [raffleId, selection.winnerUserId, winnerWallet, raffle.gacha_machine_id]
      );

      await client.query('COMMIT');
      this.log.log(
        `[raffle] #${raffleId} winner=player:${selection.winnerUserId} ticket=${selection.winningTicket}/${selection.totalTickets} (awaiting manual fulfillment)`
      );
      if (this.announce) {
        const short = winnerWallet ? `${winnerWallet.slice(0, 4)}…${winnerWallet.slice(-4)}` : 'an angler';
        this.announce(`🎟️ Raffle #${raffleId} closed! ${short} won with ${selection.totalTickets} tickets in play — prize incoming.`, 'rare');
      }
      return {
        raffleId,
        winnerUserId: selection.winnerUserId,
        winnerWallet,
        totalTickets: selection.totalTickets,
        winningTicket: selection.winningTicket,
        seed: selection.seed,
      };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw e;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // FULFILLMENT (manual real-USDC gacha purchase → NFT to the winner)
  // ==========================================================================

  /** Raffles whose winner has been chosen but whose prize hasn't been purchased. */
  async listPendingFulfillment() {
    const res = await this.pool.query(
      `SELECT r.id, r.gacha_machine_id, r.gacha_machine_name, r.gacha_machine_price,
              r.winner_wallet, r.total_tickets, r.end_time,
              c.status AS claim_status, c.error AS claim_error
       FROM raffles r
       LEFT JOIN gacha_prize_claims c ON c.raffle_id = r.id
       WHERE r.status = 'awaiting_fulfillment' AND r.winner_user_id IS NOT NULL
       ORDER BY r.id ASC`
    );
    return res.rows;
  }

  /**
   * MANUAL admin step: buy + open the gacha pack for a drawn raffle and deliver
   * the NFT to the winner's wallet. Treasury pays the USDC; NFT routes to the
   * winner via altPlayerAddress. On failure the raffle stays 'awaiting_fulfillment'
   * so it can be retried after the cause is fixed.
   */
  async fulfillRaffle(raffleId) {
    const raffleRes = await this.pool.query('SELECT * FROM raffles WHERE id = $1', [raffleId]);
    if (!raffleRes.rows.length) throw httpError(404, 'NO_RAFFLE', 'Raffle not found');
    const raffle = raffleRes.rows[0];

    if (raffle.status === 'completed') {
      return { ok: true, alreadyFulfilled: true, raffleId, prize: this._prizeOf(raffle) };
    }
    if (raffle.status !== 'awaiting_fulfillment' || !raffle.winner_wallet) {
      throw httpError(409, 'NOT_DRAWABLE', `Raffle #${raffleId} is not awaiting fulfillment (status=${raffle.status})`);
    }

    // --- Preflight: never half-spend. Bail clearly if anything is missing. ----
    if (!this.gacha?.configured) throw httpError(503, 'GACHA_UNCONFIGURED', 'Gacha API key not configured (set GACHA_API_KEY)');
    if (!this.treasury) throw httpError(503, 'NO_TREASURY', 'Treasury keypair not configured');
    const packType = raffle.gacha_machine_id || this.config.defaultPackType;
    const price = Number(raffle.gacha_machine_price) || this.config.defaultPackPrice;

    const usdc = await this._treasuryUsdcDollars();
    if (usdc !== null && usdc < price) {
      throw httpError(402, 'TREASURY_USDC_LOW', `Treasury USDC ${usdc.toFixed(2)} < pack price ${price}. Fund the treasury's USDC account and retry.`);
    }

    const claim = await this._ensureClaim(raffleId, raffle.winner_user_id, raffle.winner_wallet, packType);

    let submitSignature = claim.purchase_signature || null;
    try {
      await this.pool.query("UPDATE gacha_prize_claims SET error = NULL WHERE id = $1", [claim.id]);

      // RESUME-SAFE: if a prior attempt already generated a pack (memo persisted),
      // NEVER buy again — re-purchasing would double-spend the treasury's USDC.
      // openPack is idempotent, so we just re-open that same memo. A memo with no
      // confirmed payment will simply WAITING_FOR_WEBHOOK→timeout (no money lost).
      let memo = claim.api_memo || null;
      if (!memo) {
        // 1) Build the pack-buy tx: treasury pays, NFT goes to the winner.
        await this.pool.query("UPDATE gacha_prize_claims SET status = 'purchasing' WHERE id = $1", [claim.id]);
        const gen = await this.gacha.generatePack({
          playerAddress: this.treasury.publicKey.toBase58(),
          altPlayerAddress: raffle.winner_wallet,
          packType,
          turbo: false,
        });
        memo = gen.memo;
        // Persist the memo BEFORE submitting so a crash mid-submit can't strand a
        // paid pack we can't find — a retry resumes on this exact memo.
        await this.pool.query("UPDATE gacha_prize_claims SET api_memo = $2, status = 'purchasing' WHERE id = $1", [claim.id, memo]);

        // 2) Sign with the treasury and submit on-chain.
        const signed = this._signGachaTx(gen.transaction);
        const submit = await this.gacha.submitTransaction(signed);
        submitSignature = submit.signature || null;
        await this.pool.query(
          "UPDATE gacha_prize_claims SET purchase_signature = $2, status = 'opening' WHERE id = $1",
          [claim.id, submitSignature]
        );
      } else {
        this.log.log(`[raffle] #${raffleId} resuming fulfillment on existing memo ${memo} (no re-purchase)`);
        await this.pool.query("UPDATE gacha_prize_claims SET status = 'opening' WHERE id = $1", [claim.id]);
      }

      // 3) Reveal the pack (idempotent; may report WAITING_FOR_WEBHOOK first).
      const opened = await this._openWithRetry(memo);
      const meta = opened.nftWon?.content?.metadata || opened.nftWon || null;

      // 4) Persist the prize and complete the raffle.
      await this.pool.query(
        `UPDATE raffles SET status = 'completed', completed_at = NOW(),
           prize_nft_id = $2, prize_mint_address = $3, prize_rarity = $4, prize_metadata = $5
         WHERE id = $1`,
        [raffleId, opened.nft_address || null, opened.nft_address || null, opened.rarity || null, meta ? JSON.stringify(meta) : null]
      );
      await this.pool.query(
        `UPDATE gacha_prize_claims
           SET status = 'complete', completed_at = NOW(),
               nft_id = $2, mint_address = $3, metadata = $4
         WHERE id = $1`,
        [claim.id, opened.nft_address || null, opened.nft_address || null, meta ? JSON.stringify(meta) : null]
      );

      this.log.log(`[raffle] #${raffleId} FULFILLED — ${opened.rarity || '?'} NFT ${opened.nft_address} -> ${raffle.winner_wallet}`);
      if (this.announce) {
        const name = meta?.name || 'a mystery card';
        this.announce(`🎁 Raffle #${raffleId} prize delivered: ${name} (${opened.rarity || 'card'})!`, 'rare');
      }
      return {
        ok: true,
        raffleId,
        memo,
        signature: submitSignature,
        prize: { nftId: opened.nft_address, rarity: opened.rarity, metadata: meta },
      };
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 500);
      await this.pool.query("UPDATE gacha_prize_claims SET status = 'failed', error = $2 WHERE id = $1", [claim.id, msg]);
      this.log.error(`[raffle] #${raffleId} fulfillment FAILED:`, msg);
      // Re-throw so the admin sees the cause; raffle stays awaiting_fulfillment (retryable).
      throw (e.status ? e : httpError(502, 'FULFILL_FAILED', msg));
    }
  }

  // ==========================================================================
  // INTERNALS
  // ==========================================================================

  async _ensureClaim(raffleId, playerId, wallet, packType) {
    const existing = await this.pool.query(
      "SELECT * FROM gacha_prize_claims WHERE raffle_id = $1 ORDER BY id DESC LIMIT 1",
      [raffleId]
    );
    if (existing.rows.length) return existing.rows[0];
    const ins = await this.pool.query(
      `INSERT INTO gacha_prize_claims (raffle_id, player_id, wallet_address, gacha_machine_id, status)
       VALUES ($1,$2,$3,$4,'pending') RETURNING *`,
      [raffleId, playerId, wallet, packType]
    );
    return ins.rows[0];
  }

  /** Sign a base64 partially-signed gacha tx with the treasury keypair. */
  _signGachaTx(base64Tx) {
    const buf = Buffer.from(base64Tx, 'base64');
    try {
      const vtx = VersionedTransaction.deserialize(new Uint8Array(buf));
      vtx.sign([this.treasury]);
      return Buffer.from(vtx.serialize()).toString('base64');
    } catch {
      const tx = Transaction.from(buf);
      tx.partialSign(this.treasury);
      return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
    }
  }

  /** Poll openPack until it stops returning WAITING_FOR_WEBHOOK (or times out). */
  async _openWithRetry(memo) {
    const deadline = Date.now() + this.config.openTimeoutMs;
    let last;
    while (Date.now() < deadline) {
      last = await this.gacha.openPack(memo);
      if (last?.code !== 'WAITING_FOR_WEBHOOK') {
        if (last?.success === false) throw httpError(502, 'OPEN_FAILED', last?.error || 'openPack reported failure');
        if (!last?.nft_address) throw httpError(502, 'OPEN_NO_NFT', 'openPack returned no NFT');
        return last;
      }
      await sleep(2500);
    }
    throw httpError(504, 'OPEN_TIMEOUT', `Pack open timed out for memo ${memo} — check /api/pack/status and retry`);
  }

  /** Treasury USDC balance in dollars, or null if it can't be determined. */
  async _treasuryUsdcDollars() {
    if (!this.connection || !this.treasury) return null;
    try {
      const mint = new PublicKey(this.config.usdcMint);
      const [ata] = PublicKey.findProgramAddressSync(
        [this.treasury.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const bal = await this.connection.getTokenAccountBalance(ata);
      return Number(bal?.value?.uiAmount || 0);
    } catch (e) {
      // No ATA / RPC hiccup → treat as unknown rather than blocking fulfillment.
      this.log.warn?.('[raffle] could not read treasury USDC balance:', e.message);
      return null;
    }
  }

  _prizeOf(raffle) {
    if (!raffle.prize_nft_id) return null;
    return { nftId: raffle.prize_nft_id, mint: raffle.prize_mint_address, rarity: raffle.prize_rarity, metadata: raffle.prize_metadata };
  }

  _publicRaffle(raffle, includePrize = false) {
    const end = new Date(raffle.end_time).getTime();
    const out = {
      raffleId: raffle.id,
      status: raffle.status,
      startTime: raffle.start_time,
      endTime: raffle.end_time,
      timeRemainingMs: Math.max(0, end - Date.now()),
      totalTickets: Number(raffle.total_tickets) || 0,
      entryCount: Number(raffle.entry_count) || 0,
      machine: {
        id: raffle.gacha_machine_id,
        name: raffle.gacha_machine_name,
        price: raffle.gacha_machine_price,
      },
      userTickets: 0,
      userWinChance: 0,
    };
    if (includePrize || raffle.status === 'completed' || raffle.status === 'failed') {
      out.winnerWallet = raffle.winner_wallet || null;
      out.winnerUsername = raffle.winner_username || null;
      out.winningTicketNumber = raffle.winning_ticket_number != null ? Number(raffle.winning_ticket_number) : null;
      out.randomSeed = raffle.random_seed || null;
      out.completedAt = raffle.completed_at || null;
      out.prize = this._prizeOf(raffle);
    }
    return out;
  }
}

function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
