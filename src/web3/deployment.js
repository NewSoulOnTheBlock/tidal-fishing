import { BAIT_STORE_ADDRESS, REWARD_ESCROW_ADDRESS, HOUSE_RESERVE_VAULT_ADDRESS, TOURNAMENT_VAULT_ADDRESS, SPONSORED_HOTSPOTS_ADDRESS, GAME_TOKEN_ADDRESS, CHAIN_ID } from './chain.js';

export const deployment = Object.freeze({
  chainId: CHAIN_ID,
  asset: GAME_TOKEN_ADDRESS,
  baitStore: BAIT_STORE_ADDRESS,
  rewardEscrow: REWARD_ESCROW_ADDRESS,
  houseReserveVault: HOUSE_RESERVE_VAULT_ADDRESS,
  tournamentVault: TOURNAMENT_VAULT_ADDRESS,
  sponsoredHotspots: SPONSORED_HOTSPOTS_ADDRESS,
});

export function hasCoreP2EDeployment() { return Boolean(deployment.asset && deployment.baitStore && deployment.rewardEscrow); }
