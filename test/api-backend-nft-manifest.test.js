import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/backend.js';

test('Vercel backend proxy serves Fish NFT manifest locally without Render secret', async () => {
  const req = { method: 'GET', query: { path: '/api/nft/manifest' }, headers: { origin: 'https://www.bullfishblitz.com' } };
  let statusCode = 200;
  const headers = {};
  let body = null;
  const res = {
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    getHeader(key) { return headers[key.toLowerCase()]; },
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
    end() { return this; },
  };

  await handler(req, res);
  assert.equal(statusCode, 200);
  assert.equal(headers['access-control-allow-origin'], 'https://www.bullfishblitz.com');
  assert.equal(body.collectionSize, 500);
  assert.equal(body.speciesCount, 73);
  assert.equal(body.tokens.length, 500);
});
