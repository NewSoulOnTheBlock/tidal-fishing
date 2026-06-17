# TIDAL — Web3 fishing on Solana

A 3D fishing game where every fish you sell pays **$TIDE**, every rod or fishing
spot is unlockable with **$TIDE**, and your progress is bound to your **Solana
wallet**. Built on Solana mainnet.

**Play it now:** https://tidal-theta-tawny.vercel.app

Forked from [bridge-mind/tideline](https://github.com/bridge-mind/tideline)
(Three.js procedural fishing sim, MIT). Tidal adds:

- Wallet Standard connect (Phantom / Solflare / Backpack / etc.) — vanilla, no React
- $TIDE economy — gear and locations cost $TIDE, fish sell for $TIDE
- Wallet-bound saves — each wallet gets its own progress slot
- Optional on-chain $TIDE payment flow for gear & locations (gated by env vars)
- Vite build pipeline, code-split chunks, Vercel deployment

## Run locally

```bash
npm install
npm run dev       # http://localhost:8642
```

Build & preview the production bundle:

```bash
npm run build
npm run preview   # http://localhost:8643
```

Headless smoke test (uses Puppeteer):

```bash
npm install puppeteer
npm run smoke                                  # smokes the preview server
node smoke.mjs https://tidal-theta-tawny.vercel.app/   # smokes the deploy
```

## Environment

All env vars are optional. Set them in `.env.local` for dev, or in the Vercel
project settings for production. See [`.env.example`](./.env.example).

| Var | What it does |
|---|---|
| `VITE_SOLANA_RPC_URL` | Custom mainnet RPC (Helius / QuickNode / Triton / Alchemy). Strongly recommended — the public endpoint rate-limits aggressively. |
| `VITE_TIDE_MINT` | $TIDE SPL token mint address. Until set, the wallet panel shows `—` for $TIDE balance and the burn buttons stay hidden. When set, gear & map UIs render a `🔥 Burn N $TIDE` button beside the regular Buy/Unlock button. |
| `VITE_TIDE_DECIMALS` | Decimals of the $TIDE mint (default 9, matching SOL). |
| `VITE_CATCH_TREE` | (Phase 3) Bubblegum tree for catch cNFTs. |
| `VITE_GEAR_COLLECTION` | (Phase 3) Verified collection for gear NFTs. |

## Architecture

```
index.html                 root HTML + DOM scaffold + boot loader + favicon
vite.config.js             Vite + chunk splitting (three / solana / wallet)
vercel.json                build & cache headers for Vercel
src/
  main.js                  bootstrap, game loop, state machine, input
  core/                    renderer, scene, lights, game clock, camera rig
  world/                   Water + Sky, per-location envs, pooled particles
  gameplay/                casting, bobber physics, bite system, reel fight
  fish/                    procedural fish meshes + spawn weighting
  economy/                 money, XP, gear purchases, location unlocks
  data/                    config + fish/gear/location tables
  ui/                      HUD, screens, shop, map, journal, catch card,
                           walletPanel
  audio/                   Web Audio synth (ambience + cues)
  state/                   gameState, save/load with wallet-bound slots
  utils/                   math / format / event bus
  web3/                    solana RPC client, wallet (Wallet Standard),
                           token reads, on-chain $TIDE payment builder
```

Game phases (explicit FSM): `MENU, IDLE, CHARGING, FLYING, WAITING, BITE,
REELING, CATCH, RETRIEVING, SHOP, JOURNAL, MAP`. Pause is an overlay flag.

### Save slots

When a wallet connects, the active save key switches from `tidal_save_v1` to
`tidal_save_v1:<wallet_address>`. The anonymous local save is migrated into a
new wallet's slot on first connection so signing in never feels like a wipe.

### On-chain $TIDE payments (deflationary burn)

When `VITE_TIDE_MINT` is set and a wallet is connected, gear and location
unlocks render a `🔥 Burn N $TIDE` button beside the regular Buy/Unlock
button. The on-chain path:

1. Reads the player's on-chain $TIDE balance and verifies they have enough.
2. Builds an SPL Token `Burn` instruction targeting the player's own ATA
   (no treasury — burned $TIDE leaves circulation permanently).
3. Attaches a memo identifying the purchase (`tidal:gear:rods:2`, `tidal:loc:river`).
4. Asks the wallet to sign and send (preferring `signAndSendTransaction`).
5. On confirmation, calls `economy.grantGearOnChain` / `grantLocationOnChain`
   which grant the item **without** deducting the in-game $TIDE balance and
   record the tx signature in `S.onchain.purchases` for audit.

The in-game $TIDE balance and the on-chain $TIDE balance are deliberately
**independent** in Phase 2 — both can purchase the same gear/locations but
they're two separate currencies until the Phase 3 bridge ships. Every
on-chain purchase reduces total supply (deflationary).

## Roadmap

### Phase 1 — Foundation ✅
- Vite build, mainnet RPC config, wallet connect, wallet-bound saves, $TIDE
  branding, Vercel deploy.

### Phase 2 — On-chain spend ✅ (this commit)
- `🔥 Burn N $TIDE` for gear & locations (dormant until `VITE_TIDE_MINT` set).
- SPL Token Burn instruction + memo + audit trail in save. Deflationary —
  every purchase permanently reduces $TIDE supply.

### Phase 3 — Token deployment & catch NFTs
- Deploy the $TIDE SPL token (Token-2022 + metadata extension).
- Bridge: claim button to mint in-game $TIDE → on-chain $TIDE.
- Bubblegum tree for catch cNFTs. Rare / epic / legendary mints auto-claim.
- Gear NFTs minted when player purchases tier-2+ gear.

### Phase 4 — Multiplayer & marketplace
- Tensor / Magic Eden links to list & buy gear and catch NFTs.
- On-chain leaderboard (biggest catch, most species).
- Optional jackpot pool — % of every sale funds a weekly biggest-catch prize.

## Security notes

- Phase 1 + 2 **only** read on-chain data and (when explicitly configured) sign
  user-initiated payment transfers. There is no embedded signer, no autonomous
  signing, and no token/NFT minting from client code yet.
- Production deployments should use a private RPC. The public mainnet endpoint
  enforces low rate limits and will throttle balance reads under any load.
- Treasury authority should live behind a multisig (e.g. Squads) — never an
  EOA whose key sits on a laptop.

## License

MIT — see [LICENSE](./LICENSE). Original tideline by [BridgeMind](https://github.com/bridge-mind).
