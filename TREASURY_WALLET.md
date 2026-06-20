# Tidal Treasury Wallet Configuration

## $TIDE Token Contract
```
CiNiAdT5ongCHFJDv1ewoxMWCL1C4dt6Ua9KGRsmpump
```

## Treasury Wallet Address
```
CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror
```

This wallet holds the $TIDE token reserves that users can withdraw to their connected wallets.

## How It Works

### 1. **In-Game Earnings**
   - Users earn $TIDE by catching fish, completing challenges, tournaments, etc.
   - Earnings are tracked in-game as `S.profile.money`

### 2. **Withdrawal System**
   - **UI Location**: Wallet panel (top-right corner) when connected
   - **Button**: "Withdraw X $TIDE" appears when `S.profile.money > 0`
   - **Process**: Calls `/api/withdraw` endpoint with recipient address

### 3. **On-Chain Transfer**
   - Treasury wallet sends actual $TIDE SPL tokens to user's wallet
   - Transaction is signed server-side (treasury private key never reaches browser)
   - User sees tx confirmation in Solscan/Solana Explorer

### 4. **Balance Deduction**
   - After successful on-chain transfer, in-game balance is deducted
   - User receives toast notification with transaction signature link

## Configuration

The $TIDE token mint and treasury wallet are configured in `src/web3/solana.js`:

```javascript
// $TIDE Token Contract Address
export const TIDE_MINT = parsePubkeyOrNull(
  import.meta.env.VITE_TIDE_MINT || 
  "CiNiAdT5ongCHFJDv1ewoxMWCL1C4dt6Ua9KGRsmpump"
);

// Treasury Wallet Address
export const TIDE_TREASURY = parsePubkeyOrNull(
  import.meta.env.VITE_TIDE_TREASURY || 
  "CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror"
);
```

### Environment Variable Override

To use different addresses (e.g., for testing), set:

```bash
VITE_TIDE_MINT=<your_test_token_mint>
VITE_TIDE_TREASURY=<your_test_wallet_address>
```

## Security Notes

⚠️ **CRITICAL**: The treasury private key must be stored securely:
- **Never** commit private keys to git
- Use environment variables (`TREASURY_PRIVATE_KEY`) in production
- Store in `.env.local` (gitignored) for local development
- Use Vercel environment variables for production deployment

## Server-Side Implementation

The withdrawal endpoint (`/api/withdraw`) needs to:

1. Verify the request (recipient address, amount)
2. Check treasury has sufficient $TIDE balance
3. Create transfer instruction (treasury → recipient)
4. Sign transaction with treasury private key
5. Send transaction to Solana network
6. Return signature to client

## Example Withdrawal Flow

```
User clicks "Withdraw 1,000 $TIDE"
    ↓
Client → POST /api/withdraw { recipient, amount: 1000 }
    ↓
Server verifies treasury has 1,000+ $TIDE
    ↓
Server creates & signs transfer transaction
    ↓
Server sends tx to Solana mainnet
    ↓
Server returns signature
    ↓
Client deducts 1,000 from S.profile.money
    ↓
Client shows success toast with tx link
```

## Treasury Monitoring

**$TIDE Token Contract:**
- Solscan: https://solscan.io/token/CiNiAdT5ongCHFJDv1ewoxMWCL1C4dt6Ua9KGRsmpump
- Solana Explorer: https://explorer.solana.com/address/CiNiAdT5ongCHFJDv1ewoxMWCL1C4dt6Ua9KGRsmpump
- DexScreener: https://dexscreener.com/solana/CiNiAdT5ongCHFJDv1ewoxMWCL1C4dt6Ua9KGRsmpump

**Treasury Wallet Balance:**
- Solscan: https://solscan.io/account/CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror
- Solana Explorer: https://explorer.solana.com/address/CYV4qsTPCDNfo9acpL7ni9jTzxZoZLbkjSQ7C25smror

**Fund the treasury:**
1. Transfer SOL for transaction fees (~0.01 SOL per 1000 withdrawals)
2. Transfer $TIDE tokens to cover user withdrawals
3. Monitor balance to ensure withdrawals never fail

## Testing

### Local Testing:
1. Set `VITE_TIDE_MINT` to your test token mint
2. Set `VITE_TIDE_TREASURY` to your test wallet
3. Fund test treasury with test tokens
4. Connect wallet and earn $TIDE in-game
5. Click withdraw button and verify transaction

### Production Checklist:
- [ ] Treasury wallet funded with $TIDE tokens
- [ ] Treasury wallet has SOL for tx fees (min 0.1 SOL)
- [ ] Treasury private key stored securely
- [ ] `/api/withdraw` endpoint deployed
- [ ] Withdrawal button appears in wallet panel
- [ ] Test withdrawal with small amount
- [ ] Monitor transaction on Solscan

## Support

If withdrawals fail, check:
1. Treasury has sufficient $TIDE balance
2. Treasury has sufficient SOL for fees
3. User's wallet has associated token account (auto-created if not)
4. Solana network is not congested (check status.solana.com)
5. Server logs for error details
