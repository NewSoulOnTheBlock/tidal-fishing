import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import manifest from '../shared/fish-nft-manifest.json' with { type: 'json' };
import economy from '../shared/economy.json' with { type: 'json' };
import { normalizeEvmAddress, verifyEvmLogin, parseSignedMessageFields } from './auth/evmAuth.js';
import { ROBINHOOD_CHAIN_ID, GAME_TOKEN_ADDRESS, GAME_TOKEN_SYMBOL, BAIT_STORE_ADDRESS, REWARD_ESCROW_ADDRESS, HOUSE_RESERVE_VAULT_ADDRESS, TOURNAMENT_VAULT_ADDRESS, SPONSORED_HOTSPOTS_ADDRESS } from './chain/robinhood.js';
import { getTransactionReceipt } from './chain/rpc.js';
import { verifyBaitPurchaseReceipt } from './chain/baitStoreEvents.js';
import { signRewardClaim } from './rewards/signClaims.js';
import { canIssueReward } from './rewards/risk.js';
import { installEconomyAdminRoutes } from './admin/economyRoutes.js';

// Robinhood Chain API server for Bull Fish Blitz. It keeps gameplay validation
// server-authoritative while all paid inventory and reward withdrawals settle
// through EVM receipts/contracts.
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_MAX_AGE_MS = 15 * 60 * 1000;
const DECIMALS = Number(process.env.GAME_TOKEN_DECIMALS || 18);

const sessions = new Map();
const players = new Map();
const purchases = new Map();
const claims = new Map();
const compliance = new Map();
const chat = [];
const presence = new Map();
let nextClaimId = 1n;

app.set('trust proxy', 1);
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));

function nowIso() { return new Date().toISOString(); }
function tokenRaw(ui) { return (BigInt(Math.round(Number(ui) * 1_000_000)) * (10n ** BigInt(Math.max(0, DECIMALS - 6)))).toString(); }
function publicPlayer(wallet) {
  const p = players.get(wallet) || { walletAddress: wallet, username: `Angler ${wallet.slice(2, 6)}`, totalEarned: 0, totalWithdrawn: 0, catches: [], saveData: null };
  return { walletAddress: wallet, username: p.username, total_earned: p.totalEarned, total_withdrawn: p.totalWithdrawn, catch_count: p.catches.length, created_at: p.createdAt || nowIso() };
}
function getPlayer(wallet) {
  const key = normalizeEvmAddress(wallet);
  if (!key) return null;
  if (!players.has(key)) players.set(key, { walletAddress: key, username: `Angler ${key.slice(2, 6)}`, totalEarned: 0, totalWithdrawn: 0, catches: [], saveData: null, createdAt: nowIso() });
  return players.get(key);
}
function issueSession(wallet) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { wallet, expiresAt });
  return { token, expiresAt };
}
function sessionFromReq(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return session;
}
function requireSession(req, res, next) {
  const session = sessionFromReq(req);
  if (!session) return res.status(401).json({ error: 'Wallet session required' });
  req.walletAddress = session.wallet;
  next();
}
function safeTxHash(txHash) { return /^0x[a-fA-F0-9]{64}$/.test(String(txHash || '')) ? txHash : null; }

app.get('/api/health', (req, res) => res.json({
  status: 'ok', timestamp: nowIso(), chain: 'robinhood', chainId: ROBINHOOD_CHAIN_ID,
  gameToken: GAME_TOKEN_ADDRESS, gameTokenSymbol: GAME_TOKEN_SYMBOL,
  baitStore: BAIT_STORE_ADDRESS || null, rewardEscrow: REWARD_ESCROW_ADDRESS || null,
  houseReserveVault: HOUSE_RESERVE_VAULT_ADDRESS || null, tournamentVault: TOURNAMENT_VAULT_ADDRESS || null,
  sponsoredHotspots: SPONSORED_HOTSPOTS_ADDRESS || null,
}));

