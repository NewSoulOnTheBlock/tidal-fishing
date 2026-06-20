# 24-Hour Fish Raffle → Gacha Prize System

Players exchange caught fish for **weighted raffle tickets**. Bigger and rarer
fish are worth more tickets. Every 24 hours the raffle closes, a winner is
selected **automatically** by ticket weight, and an admin **manually** triggers
the Collector Crypt gacha purchase that delivers a real NFT prize to the
winner's wallet.

All money + ownership decisions are **server-authoritative**. The gacha API key
never reaches the browser.

## Lifecycle

```
active ──(endTime passes, scheduler)──▶ drawing ──▶ awaiting_fulfillment
                                                            │
                                            (admin: POST /api/raffle/fulfill)
                                                            ▼
                                                        completed
```

- **Automatic** (scheduler, no money): close the expired raffle, pick the
  weighted winner + prize machine, store the audit seed, open the next cycle.
- **Manual** (admin, real USDC): buy + open the Collector Crypt gacha pack and
  deliver the NFT to the winner. Set `RAFFLE_AUTO_FULFILL=true` to let the
  scheduler do this too (spends treasury USDC unattended — off by default).

## Ticket formula (server-side, `ticketCalculator.js`)

```
ticketValue = floor( (weightKg * 6 + sizeCm * 0.4) * rarityMultiplier )   // min 1
```

| Rarity | Multiplier |
|---|---|
| common | 1× |
| uncommon | 2× |
| rare | 5× |
| epic | 10× |
| legendary | 25× |
| mythic | 50× |
| ultramythic | 100× |

Recomputed from the server's own `catches` row at exchange time — the client
value is never trusted.

## Environment variables (server-side, set on Render)

| Var | Default | Purpose |
|---|---|---|
| `GACHA_API_KEY` | _(none)_ | Collector Crypt API key. **Server-only.** Without it, winners are still picked but fulfillment is disabled. |
| `GACHA_API_BASE` | `https://gacha.collectorcrypt.com` | Gacha host. Use `https://dev-gacha.collectorcrypt.com` for devnet testing. |
| `RAFFLE_DEFAULT_PACK` | `pokemon_50` | Fallback pack code if the `/machines` API is unreachable. |
| `RAFFLE_DEFAULT_PACK_NAME` | `Elite Pack` | Fallback pack display name. |
| `RAFFLE_DEFAULT_PACK_PRICE` | `50` | Fallback pack price (USDC). |
| `RAFFLE_DURATION_HOURS` | `24` | Raffle cycle length. |
| `RAFFLE_TICK_MS` | `300000` | Scheduler poll interval (ms, min 60000). |
| `RAFFLE_AUTO_FULFILL` | `false` | If `true`, the scheduler also executes the paid gacha purchase. |
| `USDC_MINT` | mainnet USDC | Mint the treasury pays packs from. |

Reuses existing server config: `TIDAL_TREASURY_SECRET` (the payer keypair),
`ADMIN_SECRET` (admin auth), `DATABASE_URL`, and the Solana RPC URL.

> **Funding:** because the gacha is a paid USDC mystery box, the **treasury
> wallet must hold USDC** on the configured network for fulfillment to succeed.
> The treasury is the payer; the NFT is routed to the winner via the gacha's
> `altPlayerAddress`. `fulfillRaffle` preflights the treasury USDC balance and
> returns `TREASURY_USDC_LOW` (HTTP 402, non-destructive, retryable) if short.

## API routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/raffle/current?wallet=` | public | Countdown, prize machine, totals, (+user tickets). |
| GET | `/api/raffle/history?limit=` | public | Past raffles + winners. |
| POST | `/api/raffle/exchange-fish` | session | Exchange a fish (`{ fishId }`) for tickets. |
| GET | `/api/raffle/user?wallet=` | session | This user's tickets, inventory, entries, wins. |
| POST | `/api/raffle/draw` | admin | Run the draw now (auto winner selection, **no spend**). |
| GET | `/api/raffle/admin/pending` | admin | Raffles awaiting manual fulfillment. |
| POST | `/api/raffle/fulfill` | admin | **Manual**: buy+open the gacha, deliver the NFT (`{ raffleId }`). |

Admin auth: pass `ADMIN_SECRET` as `adminKey` (body or `?adminKey=`) or the
`x-admin-key` header.

## Admin runbook

```bash
# 1. See which raffles have a winner but no prize yet:
curl "$API/api/raffle/admin/pending?adminKey=$ADMIN_SECRET"

# 2. (optional) Force-close an expired raffle right now (picks the winner):
curl -X POST "$API/api/raffle/draw" \
  -H 'content-type: application/json' -d "{\"adminKey\":\"$ADMIN_SECRET\"}"

# 3. Manually fulfill — spends treasury USDC, delivers the NFT to the winner:
curl -X POST "$API/api/raffle/fulfill" \
  -H 'content-type: application/json' \
  -d "{\"adminKey\":\"$ADMIN_SECRET\",\"raffleId\":42}"
```

## Player UI

The **Lucky Catch** tab in the in-game Shop (`src/ui/shop.js`): live 24h
countdown, prize pack, total/your tickets, win chance, exchangeable catch
inventory with per-fish ticket preview, recent winners, and a prize reveal when
the player has won.

## Files

| File | Role |
|---|---|
| `raffle/ticketCalculator.js` | Pure ticket math (tested). |
| `raffle/weightedWinnerSelector.js` | Pure, auditable weighted selection (tested). |
| `raffle/gachaMachineSelector.js` | Pure cheapest-per-card-type machine pick (tested). |
| `raffle/collectorsCryptApi.js` | Server-side Collector Crypt gacha client. |
| `raffle/raffleService.js` | Orchestration: schema, exchange, draw, fulfill. |
| `raffle/routes.js` | `installRaffleSystem(...)` — mounts routes + scheduler. |
| `test/*.test.mjs` | Unit tests for the pure modules (`npm test`). |
| `../src/web3/raffle.js` | Client API wrapper. |

## Tests

```bash
cd api-server && npm test   # node --test — ticket + winner + machine selection
```
