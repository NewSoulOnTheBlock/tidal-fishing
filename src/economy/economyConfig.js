import economy from '../../shared/economy.json';

export const ECONOMY = Object.freeze(economy);
export const NFT_HUNT = Object.freeze(economy.nftHunt);

export function assertEconomyConfig() {
  const total = ECONOMY.platformFeeBps + ECONOMY.rewardPoolBps + ECONOMY.lpFeeBps + ECONOMY.sponsorBps;
  if (total !== 10000) throw new Error(`Invalid economy split: ${total}`);
  if (NFT_HUNT.collectionSize !== 500) throw new Error('Fish NFT collection must be 500');
  if (NFT_HUNT.maxPendingOpportunitiesPerWallet !== 1) throw new Error('Fish NFT opportunities must not stack');
  return true;
}
