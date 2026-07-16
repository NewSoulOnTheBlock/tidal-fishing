import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, verifyMessage, getBytes } from 'ethers';
import { fishClaimDigest, signFishClaim } from '../nft/mintClaim.js';

test('signFishClaim signs the same digest verified by the configured signer', async () => {
  const signer = Wallet.createRandom();
  const player = Wallet.createRandom();
  const args = {
    signerPrivateKey: signer.privateKey,
    contractAddress: '0x2222222222222222222222222222222222222222',
    chainId: 4663,
    wallet: player.address,
    tokenId: 42,
    nonce: '0x' + '11'.repeat(32),
  };
  const signature = await signFishClaim(args);
  const digest = fishClaimDigest(args);
  assert.equal(verifyMessage(getBytes(digest), signature), signer.address);
});

test('signFishClaim returns null when production contract/signer env is missing', async () => {
  assert.equal(await signFishClaim({ wallet: Wallet.createRandom().address, tokenId: 1, nonce: '0x' + '22'.repeat(32) }), null);
});
