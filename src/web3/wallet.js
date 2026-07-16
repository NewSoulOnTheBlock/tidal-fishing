// EVM wallet connection for Robinhood Chain. This replaces the old Robinhood Chain
// Wallet Standard adapter while preserving the tiny framework-free API used by
// the existing DOM HUD.

import { CHAIN_ID, CHAIN_ID_HEX, RPC_URL, EXPLORER_BASE, NETWORK } from "./chain.js";

const listeners = new Set();
let _provider = null;
let _account = null;
let _walletName = null;

function addressObject(address) {
  if (!address) return null;
  return {
    address,
    walletAddress: address,
    toString: () => address,
    toBase58: () => address, // legacy call sites from the Robinhood Chain version
  };
}

function emit() {
  const account = addressObject(_account);
  const wallet = _provider ? { name: _walletName || "EVM Wallet", provider: _provider } : null;
  for (const cb of listeners) {
    try { cb({ wallet, account }); } catch (e) { console.error("[wallet] listener error", e); }
  }
}

export function onChange(cb) { listeners.add(cb); cb({ wallet: _provider ? { name: _walletName || "EVM Wallet", provider: _provider } : null, account: addressObject(_account) }); return () => listeners.delete(cb); }
export function currentWallet() { return _provider ? { name: _walletName || "EVM Wallet", provider: _provider } : null; }
export function currentAccount() { return addressObject(_account); }
export function currentWalletAddress() { return addressObject(_account); }
export const currentAccountAddress = currentWalletAddress;
export function currentAddress() { return _account; }

function injectedProviders() {
  if (typeof window === "undefined") return [];
  const eth = window.ethereum;
  if (!eth) return [];
  const providers = Array.isArray(eth.providers) ? eth.providers : [eth];
  return providers.map((p) => {
    const name = p.isMetaMask ? "MetaMask" : p.isCoinbaseWallet ? "Coinbase Wallet" : p.isRabby ? "Rabby" : p.isBraveWallet ? "Brave Wallet" : "Injected EVM Wallet";
    return { name, icon: null, ref: p, installed: true };
  });
}

export function listWallets() { return injectedProviders(); }

async function request(provider, method, params = []) {
  if (!provider?.request) throw new Error("No EVM wallet provider found");
  return provider.request({ method, params });
}

export async function ensureRobinhoodChain(provider = _provider) {
  if (!provider) throw new Error("Wallet not connected");
  const current = await request(provider, "eth_chainId").catch(() => null);
  if (String(current).toLowerCase() === CHAIN_ID_HEX.toLowerCase()) return true;
  try {
    await request(provider, "wallet_switchEthereumChain", [{ chainId: CHAIN_ID_HEX }]);
    return true;
  } catch (err) {
    if (err?.code !== 4902 && err?.data?.originalError?.code !== 4902) throw err;
    await request(provider, "wallet_addEthereumChain", [{
      chainId: CHAIN_ID_HEX,
      chainName: NETWORK,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: [RPC_URL],
      blockExplorerUrls: [EXPLORER_BASE],
    }]);
    return true;
  }
}

export async function connect(walletRef) {
  const provider = walletRef?.ref ?? walletRef ?? injectedProviders()[0]?.ref;
  if (!provider) throw new Error("No EVM wallet detected. Install MetaMask, Rabby, Coinbase Wallet, or another EIP-1193 wallet.");
  const accounts = await request(provider, "eth_requestAccounts");
  const account = accounts?.[0];
  if (!account) throw new Error("Wallet returned no accounts");
  _provider = provider;
  _walletName = walletRef?.name || (provider.isMetaMask ? "MetaMask" : "EVM Wallet");
  _account = account;
  provider.on?.("accountsChanged", (accounts) => { _account = accounts?.[0] || null; if (!_account) _provider = null; emit(); });
  provider.on?.("chainChanged", () => emit());
  await ensureRobinhoodChain(provider);
  emit();
  return { wallet: currentWallet(), account: currentAccount() };
}

export async function disconnect() { _provider = null; _account = null; _walletName = null; emit(); }

export async function signMessage(messageBytes) {
  if (!_provider || !_account) throw new Error("Wallet not connected");
  const text = typeof messageBytes === "string" ? messageBytes : new TextDecoder().decode(messageBytes);
  const sig = await request(_provider, "personal_sign", [text, _account]);
  return hexToBytes(sig);
}

export async function sendTransaction(tx) {
  if (!_provider || !_account) throw new Error("Wallet not connected");
  await ensureRobinhoodChain(_provider);
  return request(_provider, "eth_sendTransaction", [{ from: _account, ...tx }]);
}

export async function call(tx, block = "latest") {
  const provider = _provider;
  if (provider?.request) return request(provider, "eth_call", [tx, block]);
  const res = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [tx, block] }) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "eth_call failed");
  return json.result;
}

export async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || `${method} failed`);
  return json.result;
}

function hexToBytes(hex) {
  const clean = String(hex || "").replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Legacy Robinhood Chain transaction methods are intentionally unsupported after the
// Robinhood conversion.
export async function signTransaction() { throw new Error("Robinhood Chain transactions are disabled; use Robinhood Chain EVM transactions."); }
export async function signAndSendTransaction() { throw new Error("Robinhood Chain transactions are disabled; use Robinhood Chain EVM transactions."); }
export const WalletSignIn = "eip191:personal_sign";