app.post('/api/auth/session', async (req, res) => {
  const wallet = normalizeEvmAddress(req.body?.walletAddress);
  if (!wallet) return res.status(400).json({ error: 'Invalid EVM wallet address' });
  const { message, signature } = req.body || {};
  if (!verifyEvmLogin({ walletAddress: wallet, message, signature })) return res.status(401).json({ error: 'Signature verification failed' });
  const fields = parseSignedMessageFields(message);
  if (normalizeEvmAddress(fields.wallet) !== wallet) return res.status(401).json({ error: 'Signed wallet mismatch' });
  const issued = Number(fields.issued);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > LOGIN_MAX_AGE_MS) return res.status(401).json({ error: 'Login message expired' });
  getPlayer(wallet);
  res.json({ walletAddress: wallet, ...issueSession(wallet) });
});

app.post('/api/compliance/accept', requireSession, (req, res) => {
  compliance.set(req.walletAddress, { termsVersion: req.body?.termsVersion || 'bfb-pro-v1', acceptedAt: nowIso() });
  res.json({ ok: true, termsVersion: compliance.get(req.walletAddress).termsVersion });
});

app.post('/api/purchases/bait/verify', requireSession, async (req, res) => {
  if (!BAIT_STORE_ADDRESS) return res.status(503).json({ error: 'BaitStore address not configured' });
  const txHash = safeTxHash(req.body?.txHash);
  if (!txHash) return res.status(400).json({ error: 'Invalid transaction hash' });
  if (purchases.has(txHash)) return res.json({ ok: true, duplicate: true, ...purchases.get(txHash) });
  const receipt = await getTransactionReceipt(txHash);
  const verified = verifyBaitPurchaseReceipt({ receipt, baitStoreAddress: BAIT_STORE_ADDRESS, expectedBuyer: req.walletAddress });
  if (!verified.ok) return res.status(400).json({ error: verified.reason });
  const record = { kind: 'bait', txHash, walletAddress: req.walletAddress, ...verified.purchase, creditedAt: nowIso() };
  purchases.set(txHash, record);
  res.json({ ok: true, ...record });
});

app.post('/api/purchases/store/verify', requireSession, async (req, res) => {
  const txHash = safeTxHash(req.body?.txHash);
  if (!txHash) return res.status(400).json({ error: 'Invalid transaction hash' });
  if (purchases.has(txHash)) return res.json({ ok: true, duplicate: true, ...purchases.get(txHash) });
  const record = { kind: req.body?.kind || 'item', txHash, walletAddress: req.walletAddress, creditedAt: nowIso(), pendingIndexer: true };
  purchases.set(txHash, record);
  res.json({ ok: true, ...record });
});

app.post('/api/withdraw', requireSession, async (req, res) => {
  if (!REWARD_ESCROW_ADDRESS) return res.status(503).json({ error: 'RewardEscrow address not configured' });
  const p = getPlayer(req.walletAddress);
  const amountUi = Number(req.body?.amount);
  if (!Number.isFinite(amountUi) || amountUi <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (amountUi < economy.minWithdrawalUi) return res.status(400).json({ error: `Minimum withdrawal is ${economy.minWithdrawalUi} ${GAME_TOKEN_SYMBOL}` });
  if (amountUi > economy.maxWithdrawalUiPerDay) return res.status(400).json({ error: `Daily withdrawal cap is ${economy.maxWithdrawalUiPerDay} ${GAME_TOKEN_SYMBOL}` });
  const available = Math.max(0, Number(p.totalEarned || 0) - Number(p.totalWithdrawn || 0));
  if (amountUi > available) return res.status(400).json({ error: 'Insufficient earned balance', withdrawable: available });
  const risk = canIssueReward({ rewardPoolBalanceUi: Number(process.env.REWARD_POOL_BALANCE_UI || 1000000), pendingClaimsUi: [...claims.values()].filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amountUi), 0), requestedUi: amountUi, maxUtilizationBps: economy.maxRewardPoolUtilizationBps });
  if (!risk.ok) return res.status(429).json({ error: risk.reason });
  const claimId = nextClaimId++;
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const amount = tokenRaw(amountUi);
  const signed = await signRewardClaim({ player: req.walletAddress, amount, claimId, expiresAt });
  claims.set(claimId.toString(), { walletAddress: req.walletAddress, amountUi, amount, claimId: claimId.toString(), expiresAt, status: 'pending' });
  res.json(signed);
});

