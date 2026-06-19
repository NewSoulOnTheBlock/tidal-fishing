import express from 'express';
import cors from 'cors';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  SystemProgram,
  clusterApiUrl,
} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateCatch } from './catchRules.js';
import { makeSkrResolver } from './skrNames.js';

dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3000;

// Account suspension (wallet ban enforcement) master switch. Disabled for now —
// set ACCOUNT_SUSPENSION_ENABLED=true on the host to re-enable wallet bans.
// IP bans and rate limiting are unaffected by this flag.
const ACCOUNT_SUSPENSION_ENABLED = process.env.ACCOUNT_SUSPENSION_ENABLED === 'true';

// Render runs the app behind a single reverse proxy; trust it so req.ip and
// X-Forwarded-For reflect the real client (needed for rate limiting + IP bans).
app.set('trust proxy', 1);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Ensure ban-system tables exist (idempotent — runs on every boot).
// Self-heals deploys where schema.sql was never applied manually, which
// otherwise causes /api/catch/validate to 500 and breaks all fishing.
async function initDatabase() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS banned_wallets (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(44) UNIQUE NOT NULL,
      reason TEXT,
      banned_at TIMESTAMP DEFAULT NOW(),
      banned_by VARCHAR(100) DEFAULT 'system'
    );
    CREATE TABLE IF NOT EXISTS banned_ips (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(45) UNIQUE NOT NULL,
      reason TEXT,
      banned_at TIMESTAMP DEFAULT NOW(),
      banned_by VARCHAR(100) DEFAULT 'system'
    );
    CREATE INDEX IF NOT EXISTS idx_banned_wallets ON banned_wallets(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_banned_ips ON banned_ips(ip_address);
    CREATE TABLE IF NOT EXISTS ip_activity (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(45) NOT NULL,
      wallet_address VARCHAR(44),
      action VARCHAR(50) NOT NULL,
      timestamp TIMESTAMP DEFAULT NOW(),
      metadata JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_ip_activity_lookup ON ip_activity(ip_address, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_ip_activity_wallet ON ip_activity(wallet_address, timestamp DESC);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(44) NOT NULL,
      username VARCHAR(50),
      message VARCHAR(280) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(id DESC);
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(44) NOT NULL,
      amount BIGINT NOT NULL,
      nonce VARCHAR(80) UNIQUE NOT NULL,
      tx_signature VARCHAR(120),
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_withdrawals_wallet ON withdrawals(wallet_address, created_at DESC);
  `;
  try {
    await pool.query(ddl);
    console.log('✅ Ban-system tables ready');
  } catch (err) {
    console.error('❌ Failed to initialize ban-system tables:', err);
  }
  // Withdrawable-balance ledger column. Run separately so a failure here
  // (e.g. players table not yet migrated) doesn't block the tables above.
  try {
    await pool.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS total_withdrawn BIGINT DEFAULT 0');
  } catch (err) {
    console.error('❌ Failed to add total_withdrawn column:', err.message);
  }
  // Engagement features: chat message kind (user/system/rare/welcome/catch) +
  // poster level for in-chat flair. Run separately so each is independent.
  try {
    await pool.query("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS kind VARCHAR(16) DEFAULT 'user'");
    await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS level INT DEFAULT 0');
  } catch (err) {
    console.error('❌ Failed to add chat flair columns:', err.message);
  }
  // Daily-streak tracking (consecutive UTC days the wallet checked in).
  try {
    await pool.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS streak_count INT DEFAULT 0');
    await pool.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS last_active_date DATE');
    await pool.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS streak_reward_date DATE');
  } catch (err) {
    console.error('❌ Failed to add streak columns:', err.message);
  }
}
initDatabase();

// Environment variables
const RPC_URL = process.env.VITE_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
const TIDE_MINT_STR = process.env.VITE_TIDE_MINT || '7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump';
const SECRET_STR = process.env.TIDAL_TREASURY_SECRET || '';
const TIDE_DECIMALS = Number(process.env.VITE_TIDE_DECIMALS ?? 6);
const MAX_UI_AMOUNT = Number(process.env.TIDAL_WITHDRAW_MAX ?? 100_000_000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://tidalfishing.fun';

// Server-authoritative per-species value ceilings (generated by
// gen-fish-values.mjs from the same data + formula the client uses). Every
// client-reported catch value is clamped to this so a tampered client cannot
// mint withdrawable $TIDE. Regenerate after editing fish data.
const __dirname = dirname(fileURLToPath(import.meta.url));
let FISH_VALUES = { earnMult: 1, species: {} };
try {
  FISH_VALUES = JSON.parse(readFileSync(join(__dirname, 'fishValues.json'), 'utf8'));
  console.log(`[server] Loaded value caps for ${Object.keys(FISH_VALUES.species).length} species`);
} catch (e) {
  console.error('[server] fishValues.json missing — falling back to flat value ceiling:', e.message);
}
const VALID_LOCATIONS = new Set(['lake', 'river', 'pier', 'ocean']);

// Server-recorded catch counts that any legitimate angler comfortably exceeds
// long before they could afford to unlock a high-tier spot (the TIDE needed to
// unlock pier/ocean requires far more catches than these floors). Used as the
// sole, SERVER-AUTHORITATIVE progression gate in /api/player/catch, so honest
// and migrating players are never blocked while a level-forging client is.
const LOCATION_CATCH_FLOOR = { pier: 12, ocean: 30 };

// Catch validation rules (reachability gate, value/size/weight clamps, rarity
// + earnings caps) live in catchRules.js so they can be unit-tested in
// isolation.

// ============================================================================
// SHARED-WORLD / ENGAGEMENT HELPERS
// Online-presence count, daily hot spot, and the system "live feed" that posts
// notable catches into the global chat (Fishermans Hole).
// ============================================================================

const SYSTEM_WALLET = 'SYSTEM';
const HOT_SPOTS = ['lake', 'river', 'pier', 'ocean'];
const HOT_SPOT_LABEL = { lake: 'Lake', river: 'River', pier: 'Pier', ocean: 'Ocean' };
// Daily $TIDE check-in bonus (credited to the withdrawable ledger). Kept small
// and once-per-UTC-day so it can't be farmed: base + step×min(streak,7).
const STREAK_BONUS_BASE = 25;
const STREAK_BONUS_STEP = 15;
const STREAK_BONUS_MAX = 150;

function utcDayNumber(ms = Date.now()) { return Math.floor(ms / 86400000); }
// Deterministic rotating hot spot — must match the client's world.js formula.
function dailyHotSpot() { return HOT_SPOTS[utcDayNumber() % HOT_SPOTS.length]; }

function shortWallet(w) {
  return (typeof w === 'string' && w.length > 10) ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || 'angler');
}
// Prettify a species id ("largemouth_bass") into a display name ("Largemouth Bass").
function prettySpecies(id) {
  return String(id || 'fish').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
}

// Whitelist the player columns safe to return from the UNAUTHENTICATED
// /api/player/auth lookup. Deliberately omits `money` and `total_withdrawn`
// (financial internals) and other private columns — everything here is already
// public via the leaderboard / profile endpoints. The client only reads
// username/level/xp from this response (src/web3/databaseIntegration.js).
function publicPlayer(row = {}) {
  return {
    wallet_address: row.wallet_address,
    username: row.username,
    level: row.level,
    xp: row.xp,
    total_earned: row.total_earned,
    total_catches: row.total_catches,
    perfect_hooks: row.perfect_hooks,
    profile_picture: row.profile_picture,
    bio: row.bio,
    created_at: row.created_at,
    last_login: row.last_login,
  };
}

// In-memory presence: per-tab id -> { at: last-seen ms, wallet|null }. Counts
// tabs active in the last 60s. Resets on restart (fine — it's flavor), single
// Render instance.
const presence = new Map();
const PRESENCE_TTL_MS = 60_000;
const PRESENCE_MAX = 5000;
const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function touchPresence(id, wallet) {
  if (typeof id !== 'string' || id.length < 6 || id.length > 64) return;
  if (!presence.has(id) && presence.size >= PRESENCE_MAX) return;
  const w = (typeof wallet === 'string' && SOL_ADDR_RE.test(wallet)) ? wallet : null;
  presence.set(id, { at: Date.now(), wallet: w });
}
function prunePresence() {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [id, v] of presence) if (!v || v.at < cutoff) presence.delete(id);
}
function onlineCount() {
  prunePresence();
  return presence.size;
}
// Distinct wallets currently online (deduped across a player's multiple tabs).
function onlineWallets() {
  prunePresence();
  const set = new Set();
  for (const v of presence.values()) if (v.wallet) set.add(v.wallet);
  return set;
}

// Post a system "live feed" line into the global chat. Fire-and-forget so it
// never blocks a gameplay response; periodically prunes the table.
let _sysChatCount = 0;
async function insertSystemChat(message, kind = 'system') {
  const msg = String(message)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
  if (!msg) return;
  try {
    await pool.query(
      `INSERT INTO chat_messages (wallet_address, username, message, kind, level)
       VALUES ($1, $2, $3, $4, 0)`,
      [SYSTEM_WALLET, 'Fishermans Hole', msg, kind]
    );
    if ((++_sysChatCount % 10) === 0) {
      pool.query(
        `DELETE FROM chat_messages
         WHERE id < (SELECT MIN(id) FROM (SELECT id FROM chat_messages ORDER BY id DESC LIMIT 500) t)`
      ).catch(() => {});
    }
  } catch (e) { /* best-effort flavor — never throw */ }
}

// Timing-safe admin key check (avoids leaking the secret via response timing).
function adminKeyValid(provided) {
  const secret = process.env.ADMIN_SECRET || '';
  if (!secret || typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ============================================================================
// SIGN-IN WITH SOLANA (SIWS) — session tokens prove wallet ownership so the
// write endpoints can't be impersonated by spoofing `walletAddress` in a body.
// ============================================================================

// Secret used to HMAC session tokens. Prefer a dedicated SESSION_SECRET env var;
// fall back to a stable value derived from existing secrets so tokens survive
// server restarts even if the operator hasn't set one yet.
const SESSION_SECRET = process.env.SESSION_SECRET ||
  crypto.createHash('sha256')
    .update(`tidal-session|${process.env.ADMIN_SECRET || ''}|${TIDE_MINT_STR || ''}`)
    .digest('hex');
// Fail-loud guard: if NEITHER a dedicated SESSION_SECRET nor an ADMIN_SECRET is
// set, the derived fallback above is computed from publicly-known constants only
// (empty secret + the public mint), making session tokens forgeable. Warn
// prominently on boot so the operator sets a real secret on the host.
if (!process.env.SESSION_SECRET && !process.env.ADMIN_SECRET) {
  console.error(
    '⚠️  SECURITY: neither SESSION_SECRET nor ADMIN_SECRET is set — session ' +
    'tokens are signed with a PUBLICLY-DERIVABLE key and can be forged. Set a ' +
    'strong SESSION_SECRET (and ADMIN_SECRET) env var on the host immediately.'
  );
}
// Default to enforcing; set SESSION_ENFORCE=false only as an emergency escape hatch.
const SESSION_ENFORCE = String(process.env.SESSION_ENFORCE ?? 'true').toLowerCase() !== 'false';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const SIWS_MAX_AGE_MS = 15 * 60 * 1000;     // signed login message freshness window (generous to absorb client clock skew)

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Issue a compact `<payload>.<hmac>` token binding a wallet to an expiry.
function issueSessionToken(wallet) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = base64url(JSON.stringify({ w: wallet, exp }));
  const mac = base64url(crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest());
  return { token: `${payload}.${mac}`, expiresAt: exp };
}

// Verify a token's HMAC + expiry; returns the wallet address or null.
function verifySessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expectedMac = base64url(crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest());
  const a = Buffer.from(mac), b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
  catch { return null; }
  if (!data || typeof data.w !== 'string' || typeof data.exp !== 'number') return null;
  if (Date.now() > data.exp) return null;
  return data.w;
}

// Middleware: require a valid Bearer session whose wallet matches the body's
// walletAddress. When SESSION_ENFORCE is off, tokenless requests pass through
// (legacy compatibility) but a present token is still validated + matched.
function requireSession(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const bodyWallet = req.body?.walletAddress;

  if (!token) {
    if (SESSION_ENFORCE) {
      return res.status(401).json({ error: 'Sign in with your wallet to continue', code: 'SESSION_REQUIRED' });
    }
    return next(); // legacy grace period
  }

  const wallet = verifySessionToken(token);
  if (!wallet) {
    return res.status(401).json({ error: 'Session expired — sign in again', code: 'SESSION_INVALID' });
  }
  if (bodyWallet && bodyWallet !== wallet) {
    return res.status(403).json({ error: 'Session does not match wallet', code: 'SESSION_MISMATCH' });
  }
  req.authWallet = wallet;
  next();
}

// Solana program IDs
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  credentials: true,
}));
// Security headers. CSP disabled (this is a JSON API) and CORP relaxed so the
// off-origin Windows Widgets board can still read /api/widget.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '64kb' }));

// --- Rate limiters (per-IP; trust proxy is enabled above) ---
const withdrawLimiter = rateLimit({
  windowMs: 60_000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many withdrawal attempts. Wait a minute and try again.' },
});
const adminLimiter = rateLimit({
  windowMs: 60_000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many admin requests.' },
});
const writeLimiter = rateLimit({
  windowMs: 60_000, max: 90,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});
// Universal baseline limiter applied to EVERY /api route (public reads included)
// so no endpoint is completely unmetered. Deliberately generous: a single very-
// active player peaks well under 40 req/min, so even dozens of players sharing a
// CGNAT/household IP stay clear, while a scraper or flooder (thousands/min) is
// bounded. The stricter per-route limiters (write/withdraw/admin) stack on top.
const globalLimiter = rateLimit({
  windowMs: 60_000, max: Number(process.env.GLOBAL_RATE_MAX) || 1200,
  standardHeaders: true, legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: { error: 'Too many requests. Slow down.' },
});

// IP extraction helper
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         'unknown';
}

// --- In-memory perf caches -------------------------------------------------
// checkBans runs on EVERY /api request (chat polling alone is 15+/min/client).
// Cache the per-IP ban result for 5 min; the auto-ban + admin ban/unban paths
// call clearBanCache(ip) so a new ban still takes effect immediately.
const BAN_CACHE_TTL = 5 * 60 * 1000;
const BAN_CACHE_MAX = 5000;
const banCache = new Map(); // ip -> { t, banned, reason }
function getCachedBan(ip) {
  const e = banCache.get(ip);
  if (e && Date.now() - e.t < BAN_CACHE_TTL) return e;
  if (e) banCache.delete(ip);
  return null;
}
function setCachedBan(ip, banned, reason) {
  if (banCache.size >= BAN_CACHE_MAX) {
    let drop = Math.ceil(BAN_CACHE_MAX * 0.1);
    for (const k of banCache.keys()) { banCache.delete(k); if (--drop <= 0) break; }
  }
  banCache.set(ip, { t: Date.now(), banned, reason });
}
function clearBanCache(ip) { if (ip) banCache.delete(ip); else banCache.clear(); }

// Route-level middleware to stamp a Cache-Control policy on a response.
const cacheControl = (value) => (req, res, next) => { res.set('Cache-Control', value); next(); };

// Ban check middleware
async function checkBans(req, res, next) {
  const ip = getClientIP(req);
  const walletAddress = req.body.walletAddress || req.query.walletAddress;
  
  try {
    // Check IP ban (cached — this middleware runs on every /api request)
    let ipEntry = getCachedBan(ip);
    if (!ipEntry) {
      const ipBan = await pool.query(
        'SELECT reason FROM banned_ips WHERE ip_address = $1',
        [ip]
      );
      setCachedBan(ip, ipBan.rows.length > 0, ipBan.rows[0]?.reason || 'Your IP has been banned');
      ipEntry = getCachedBan(ip);
    }
    if (ipEntry?.banned) {
      return res.status(403).json({
        error: 'Access denied',
        reason: ipEntry.reason || 'Your IP has been banned',
        banned: true
      });
    }
    
    // Check wallet ban if provided (account suspension — gated by master switch)
    if (ACCOUNT_SUSPENSION_ENABLED && walletAddress) {
      const walletBan = await pool.query(
        'SELECT reason FROM banned_wallets WHERE wallet_address = $1',
        [walletAddress]
      );
      if (walletBan.rows.length > 0) {
        return res.status(403).json({ 
          error: 'Account suspended',
          reason: walletBan.rows[0].reason || 'This wallet has been banned',
          banned: true
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('[ban-check] Error:', error);
    // Don't block on ban-check errors
    next();
  }
}

// Track IP activity
async function trackActivity(ip, wallet, action, metadata = {}) {
  try {
    await pool.query(
      'INSERT INTO ip_activity (ip_address, wallet_address, action, metadata) VALUES ($1, $2, $3, $4)',
      [ip, wallet, action, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('[track-activity] Error:', error);
  }
}

// --- Catch hot-path protection -------------------------------------------
// The catch flow (/api/catch/validate → /api/player/catch) is the most abused
// surface: a bypassed client can hammer it to churn DB transactions and bloat
// the audit table. A single catch now takes several seconds of gameplay, so
// even an aggressive-but-honest client only touches these a handful of times a
// minute. This dedicated limiter sheds a flood IN MEMORY (zero DB I/O) at a
// tight per-IP ceiling, and an IP that keeps slamming it past every limit
// auto-bans itself so "hitting it over and over" becomes self-defeating.
const CATCH_RATE_MAX = Number(process.env.CATCH_RATE_MAX) || 120;
// Per-WALLET soft cap on catch validations per minute. Keyed by wallet (not IP)
// so honest players who share an IP never throttle each other, and set far above
// any human catch cadence (the client enforces a 5s min interval ≈ 12/min, a
// single catch takes several seconds of gameplay). The authoritative anti-cheat
// is /api/player/catch — validate is only a soft "are you online" gate that a
// real bypassing client ignores, so this ceiling exists purely to shed a
// scripted single-wallet flood without ever blocking legitimate play.
const CATCH_VALIDATE_SOFT_MAX = Number(process.env.CATCH_VALIDATE_SOFT_MAX) || 60;
const CATCH_AUTOBAN = process.env.CATCH_AUTOBAN !== '0';
const CATCH_FLOOD_BAN = Number(process.env.CATCH_FLOOD_BAN) || 150;
const _catchFlood = new Map(); // ip -> { n, since } rolling 60s reject counter

async function noteCatchFlood(ip) {
  if (!ip || ip === 'unknown') return;
  const now = Date.now();
  let e = _catchFlood.get(ip);
  if (!e || now - e.since > 60_000) { e = { n: 0, since: now }; _catchFlood.set(ip, e); }
  e.n++;
  if (e.n === 1 || e.n % 25 === 0) {
    console.warn(`[catch] FLOOD ip=${ip} rejected=${e.n} within 60s`);
  }
  // One-shot auto-ban once an IP blows past a clearly-bot threshold. The honest
  // ceiling is CATCH_RATE_MAX/min, so reaching ~150 *rejections* in a minute
  // means thousands of requests/min — no human or shared household does this.
  if (CATCH_AUTOBAN && e.n === CATCH_FLOOD_BAN) {
    try {
      await pool.query(
        'INSERT INTO banned_ips (ip_address, reason) VALUES ($1, $2) ON CONFLICT (ip_address) DO UPDATE SET reason = $2',
        [ip, 'auto: catch endpoint flood']
      );
      clearBanCache(ip); // force a re-check so the ban is enforced immediately
      console.warn(`[catch] AUTO-BANNED ip=${ip} (${e.n} rejects/min on catch endpoint)`);
    } catch (err) {
      console.error('[catch] auto-ban failed:', err.message);
    }
  }
}

const catchLimiter = rateLimit({
  windowMs: 60_000,
  max: CATCH_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIP(req),
  handler: (req, res) => {
    noteCatchFlood(getClientIP(req));
    res.status(429).json({ error: 'Catching too fast — slow down.', allowed: false });
  },
});

// Baseline per-IP rate limit + ban check on every API route. The limiter is
// registered first so a flood is shed cheaply, before the ban-lookup DB query.
app.use('/api', globalLimiter);
app.use('/api', checkBans);

// Load treasury keypair
let treasuryKeypair = null;
try {
  if (SECRET_STR) {
    let bytes;
    if (SECRET_STR.trim().startsWith('[')) {
      bytes = Uint8Array.from(JSON.parse(SECRET_STR));
    } else {
      bytes = bs58.decode(SECRET_STR.trim());
    }
    if (bytes.length === 64) {
      treasuryKeypair = Keypair.fromSecretKey(bytes);
      console.log('[server] Treasury loaded:', treasuryKeypair.publicKey.toBase58());
    }
  }
} catch (error) {
  console.error('[server] Failed to load treasury keypair:', error.message);
}

// Solana connection
const connection = new Connection(RPC_URL, 'confirmed');

// Resolves a wallet's .skr (Seeker/ANS) name for the Catch of the Day banner.
const skrResolver = makeSkrResolver(connection);

// Helper functions
const tokenProgramCache = new Map(); // mint base58 -> program PublicKey (a mint's program never changes)
async function detectTokenProgram(mint) {
  const key = mint.toBase58();
  const cached = tokenProgramCache.get(key);
  if (cached) return cached;
  // Check the mint account to determine if it's Token-2022 or classic
  const mintInfo = await connection.getAccountInfo(mint);
  if (!mintInfo) {
    throw new Error('Mint account not found');
  }
  // Token-2022 mints are owned by the Token-2022 program
  const program = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  tokenProgramCache.set(key, program);
  return program;
}

async function getAssociatedTokenAddress(mint, owner, tokenProgram) {
  // Derive ATA using the correct token program
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return { address: ata, programId: tokenProgram };
}

function createAssociatedTokenAccountIx(payer, ata, owner, mint, tokenProgram) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

function createTransferIx(source, dest, owner, amount, tokenProgram) {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); // SPL Token: Transfer
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: tokenProgram,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

// Routes

// Health check
app.get('/api/health', cacheControl('no-store'), (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    treasury: treasuryKeypair ? treasuryKeypair.publicKey.toBase58() : 'not configured',
    tideMint: TIDE_MINT_STR,
    rpcUrl: RPC_URL.replace(/api-key=[^&]+/, 'api-key=***'),
  });
});

// Get treasury balance
app.get('/api/treasury/balance', cacheControl('public, max-age=30'), async (req, res) => {
  try {
    if (!treasuryKeypair) {
      return res.status(503).json({ error: 'Treasury not configured' });
    }

    const mintPk = new PublicKey(TIDE_MINT_STR);
    const tokenProgram = await detectTokenProgram(mintPk);
    const { address: ata } = await getAssociatedTokenAddress(mintPk, treasuryKeypair.publicKey, tokenProgram);
    
    const balance = await connection.getTokenAccountBalance(ata);
    
    res.json({
      address: treasuryKeypair.publicKey.toBase58(),
      mint: TIDE_MINT_STR,
      tokenAccount: ata.toBase58(),
      balance: {
        raw: balance.value.amount,
        ui: balance.value.uiAmountString,
        decimals: balance.value.decimals,
      },
    });
  } catch (error) {
    console.error('[treasury/balance] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Withdraw endpoint.
// Hardened: the caller must prove ownership of `recipient` with a wallet
// signature over a time-bound, single-use message, the amount is gated against
// the server-recorded withdrawable balance (total_earned - total_withdrawn),
// and the nonce is consumed atomically to prevent replay / double-spend.
app.post('/api/withdraw', withdrawLimiter, async (req, res) => {
  try {
    if (!treasuryKeypair || !TIDE_MINT_STR) {
      return res.status(503).json({
        error: 'Withdrawals not configured: treasury key or mint missing',
      });
    }

    const { recipient, amount, message, signature } = req.body;

    if (typeof recipient !== 'string' || !recipient) {
      return res.status(400).json({ error: 'recipient (string) required' });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount (positive number) required' });
    }
    if (amount > MAX_UI_AMOUNT) {
      return res.status(400).json({ error: `amount exceeds per-call cap of ${MAX_UI_AMOUNT}` });
    }
    if (typeof message !== 'string' || typeof signature !== 'string') {
      return res.status(401).json({ error: 'Signed authorization required' });
    }

    let recipientPk;
    try {
      recipientPk = new PublicKey(recipient);
    } catch {
      return res.status(400).json({ error: 'Invalid recipient address' });
    }

    // Reject banned wallets — checkBans only inspects req.body.walletAddress,
    // but withdrawals key off `recipient`, so check it explicitly here.
    // Gated by the account-suspension master switch.
    if (ACCOUNT_SUSPENSION_ENABLED) {
      const bannedRow = await pool.query('SELECT reason FROM banned_wallets WHERE wallet_address = $1', [recipient]);
      if (bannedRow.rows.length > 0) {
        return res.status(403).json({ error: 'Account suspended', reason: bannedRow.rows[0].reason || 'This wallet has been banned' });
      }
    }

    // --- Verify the wallet signature over the authorization message ---
    let sigBytes;
    try {
      sigBytes = Buffer.from(signature, 'base64');
    } catch {
      return res.status(401).json({ error: 'Malformed signature' });
    }
    if (sigBytes.length !== 64) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    const verified = nacl.sign.detached.verify(
      new Uint8Array(Buffer.from(message, 'utf8')),
      new Uint8Array(sigBytes),
      recipientPk.toBytes()
    );
    if (!verified) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    // --- The signed message must bind to THIS request (wallet, amount, freshness) ---
    const fields = {};
    for (const line of message.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    if (fields.wallet !== recipient) {
      return res.status(401).json({ error: 'Signed wallet does not match recipient' });
    }
    const signedAmount = parseFloat(String(fields.amount));
    if (!Number.isFinite(signedAmount) || Math.abs(signedAmount - amount) > 1e-6) {
      return res.status(401).json({ error: 'Signed amount does not match request' });
    }
    const issued = Number(fields.issued);
    if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > 120000) {
      return res.status(401).json({ error: 'Authorization expired — please try again' });
    }
    const nonce = String(fields.nonce || '').slice(0, 80);
    if (!nonce) {
      return res.status(401).json({ error: 'Missing authorization nonce' });
    }

    const intAmount = Math.round(amount);

    // --- Idempotency: claim the nonce before touching the chain. UNIQUE
    //     constraint makes a replayed request fail here. ---
    try {
      await pool.query(
        `INSERT INTO withdrawals (wallet_address, amount, nonce, status) VALUES ($1, $2, $3, 'pending')`,
        [recipient, intAmount, nonce]
      );
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: 'This withdrawal was already submitted' });
      }
      throw e;
    }

    // --- Atomically reserve the withdrawable balance (prevents concurrent
    //     double-spend). Only succeeds if earned-minus-withdrawn covers it. ---
    const reserve = await pool.query(
      `UPDATE players
         SET total_withdrawn = total_withdrawn + $2
       WHERE wallet_address = $1
         AND (total_earned - total_withdrawn) >= $2
       RETURNING total_withdrawn, total_earned`,
      [recipient, intAmount]
    );
    if (reserve.rows.length === 0) {
      await pool.query(`UPDATE withdrawals SET status = 'rejected' WHERE nonce = $1`, [nonce]);
      const p = await pool.query('SELECT total_earned, total_withdrawn FROM players WHERE wallet_address = $1', [recipient]);
      const avail = p.rows.length ? Math.max(0, Number(p.rows[0].total_earned) - Number(p.rows[0].total_withdrawn)) : 0;
      return res.status(400).json({ error: `Insufficient earned balance. You can withdraw up to ${avail} $TIDE.`, withdrawable: avail });
    }

    // --- Build, sign and send the on-chain transfer ---
    let txSig;
    try {
      const mintPk = new PublicKey(TIDE_MINT_STR);
      const rawAmount = BigInt(Math.round(amount * 10 ** TIDE_DECIMALS));
      const tokenProgram = await detectTokenProgram(mintPk);
      const source = await getAssociatedTokenAddress(mintPk, treasuryKeypair.publicKey, tokenProgram);
      const dest = await getAssociatedTokenAddress(mintPk, recipientPk, tokenProgram);

      const ixs = [];
      ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 150_000 }));

      let sourceBalance = 0n;
      try {
        const acc = await connection.getTokenAccountBalance(source.address);
        sourceBalance = BigInt(acc.value.amount);
      } catch {
        throw new Error('Treasury has no $TIDE token account');
      }
      if (sourceBalance < rawAmount) {
        throw new Error(`Treasury balance too low (have ${Number(sourceBalance) / 10 ** TIDE_DECIMALS}, need ${amount})`);
      }

      const destInfo = await connection.getAccountInfo(dest.address);
      if (!destInfo) {
        ixs.push(createAssociatedTokenAccountIx(treasuryKeypair.publicKey, dest.address, recipientPk, mintPk, tokenProgram));
      }
      ixs.push(createTransferIx(source.address, dest.address, treasuryKeypair.publicKey, rawAmount, tokenProgram));

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ feePayer: treasuryKeypair.publicKey, blockhash, lastValidBlockHeight });
      tx.add(...ixs);
      tx.sign(treasuryKeypair);

      txSig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed');
    } catch (txErr) {
      // Refund the reserved ledger amount and mark the attempt failed.
      await pool.query(
        `UPDATE players SET total_withdrawn = GREATEST(0, total_withdrawn - $2) WHERE wallet_address = $1`,
        [recipient, intAmount]
      );
      await pool.query(`UPDATE withdrawals SET status = 'failed' WHERE nonce = $1`, [nonce]);
      console.error('[withdraw] Transaction failed:', txErr);
      return res.status(502).json({ error: txErr.message || 'Transaction failed' });
    }

    await pool.query(`UPDATE withdrawals SET status = 'sent', tx_signature = $2 WHERE nonce = $1`, [nonce, txSig]);
    console.log('[withdraw] Success:', txSig, 'recipient:', recipient, 'amount:', amount);

    res.json({
      signature: txSig,
      recipient,
      amount,
      explorerUrl: `https://solscan.io/tx/${txSig}`,
    });
  } catch (error) {
    console.error('[withdraw] Error:', error);
    res.status(502).json({ error: error.message || 'Transaction failed' });
  }
});

