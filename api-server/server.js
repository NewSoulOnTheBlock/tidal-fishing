import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import manifest from '../shared/fish-nft-manifest.json' with { type: 'json' };
import economy from '../shared/economy.json' with { type: 'json' };
import { normalizeEvmAddress, verifyEvmLogin, parseSignedMessageFields } from './auth/evmAuth.js';
import { ROBINHOOD_CHAIN_ID, GAME_TOKEN_ADDRESS, GAME_TOKEN_SYMBOL, BAIT_STORE_ADDRESS, REWARD_ESCROW_ADDRESS, HOUSE_RESERVE_VAULT_ADDRESS, TOURNAMENT_VAULT_ADDRESS, SPONSORED_HOTSPOTS_ADDRESS } from './chain/robinhood.js';
import { getTransactionReceipt } from './chain/rpc.js';
import { verifyBaitPurchaseReceipt } from './chain/baitStoreEvents.js';
import { signRewardClaim } from './rewards/signClaims.js';
import { canIssueReward } from './rewards/risk.js';
import { installEconomyAdminRoutes } from './admin/economyRoutes.js';

dotenv.config();
const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_MAX_AGE_MS = 15 * 60 * 1000;
const DECIMALS = Number(process.env.GAME_TOKEN_DECIMALS || 18);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } }) : null;

const sessions = new Map();
const players = new Map();
const purchases = new Map();
const claims = new Map();
const compliance = new Map();
const chat = [];
const presence = new Map();
let nextClaimId = 1n;
const BAIT_PACK_BY_ID = { bait_basic: '1', bait_fine: '2', bait_prime: '3', bait_exotic: '4', bait_mythic: '5', bait_celestial: '6' };

app.set('trust proxy', 1);
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));

