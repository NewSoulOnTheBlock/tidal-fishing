# 🔧 Render Dashboard Setup

## Step-by-Step: Add DATABASE_URL Environment Variable

### 1. Go to Render Dashboard
Navigate to: https://dashboard.render.com

### 2. Find Your Service
- Click on **"tidal-fishing"** (or whatever your API service is named)
- Should show as a "Web Service"

### 3. Navigate to Environment Tab
- Click **"Environment"** in the left sidebar
- You'll see any existing environment variables

### 4. Add Database URL
Click **"Add Environment Variable"** button

**For Internal Connection (RECOMMENDED):**
```
Key:   DATABASE_URL
Value: postgresql://fish_2l8h_user:WsnxpIk1Wb8e1H6AYsX9rp8EEqXTQ124@dpg-d8p50sojs32c738dgem0-a/fish_2l8h
```

Why internal?
- Faster (same datacenter)
- No public internet latency
- More secure

### 5. Save & Deploy
- Click **"Save Changes"**
- Render will automatically redeploy your service
- Wait ~3-5 minutes for deployment to complete

### 6. Verify Deployment
Check the logs:
- Click **"Logs"** tab
- Look for: `✅ Database connected` message on startup
- Should see no connection errors

### 7. Test Endpoints
Once deployed, test with curl:

```bash
# Replace YOUR-SERVICE-URL with your Render URL
# Example: https://tidal-fishing.onrender.com

# Test health check
curl https://YOUR-SERVICE-URL/health

# Test player auth (replace with your wallet address)
curl -X POST https://YOUR-SERVICE-URL/api/player/auth \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"YOUR_WALLET_ADDRESS"}'

# Test leaderboard
curl https://YOUR-SERVICE-URL/api/leaderboard
```

## Troubleshooting

### If you see "Database connection failed"
1. Check the DATABASE_URL is exactly right (no typos)
2. Verify the Render service has redeployed
3. Check Render logs for specific error messages
4. Ensure the PostgreSQL database is running

### If endpoints return 404
1. Verify the API server redeployed successfully
2. Check package.json has correct start script
3. Look at Render logs for startup errors

### If you see CORS errors from frontend
The server already has CORS configured for:
- https://tidalfishing.fun
- https://tidal-theta-tawny.vercel.app
- http://localhost:* (for dev)

No additional configuration needed!

## What Happens Next?

After DATABASE_URL is set and deployed:

1. ✅ API server can connect to PostgreSQL
2. ✅ All 6 database endpoints become functional
3. ✅ Frontend can authenticate players
4. ✅ Catches get recorded in database
5. ✅ Leaderboard shows real data

**Next dev session:** Wire up frontend to call these endpoints automatically!
