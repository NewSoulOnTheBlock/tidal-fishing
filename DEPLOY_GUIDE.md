# 🚀 Deploy Withdrawal System — Step by Step

## ✅ What's Done

1. ✅ Express API server created in `api-server/`
2. ✅ Frontend updated to call Render API
3. ✅ Code committed locally
4. ✅ Treasury wallet configured: `CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror`
5. ✅ $TIDE mint configured: `7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump`

## 📋 Next Steps

### Step 1: Push to GitHub (if you have a repo)

```bash
cd C:\Users\roota\tidal
git remote add origin https://github.com/YOUR_USERNAME/tidal.git
git push -u origin main
```

Or create a new GitHub repo and push there.

### Step 2: Deploy API Server to Render

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com/
   - Sign up/log in (free tier available)

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub account
   - Select your `tidal` repository
   
3. **Configure Service**
   ```
   Name: tidal-api
   Root Directory: api-server
   Environment: Node
   Build Command: npm install
   Start Command: npm start
   Plan: Free
   ```

4. **Add Environment Variables**
   Click "Advanced" → "Add Environment Variable"
   
   ```
   TIDAL_TREASURY_SECRET=auyRzxYNj3K5zEXg92BLueo4jVqwsNfXBCvWZc5WqJynyLC5MUUUT8cn49NWifTsFwBjr9DW4GTtH6MUPU65Lht
   VITE_TIDE_MINT=7sXmXJEKLRQ3ZJ68g6fdsJMV2R9fXDbem1nS2d9apump
   VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=021f44ec-4a1a-4d35-ab8a-f7263ea0f2dd
   CORS_ORIGIN=https://tidalfishing.fun
   ```

5. **Click "Create Web Service"**
   - Render will build and deploy automatically
   - You'll get a URL like: `https://tidal-api.onrender.com`
   - Save this URL!

### Step 3: Update Frontend with API URL

```bash
cd C:\Users\roota\tidal
vercel env add VITE_API_URL production
# Paste: https://tidal-api.onrender.com
```

### Step 4: Redeploy Frontend

```bash
vercel deploy --prod --yes
```

### Step 5: Fund Treasury Wallet

Send $TIDE tokens and SOL to treasury wallet:
```
CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror
```

Recommended:
- **$TIDE:** 10,000,000+ tokens (for withdrawals)
- **SOL:** 0.1 SOL (for transaction fees)

### Step 6: Test!

1. **Check API health:**
   ```bash
   curl https://tidal-api.onrender.com/api/health
   ```

2. **Check treasury balance:**
   ```bash
   curl https://tidal-api.onrender.com/api/treasury/balance
   ```

3. **Test withdrawal in-game:**
   - Play game, earn $TIDE
   - Click wallet panel → "Withdraw"
   - Enter amount → confirm
   - Should receive tokens in wallet!

## 🐛 Troubleshooting

**API not starting?**
- Check Render logs in dashboard
- Verify environment variables are set

**Withdrawals failing with "Treasury balance too low"?**
- Fund treasury wallet with $TIDE

**Withdrawals failing with "Transaction failed"?**
- Check treasury has SOL for fees
- Check RPC URL is valid

**CORS errors in browser console?**
- Make sure CORS_ORIGIN matches your domain
- Check API logs to see what origin was rejected

**First request takes 30 seconds?**
- Normal! Render free tier spins down after 15 min
- Upgrade to $7/month for 24/7 uptime

## 📝 Files Changed

- ✅ `api-server/server.js` - Express server with SPL token transfer
- ✅ `api-server/package.json` - Dependencies
- ✅ `api-server/README.md` - API documentation
- ✅ `src/web3/withdraw.js` - Updated to call Render API

## 🎯 Current Status

✅ Code ready
✅ Committed locally
⏳ Needs: Push to GitHub
⏳ Needs: Deploy to Render
⏳ Needs: Update Vercel env
⏳ Needs: Fund treasury
⏳ Needs: Test withdrawals

Let me know when you're ready for each step!