function nowIso() { return new Date().toISOString(); }
function tokenRaw(ui) { return (BigInt(Math.round(Number(ui) * 1_000_000)) * (10n ** BigInt(Math.max(0, DECIMALS - 6)))).toString(); }
function safeTxHash(txHash) { return /^0x[a-fA-F0-9]{64}$/.test(String(txHash || '')) ? txHash : null; }
function packForBaitId(baitId) { return BAIT_PACK_BY_ID[baitId] || String(baitId || '').replace(/[^0-9]/g, '') || null; }

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(42) UNIQUE NOT NULL,
      username VARCHAR(64),
      total_earned NUMERIC(38,6) DEFAULT 0,
      total_withdrawn NUMERIC(38,6) DEFAULT 0,
      save_data JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS api_sessions (
      token_hash VARCHAR(80) PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS onchain_purchases (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL,
      tx_hash VARCHAR(66) UNIQUE NOT NULL,
      kind VARCHAR(32) NOT NULL,
      item_id VARCHAR(64),
      quantity INT NOT NULL DEFAULT 1,
      gross_amount NUMERIC(78,0),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cast_credits (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL,
      bait_pack_id VARCHAR(32) NOT NULL,
      source_tx_hash VARCHAR(66),
      remaining INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reward_claims (
      claim_id NUMERIC(78,0) PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL,
      amount_ui NUMERIC(38,6) NOT NULL,
      amount_raw NUMERIC(78,0) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      expires_at BIGINT NOT NULL,
      tx_hash VARCHAR(66),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS compliance_acceptances (
      wallet_address VARCHAR(42) PRIMARY KEY,
      terms_version VARCHAR(80) NOT NULL,
      accepted_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS catches (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL,
      species_id VARCHAR(100),
      location VARCHAR(80),
      rarity VARCHAR(40),
      size_cm NUMERIC(16,4),
      weight_kg NUMERIC(16,4),
      value_ui NUMERIC(38,6) DEFAULT 0,
      bait_id VARCHAR(80),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL,
      message VARCHAR(280) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
initDb().then(() => pool && console.log('[db] Robinhood P2E tables ready')).catch((e) => console.error('[db] init failed', e));

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
async function issueSession(wallet) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { wallet, expiresAt });
  if (pool) await pool.query('INSERT INTO api_sessions(token_hash,wallet_address,expires_at) VALUES($1,$2,to_timestamp($3/1000.0)) ON CONFLICT(token_hash) DO NOTHING', [tokenHash(token), wallet, expiresAt]);
  return { token, expiresAt };
}
async function sessionFromReq(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);
  if (session && session.expiresAt > Date.now()) return session;
  if (pool && token) {
    const { rows } = await pool.query('SELECT wallet_address, EXTRACT(EPOCH FROM expires_at)*1000 AS exp FROM api_sessions WHERE token_hash=$1 AND expires_at>NOW()', [tokenHash(token)]);
    if (rows[0]) return { wallet: rows[0].wallet_address, expiresAt: Number(rows[0].exp) };
  }
  return null;
}
async function requireSession(req, res, next) { const s = await sessionFromReq(req); if (!s) return res.status(401).json({ error: 'Wallet session required' }); req.walletAddress = s.wallet; next(); }

async function getPlayer(wallet) {
  const key = normalizeEvmAddress(wallet); if (!key) return null;
  if (pool) {
    const { rows } = await pool.query(`INSERT INTO players(wallet_address, username) VALUES($1,$2) ON CONFLICT(wallet_address) DO UPDATE SET updated_at=NOW() RETURNING *`, [key, `Angler ${key.slice(2, 6)}`]);
    return rows[0];
  }
  if (!players.has(key)) players.set(key, { wallet_address: key, username: `Angler ${key.slice(2, 6)}`, total_earned: 0, total_withdrawn: 0, catches: [], save_data: null, created_at: nowIso() });
  return players.get(key);
}
function publicPlayer(p) { return { walletAddress: p.wallet_address, username: p.username, total_earned: Number(p.total_earned || 0), total_withdrawn: Number(p.total_withdrawn || 0), catch_count: Number(p.catch_count || p.catches?.length || 0), created_at: p.created_at || nowIso() }; }
async function playerSummary(wallet) { const p = await getPlayer(wallet); if (!pool) return publicPlayer(p); const { rows } = await pool.query('SELECT p.*, (SELECT COUNT(*) FROM catches c WHERE c.wallet_address=p.wallet_address) catch_count FROM players p WHERE p.wallet_address=$1', [p.wallet_address]); return publicPlayer(rows[0]); }
async function hasCastCredit(wallet, baitId) { const pack = packForBaitId(baitId); if (!pack) return false; if (pool) { const { rows } = await pool.query('SELECT id FROM cast_credits WHERE wallet_address=$1 AND bait_pack_id=$2 AND remaining>0 ORDER BY id LIMIT 1', [wallet, pack]); return !!rows[0]; } return true; }
async function consumeCastCredit(wallet, baitId) { const pack = packForBaitId(baitId); if (!pack) return false; if (pool) { const { rows } = await pool.query('UPDATE cast_credits SET remaining=remaining-1 WHERE id=(SELECT id FROM cast_credits WHERE wallet_address=$1 AND bait_pack_id=$2 AND remaining>0 ORDER BY id LIMIT 1) RETURNING id', [wallet, pack]); return !!rows[0]; } return true; }

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: nowIso(), chain: 'robinhood', chainId: ROBINHOOD_CHAIN_ID, gameToken: GAME_TOKEN_ADDRESS, gameTokenSymbol: GAME_TOKEN_SYMBOL, baitStore: BAIT_STORE_ADDRESS || null, rewardEscrow: REWARD_ESCROW_ADDRESS || null, houseReserveVault: HOUSE_RESERVE_VAULT_ADDRESS || null, tournamentVault: TOURNAMENT_VAULT_ADDRESS || null, sponsoredHotspots: SPONSORED_HOTSPOTS_ADDRESS || null, persistence: pool ? 'postgres' : 'memory' }));

app.post('/api/auth/session', async (req, res) => { const wallet = normalizeEvmAddress(req.body?.walletAddress); if (!wallet) return res.status(400).json({ error: 'Invalid EVM wallet address' }); const { message, signature } = req.body || {}; if (!verifyEvmLogin({ walletAddress: wallet, message, signature })) return res.status(401).json({ error: 'Signature verification failed' }); const fields = parseSignedMessageFields(message); if (normalizeEvmAddress(fields.wallet) !== wallet) return res.status(401).json({ error: 'Signed wallet mismatch' }); const issued = Number(fields.issued); if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > LOGIN_MAX_AGE_MS) return res.status(401).json({ error: 'Login message expired' }); await getPlayer(wallet); res.json({ walletAddress: wallet, ...(await issueSession(wallet)) }); });
app.post('/api/compliance/accept', requireSession, async (req, res) => { const terms = req.body?.termsVersion || 'bfb-pro-v1'; compliance.set(req.walletAddress, { termsVersion: terms, acceptedAt: nowIso() }); if (pool) await pool.query('INSERT INTO compliance_acceptances(wallet_address,terms_version) VALUES($1,$2) ON CONFLICT(wallet_address) DO UPDATE SET terms_version=$2, accepted_at=NOW()', [req.walletAddress, terms]); res.json({ ok: true, termsVersion: terms }); });

