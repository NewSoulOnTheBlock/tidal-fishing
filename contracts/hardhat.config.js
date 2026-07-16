import 'dotenv/config';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '';
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];
export default {
  solidity: { version: '0.8.24', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } },
  networks: {
    robinhoodMainnet: { url: process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com', chainId: 4663, accounts },
    robinhoodTestnet: { url: process.env.ROBINHOOD_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com', chainId: 46630, accounts },
  },
};