// ============================================================================
// PROFILE ENDPOINTS
// ============================================================================

// Update player profile (username, profile picture, bio)
app.patch('/api/player/profile', writeLimiter, requireSession, async (req, res) => {
  try {
    const { walletAddress, username, profilePicture, bio } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress required' });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (username !== undefined) {
      if (typeof username !== 'string') {
        return res.status(400).json({ error: 'username must be a string' });
      }
      const cleanName = username.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 50);
      updates.push(`username = $${paramCount++}`);
      values.push(cleanName);
    }
    if (profilePicture !== undefined) {
      if (profilePicture !== null && typeof profilePicture !== 'string') {
        return res.status(400).json({ error: 'profilePicture must be a string' });
      }
      const cleanPic = profilePicture ? String(profilePicture).trim().slice(0, 512) : null;
      updates.push(`profile_picture = $${paramCount++}`);
      values.push(cleanPic);
    }
    if (bio !== undefined) {
      if (typeof bio !== 'string') {
        return res.status(400).json({ error: 'bio must be a string' });
      }
      const cleanBio = bio.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
      updates.push(`bio = $${paramCount++}`);
      values.push(cleanBio);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(walletAddress);
    
    const result = await pool.query(
      `UPDATE players 
       SET ${updates.join(', ')}, last_login = NOW()
       WHERE wallet_address = $${paramCount}
       RETURNING id, wallet_address, username, profile_picture, bio, level, xp, total_catches, total_earned`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ 
      success: true,
      player: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get player profile (public view)
app.get('/api/player/profile/:wallet', cacheControl('no-store'), async (req, res) => {
  try {
    const { wallet } = req.params;
    
    const result = await pool.query(
      `SELECT 
        wallet_address,
        username,
        profile_picture,
        bio,
        level,
        xp,
        money,
        total_catches,
        total_earned,
        perfect_hooks,
        unlocked_locations,
        login_streak,
        created_at
      FROM players 
      WHERE wallet_address = $1`,
      [wallet]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Get achievements
    const achievementsResult = await pool.query(
      `SELECT achievement_id, unlocked_at 
       FROM achievements 
       WHERE player_id = (SELECT id FROM players WHERE wallet_address = $1)
       ORDER BY unlocked_at ASC`,
      [wallet]
    );

    res.json({
      player: result.rows[0],
      achievements: achievementsResult.rows
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ============================================================================
// EXISTING ENDPOINTS
// ============================================================================

// 1. Auth - Get or create player profile
app.post('/api/player/auth', writeLimiter, async (req, res) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress || walletAddress.length < 32) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    // Find existing player or create new
    let result = await pool.query(
      'SELECT * FROM players WHERE wallet_address = $1',
      [walletAddress]
    );

    if (result.rows.length === 0) {
      // Create new player
      result = await pool.query(
        `INSERT INTO players (wallet_address) 
         VALUES ($1) 
         RETURNING *`,
        [walletAddress]
      );
      console.log('[auth] New player created:', walletAddress);
    } else {
      // Update last login
      await pool.query(
        'UPDATE players SET last_login = NOW() WHERE wallet_address = $1',
        [walletAddress]
      );
      console.log('[auth] Player logged in:', walletAddress);
    }

    res.json({ player: publicPlayer(result.rows[0]) });
  } catch (error) {
    console.error('[auth] Error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// SIWS: verify a wallet signature and issue a session token used to authorize
// the write endpoints. Banned wallets are already rejected by checkBans.
app.post('/api/auth/session', writeLimiter, async (req, res) => {
  const { walletAddress, message, signature } = req.body;

  if (typeof walletAddress !== 'string' || walletAddress.length < 32) {
    return res.status(400).json({ error: 'walletAddress required' });
  }
  if (typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'message and signature required' });
  }

  let pk;
  try { pk = new PublicKey(walletAddress); }
  catch { return res.status(400).json({ error: 'Invalid wallet address' }); }

  let sigBytes;
  try { sigBytes = Buffer.from(signature, 'base64'); }
  catch { return res.status(401).json({ error: 'Malformed signature' }); }
  if (sigBytes.length !== 64) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const verified = nacl.sign.detached.verify(
    new Uint8Array(Buffer.from(message, 'utf8')),
    new Uint8Array(sigBytes),
    pk.toBytes()
  );
  if (!verified) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  // The signed message must bind to THIS wallet and be fresh (replay guard).
  const fields = {};
  for (const line of message.split('\n')) {
    const idx = line.indexOf(':');
    if (idx > -1) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (fields.wallet !== walletAddress) {
    return res.status(401).json({ error: 'Signed message wallet mismatch' });
  }
  const issued = Number(fields.issued);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > SIWS_MAX_AGE_MS) {
    return res.status(401).json({ error: 'Login message expired — try again' });
  }

  const { token, expiresAt } = issueSessionToken(walletAddress);
  res.json({ token, expiresAt });
});

// Coerce to a bounded non-negative integer; rejects NaN/Infinity/negatives.
function intOr(v, def = 0, min = 0, max = 2_000_000_000) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// 2. Save player state.
// NOTE: total_earned and total_catches are server-authoritative (incremented
// only by /api/player/catch after value validation) and are deliberately NOT
// written here — otherwise a tampered client could inflate them and withdraw.
app.post('/api/player/save', writeLimiter, requireSession, async (req, res) => {
  const { walletAddress, state } = req.body;

  if (!walletAddress || !state) {
    return res.status(400).json({ error: 'Missing wallet address or state' });
  }

  try {
    await pool.query(
      `UPDATE players SET 
        level = LEAST(GREATEST(players.level, $2), players.total_catches + 10),
        xp = GREATEST(players.xp, $3),
        money = $4,
        perfect_hooks = GREATEST(players.perfect_hooks, $5),
        snaps = $6,
        unlocked_locations = $7,
        equipped_rod = $8,
        equipped_reel = $9,
        equipped_line = $10,
        equipped_bait = $11,
        owned_gear = $12
       WHERE wallet_address = $1`,
      [
        walletAddress,
        intOr(state.level, 1, 1, 200),
        intOr(state.xp, 0, 0, 5_000_000),
        intOr(state.money, 0),
        intOr(state.perfectHooks, 0),
        intOr(state.snaps, 0),
        Array.isArray(state.unlockedLocations) ? state.unlockedLocations : ['lake'],
        intOr(state.equippedRod, 0, 0, 1000),
        intOr(state.equippedReel, 0, 0, 1000),
        intOr(state.equippedLine, 0, 0, 1000),
        intOr(state.equippedBait, 0, 0, 1000),
        JSON.stringify(state.ownedGear ?? {})
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[save] Error:', error);
    res.status(500).json({ error: 'Save failed' });
  }
});

// 3. Record catch — SERVER-AUTHORITATIVE earnings.
// The client-reported value is clamped to the species ceiling, server-side
// anti-farming caps are enforced, and total_earned/total_catches (the figures
// the withdrawal ledger trusts) are incremented here and ONLY here.
app.post('/api/player/catch', catchLimiter, requireSession, async (req, res) => {
  const { walletAddress, catch: catchData } = req.body;

  if (!walletAddress || !catchData) {
    return res.status(400).json({ error: 'Missing wallet address or catch data' });
  }

  const speciesId = String(catchData.speciesId || '').slice(0, 50);
  const cap = FISH_VALUES.species[speciesId];
  const location = String(catchData.location || '');

  let client;
  try {
    const player = await pool.query(
      'SELECT id, username, total_catches FROM players WHERE wallet_address = $1',
      [walletAddress]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const playerId = player.rows[0].id;
    const playerName = player.rows[0].username || shortWallet(walletAddress);
    const priorCatches = Number(player.rows[0].total_catches) || 0;

    client = await pool.connect();
    await client.query('BEGIN');
    // Serialize catch processing for THIS player. Without it, two concurrent
    // catches both read the same hourly/daily earnings allowance and can each
    // credit against it, slightly over-paying the cap. The xact-scoped advisory
    // lock (auto-released on COMMIT/ROLLBACK) makes the read→credit atomic
    // per-player; different players never contend.
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [playerId]);

    // Fresh, under-lock read of the progression-gate signal. SERVER-AUTHORITATIVE:
    // we read total_catches (incremented only by this endpoint) and never trust a
    // client-asserted level here.
    const gp = await client.query('SELECT total_catches FROM players WHERE id = $1', [playerId]);
    const recordedCatches = Number(gp.rows[0]?.total_catches) || 0;

    // Location speed-bump (anti-progression-skip), SERVER-AUTHORITATIVE. Silently
    // decline to RECORD a catch in a high-tier spot until the player's *server-
    // side* catch history proves they've put in the baseline grind to reach it.
    // lake/river are ungated starters, so honest players always build this up
    // there first — and the TIDE needed to even unlock pier/ocean requires far
    // more catches than these floors, so legit anglers are never blocked. The
    // client already credited the catch locally, so gameplay is unaffected; we
    // simply don't mirror/credit a clearly-unreachable one, keeping the
    // leaderboard and live feed honest. We no longer consult the client-settable
    // level at all. Financial damage is independently bounded by the earnings +
    // rarity caps in evaluateCatch.
    const floor = LOCATION_CATCH_FLOOR[location];
    if (floor != null && recordedCatches < floor) {
      await client.query('ROLLBACK');
      console.warn(`[catch] SKIP location_locked loc=${location} catches=${recordedCatches} need=${floor} wallet=${walletAddress}`);
      return res.json({ success: true, creditedValue: 0, skipped: 'location_locked' });
    }

    // Per-player catch counts over rolling windows, plus per-rarity / jackpot-
    // species tallies for the plausibility backstop. Drives all the caps below.
    const rl = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE caught_at > NOW() - INTERVAL '1 minute') AS m,
         COUNT(*) FILTER (WHERE caught_at > NOW() - INTERVAL '1 hour')   AS h,
         COUNT(*)                                                        AS d,
         COALESCE(SUM(value) FILTER (WHERE caught_at > NOW() - INTERVAL '1 hour'), 0) AS eh,
         COALESCE(SUM(value), 0)                                                       AS ed,
         COUNT(*) FILTER (WHERE rarity IN ('legendary','mythic','ultramythic') AND caught_at > NOW() - INTERVAL '1 hour') AS lh,
         COUNT(*) FILTER (WHERE rarity IN ('legendary','mythic','ultramythic'))                                          AS ld,
         COUNT(*) FILTER (WHERE species_id = $2)                                               AS js
       FROM catches
       WHERE player_id = $1 AND caught_at > NOW() - INTERVAL '1 day'`,
      [playerId, speciesId]
    );
    const counts = rl.rows[0];

    // Authoritative decision: reachability gate, value/size/weight clamps,
    // forced rarity, rate + earnings + rarity caps. Pure logic in catchRules.js.
    const decision = evaluateCatch({
      cap,
      location,
      validLocation: VALID_LOCATIONS.has(location),
      isHotSpot: location === dailyHotSpot(),
      catchData,
      counts,
    });
    if (!decision.ok) {
      await client.query('ROLLBACK');
      if (decision.code === 'BAD_SPECIES_LOCATION' || decision.code === 'RARITY_LIMIT') {
        // Log clear cheat signals so abusers can be identified from server logs.
        console.warn(`[catch] REJECT ${decision.code} species=${speciesId} loc=${location} wallet=${walletAddress} counts=${JSON.stringify(counts)}`);
      }
      return res.status(decision.status).json({ error: decision.error, code: decision.code });
    }
    const { value, sizeCm, weightKg, rarity } = decision;
    const perfect = !!catchData.perfectHook;

    // Insert catch with the server-validated value
    await client.query(
      `INSERT INTO catches (player_id, species_id, location, rarity, size_cm, weight_kg, value, perfect_hook)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [playerId, speciesId, location, rarity, sizeCm, weightKg, value, perfect]
    );

    // Update journal entry
    await client.query(
      `INSERT INTO journal_entries (player_id, species_id, total_caught, biggest_size_cm, biggest_weight_kg)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (player_id, species_id) 
       DO UPDATE SET 
         total_caught = journal_entries.total_caught + 1,
         biggest_size_cm = GREATEST(journal_entries.biggest_size_cm, $3),
         biggest_weight_kg = GREATEST(journal_entries.biggest_weight_kg, $4)`,
      [playerId, speciesId, sizeCm, weightKg]
    );

    // Authoritative ledger update — the only place total_earned grows.
    await client.query(
      `UPDATE players SET total_earned = total_earned + $2, total_catches = total_catches + 1 WHERE id = $1`,
      [playerId, value]
    );

    await client.query('COMMIT');

    // Live social feed (fire-and-forget — never blocks the catch response).
    // First catch → welcome; ultra mythic / mythic / legendary → gold
    // broadcast; epic / perfect-hook rare → ticker line. Bounded set so the
    // chat never floods.
    const rl2 = rarity.toLowerCase();
    const sizeR = Math.round(sizeCm);
    const fishName = prettySpecies(speciesId);
    if (priorCatches === 0) {
      insertSystemChat(`👋 Welcome ${playerName} to the waters — first catch: a ${sizeR}cm ${fishName}!`, 'welcome');
    } else if (rl2 === 'ultramythic') {
      insertSystemChat(`🌌 ULTRA MYTHIC!! ${playerName} hauled in a ${sizeR}cm ${fishName} — a once-in-a-lifetime catch!`, 'rare');
    } else if (rl2 === 'mythic') {
      insertSystemChat(`🌟 MYTHIC! ${playerName} landed a ${sizeR}cm ${fishName}!`, 'rare');
    } else if (rl2 === 'legendary') {
      insertSystemChat(`⭐ LEGENDARY! ${playerName} landed a ${sizeR}cm ${fishName}!`, 'rare');
    } else if (rl2 === 'epic') {
      insertSystemChat(`🐟 ${playerName} landed a ${sizeR}cm ${fishName} (Epic)!`, 'catch');
    } else if (rl2 === 'rare' && perfect) {
      insertSystemChat(`🎣 ${playerName} nailed a perfect ${sizeR}cm ${fishName}!`, 'catch');
    }

    res.json({ success: true, creditedValue: value });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* already aborted */ } }
    console.error('[catch] Error:', error);
    res.status(500).json({ error: 'Failed to record catch' });
  } finally {
    if (client) client.release();
  }
});

// 4. Get leaderboard (top earners, recent catches feed, or per-species bests)
// 30s in-memory TTL cache — the daily board does a GROUP BY aggregate and is
// hit by every client (leaderboard panel + chat medals) several times a minute.
const LB_CACHE_TTL = 30_000;
const lbCache = new Map(); // key -> { t, body }
function lbCacheGet(key) {
  const e = lbCache.get(key);
  if (e && Date.now() - e.t < LB_CACHE_TTL) return e.body;
  if (e) lbCache.delete(key);
  return null;
}
function lbCacheSet(key, body) {
  if (lbCache.size > 200) { const k = lbCache.keys().next().value; lbCache.delete(k); }
  lbCache.set(key, { t: Date.now(), body });
}
app.get('/api/leaderboard', cacheControl('public, max-age=30'), async (req, res) => {
  const { type, species } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
  const cacheKey = `${type || 'daily'}:${species || ''}:${limit}`;

  try {
    const cachedBody = lbCacheGet(cacheKey);
    if (cachedBody) return res.json(cachedBody);
    // Recent catches feed — global, newest first.
    if (type === 'recent') {
      const result = await pool.query(
        `SELECT c.species_id, c.location, c.rarity, c.size_cm, c.weight_kg,
                c.value, c.perfect_hook, c.caught_at,
                p.wallet_address, p.username
         FROM catches c
         JOIN players p ON c.player_id = p.id
         ORDER BY c.caught_at DESC
         LIMIT $1`,
        [limit]
      );
      const body = { catches: result.rows };
      lbCacheSet(cacheKey, body);
      return res.json(body);
    }

    // Biggest catches for a single species.
    if (type === 'species') {
      if (!species) {
        return res.status(400).json({ error: 'species query param is required' });
      }
      const result = await pool.query(
        `SELECT c.species_id, c.location, c.rarity, c.size_cm, c.weight_kg,
                c.value, c.perfect_hook, c.caught_at,
                p.wallet_address, p.username
         FROM catches c
         JOIN players p ON c.player_id = p.id
         WHERE c.species_id = $1
         ORDER BY c.size_cm DESC, c.value DESC
         LIMIT $2`,
        [species, limit]
      );
      const body = { catches: result.rows };
      lbCacheSet(cacheKey, body);
      return res.json(body);
    }

    // Default: DAILY leaderboard — ranks anglers by what they've earned TODAY,
    // aggregated from the day's catches. Using date_trunc('day', NOW()) (the
    // same clock catches are stamped with) means it resets automatically at
    // midnight server time (UTC on our host) with no cron job. Only anglers who
    // caught something today appear.
    const result = await pool.query(
      `SELECT p.wallet_address, p.username, p.level,
              COUNT(c.id)::int AS total_catches,
              COALESCE(SUM(c.value), 0)::int AS total_earned,
              MAX(c.caught_at) AS last_catch
       FROM catches c
       JOIN players p ON c.player_id = p.id
       WHERE c.caught_at >= date_trunc('day', NOW()::timestamp)
       GROUP BY p.id
       ORDER BY total_earned DESC, total_catches DESC, last_catch ASC
       LIMIT $1`,
      [limit]
    );
    const body = { leaderboard: result.rows, period: 'daily' };
    lbCacheSet(cacheKey, body);
    res.json(body);
  } catch (error) {
    console.error('[leaderboard] Error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// 4a-bis. PWA Windows widget data feed — supplies the Adaptive Card bindings
// for the manifest `widgets` entry. CORS is made permissive here because the
// Windows Widgets Board fetches this from outside the app's web origin.
app.get('/api/widget', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.removeHeader('Access-Control-Allow-Credentials');
  res.set('Cache-Control', 'no-store');
  const shorten = (w) => (w && w.length > 10) ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || '—');
  try {
    const top = await pool.query('SELECT wallet_address, username, total_earned FROM leaderboard LIMIT 1');
    const cnt = await pool.query('SELECT COUNT(*)::int AS n FROM players');
    const t = top.rows[0];
    res.json({
      leader: t ? (t.username || shorten(t.wallet_address)) : 'Be the first!',
      earned: t ? Math.round(Number(t.total_earned)).toLocaleString('en-US') : '0',
      players: cnt.rows[0]?.n ?? 0,
      tagline: 'Cast a line, earn $TIDE, climb the leaderboard.',
    });
  } catch (error) {
    console.error('[widget] Error:', error);
    res.json({ leader: 'Tidal anglers', earned: '0', players: 0, tagline: 'Cast a line and earn $TIDE.' });
  }
});

// 4b. Global troll box — fetch recent chat messages.
// ?since=<id> returns only newer messages (for incremental polling);
// otherwise returns the latest `limit` messages (oldest-first for appending).
app.get('/api/chat', cacheControl('no-store'), async (req, res) => {
  const since = parseInt(req.query.since, 10);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  try {
    let result;
    if (Number.isFinite(since) && since > 0) {
      result = await pool.query(
        `SELECT id, wallet_address, username, message, kind, level, created_at
         FROM chat_messages WHERE id > $1 ORDER BY id ASC LIMIT $2`,
        [since, limit]
      );
    } else {
      // Latest N, then flip to chronological order for the client.
      const r = await pool.query(
        `SELECT id, wallet_address, username, message, kind, level, created_at
         FROM chat_messages ORDER BY id DESC LIMIT $1`,
        [limit]
      );
      r.rows.reverse();
      result = r;
    }
    res.json({ messages: result.rows });
  } catch (error) {
    console.error('[chat] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

// 4c. Global troll box — post a chat message.
// Banned wallets are already blocked by checkBans (walletAddress in body).
// Requires a chosen angler name, enforces a length cap + per-wallet cooldown.
app.post('/api/chat', writeLimiter, requireSession, async (req, res) => {
  const { walletAddress } = req.body;
  let { message } = req.body;

  if (!walletAddress || walletAddress.length < 32) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }
  if (typeof message !== 'string') {
    return res.status(400).json({ error: 'Message required' });
  }

  // Sanitize: strip control chars, collapse whitespace runs, trim, cap length.
  message = message.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
  if (!message) {
    return res.status(400).json({ error: 'Message is empty' });
  }

  try {
    // Authoritative identity: take the poster's display name (and level flair)
    // from the DB, NOT the request body, so a tampered client can't post under
    // another angler's name in the global feed.
    let cleanName = '';
    let posterLevel = 0;
    try {
      const lr = await pool.query('SELECT username, level FROM players WHERE wallet_address = $1', [walletAddress]);
      cleanName = (lr.rows[0]?.username || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 50);
      posterLevel = Number(lr.rows[0]?.level) || 0;
    } catch (e) { /* identity lookup failed — treat as no name set */ }

    if (!cleanName) {
      return res.status(400).json({ error: 'Set an angler name before chatting', code: 'NAME_REQUIRED' });
    }

    // Per-wallet cooldown (anti-flood): reject if last post was < 1.5s ago.
    const last = await pool.query(
      `SELECT created_at FROM chat_messages WHERE wallet_address = $1 ORDER BY id DESC LIMIT 1`,
      [walletAddress]
    );
    if (last.rows.length > 0) {
      const elapsed = Date.now() - new Date(last.rows[0].created_at).getTime();
      if (elapsed < 1500) {
        return res.status(429).json({ error: 'Slow down a sec', code: 'RATE_LIMIT' });
      }
    }

    const inserted = await pool.query(
      `INSERT INTO chat_messages (wallet_address, username, message, kind, level)
       VALUES ($1, $2, $3, 'user', $4)
       RETURNING id, wallet_address, username, message, kind, level, created_at`,
      [walletAddress, cleanName, message, posterLevel]
    );

    // Keep the table bounded — drop everything but the newest 500 messages.
    pool.query(
      `DELETE FROM chat_messages
       WHERE id < (SELECT MIN(id) FROM (SELECT id FROM chat_messages ORDER BY id DESC LIMIT 500) t)`
    ).catch(() => {});

    res.json({ success: true, message: inserted.rows[0] });
  } catch (error) {
    console.error('[chat] Post error:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

// ============================================================================
// SHARED-WORLD ENDPOINTS (engagement features)
// ============================================================================

// 4d. Presence heartbeat — a tab pings every ~30s with a per-tab id. Returns the
// live online count + today's hot spot. In-memory, no DB, no session required.
app.post('/api/presence', (req, res) => {
  const { id, walletAddress } = req.body || {};
  touchPresence(id || walletAddress, walletAddress);
  res.json({ online: onlineCount(), hotSpot: dailyHotSpot() });
});

// 4e. World snapshot — online count, daily hot spot, and the catch of the day
// (biggest catch in the last 24h). Read-only, public.
app.get('/api/world', cacheControl('public, max-age=10'), async (req, res) => {
  let catchOfDay = null;
  try {
    const r = await pool.query(
      `SELECT c.species_id, c.size_cm, c.rarity, c.value, p.username, p.wallet_address
       FROM catches c JOIN players p ON c.player_id = p.id
       WHERE c.caught_at > NOW() - INTERVAL '24 hours'
       ORDER BY c.size_cm DESC, c.value DESC
       LIMIT 1`
    );
    if (r.rows[0]) {
      const c = r.rows[0];
      const skrName = skrResolver.getSkrNameCached(c.wallet_address);
      catchOfDay = {
        species: prettySpecies(c.species_id),
        sizeCm: Math.round(Number(c.size_cm)),
        rarity: c.rarity,
        who: skrName || c.username || shortWallet(c.wallet_address),
      };
    }
  } catch (e) {
    console.error('[world] Error:', e.message);
  }
  res.json({ online: onlineCount(), hotSpot: dailyHotSpot(), hotSpotLabel: HOT_SPOT_LABEL[dailyHotSpot()], catchOfDay });
});

// 4e-bis. Anglers panel data for the "fishing now" modal: who is online right now
// (named, deduped by wallet) plus the all-time total number of anglers ever to
// have a saved profile. Read-only, public (covered by the global limiter). The
// all-time count is cached briefly so opening the modal can't hammer the DB.
let anglersTotalCache = { n: 0, at: 0 };
const ANGLERS_TOTAL_TTL_MS = 30_000;
app.get('/api/anglers/online', cacheControl('public, max-age=10'), async (req, res) => {
  const online = onlineCount();
  const wallets = [...onlineWallets()].slice(0, 100);

  // Resolve display names for the online wallets.
  let anglers = [];
  if (wallets.length) {
    let nameByWallet = new Map();
    try {
      const r = await pool.query(
        `SELECT wallet_address, username FROM players WHERE wallet_address = ANY($1)`,
        [wallets]
      );
      nameByWallet = new Map(r.rows.map((row) => [row.wallet_address, row.username]));
    } catch (e) {
      console.error('[anglers] name lookup error:', e.message);
    }
    anglers = wallets.map((w) => {
      const skr = skrResolver.getSkrNameCached(w);
      return { name: skr || nameByWallet.get(w) || shortWallet(w) };
    });
    // Stable, friendly ordering by name.
    anglers.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Anonymous tabs (no connected wallet) shown only as a count.
  const guests = Math.max(0, online - wallets.length);

  // All-time total anglers ever (cached 30s).
  let totalEver = anglersTotalCache.n;
  if (Date.now() - anglersTotalCache.at > ANGLERS_TOTAL_TTL_MS) {
    try {
      const t = await pool.query(`SELECT COUNT(*)::int AS n FROM players`);
      totalEver = t.rows[0]?.n || 0;
      anglersTotalCache = { n: totalEver, at: Date.now() };
    } catch (e) {
      console.error('[anglers] total count error:', e.message);
    }
  }

  res.json({ online, anglers, guests, totalEver });
});
app.post('/api/player/checkin', writeLimiter, requireSession, async (req, res) => {
  const { walletAddress } = req.body || {};
  if (!walletAddress || walletAddress.length < 32) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }
  try {
    const pr = await pool.query(
      'SELECT id, streak_count, last_active_date FROM players WHERE wallet_address = $1',
      [walletAddress]
    );
    if (pr.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const row = pr.rows[0];
    const todayNum = utcDayNumber();
    const lastNum = row.last_active_date ? utcDayNumber(new Date(row.last_active_date).getTime()) : null;
    let streak = Number(row.streak_count) || 0;
    let bonus = 0;

    if (lastNum === todayNum) {
      // Already checked in today — no bonus, streak unchanged.
    } else {
      const newStreak = (lastNum !== null && todayNum - lastNum === 1) ? streak + 1 : 1;
      const newBonus = Math.min(STREAK_BONUS_MAX, STREAK_BONUS_BASE + STREAK_BONUS_STEP * Math.min(newStreak, 7));
      // Atomic + idempotent credit. The WHERE clause gates the reward on
      // last_active_date not already being today, and the date is advanced in
      // the SAME statement — so under concurrent/replayed requests only the
      // first updates a row (the racers re-read the now-current row under
      // READ COMMITTED and match zero rows). Previously this was a SELECT-then-
      // UPDATE with no lock, letting a scripted client race many check-ins and
      // stack total_earned (a withdrawable balance) past the once-per-day cap.
      const upd = await pool.query(
        `UPDATE players
            SET streak_count = $2,
                last_active_date = (now() AT TIME ZONE 'utc')::date,
                streak_reward_date = (now() AT TIME ZONE 'utc')::date,
                total_earned = total_earned + $3
          WHERE id = $1
            AND last_active_date IS DISTINCT FROM (now() AT TIME ZONE 'utc')::date`,
        [row.id, newStreak, newBonus]
      );
      streak = newStreak;
      // Only report (and only actually credited) the bonus if THIS request won
      // the race; a duplicate that updated zero rows gets no bonus.
      if (upd.rowCount === 1) bonus = newBonus;
    }
    res.json({ streak, bonus, hotSpot: dailyHotSpot(), hotSpotLabel: HOT_SPOT_LABEL[dailyHotSpot()], online: onlineCount() });
  } catch (error) {
    console.error('[checkin] Error:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// 4g. Player rank + best catch — backs the /rank and /best chat slash-commands.
app.get('/api/player/rank/:walletAddress', cacheControl('no-store'), async (req, res) => {
  const wallet = req.params.walletAddress;
  try {
    const me = await pool.query(
      'SELECT id, username, total_earned, total_catches, streak_count FROM players WHERE wallet_address = $1',
      [wallet]
    );
    if (me.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const earned = Number(me.rows[0].total_earned) || 0;
    const rankQ = await pool.query(
      'SELECT COUNT(*)::int + 1 AS rank FROM players WHERE total_earned > $1',
      [earned]
    );
    const bestQ = await pool.query(
      'SELECT species_id, size_cm FROM catches WHERE player_id = $1 ORDER BY size_cm DESC LIMIT 1',
      [me.rows[0].id]
    );
    res.json({
      rank: rankQ.rows[0].rank,
      username: me.rows[0].username || null,
      totalEarned: earned,
      totalCatches: Number(me.rows[0].total_catches) || 0,
      streak: Number(me.rows[0].streak_count) || 0,
      best: bestQ.rows[0]
        ? { species: prettySpecies(bestQ.rows[0].species_id), sizeCm: Math.round(Number(bestQ.rows[0].size_cm)) }
        : null,
    });
  } catch (error) {
    console.error('[rank] Error:', error);
    res.status(500).json({ error: 'Failed to fetch rank' });
  }
});

// 5. Get player stats
app.get('/api/player/stats/:walletAddress', cacheControl('no-store'), async (req, res) => {
  try {
    const player = await pool.query(
      `SELECT p.*, 
        COUNT(DISTINCT c.species_id) as unique_species,
        COUNT(c.id) as total_catches_recorded
       FROM players p
       LEFT JOIN catches c ON p.id = c.player_id
       WHERE p.wallet_address = $1
       GROUP BY p.id`,
      [req.params.walletAddress]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ stats: player.rows[0] });
  } catch (error) {
    console.error('[stats] Error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// 6. Get player journal
app.get('/api/player/journal/:walletAddress', cacheControl('no-store'), async (req, res) => {
  try {
    const player = await pool.query(
      'SELECT id FROM players WHERE wallet_address = $1',
      [req.params.walletAddress]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const journal = await pool.query(
      `SELECT * FROM journal_entries 
       WHERE player_id = $1 
       ORDER BY first_caught_at DESC`,
      [player.rows[0].id]
    );

    res.json({ journal: journal.rows });
  } catch (error) {
    console.error('[journal] Error:', error);
    res.status(500).json({ error: 'Failed to fetch journal' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[server] Tidal API listening on port ${PORT}`);
  console.log(`[server] CORS origin: ${CORS_ORIGIN}`);
  console.log(`[server] Treasury: ${treasuryKeypair ? '✅ Loaded' : '❌ Not configured'}`);
  console.log(`[server] $TIDE Mint: ${TIDE_MINT_STR}`);
  console.log(`[server] Database: ${process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
});

// Prune the ip_activity audit table hourly so it can't grow without bound
// (every catch-validate inserts a row). Keep ~2 days for rate-limit windows.
const pruneTimer = setInterval(() => {
  pool.query(`DELETE FROM ip_activity WHERE timestamp < NOW() - INTERVAL '2 days'`).catch(() => {});
  const cutoff = Date.now() - 300_000;
  for (const [ip, e] of _catchFlood) if (e.since < cutoff) _catchFlood.delete(ip);
}, 3_600_000);
pruneTimer.unref?.();

// ============================================================================
// BAN SYSTEM & CATCH VALIDATION
// ============================================================================

// Validate catch (prevents offline fishing)
app.post('/api/catch/validate', catchLimiter, async (req, res) => {
  const { walletAddress, speciesId, value } = req.body;
  const ip = getClientIP(req);
  
  if (!walletAddress || !speciesId) {
    return res.status(400).json({ error: 'Missing required fields', allowed: false });
  }

  // Reject globally-unreachable species up front (defense-in-depth; the
  // authoritative gate is /api/player/catch). A species that appears in no
  // spawn table can never be caught legitimately — only a tampered client
  // would claim one (e.g. the high-value "fantasy" legendaries).
  const spec = FISH_VALUES.species[String(speciesId).slice(0, 50)];
  if (!spec || !spec.spawn || Object.keys(spec.spawn).length === 0) {
    console.warn(`[catch-validate] REJECT unreachable species=${speciesId} wallet=${walletAddress}`);
    return res.json({ allowed: false, error: 'That fish cannot be caught here' });
  }
  
  try {
    // Cross-instance soft cap: how many catches this WALLET has ALREADY been
    // cleared for in the last minute. Keyed by wallet (not IP) so honest players
    // who share an IP — a household, phones behind carrier-grade NAT, a cafe —
    // never throttle each other. We COUNT first and only record an attempt when
    // we actually allow it, so a rejected flood writes nothing to the audit
    // table. The ceiling sits far above any human catch cadence but still sheds
    // a scripted single-wallet flood; the authoritative gate is /api/player/catch.
    const recent = await pool.query(
      `SELECT COUNT(*) AS count FROM ip_activity
       WHERE wallet_address = $1 AND action = 'catch_validate'
       AND timestamp > NOW() - INTERVAL '1 minute'`,
      [walletAddress]
    );
    if (parseInt(recent.rows[0].count, 10) >= CATCH_VALIDATE_SOFT_MAX) {
      return res.json({ allowed: false, error: 'Too many catches. Please slow down.' });
    }

    // Cleared — record the allowed attempt so it counts toward the window.
    await trackActivity(ip, walletAddress, 'catch_validate', { speciesId, value });
    res.json({ allowed: true });
  } catch (error) {
    console.error('[catch-validate] Error:', error);
    // Fail closed - don't allow catch on error
    res.status(500).json({ error: 'Validation failed', allowed: false });
  }
});

// Admin: Ban wallet
app.post('/api/admin/ban/wallet', adminLimiter, async (req, res) => {
  const { walletAddress, reason, adminKey } = req.body;
  
  if (!adminKeyValid(adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address required' });
  }
  
  try {
    await pool.query(
      'INSERT INTO banned_wallets (wallet_address, reason) VALUES ($1, $2) ON CONFLICT (wallet_address) DO UPDATE SET reason = $2',
      [walletAddress, reason || 'Violation of terms']
    );
    console.log(`[admin] Banned wallet: ${walletAddress}`);
    res.json({ success: true, message: `Wallet ${walletAddress} has been banned` });
  } catch (error) {
    console.error('[admin] Ban wallet error:', error);
    res.status(500).json({ error: 'Failed to ban wallet' });
  }
});

// Admin: Ban IP
app.post('/api/admin/ban/ip', adminLimiter, async (req, res) => {
  const { ipAddress, reason, adminKey } = req.body;
  
  if (!adminKeyValid(adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!ipAddress) {
    return res.status(400).json({ error: 'IP address required' });
  }
  
  try {
    await pool.query(
      'INSERT INTO banned_ips (ip_address, reason) VALUES ($1, $2) ON CONFLICT (ip_address) DO UPDATE SET reason = $2',
      [ipAddress, reason || 'Violation of terms']
    );
    clearBanCache(ipAddress);
    console.log(`[admin] Banned IP: ${ipAddress}`);
    res.json({ success: true, message: `IP ${ipAddress} has been banned` });
  } catch (error) {
    console.error('[admin] Ban IP error:', error);
    res.status(500).json({ error: 'Failed to ban IP' });
  }
});

// Admin: Unban wallet
app.post('/api/admin/unban/wallet', adminLimiter, async (req, res) => {
  const { walletAddress, adminKey } = req.body;
  
  if (!adminKeyValid(adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    await pool.query('DELETE FROM banned_wallets WHERE wallet_address = $1', [walletAddress]);
    console.log(`[admin] Unbanned wallet: ${walletAddress}`);
    res.json({ success: true, message: `Wallet ${walletAddress} has been unbanned` });
  } catch (error) {
    console.error('[admin] Unban wallet error:', error);
    res.status(500).json({ error: 'Failed to unban wallet' });
  }
});

// Admin: Unban IP
app.post('/api/admin/unban/ip', adminLimiter, async (req, res) => {
  const { ipAddress, adminKey } = req.body;
  
  if (!adminKeyValid(adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    await pool.query('DELETE FROM banned_ips WHERE ip_address = $1', [ipAddress]);
    clearBanCache(ipAddress);
    console.log(`[admin] Unbanned IP: ${ipAddress}`);
    res.json({ success: true, message: `IP ${ipAddress} has been unbanned` });
  } catch (error) {
    console.error('[admin] Unban IP error:', error);
    res.status(500).json({ error: 'Failed to unban IP' });
  }
});

// Admin: List bans
app.get('/api/admin/bans', adminLimiter, async (req, res) => {
  const { adminKey } = req.query;
  
  if (!adminKeyValid(adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const wallets = await pool.query('SELECT * FROM banned_wallets ORDER BY banned_at DESC LIMIT 100');
    const ips = await pool.query('SELECT * FROM banned_ips ORDER BY banned_at DESC LIMIT 100');
    
    res.json({
      bannedWallets: wallets.rows,
      bannedIPs: ips.rows
    });
  } catch (error) {
    console.error('[admin] List bans error:', error);
    res.status(500).json({ error: 'Failed to list bans' });
  }
});
