import { apiFetch } from "../utils/api.js";
import { currentPublicKey, sendTransaction } from "./wallet.js";
import { AbiCoder } from "ethers";

export async function getFishNftManifest() {
  const res = await apiFetch("/api/nft/manifest");
  if (!res.ok) throw new Error(`Failed to load Fish NFT manifest (${res.status})`);
  return res.json();
}

export async function getActiveFishNftOpportunity(walletAddress = currentPublicKey()?.toString()) {
  if (!walletAddress) return null;
  const res = await apiFetch(`/api/nft/opportunity/${encodeURIComponent(walletAddress)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.opportunity || null;
}

export async function claimFishNft(walletAddress = currentPublicKey()?.toString()) {
  if (!walletAddress) throw new Error("Connect your wallet first");
  const res = await apiFetch("/api/nft/mint-claim", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fish NFT claim failed (${res.status})`);
  const claim = data.claim;
  if (claim?.signature && claim?.contractAddress) {
    const coder = AbiCoder.defaultAbiCoder();
    const encodedArgs = coder.encode(['uint256', 'bytes32', 'bytes'], [BigInt(claim.tokenId), claim.nonce, claim.signature]);
    const txHash = await sendTransaction({
      to: claim.contractAddress,
      data: `0x7f14bb37${encodedArgs.slice(2)}`,
      value: '0x0',
    });
    return { ...data, txHash };
  }
  return data;
}
