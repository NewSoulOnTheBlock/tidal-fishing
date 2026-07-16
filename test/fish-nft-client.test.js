import test from 'node:test';
import assert from 'node:assert/strict';
import { claimFishNft } from '../src/web3/fishNft.js';

test('claimFishNft posts wallet address to mint claim endpoint with auth', async () => {
  const calls = [];
  global.window = { location: { origin: 'https://example.test' } };
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ success: true, claim: { tokenId: 7 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await claimFishNft('0x1111111111111111111111111111111111111111');
  assert.equal(result.claim.tokenId, 7);
  assert.equal(calls[0].url, '/api/backend?path=%2Fapi%2Fnft%2Fmint-claim');
  assert.equal(JSON.parse(calls[0].options.body).walletAddress, '0x1111111111111111111111111111111111111111');
});
