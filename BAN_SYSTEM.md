# Ban System Administration Guide

## Overview
Tidal now has IP + wallet banning capabilities with server-side catch validation. **No offline fishing is possible** - all catches must be approved by the server.

## How It Works

### Server-Side Validation
- Every catch triggers `/api/catch/validate` before registering
- Server checks IP bans, wallet bans, and rate limits
- Fails closed: no server connection = no fishing

### Ban Types
1. **Wallet Bans** - Blocks specific Solana addresses (cannot be bypassed with VPN)
2. **IP Bans** - Blocks IP addresses (can be bypassed with VPN, but slows down bots)

### Rate Limiting
- **10 catches/minute** per IP address
- Tracked in `ip_activity` table
- Automatic throttling

## Admin Endpoints

All admin endpoints require `ADMIN_SECRET` environment variable.

### Ban a Wallet
```bash
curl -X POST https://tidal-fishing.onrender.com/api/admin/ban/wallet \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    "reason": "Exploiting refresh bug for free $TIDE",
    "adminKey": "YOUR_ADMIN_SECRET"
  }'
```

### Ban an IP
```bash
curl -X POST https://tidal-fishing.onrender.com/api/admin/ban/ip \
  -H "Content-Type: application/json" \
  -d '{
    "ipAddress": "192.168.1.1",
    "reason": "Bot farming detected",
    "adminKey": "YOUR_ADMIN_SECRET"
  }'
```

### Unban a Wallet
```bash
curl -X POST https://tidal-fishing.onrender.com/api/admin/unban/wallet \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    "adminKey": "YOUR_ADMIN_SECRET"
  }'
```

### Unban an IP
```bash
curl -X POST https://tidal-fishing.onrender.com/api/admin/unban/ip \
  -H "Content-Type: application/json" \
  -d '{
    "ipAddress": "192.168.1.1",
    "adminKey": "YOUR_ADMIN_SECRET"
  }'
```

### List All Bans
```bash
curl "https://tidal-fishing.onrender.com/api/admin/bans?adminKey=YOUR_ADMIN_SECRET"
```

Response:
```json
{
  "bannedWallets": [
    {
      "id": 1,
      "wallet_address": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
      "reason": "Exploiting refresh bug",
      "banned_at": "2026-06-17T08:59:00.000Z",
      "banned_by": "system"
    }
  ],
  "bannedIPs": [
    {
      "id": 1,
      "ip_address": "192.168.1.1",
      "reason": "Bot farming detected",
      "banned_at": "2026-06-17T09:00:00.000Z",
      "banned_by": "system"
    }
  ]
}
```

## User Experience

### Banned Users See:
- **Wallet Ban**: "🚫 Account Suspended - [reason]" modal overlay
- **IP Ban**: "Access denied - Your IP has been banned" toast
- **Rate Limited**: "Too many catches. Please slow down." toast
- **Offline**: "Server connection required. Please check your internet connection."

## Database Tables

### `banned_wallets`
```sql
CREATE TABLE banned_wallets (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  reason TEXT,
  banned_at TIMESTAMP DEFAULT NOW(),
  banned_by VARCHAR(100) DEFAULT 'system'
);
```

### `banned_ips`
```sql
CREATE TABLE banned_ips (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) UNIQUE NOT NULL,
  reason TEXT,
  banned_at TIMESTAMP DEFAULT NOW(),
  banned_by VARCHAR(100) DEFAULT 'system'
);
```

### `ip_activity`
```sql
CREATE TABLE ip_activity (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  wallet_address VARCHAR(44),
  action VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);
```

## Deployment Checklist

1. **Database Migration**
   ```bash
   psql $DATABASE_URL < api-server/schema.sql
   ```

2. **Set Admin Secret**
   ```bash
   # On Render.com dashboard
   ADMIN_SECRET=strong-random-password-here
   ```

3. **Deploy API Server** (must deploy first)
   - Push to Render
   - Verify ban tables exist
   - Test `/api/admin/bans` endpoint

4. **Deploy Client** (deploy second)
   - Push to Vercel
   - Test catch validation works
   - Verify offline fishing is blocked

## Monitoring

### Check IP Activity
```sql
SELECT ip_address, COUNT(*) as catches, MAX(timestamp) as last_catch
FROM ip_activity
WHERE action = 'catch_validate'
AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
ORDER BY catches DESC
LIMIT 20;
```

### Find Suspicious Activity
```sql
-- More than 10 catches/minute
SELECT ip_address, wallet_address, COUNT(*) as count
FROM ip_activity
WHERE action = 'catch_validate'
AND timestamp > NOW() - INTERVAL '1 minute'
GROUP BY ip_address, wallet_address
HAVING COUNT(*) > 10;
```

## Ban Recommendations

### Ban a Wallet If:
- Confirmed exploit usage (refresh spam, etc)
- Multiple bot accounts from same wallet
- Draining treasury via known exploits
- TOS violations

### Ban an IP If:
- Bot farm detected (many wallets from one IP)
- Datacenter/VPN IPs with abnormal activity
- DDoS or abuse patterns

### Do NOT Ban:
- Single offense without confirmation
- Shared IPs (cafes, schools, offices)
- Users who report bugs/exploits
