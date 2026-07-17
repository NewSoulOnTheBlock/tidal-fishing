import { CHAIN_ID, GAME_TOKEN_ADDRESS, BAIT_STORE_ADDRESS, REWARD_ESCROW_ADDRESS, HOUSE_RESERVE_VAULT_ADDRESS, TOURNAMENT_VAULT_ADDRESS, SPONSORED_HOTSPOTS_ADDRESS } from './chain.js';

export const deployment = Object.freeze({
  chainId: CHAIN_ID,
  asset: GAME_TOKEN_ADDRESS,
  baitStore: BAIT_STORE_ADDRESS,
  rewardEscrow: REWARD_ESCROW_ADDRESS,
  houseReserveVault: HOUSE_RESERVE_VAULT_ADDRESS,
  tournamentVault: TOURNAMENT_VAULT_ADDRESS,
  sponsoredHotspots: SPONSORED_HOTSPOTS_ADDRESS,
  txHashes: {
    baitStore: '0x9293e0914fdc48288e06751885d7d7b3311008735e09d83d508256f5b14d62b8',
    rewardEscrow: '0xee09ac1d881b69dd88aa3c3ac7137ca163ea92d961b7614d9a80d5de767af146',
    houseReserveVault: '0xfb06a3664faa6913f25d3ffee7d3f8d63471e8f8defb538a40eb72f58a02d3d8',
    tournamentVault: '0x0806703fa5d1e66b48e254a64d4bfb320a90c9c9594f519062c72ed91d08e87e',
    sponsoredHotspots: '0x4a42a1abef64cf92918436c69e97c54dc874d5f471d9455bc58ef1b8dbb725ab',
  },
});

export function hasCoreP2EDeployment() { return Boolean(deployment.asset && deployment.baitStore && deployment.rewardEscrow); }