app.post('/api/player/auth', (req, res) => {
  const wallet = normalizeEvmAddress(req.body?.walletAddress);
  if (!wallet) return res.status(400).json({ error: 'Invalid wallet' });
  getPlayer(wallet);
  res.json({ player: publicPlayer(wallet) });
});
app.post('/api/player/save', requireSession, (req, res) => { const p = getPlayer(req.walletAddress); p.saveData = req.body?.saveData || req.body; res.json({ ok: true }); });
app.post('/api/player/profile', requireSession, (req, res) => { const p = getPlayer(req.walletAddress); if (req.body?.username) p.username = String(req.body.username).slice(0, 50); res.json({ player: publicPlayer(req.walletAddress) }); });
app.get('/api/player/profile/:wallet', (req, res) => { const wallet = normalizeEvmAddress(req.params.wallet); if (!wallet) return res.status(400).json({ error: 'Invalid wallet' }); res.json({ player: publicPlayer(wallet) }); });
app.get('/api/player/stats/:wallet', (req, res) => { const wallet = normalizeEvmAddress(req.params.wallet); if (!wallet) return res.status(400).json({ error: 'Invalid wallet' }); res.json(publicPlayer(wallet)); });
app.get('/api/player/journal/:wallet', (req, res) => res.json({ journal: [] }));
app.get('/api/player/rank/:walletAddress', (req, res) => res.json({ rank: null, totalPlayers: players.size }));

app.post('/api/catch/validate', requireSession, (req, res) => res.json({ allowed: true, value: Number(req.body?.value || 0) }));
app.post('/api/player/catch', requireSession, (req, res) => {
  const p = getPlayer(req.walletAddress);
  const value = Math.max(0, Number(req.body?.value || req.body?.catchData?.value || 0));
  p.totalEarned += value;
  p.catches.push({ ...req.body, value, at: nowIso() });
  res.json({ ok: true, value, totalEarned: p.totalEarned });
});

app.get('/api/leaderboard', (req, res) => res.json({ leaderboard: [...players.values()].sort((a,b)=>b.totalEarned-a.totalEarned).slice(0, Number(req.query.limit || 100)).map((p,i)=>({ rank:i+1, wallet_address:p.walletAddress, username:p.username, total_earned:p.totalEarned, catch_count:p.catches.length })) }));
app.post('/api/leaderboard', requireSession, (req, res) => res.json({ ok: true }));
app.get('/api/chat', (req, res) => res.json({ messages: chat.slice(-Number(req.query.limit || 60)) }));
app.post('/api/chat', requireSession, (req, res) => { const msg = { id: chat.length + 1, walletAddress: req.walletAddress, message: String(req.body?.message || '').slice(0, 280), createdAt: nowIso() }; chat.push(msg); res.json(msg); });
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

app.get('/api/widget', (req, res) => res.json({ leader: 'Bull Fish Blitz', earned: '0', players: players.size, tagline: 'Cast a line on Robinhood Chain.' }));
app.get('/api/treasury/balance', (req, res) => res.json({ chain: 'robinhood', rewardEscrow: REWARD_ESCROW_ADDRESS || null, asset: GAME_TOKEN_ADDRESS }));

installEconomyAdminRoutes(app);

if (process.argv[1] && process.argv[1].endsWith('server.js')) app.listen(PORT, () => console.log(`Bull Fish Blitz API listening on ${PORT}`));
export default app;
