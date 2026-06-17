# Withdraw Endpoint Deployment Guide

## Status: ✅ Endpoint Ready to Deploy

The `/api/withdraw` endpoint is already built and ready! It just needs environment variables configured.

## Required Environment Variables

Set these in Vercel Dashboard (Project Settings → Environment Variables):

### 1. **TIDAL_TREASURY_SECRET** (REQUIRED)
   - **Description**: Base58-encoded private key of the treasury wallet
   - **Value**: `<your_treasury_private_key_base58>`
   - **Environment**: Production, Preview, Development
   - ⚠️ **CRITICAL**: Keep this secret! Never commit to git.

### 2. **VITE_TIDE_MINT** (Already set in code)
   - **Description**: $TIDE token contract address
   - **Value**: `7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump`
   - **Environment**: Production, Preview, Development
   - ℹ️ Already hardcoded in `src/web3/solana.js`, but can be overridden

### 3. **VITE_SOLANA_RPC_URL** (Optional but recommended)
   - **Description**: Custom RPC endpoint (Helius, QuickNode, Triton)
   - **Value**: `https://mainnet.helius-rpc.com/?api-key=<your_key>`
   - **Environment**: Production, Preview, Development
   - ℹ️ Defaults to public mainnet-beta (rate-limited)

### 4. **VITE_TIDE_DECIMALS** (Optional)
   - **Description**: Token decimals (default: 9)
   - **Value**: `9`
   - **Environment**: Production
   - ℹ️ Only override if $TIDE uses different decimals

### 5. **TIDAL_WITHDRAW_MAX** (Optional)
   - **Description**: Max $TIDE per withdrawal (anti-abuse)
   - **Value**: `100000000` (100 million)
   - **Environment**: Production
   - ℹ️ Prevents single massive withdrawals

## Quick Setup via Vercel CLI

```bash
# Set treasury private key (KEEP SECRET!)
vercel env add TIDAL_TREASURY_SECRET production

# Set RPC URL (recommended for production)
vercel env add VITE_SOLANA_RPC_URL production

# Deploy
vercel deploy --prod
```

## Getting Your Treasury Private Key

### From Phantom Wallet:
1. Open Phantom → Settings → Security & Privacy
2. Export Private Key
3. Copy the base58 string

### From Solana CLI:
```bash
# If you have the keypair file
cat ~/.config/solana/treasury.json
# Use the array format or convert to base58
```

### From JSON keypair to Base58:
```javascript
import bs58 from 'bs58';
const keypairJson = [1,2,3,...]; // 64 bytes
const base58 = bs58.encode(Uint8Array.from(keypairJson));
console.log(base58);
```

## How It Works

```
User clicks "Withdraw X $TIDE"
    ↓
Frontend → POST /api/withdraw
    { recipient: "user_wallet", amount: X }
    ↓
Server loads treasury keypair from env
    ↓
Server checks treasury has X+ $TIDE
    ↓
Server creates transfer instruction:
    From: Treasury ATA
    To: User ATA (creates if needed)
    Amount: X $TIDE
    ↓
Server signs with treasury key
    ↓
Server sends to Solana mainnet
    ↓
Server waits for confirmation
    ↓
Server returns signature
    ↓
Frontend shows success toast
```

## Testing the Endpoint

### Local Testing:
```bash
# Set env vars in .env.local
TIDAL_TREASURY_SECRET=<your_key>
VITE_TIDE_MINT=7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump
VITE_SOLANA_RPC_URL=<optional_rpc>

# Start dev server
npm run dev

# Test withdrawal
curl -X POST http://localhost:5173/api/withdraw \
  -H "Content-Type: application/json" \
  -d '{"recipient":"YOUR_WALLET_ADDRESS","amount":1}'
```

### Production Testing:
1. Connect wallet on https://tidalfishing.fun
2. Earn some $TIDE (fish, challenges, etc.)
3. Click "Withdraw X $TIDE" button
4. Check Solscan for transaction

## Security Checklist

- [ ] Treasury private key stored in Vercel env vars (NOT in code)
- [ ] `.env.local` is in `.gitignore`
- [ ] Treasury wallet funded with:
  - [ ] $TIDE tokens for withdrawals
  - [ ] SOL for transaction fees (~0.01 SOL per 1000 txs)
- [ ] `TIDAL_WITHDRAW_MAX` set to reasonable limit
- [ ] Custom RPC configured (avoid rate limits)
- [ ] Test withdrawal with small amount first

## Monitoring

**Treasury Balance:**
- https://solscan.io/account/CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror

**Check Recent Withdrawals:**
```bash
# View treasury transactions
curl "https://api.mainnet-beta.solana.com" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getSignaturesForAddress",
    "params": ["CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror"]
  }'
```

## Troubleshooting

### "Withdrawals not configured"
- Set `TIDAL_TREASURY_SECRET` and `VITE_TIDE_MINT` in Vercel env

### "Treasury has no $TIDE token account"
- Transfer $TIDE tokens to treasury wallet first

### "Treasury balance too low"
- Fund treasury with more $TIDE tokens

### "Transaction failed"
- Check treasury has SOL for fees
- Check Solana network status: https://status.solana.com/
- Try again (network might be congested)

### Rate limiting errors
- Set `VITE_SOLANA_RPC_URL` to a premium RPC provider

## Next Steps

1. **Set environment variables in Vercel**
2. **Fund the treasury wallet**
3. **Redeploy** (if env vars changed)
4. **Test withdrawal** with small amount
5. **Monitor** treasury balance regularly

---

## Quick Deploy Command

```bash
# After setting env vars in Vercel Dashboard:
vercel deploy --prod --yes
```

The withdraw endpoint will be live at:
`https://tidalfishing.fun/api/withdraw`
