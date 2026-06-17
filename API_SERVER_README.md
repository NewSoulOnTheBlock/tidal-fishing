# Tidal API Server (Render)

Simple Express server for handling $TIDE withdrawals and other Solana transactions.

## Quick Deploy to Render

1. **Create new Web Service on Render**
   - Connect this repo
   - Root Directory: `api-server` (or wherever you place this)
   - Build Command: `npm install`
   - Start Command: `npm start`

2. **Set Environment Variables**
   ```
   TIDAL_TREASURY_SECRET=<your_treasury_private_key_base58>
   VITE_TIDE_MINT=7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump
   VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
   PORT=3000
   CORS_ORIGIN=https://tidalfishing.fun
   ```

3. **Deploy!**
   - Render will auto-deploy on push
   - Get your API URL (e.g., `https://tidal-api.onrender.com`)

4. **Update Frontend**
   - Change `/api/withdraw` to `https://tidal-api.onrender.com/api/withdraw`
   - Redeploy frontend

## Local Development

```bash
npm install
npm run dev
```

## Endpoints

- `POST /api/withdraw` - Withdraw $TIDE to connected wallet
- `GET /api/health` - Health check
- `GET /api/treasury/balance` - Check treasury balance

## Free Tier

Render free tier includes:
- ✅ 750 hours/month (enough for always-on)
- ✅ Auto-deploy from Git
- ✅ HTTPS included
- ⚠️ Spins down after 15 min inactivity (first request slower)

Need 24/7 uptime? Upgrade to $7/month.
