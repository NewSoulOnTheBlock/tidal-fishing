# TIDELINE — 3D Fishing Simulator

A complete, single-player 3D fishing game that runs in the browser. Built with
**Three.js (v0.170, loaded via CDN import map)** and vanilla ES modules —
**no build step, no npm install, no external assets**. Water, sky, fish,
scenery and every sound effect are generated procedurally at runtime.

**Play it now:** [bridge-mind.github.io/tideline](https://bridge-mind.github.io/tideline/)

Open source under the [MIT license](./LICENSE), shipped by [BridgeMind](https://github.com/bridge-mind).

## Run it locally

ES modules require a local web server (opening `index.html` via `file://` will not work):

```bash
cd fishing-simulator

# any one of these:
python3 -m http.server 8642
npx serve .
npx http-server -p 8642
```

Then open `http://localhost:8642` in a modern browser (Chrome, Edge, Firefox,
Safari 16.4+). The only network request is the Three.js CDN fetch on first load.

## How to play

| Action | Input |
|---|---|
| Aim | Move the mouse |
| Charge cast | Hold **Left Click** or **Space** |
| Cast | Release |
| Hook a bite | **Click** instantly when the bobber plunges and **!** appears |
| Reel | Hold **Click** — release during red **surges** or the line snaps |
| Retrieve bobber | Hold Click while waiting, or press **R** |
| Shop / Map / Journal | **B** / **M** / **J** (or the HUD buttons, while idle) |
| Pause | **Esc** |

**The loop:** cast → wait → hook → win the tension fight → earn cash & XP →
sell fish at the Shop → upgrade rod/reel/line/bait → unlock River Bend, the
Coastal Pier and the Deep Ocean → complete all 21 species in the Journal.

Tips:

- Long casts reach **deep water**, where rarer, bigger fish live.
- **Time of day matters** — salmon rise at dawn, swordfish only at night. The
  in-game day lasts 8 real minutes.
- Cloudy weather speeds up bites and nudges rare spawns.
- Watch the tension bar: reel in bursts, rest to recover, and never reel
  through a surge. Fish tire over time — outlast them.
- Progress (money, level, gear, locations, journal, time of day) saves to
  `localStorage` automatically; reset from the menu or settings.

## Architecture

```
index.html            canvas + HUD/menu DOM + CDN import map
styles.css            all UI styling
src/
  main.js             bootstrap, game loop, FSM wiring, input routing
  core/               renderer/scene/lights, game clock, camera rig
  world/              Water + Sky (official Three.js examples), per-location
                      environments, pooled particles (splash/ripple/motes/birds)
  gameplay/           casting + rod rig + line, bobber physics, bite system,
                      reel-fight minigame
  fish/               procedural fish mesh factory, spawn weighting
  economy/            money, XP/levels, selling, gear purchases, unlocks
  data/               config (all tuning constants), fish/gear/location tables
  ui/                 HUD, menus, shop, journal, map, catch card (DOM-driven)
  audio/              Web Audio procedural synth (ambience + all cues)
  state/              central game state, explicit state machine, save/load
  utils/              math/random/easing/format helpers, event bus
```

Game phases are explicit FSM states: `MENU, IDLE, CHARGING, FLYING, WAITING,
BITE, REELING, CATCH, RETRIEVING, SHOP, JOURNAL, MAP` (pause is an overlay
flag so resuming never re-enters a phase). All balance numbers live in
`src/data/config.js` and the data tables in `src/data/`.

## Content

- **21 fish species** across Common / Uncommon / Rare / Epic / Legendary,
  each with its own silhouette, colors, size/weight ranges, value, preferred
  location, depth zone, time of day and fight profile.
- **4 locations** — Calm Lake, River Bend, Coastal Pier, Deep Ocean — with
  distinct water color, sky mood, fog, scenery, ambience and spawn tables.
- **4 gear categories × 4 tiers** — rods (cast distance + fight control),
  reels (reel speed), lines (snap resistance), bait (bite speed + rarity bias).
- Day/night cycle with dawn/day/dusk/night fish behavior, drifting weather,
  star fields, moonlit nights, bird flocks and fireflies.
- Persistent journal with per-species catch counts and size records.

## Performance notes

- One reflection pass (Three.js `Water`) is the main GPU cost; the Low quality
  setting halves the reflection texture, disables shadows and caps pixel ratio.
- All particles are pooled; geometries/materials are shared where possible and
  disposed on location switches.

## Contributing & license

MIT — see [LICENSE](./LICENSE). Issues and pull requests are welcome: balance
tweaks live in `src/data/config.js`, new species in `src/data/fishData.js`,
and new fishing spots in `src/data/locationData.js` plus an environment
builder in `src/world/environment.js`.
