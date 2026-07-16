import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { normalizeEvmAddress, verifyEvmLogin } from '../auth/evmAuth.js';

test('normalizes checksum EVM addresses', () => {
  const wallet = Wallet.createRandom();
  assert.equal(normalizeEvmAddress(wallet.address.toLowerCase()), wallet.address);
});

test('verifies base64 personal_sign signatures from frontend session flow', async () => {
  const wallet = Wallet.createRandom();
  const issued = Date.now();
  const message = `Sign in to Bull Fish Blitz\nwallet: ${wallet.address}\nnonce: test\nissued: ${issued}`;
  const hexSignature = await wallet.signMessage(message);
  const base64Signature = Buffer.from(hexSignature.slice(2), 'hex').toString('base64');
  assert.equal(verifyEvmLogin({ walletAddress: wallet.address, message, signature: base64Signature }), true);
});

test('rejects a signature from a different wallet', async () => {
  const signer = Wallet.createRandom();
  const claimed = Wallet.createRandom();
  const message = `Sign in to Bull Fish Blitz\nwallet: ${claimed.address}\nnonce: test\nissued: ${Date.now()}`;
  const base64Signature = Buffer.from((await signer.signMessage(message)).slice(2), 'hex').toString('base64');
  assert.equal(verifyEvmLogin({ walletAddress: claimed.address, message, signature: base64Signature }), false);
});
