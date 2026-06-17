# 🧪 Database Integration Testing Guide

## ✅ What's Live

**Frontend Integration Complete:**
- ✅ Wallet connect triggers database authentication
- ✅ Auto-save every 30 seconds
- ✅ Every fish catch recorded to database
- ✅ Leaderboard pulls from PostgreSQL
- ✅ localStorage → database migration on first connect
- ✅ Force sync on level up, unlock, purchase

**Backend Deployed:**
- ✅ API server on Render: https://tidal-fishing.onrender.com
- ✅ DATABASE_URL configured
- ✅ PostgreSQL ready with 7 tables

## 🧪 Testing Steps

### 1. Connect Wallet
1. Go to https://tidalfishing.fun
2. Click wallet icon (top right)
3. Select your wallet (Phantom/Solflare/Backpack)
4. Approve connection

**Expected:**
- ✅ Wallet address appears in HUD
- ✅ Toast: "🗄️ Database connected! Progress will auto-save."
- ✅ Console: `[db] ✅ Player authenticated`
- ✅ If you had local progress: "📤 Syncing local progress to cloud..."

### 2. Catch a Fish
1. Cast your line (click)
2. Wait for bite
3. Hook when prompted (click)
4. Reel in (hold click)

**Expected:**
- ✅ Fish caught successfully
- ✅ Console: `[db] ✅ Catch recorded: <species>`
- ✅ Catch saved to database (invisible to player)

### 3. Check Auto-Save
1. Play for 30+ seconds
2. Watch browser console

**Expected:**
- ✅ Every 30s: `[db] ✅ Player state synced successfully`
- ✅ No errors in console
- ✅ Game continues smoothly (async sync)

### 4. Level Up
1. Catch enough fish to level up

**Expected:**
- ✅ Level up animation
- ✅ Console: `[db] Force sync triggered`
- ✅ Immediate sync (not waiting 30s)

### 5. Check Leaderboard
1. Click leaderboard icon (or press L)
2. View "Top Earners" tab

**Expected:**
- ✅ Real player data loads
- ✅ Shows wallet addresses (shortened)
- ✅ Shows total earned + catches
- ✅ Top 3 have trophy emojis (🥇🥈🥉)
- ✅ If empty: "No entries yet. Be the first to fish and claim your spot!"

### 6. Cross-Device Sync
1. Connect same wallet on different device/browser
2. Check if progress matches

**Expected:**
- ✅ Same level, XP, money
- ✅ Same unlocked locations
- ✅ Same equipped gear
- ✅ Catches sync across devices

### 7. Disconnect & Reconnect
1. Disconnect wallet
2. Catch a fish (goes to localStorage)
3. Reconnect wallet
4. Check if both catches are synced

**Expected:**
- ✅ On disconnect: auto-save stops
- ✅ On reconnect: auto-save resumes
- ✅ New catches sync to database

## 🔍 Debugging

### Check API Health
```bash
curl https://tidal-fishing.onrender.com/health
```
**Expected:** `{"status":"ok","timestamp":"..."}`

### Check Database Connection
```bash
curl https://tidal-fishing.onrender.com/health
```
Look for: `"database":"connected"`

### Test Authentication
```bash
curl -X POST https://tidal-fishing.onrender.com/api/player/auth \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"YOUR_WALLET_ADDRESS"}'
```
**Expected:** Player object with stats

### Check Leaderboard
```bash
curl https://tidal-fishing.onrender.com/api/leaderboard?limit=10
```
**Expected:** Array of top players

## 🐛 Common Issues

### "Database connected" toast doesn't appear
- **Cause:** API server offline or DATABASE_URL not set
- **Check:** https://tidal-fishing.onrender.com/health
- **Fix:** Verify DATABASE_URL in Render dashboard

### Catches not recording
- **Cause:** Wallet not connected or auth failed
- **Check:** Console for `[db] ✅ Catch recorded` messages
- **Fix:** Reconnect wallet, check API health

### Auto-save not working
- **Cause:** Wallet disconnected or sync loop crashed
- **Check:** Console for `[db] ✅ Player state synced` every 30s
- **Fix:** Disconnect and reconnect wallet

### Leaderboard shows "Failed to load"
- **Cause:** API server down or CORS issue
- **Check:** Browser network tab for 500/404 errors
- **Fix:** Check Render logs for database connection errors

### "Too many requests" error
- **Cause:** Rate limiting (shouldn't happen normally)
- **Fix:** Wait 60 seconds, try again

## 📊 What Gets Synced

**Player State (every 30s):**
- Level, XP, money
- Total catches, total earned
- Perfect hooks count
- Unlocked locations
- Equipped gear
- Owned gear
- Login streak

**Catch Data (every fish):**
- Species ID
- Location
- Rarity
- Size (cm)
- Weight (kg)
- Value
- Perfect hook flag
- Timestamp

**Leaderboard (real-time):**
- Top 100 by earnings
- Wallet address
- Total earned
- Total catches
- Rank (1-100)

## 🎯 Success Criteria

✅ **Core Flow Working:**
1. Connect wallet → see authentication toast
2. Catch fish → see console log
3. Wait 30s → see auto-save log
4. Level up → see force sync
5. Open leaderboard → see real data

✅ **No Errors:**
- No red errors in browser console
- No API 500 errors in Network tab
- No database connection failures in Render logs

✅ **Data Persistence:**
- Refresh page → progress preserved
- Disconnect/reconnect → same stats
- Cross-device → same progress

## 🚀 Performance Notes

**Auto-Save:**
- 30-second interval (not too aggressive)
- 5-second debounce (prevents spam)
- Async (doesn't block gameplay)

**Catch Recording:**
- Async + best-effort
- Doesn't throw errors to gameplay
- Fails silently if API down

**Leaderboard:**
- Loads on demand (not automatic)
- Top 100 limit (fast queries)
- Cached for 60s (future optimization)

## 📱 Mobile Testing

Same tests apply on mobile:
- Use Phantom mobile app
- Connect via WalletConnect
- All features should work identically

---

**Ready to test?** Go catch some fish and check the leaderboard! 🎣

**Questions?** Check the browser console for `[db]` logs to see what's happening.
