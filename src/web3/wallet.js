// Wallet connection via the Wallet Standard.
//
// All modern Solana wallets (Phantom, Solflare, Backpack, Glow, OKX, Coinbase,
// Trust, Brave, etc.) inject a Wallet Standard provider. We listen for them
// via @wallet-standard/app and surface the Solana-capable ones to the UI.
//
// We expose:
//   - listWallets()                    -> all Solana-capable detected wallets
//   - connect(wallet)                  -> request the wallet to expose accounts
//   - disconnect()
//   - currentAccount() / currentWallet()
//   - signTransaction(tx)              -> for Phase 2 token + NFT mints
//   - signMessage(uint8)               -> for Sign-In-With-Solana auth
//   - onChange(cb)                     -> subscribe to connect/disconnect/account
//
// This module is intentionally framework-free: returned values are plain JS
// objects and a tiny event emitter, so the existing DOM-driven HUD can consume
// it directly without a React shell.

import { getWallets } from "@wallet-standard/app";
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
} from "@wallet-standard/features";
import {
  SolanaSignTransaction,
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignIn,
} from "@solana/wallet-standard-features";
import { PublicKey } from "@solana/web3.js";

const SOLANA_MAINNET_CHAIN = "solana:mainnet";

const listeners = new Set();
let _wallet = null;
let _account = null;

function emit() {
  for (const cb of listeners) {
    try {
      cb({ wallet: _wallet, account: _account });
    } catch (e) {
      console.error("[wallet] listener error", e);
    }
  }
}

export function onChange(cb) {
  listeners.add(cb);
  cb({ wallet: _wallet, account: _account });
  return () => listeners.delete(cb);
}

export function currentWallet() {
  return _wallet;
}

export function currentAccount() {
  return _account;
}

export function currentPublicKey() {
  if (!_account) return null;
  try {
    return new PublicKey(_account.address);
  } catch {
    return null;
  }
}

function isSolanaWallet(w) {
  if (!w?.chains?.some?.((c) => c.startsWith("solana:"))) return false;
  const f = w.features ?? {};
  return Boolean(f[StandardConnect] && (f[SolanaSignTransaction] || f[SolanaSignAndSendTransaction]));
}

function solanaAccount(wallet) {
  return wallet.accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? wallet.accounts[0] ?? null;
}

let _walletsApi = null;
const detected = new Map(); // name -> wallet

function getApi() {
  if (_walletsApi) return _walletsApi;
  _walletsApi = getWallets();
  // initial snapshot
  for (const w of _walletsApi.get()) registerWallet(w);
  // future registrations
  _walletsApi.on("register", (...arr) => arr.forEach(registerWallet));
  _walletsApi.on("unregister", (...arr) =>
    arr.forEach((w) => {
      detected.delete(w.name);
      if (_wallet?.name === w.name) hardDisconnect();
    })
  );
  return _walletsApi;
}

function registerWallet(w) {
  if (!isSolanaWallet(w)) return;
  if (detected.has(w.name)) return;
  detected.set(w.name, w);
  // subscribe to per-wallet change events so account switches reach our UI
  const evt = w.features[StandardEvents];
  if (evt?.on) {
    evt.on("change", () => {
      if (_wallet?.name === w.name) {
        _account = solanaAccount(w);
        if (!_account) hardDisconnect();
        else emit();
      }
    });
  }
}

export function listWallets() {
  getApi();
  return [...detected.values()].map((w) => ({
    name: w.name,
    icon: w.icon,
    ref: w,
    installed: true,
  }));
}

export async function connect(walletRef) {
  getApi();
  const wallet = walletRef?.ref ?? walletRef;
  if (!wallet) throw new Error("No wallet selected");
  if (!isSolanaWallet(wallet)) throw new Error(`${wallet.name} does not support Solana`);

  const feature = wallet.features[StandardConnect];
  if (!feature?.connect) throw new Error(`${wallet.name} does not implement standard:connect`);
  const result = await feature.connect();
  const account = result?.accounts?.[0] ?? solanaAccount(wallet);
  if (!account) throw new Error(`${wallet.name} returned no accounts`);
  _wallet = wallet;
  _account = account;
  emit();
  return { wallet: _wallet, account: _account };
}

export async function disconnect() {
  if (!_wallet) return;
  const feature = _wallet.features[StandardDisconnect];
  try {
    await feature?.disconnect?.();
  } catch (e) {
    console.warn("[wallet] disconnect failed (clearing state anyway):", e);
  }
  hardDisconnect();
}

function hardDisconnect() {
  _wallet = null;
  _account = null;
  emit();
}

/** Sign a serialized VersionedTransaction (Uint8Array). Returns Uint8Array of the signed tx. */
export async function signTransaction(serializedTx) {
  if (!_wallet || !_account) throw new Error("Wallet not connected");
  const feature = _wallet.features[SolanaSignTransaction];
  if (!feature?.signTransaction) throw new Error("Wallet does not support signTransaction");
  const [out] = await feature.signTransaction({
    account: _account,
    chain: SOLANA_MAINNET_CHAIN,
    transaction: serializedTx,
  });
  return out.signedTransaction;
}

/** Sign + send in one step (preferred when supported — wallet picks blockhash). */
export async function signAndSendTransaction(serializedTx, options) {
  if (!_wallet || !_account) throw new Error("Wallet not connected");
  const feature = _wallet.features[SolanaSignAndSendTransaction];
  if (!feature?.signAndSendTransaction) {
    throw new Error("Wallet does not support signAndSendTransaction; use signTransaction + manual send instead");
  }
  const [result] = await feature.signAndSendTransaction({
    account: _account,
    chain: SOLANA_MAINNET_CHAIN,
    transaction: serializedTx,
    options,
  });
  return result.signature;
}

/** Sign a raw message (Uint8Array). Used by Sign-In-With-Solana auth. */
export async function signMessage(messageBytes) {
  if (!_wallet || !_account) throw new Error("Wallet not connected");
  const feature = _wallet.features[SolanaSignMessage];
  if (!feature?.signMessage) throw new Error("Wallet does not support signMessage");
  const [result] = await feature.signMessage({
    account: _account,
    message: messageBytes,
  });
  return result.signature;
}

export { SolanaSignIn };
