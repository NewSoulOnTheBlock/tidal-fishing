import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import solc from 'solc';

function compileContracts() {
  const files = [
    'contracts/Common.sol',
    'contracts/BaitStore.sol',
    'contracts/RewardEscrow.sol',
    'contracts/TournamentVault.sol',
    'contracts/SponsoredHotspots.sol',
    'contracts/HouseReserveVault.sol',
  ];
  const sources = Object.fromEntries(files.map((file) => [file, { content: readFileSync(file, 'utf8') }]));
  const input = { language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  assert.deepEqual(errors, []);
  return out.contracts;
}

test('contracts workspace files exist', () => {
  for (const file of ['package.json', 'hardhat.config.js', 'scripts/deploy.js']) {
    assert.equal(existsSync(file), true, `${file} missing`);
  }
});

test('Robinhood P2E contracts compile and expose required events/functions', () => {
  const contracts = compileContracts();
  const bait = contracts['contracts/BaitStore.sol'].BaitStore;
  const reward = contracts['contracts/RewardEscrow.sol'].RewardEscrow;
  assert.ok(bait.evm.bytecode.object.length > 2000);
  assert.ok(reward.evm.bytecode.object.length > 2000);
  const baitNames = bait.abi.map((x) => x.name).filter(Boolean);
  const rewardNames = reward.abi.map((x) => x.name).filter(Boolean);
  for (const name of ['buyBaitPack', 'buyItem', 'setPack', 'BaitPackPurchased', 'ItemPurchased']) assert.ok(baitNames.includes(name), `BaitStore missing ${name}`);
  for (const name of ['claim', 'setRewardSigner', 'pause', 'unpause', 'RewardClaimed']) assert.ok(rewardNames.includes(name), `RewardEscrow missing ${name}`);
});
