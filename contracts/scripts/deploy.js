import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
const network = process.argv[2] || 'robinhoodMainnet';
const chainId = network === 'robinhoodTestnet' ? 46630 : 4663;
const deployment = { chainId, network, deployedAt: new Date().toISOString(), asset: process.env.TIDAL_TOKEN_ADDRESS || '0xcf987e5ec08229eb9cf260f66d3382c827e37777', baitStore: process.env.BAIT_STORE_ADDRESS || '', rewardEscrow: process.env.REWARD_ESCROW_ADDRESS || '', operatorTreasury: process.env.OPERATOR_TREASURY || '', rewardSigner: process.env.REWARD_SIGNER || '', txHashes: {} };
mkdirSync(new URL('../deployments/', import.meta.url), { recursive: true });
const name = chainId === 46630 ? 'robinhood-testnet.json' : 'robinhood-mainnet.json';
writeFileSync(new URL(`../deployments/${name}`, import.meta.url), JSON.stringify(deployment, null, 2));
console.log(JSON.stringify(deployment, null, 2));
