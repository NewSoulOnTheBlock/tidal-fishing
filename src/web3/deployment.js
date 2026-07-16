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
    baitStore: '0xfc7fa5d57e3b9a486e0ae34f8a64e9cc2d43ff508fb922d29215c58c173dfdee',
    rewardEscrow: '0x50dcadf4399ecc93fab6f2f46fff58bfa16eb271d0e4dc685efe3f0b1d5baa28',
    houseReserveVault: '0x388b04d8957b5205813cb36d375a54e22f01222331230a5e74b214e66dd88d15',
    tournamentVault: '0x3fa29e8311c6c0c6ce281d4013b2876e9c6fa0f860346c76b408c7e6be5601c6',
    sponsoredHotspots: '0x834ab4a9639746e128bf12b48db09f4951f7e9210c9f3e25ffea3095d652225c',
  },
});

export function hasCoreP2EDeployment() { return Boolean(deployment.asset && deployment.baitStore && deployment.rewardEscrow); }