app.post('/api/purchases/bait/verify', requireSession, async (req, res) => { if (!BAIT_STORE_ADDRESS) return res.status(503).json({ error: 'BaitStore address not configured' }); const txHash = safeTxHash(req.body?.txHash); if (!txHash) return res.status(400).json({ error: 'Invalid transaction hash' }); if (pool) { const dup = await pool.query('SELECT * FROM onchain_purchases WHERE tx_hash=$1', [txHash]); if (dup.rows[0]) return res.json({ ok: true, duplicate: true, quantity: dup.rows[0].quantity, packId: dup.rows[0].item_id, txHash }); } else if (purchases.has(txHash)) return res.json({ ok: true, duplicate: true, ...purchases.get(txHash) }); const receipt = await getTransactionReceipt(txHash); const verified = verifyBaitPurchaseReceipt({ receipt, baitStoreAddress: BAIT_STORE_ADDRESS, expectedBuyer: req.walletAddress }); if (!verified.ok) return res.status(400).json({ error: verified.reason }); const record = { kind: 'bait', txHash, walletAddress: req.walletAddress, packId: verified.purchase.packId, quantity: verified.purchase.quantity, grossAmount: verified.purchase.grossAmount, creditedAt: nowIso() }; if (pool) { await pool.query('INSERT INTO onchain_purchases(wallet_address,tx_hash,kind,item_id,quantity,gross_amount) VALUES($1,$2,$3,$4,$5,$6)', [req.walletAddress, txHash, 'bait', record.packId, record.quantity, record.grossAmount]); await pool.query('INSERT INTO cast_credits(wallet_address,bait_pack_id,source_tx_hash,remaining) VALUES($1,$2,$3,$4)', [req.walletAddress, record.packId, txHash, record.quantity]); } else purchases.set(txHash, record); res.json({ ok: true, ...record }); });
app.post('/api/purchases/store/verify', requireSession, async (req, res) => { const txHash = safeTxHash(req.body?.txHash); if (!txHash) return res.status(400).json({ error: 'Invalid transaction hash' }); const record = { kind: req.body?.kind || 'item', txHash, walletAddress: req.walletAddress, creditedAt: nowIso(), pendingIndexer: true }; if (pool) await pool.query('INSERT INTO onchain_purchases(wallet_address,tx_hash,kind,item_id,quantity,gross_amount) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tx_hash) DO NOTHING', [req.walletAddress, txHash, record.kind, req.body?.itemId || null, Number(req.body?.quantity || 1), 0]); else purchases.set(txHash, record); res.json({ ok: true, ...record }); });

app.post('/api/withdraw', requireSession, async (req, res) => { if (!REWARD_ESCROW_ADDRESS) return res.status(503).json({ error: 'RewardEscrow address not configured' }); const p = await getPlayer(req.walletAddress); const amountUi = Number(req.body?.amount); if (!Number.isFinite(amountUi) || amountUi <= 0) return res.status(400).json({ error: 'Invalid amount' }); if (amountUi < economy.minWithdrawalUi) return res.status(400).json({ error: `Minimum withdrawal is ${economy.minWithdrawalUi} ${GAME_TOKEN_SYMBOL}` }); if (amountUi > economy.maxWithdrawalUiPerDay) return res.status(400).json({ error: `Daily withdrawal cap is ${economy.maxWithdrawalUiPerDay} ${GAME_TOKEN_SYMBOL}` }); const available = Math.max(0, Number(p.total_earned || 0) - Number(p.total_withdrawn || 0)); if (amountUi > available) return res.status(400).json({ error: 'Insufficient earned balance', withdrawable: available }); let pendingClaimsUi = 0; if (pool) { const { rows } = await pool.query("SELECT COALESCE(SUM(amount_ui),0) pending FROM reward_claims WHERE status='pending'"); pendingClaimsUi = Number(rows[0].pending || 0); } else pendingClaimsUi = [...claims.values()].filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amountUi), 0); const risk = canIssueReward({ rewardPoolBalanceUi: Number(process.env.REWARD_POOL_BALANCE_UI || 1000000), pendingClaimsUi, requestedUi: amountUi, maxUtilizationBps: economy.maxRewardPoolUtilizationBps }); if (!risk.ok) return res.status(429).json({ error: risk.reason }); const claimId = pool ? BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)) : nextClaimId++; const expiresAt = Math.floor(Date.now() / 1000) + 3600; const amount = tokenRaw(amountUi); const signed = await signRewardClaim({ player: req.walletAddress, amount, claimId, expiresAt }); if (pool) await pool.query('INSERT INTO reward_claims(claim_id,wallet_address,amount_ui,amount_raw,expires_at) VALUES($1,$2,$3,$4,$5)', [claimId.toString(), req.walletAddress, amountUi, amount, expiresAt]); else claims.set(claimId.toString(), { walletAddress: req.walletAddress, amountUi, amount, claimId: claimId.toString(), expiresAt, status: 'pending' }); res.json(signed); });
app.post('/api/claims/mark-submitted', requireSession, async (req, res) => { const txHash = safeTxHash(req.body?.txHash); const claimId = String(req.body?.claimId || ''); if (!txHash || !claimId) return res.status(400).json({ error: 'claimId and txHash required' }); if (pool) await pool.query("UPDATE reward_claims SET status='submitted', tx_hash=$1 WHERE claim_id=$2 AND wallet_address=$3", [txHash, claimId, req.walletAddress]); res.json({ ok: true }); });

