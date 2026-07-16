import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'src/web3/chain.js',
  'src/web3/purchases.js',
  'src/web3/rewardEscrow.js',
  'src/web3/deployment.js',
  'src/ui/complianceGate.js',
  'src/ui/lpsUI.js',
  'src/ui/tournamentUI.js',
  'src/ui/adminEconomyUI.js',
  'api-server/chain/robinhood.js',
  'api-server/chain/rpc.js',
  'api-server/chain/baitStoreEvents.js',
  'api-server/chain/storeEvents.js',
  'api-server/rewards/signClaims.js',
  'api-server/rewards/risk.js',
  'api-server/admin/economyRoutes.js',
  'contracts/package.json',
  'contracts/hardhat.config.js',
  'contracts/contracts/BaitStore.sol',
  'contracts/contracts/RewardEscrow.sol',
  'contracts/contracts/TournamentVault.sol',
  'contracts/contracts/SponsoredHotspots.sol',
  'contracts/contracts/HouseReserveVault.sol',
  'contracts/scripts/deploy.js',
  'contracts/deployments/.gitkeep',
];

test('Robinhood P2E plan files exist', () => {
  for (const file of requiredFiles) assert.equal(existsSync(file), true, `${file} should exist`);
});

test('frontend imports use chain.js instead of the legacy solana.js path', () => {
  const files = [
    'src/web3/wallet.js',
    'src/web3/token.js',
    'src/web3/payment.js',
    'src/web3/solPayment.js',
    'src/web3/marketcap.js',
    'src/ui/walletPanel.js',
    'src/ui/marketCapUI.js',
    'src/ui/chatUI.js',
    'src/ui/leaderboardUI.js',
    'src/ui/map.js',
    'src/main.js',
  ].filter(existsSync);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\.\/solana\.js|\.\.\/web3\/solana\.js|web3\/solana/, `${file} still imports solana.js`);
  }
});

test('API production server no longer imports Solana payout primitives', () => {
  const source = readFileSync('api-server/server.js', 'utf8');
  assert.doesNotMatch(source, /@solana|tweetnacl|PublicKey|Keypair|clusterApiUrl|LAMPORTS|lamports|Jupiter|Solscan|SIWS|SBF|TIDE_MINT_STR/);
});

test('withdraw client uses RewardEscrow claims instead of direct treasury payouts', () => {
  const source = readFileSync('src/web3/withdraw.js', 'utf8');
  assert.match(source, /claimRewardOnChain/);
  assert.doesNotMatch(source, /withdraw-sol|SOL fish sale|SBF/);
});
