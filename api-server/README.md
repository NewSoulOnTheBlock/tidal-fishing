# Tidal API Server

Express server for handling Solana $TIDE withdrawals.

## Quick Deploy to Render

### 1. Create New Web Service

1. Go to https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub repo
4. Configure:
   - **Name:** `tidal-api`
   - **Root Directory:** `api-server`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`

### 2. Set Environment Variables

In Render dashboard, add these:

```
TIDAL_TREASURY_SECRET=auyRzxYNj3K5zEXg92BLueo4jVqwsNfXBCvWZc5WqJynyLC5MUUUT8cn49NWifTsFwBjr9DW4GTtH6MUPU65Lht
VITE_TIDE_MINT=7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump
VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=021f44ec-4a1a-4d35-ab8a-f7263ea0f2dd
CORS_ORIGIN=https://tidalfishing.fun
```

### 3. Deploy!

Render will auto-build and deploy. You'll get a URL like:
```
https://tidal-api.onrender.com
```

### 4. Update Frontend

Change the withdraw endpoint in `src/web3/withdraw.js`:

```javascript
const res = await fetch("https://tidal-api.onrender.com/api/withdraw", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ recipient: recipient.toBase58(), amount }),
});
```

Then redeploy frontend to Vercel!

## Local Development

```bash
cd api-server
npm install
npm run dev
```

Test locally:
```bash
curl http://localhost:3000/api/health
```

## API Endpoints

### `GET /api/health`
Health check - returns server status and config

### `GET /api/treasury/balance`
Get treasury $TIDE balance

### `POST /api/withdraw`
Withdraw $TIDE to user wallet

**Request:**
```json
{
  "recipient": "USER_WALLET_ADDRESS",
  "amount": 100
}
```

**Response:**
```json
{
  "signature": "TX_SIGNATURE",
  "recipient": "USER_WALLET_ADDRESS",
  "amount": 100,
  "explorerUrl": "https://solscan.io/tx/..."
}
```

## Free Tier Limits

- ✅ 750 hours/month
- ✅ Auto-deploy from Git
- ✅ HTTPS included
- ⚠️ Spins down after 15 min inactivity
- ⚠️ First request after spin-down takes ~30s

For 24/7 uptime: Upgrade to $7/month

## Troubleshooting

**Server not starting?**
- Check environment variables are set
- Check logs in Render dashboard

**Withdrawals failing?**
- Check treasury has $TIDE tokens
- Check treasury has SOL for fees
- Check RPC URL is valid

**CORS errors?**
- Make sure CORS_ORIGIN matches your frontend domain