app.post('/api/player/auth', async (req, res) => { const wallet = normalizeEvmAddress(req.body?.walletAddress); if (!wallet) return res.status(400).json({ error: 'Invalid wallet' }); res.json({ player: await playerSummary(wallet) }); });
app.post('/api/player/save', requireSession, async (req, res) => { if (pool) await pool.query('UPDATE players SET save_data=$2, updated_at=NOW() WHERE wallet_address=$1', [req.walletAddress, req.body?.saveData || req.body]); else (await getPlayer(req.walletAddress)).save_data = req.body?.saveData || req.body; res.json({ ok: true }); });
app.post('/api/player/profile', requireSession, async (req, res) => { if (pool && req.body?.username) await pool.query('UPDATE players SET username=$2, updated_at=NOW() WHERE wallet_address=$1', [req.walletAddress, String(req.body.username).slice(0,64)]); else if (req.body?.username) (await getPlayer(req.walletAddress)).username = String(req.body.username).slice(0,64); res.json({ player: await playerSummary(req.walletAddress) }); });
app.patch('/api/player/profile', requireSession, async (req, res) => { if (pool && req.body?.username) await pool.query('UPDATE players SET username=$2, updated_at=NOW() WHERE wallet_address=$1', [req.walletAddress, String(req.body.username).slice(0,64)]); res.json({ player: await playerSummary(req.walletAddress) }); });
app.get('/api/player/profile/:wallet', async (req, res) => { const wallet = normalizeEvmAddress(req.params.wallet); if (!wallet) return res.status(400).json({ error: 'Invalid wallet' }); res.json({ player: await playerSummary(wallet) }); });
app.get('/api/player/stats/:wallet', async (req, res) => { const wallet = normalizeEvmAddress(req.params.wallet); if (!wallet) return res.status(400).json({ error: 'Invalid wallet' }); res.json(await playerSummary(wallet)); });
app.get('/api/player/journal/:wallet', (req, res) => res.json({ journal: [] }));
app.get('/api/player/rank/:walletAddress', async (req, res) => res.json({ rank: null, totalPlayers: pool ? Number((await pool.query('SELECT COUNT(*) c FROM players')).rows[0].c) : players.size }));
app.post('/api/catch/validate', requireSession, async (req, res) => { const baitId = req.body?.baitId; if (baitId && !(await hasCastCredit(req.walletAddress, baitId))) return res.status(402).json({ allowed: false, error: 'No verified bait credits for this tier' }); res.json({ allowed: true, value: Number(req.body?.value || 0) }); });
app.post('/api/player/catch', requireSession, async (req, res) => { const c = req.body?.catch || req.body?.catchData || req.body || {}; if (c.baitId && !(await consumeCastCredit(req.walletAddress, c.baitId))) return res.status(402).json({ error: 'No verified bait credit available' }); const value = Math.max(0, Number(c.value || 0)); if (pool) { await pool.query('INSERT INTO catches(wallet_address,species_id,location,rarity,size_cm,weight_kg,value_ui,bait_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [req.walletAddress, c.speciesId, c.location, c.rarity, c.sizeCm, c.weightKg, value, c.baitId || null]); await pool.query('UPDATE players SET total_earned=total_earned+$2, updated_at=NOW() WHERE wallet_address=$1', [req.walletAddress, value]); } else { const p = await getPlayer(req.walletAddress); p.total_earned += value; p.catches.push({ ...c, value, at: nowIso() }); } res.json({ ok: true, value }); });

app.get('/api/leaderboard', async (req, res) => { if (pool) { const { rows } = await pool.query('SELECT p.wallet_address, p.username, p.total_earned, COUNT(c.id) catch_count FROM players p LEFT JOIN catches c ON c.wallet_address=p.wallet_address GROUP BY p.wallet_address,p.username,p.total_earned ORDER BY p.total_earned DESC LIMIT $1', [Number(req.query.limit || 100)]); return res.json({ leaderboard: rows.map((p,i)=>({ rank:i+1, wallet_address:p.wallet_address, username:p.username, total_earned:Number(p.total_earned), catch_count:Number(p.catch_count) })) }); } res.json({ leaderboard: [...players.values()].sort((a,b)=>Number(b.total_earned)-Number(a.total_earned)).slice(0, Number(req.query.limit || 100)).map((p,i)=>({ rank:i+1, wallet_address:p.wallet_address, username:p.username, total_earned:p.total_earned, catch_count:p.catches.length })) }); });
app.post('/api/leaderboard', requireSession, (req, res) => res.json({ ok: true }));
app.get('/api/chat', async (req, res) => { if (pool) { const { rows } = await pool.query('SELECT id,wallet_address,message,created_at FROM chat_messages ORDER BY id DESC LIMIT $1', [Number(req.query.limit || 60)]); return res.json({ messages: rows.reverse() }); } res.json({ messages: chat.slice(-Number(req.query.limit || 60)) }); });
app.post('/api/chat', requireSession, async (req, res) => { const message = String(req.body?.message || '').slice(0, 280); if (pool) { const { rows } = await pool.query('INSERT INTO chat_messages(wallet_address,message) VALUES($1,$2) RETURNING *', [req.walletAddress, message]); return res.json(rows[0]); } const msg = { id: chat.length + 1, walletAddress: req.walletAddress, message, createdAt: nowIso() }; chat.push(msg); res.json(msg); });
app.post('/api/presence', (req, res) => { if (req.body?.walletAddress) presence.set(req.body.walletAddress, Date.now()); res.json({ ok: true, online: presence.size }); });
app.get('/api/world', (req, res) => res.json({ online: presence.size, hotSpot: null, sponsoredHotspots: [] }));
app.get('/api/anglers/online', (req, res) => res.json({ online: presence.size, anglers: [] }));
app.post('/api/player/checkin', requireSession, (req, res) => res.json({ ok: true, bonus: 0 }));
app.get('/api/nft/manifest', (req, res) => res.json(manifest));
app.get('/api/nft/opportunity/:wallet', (req, res) => res.json({ opportunity: null }));
app.post('/api/nft/mint-claim', requireSession, (req, res) => res.status(503).json({ error: 'Fish NFT claims require configured mint signer' }));
app.get('/api/raffle/current', (req, res) => res.json({ raffle: null }));
app.get('/api/raffle/user', requireSession, (req, res) => res.json({ entries: [] }));
app.get('/api/raffle/history', (req, res) => res.json({ raffles: [] }));
app.post('/api/raffle/exchange-fish', requireSession, (req, res) => res.json({ ok: true, tickets: 0 }));
app.post('/api/raffle/buy-pack', requireSession, (req, res) => res.json({ ok: false, error: 'No active raffle pack' }));
app.get('/api/widget', async (req, res) => res.json({ leader: 'Bull Fish Blitz', earned: '0', players: pool ? Number((await pool.query('SELECT COUNT(*) c FROM players')).rows[0].c) : players.size, tagline: 'Cast a line on Robinhood Chain.' }));
app.get('/api/treasury/balance', (req, res) => res.json({ chain: 'robinhood', rewardEscrow: REWARD_ESCROW_ADDRESS || null, asset: GAME_TOKEN_ADDRESS }));
installEconomyAdminRoutes(app, { pool });
if (process.argv[1] && process.argv[1].endsWith('server.js')) app.listen(PORT, () => console.log(`Bull Fish Blitz API listening on ${PORT}`));
export default app;
