import { getAddress, keccak256, AbiCoder, Wallet, getBytes } from 'ethers';

const coder = AbiCoder.defaultAbiCoder();

export function fishClaimDigest({ contractAddress, chainId, wallet, tokenId, nonce }) {
  const nonceHex = String(nonce || '').startsWith('0x') ? nonce : `0x${nonce}`;
  return keccak256(coder.encode(
    ['address', 'uint256', 'address', 'uint256', 'bytes32'],
    [getAddress(contractAddress), BigInt(chainId), getAddress(wallet), BigInt(tokenId), nonceHex],
  ));
}

export async function signFishClaim({ signerPrivateKey, contractAddress, chainId = 4663, wallet, tokenId, nonce }) {
  if (!signerPrivateKey || !contractAddress) return null;
  const signer = new Wallet(signerPrivateKey);
  const digest = fishClaimDigest({ contractAddress, chainId, wallet, tokenId, nonce });
  return signer.signMessage(getBytes(digest));
}
