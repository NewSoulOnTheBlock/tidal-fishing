#!/usr/bin/env node
import { JsonRpcProvider, Contract } from 'ethers';
import { spawn } from 'node:child_process';
import deployment from './contracts/deployments/robinhood-mainnet.json' with { type: 'json' };

const baseUrl = process.argv[2] || 'http://127.0.0.1:3099';
const provider = new JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com', 4663, { staticNetwork: true });
const asset = deployment.asset;
const contracts = deployment.contracts;
const checks = [];
function ok(name, value, extra = {}) { checks.push({ name, ok: Boolean(value), ...extra }); if (!value) throw new Error(`${name} failed`); }
async function waitFor(url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try { const r = await fetch(url); if (r.ok) return r; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
async function checkChain() {
  const network = await provider.getNetwork();
  ok('robinhood-chain-id', Number(network.chainId) === 4663, { chainId: Number(network.chainId) });
  for (const [name, meta] of Object.entries(contracts)) {
    const code = await provider.getCode(meta.address);
    ok(`${name}-code`, code && code !== '0x', { address: meta.address, bytecodeLength: code.length });
  }
  const baitStore = new Contract(contracts.baitStore.address, ['function asset() view returns(address)','function packs(uint256) view returns(uint256,bool)'], provider);
  ok('baitstore-asset', (await baitStore.asset()).toLowerCase() === asset.toLowerCase(), { asset });
  for (let i = 1; i <= 6; i++) {
    const [price, active] = await baitStore.packs(i);
    ok(`bait-pack-${i}-active`, active && price > 0n, { price: price.toString() });
  }
}
async function checkApi() {
  const r = await fetch(`${baseUrl}/api/health`);
  const body = await r.json();
  ok('api-health', r.ok && body.chain === 'robinhood' && body.chainId === 4663, body);
  ok('api-baitstore-config', body.baitStore?.toLowerCase() === contracts.baitStore.address.toLowerCase(), { baitStore: body.baitStore });
  ok('api-rewardescrow-config', body.rewardEscrow?.toLowerCase() === contracts.rewardEscrow.address.toLowerCase(), { rewardEscrow: body.rewardEscrow });
}
let child = null;
try {
  await checkChain();
  if (baseUrl.includes('127.0.0.1:3099')) {
    child = spawn(process.execPath, ['api-server/server.js'], { env: { ...process.env, PORT: '3099' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await waitFor(`${baseUrl}/api/health`);
  }
  await checkApi();
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} finally {
  if (child) child.kill('SIGTERM');
}
