import { getAddress, verifyMessage } from 'ethers';

export const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeEvmAddress(address) {
  if (!EVM_ADDRESS_RE.test(String(address || ''))) return null;
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

export function signatureToHex(signature) {
  if (typeof signature !== 'string') return null;
  if (/^0x[a-fA-F0-9]+$/.test(signature)) return signature;
  try {
    const bytes = Buffer.from(signature, 'base64');
    if (!bytes.length) return null;
    return `0x${bytes.toString('hex')}`;
  } catch {
    return null;
  }
}

export function verifyEvmLogin({ walletAddress, message, signature }) {
  const expected = normalizeEvmAddress(walletAddress);
  if (!expected || typeof message !== 'string') return false;
  const hexSignature = signatureToHex(signature);
  if (!hexSignature) return false;
  try {
    const recovered = verifyMessage(message, hexSignature);
    return normalizeEvmAddress(recovered) === expected;
  } catch {
    return false;
  }
}

export function parseSignedMessageFields(message) {
  const fields = {};
  for (const line of String(message || '').split('\n')) {
    const idx = line.indexOf(':');
    if (idx > -1) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}
