// TIDAL — bootstrap, game loop, state machine wiring and input routing.
// Forked from bridge-mind/tideline. Now Web3-native on Solana mainnet.

import * as THREE from "three";
import { CONFIG } from "./data/config.js";
import { LOCATION_BY_ID } from "./data/locationData.js";
import { S, events, machine, Phase, isGameplayPhase } from "./state/gameState.js";
import { loadGame, saveGame, resetSave, setWalletSlot } from "./state/saveLoad.js";
import { audio } from "./audio/audioManager.js";
import { createCore } from "./core/scene.js";
import { GameClock } from "./core/time.js";
import { CameraRig } from "./core/cameraRig.js";
import { WaterSurface } from "./world/water.js";
import { SkySystem } from "./world/sky.js";
import { EnvironmentManager } from "./world/environment.js";
import { Effects } from "./world/effects.js";
import { CastingSystem } from "./gameplay/casting.js";
import { Bobber } from "./gameplay/bobber.js";
import { BiteSystem } from "./gameplay/biteSystem.js";
import { ReelFight } from "./gameplay/reelMinigame.js";
import * as economy from "./economy/economy.js";
import { HUD } from "./ui/hud.js";
import { Screens } from "./ui/screens.js";
import { ShopUI } from "./ui/shop.js";
import { JournalUI } from "./ui/journal.js";
import { MapUI } from "./ui/map.js";
import { CatchCard } from "./ui/catchCard.js";
import { WalletPanel } from "./ui/walletPanel.js";
import { JournalUI as ProgressionJournalUI } from "./ui/journalUI.js";
// import { DailyLoginUI } from "./ui/dailyLoginUI.js"; // DISABLED - daily rewards removed
import { ChallengesUI } from "./ui/challengesUI.js";
import { AchievementsUI } from "./ui/achievementsUI.js";
import { WeatherUI } from "./ui/weatherUI.js";
import { ProfileUI } from "./ui/profileUI.js";
import { LeaderboardUI } from "./ui/leaderboardUI.js";
import { TournamentUI } from "./ui/tournamentUI.js";
import { onChange as onWalletChange } from "./web3/wallet.js";
import { recordCatchToDB } from "./web3/databaseIntegration.js";
import { shortAddress } from "./web3/solana.js";
import { lerp, randRange, projectToScreen } from "./utils/utils.js";
import { initJournal } from "./progression/journal.js";
// import { initDailyLogin, checkDailyLogin } from "./progression/dailyLogin.js"; // DISABLED - daily rewards removed
import { initChallenges, rollDailyChallenges, updateChallengeProgress } from "./progression/challenges.js";
import { initAchievements } from "./progression/achievements.js";
import { initWeather } from "./progression/weather.js";
import { initTournament } from "./progression/tournament.js";

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

loadGame();

// Initialize progression systems
S.progressionJournal = initJournal(S);
// S.dailyLogin = initDailyLogin(S); // DISABLED - daily rewards removed
S.challenges = initChallenges(S);
S.achievements = initAchievements(S);
S.weather = initWeather(S);
S.tournament = initTournament(S);

// Roll daily challenges for today
rollDailyChallenges(S.challenges);

// Daily login check DISABLED - no more daily rewards
// const dailyCheck = checkDailyLogin(S.dailyLogin);
// if (dailyCheck.canClaim) {
//   setTimeout(() => {
//     const dailyUI = new DailyLoginUI();
//     dailyUI.show();
//   }, 2000);
// }

const container = document.getElementById("canvas-wrap");
const core = createCore(container);
const { renderer, scene, camera } = core;

const gclock = new GameClock(S.world.hour);
const rig = new CameraRig(camera);
const water = new WaterSurface(scene, S.settings.quality);
const sky = new SkySystem(scene, renderer, core.sunLight, core.hemiLight, core.ambient, water);
const env = new EnvironmentManager(scene);
const effects = new Effects(scene);
const casting = new CastingSystem(scene);
const bobber = new Bobber(scene, effects);
const bite = new BiteSystem(
  () => ({
    location: currentLoc(),
    hours: gclock.hours,
    weather: S.world.weather,
    bait: economy.getStats().bait,
  }),
  bobber
);
const fight = new ReelFight(scene, effects, audio);

const hud = new HUD();
const catchCard = new CatchCard();
const walletPanel = new WalletPanel();
const shopUI = new ShopUI(() => machine.set(Phase.IDLE));
const journalUI = new JournalUI(() => machine.set(Phase.IDLE));
const mapUI = new MapUI(
  () => machine.set(Phase.IDLE),
  (locId) => {
    travelTo(locId);
    machine.set(Phase.IDLE);
  }
);

// New progression UIs
const progressionJournalUI = new ProgressionJournalUI();
const achievementsUI = new AchievementsUI();
const challengesUI = new ChallengesUI();
const weatherUI = new WeatherUI(scene);
const profileUI = new ProfileUI();
const leaderboardUI = new LeaderboardUI();
const tournamentUI = new TournamentUI();

// Initialize weather and challenges widgets
weatherUI.init();
challengesUI.init();
achievementsUI.init();
tournamentUI.init();

const screens = new Screens({
  onPlay: () => machine.set(Phase.IDLE),
  onResume: () => setPaused(false),
  onQuitToMenu: () => {
    saveGame();
    setPaused(false);
    machine.set(Phase.MENU);
    hud.toast("Progress saved", "success");
  },
  onResetSave: () => {
    resetSave();
    applySettings();
    travelTo(S.world.current, true);
    gclock.hours = S.world.hour;
    screens.showMenu(false);
    if (machine.current !== Phase.MENU) machine.set(Phase.MENU);
    hud.refreshAll();
    hud.toast("Save erased — fresh logbook ready", "warn");
  },
  onQualityChange: (q) => {
    core.setQuality(q);
    water.setQuality(q);
    saveGame();
  },
});

const currentLoc = () => LOCATION_BY_ID[S.world.current] ?? LOCATION_BY_ID.lake;

function applySettings() {
  audio.setVolume(S.settings.volume);
  audio.setMuted(S.settings.muted);
  core.setQuality(S.settings.quality);
  water.setQuality(S.settings.quality);
}

function travelTo(locId, silent = false) {
  const loc = LOCATION_BY_ID[locId] ?? LOCATION_BY_ID.lake;
  S.world.current = loc.id;
  bite.cancel();
  bobber.hide();
  if (fight.active) fight.end();
  env.load(loc);
  casting.attachTo(env.playerSpot);
  rig.setAnchor(env.playerSpot);
  water.setParams(loc.water);
  effects.setLocationAmbient(loc);
  audio.setAmbience(loc.ambience, gclock.segment);
  hud.updateLocation();
  events.emit("location", { id: loc.id });
  if (!silent) {
    saveGame();
    hud.toast(`Now fishing: ${loc.name}`);
  }
}

// ---------------------------------------------------------------------------
// pause (an overlay flag, not a phase — resuming never re-enters a phase)
// ---------------------------------------------------------------------------

let paused = false;

function setPaused(on) {
  if (paused === on) return;
  if (on && !isGameplayPhase(machine.current)) return;
  paused = on;
  if (on) {
    fight.setReeling(false);
    inputHeld = false;
    screens.showPause();
    saveGame();
  } else {
    screens.hideAll();
  }
}

// ---------------------------------------------------------------------------
// state machine
// ---------------------------------------------------------------------------

machine.register(Phase.MENU, {
  enter() {
    bite.cancel();
    bobber.hide();
    if (fight.active) fight.end();
    casting.setBend(0);
    casting.setLineTension(0);
    hud.hide();
    rig.setMode("menu");
    screens.showMenu(S.stats.catches > 0 || S.profile.money !== CONFIG.economy.startMoney || S.profile.level > 1);
  },
});

machine.register(Phase.IDLE, {
  enter() {
    screens.hideAll();
    shopUI.close();
    journalUI.close();
    mapUI.close();
    bite.cancel();
    bobber.hide();
    casting.setBend(0);
    casting.setLineTension(0);
    rig.setMode("play");
    rig.setFocus(null);
    hud.show();
    hud.setClock(gclock.hours, gclock.segment);
  },
});

machine.register(Phase.CHARGING, {
  enter() {
    casting.beginCharge();
    hud.showPower(true);
  },
  exit() {
    hud.showPower(false);
    rig.setFovPulse(0);
  },
});

machine.register(Phase.FLYING, {
  enter() {
    S.stats.casts += 1;
    audio.play("whoosh");
  },
});

machine.register(Phase.WAITING, {});

machine.register(Phase.BITE, {});

machine.register(Phase.REELING, {
  enter({ fish }) {
    bobber.hide();
    hud.showReel(true, fish);
    fight.start(fish, lastBobberPos.clone(), env.playerSpot, economy.getStats());
    fight.setReeling(inputHeld);
    rig.setFocus(fight.fishPoint);
    audio.play("hook");
  },
  exit() {
    rig.setFocus(null);
    casting.setBend(0);
    casting.setLineTension(0);
    hud.showReel(false);
  },
});

machine.register(Phase.CATCH, {});

machine.register(Phase.RETRIEVING, {
  enter() {
    bite.cancel();
    bobber.startRetrieve();
  },
});

machine.register(Phase.SHOP, {
  enter(data) {
    shopUI.open(data?.tab ?? "rods");
  },
  exit() {
    shopUI.close();
  },
});

machine.register(Phase.JOURNAL, {
  enter() {
    journalUI.open();
  },
  exit() {
    journalUI.close();
  },
});

machine.register(Phase.MAP, {
  enter() {
    mapUI.open();
  },
  exit() {
    mapUI.close();
  },
});

// ---------------------------------------------------------------------------
// gameplay event wiring
// ---------------------------------------------------------------------------

const lastBobberPos = new THREE.Vector3();

events.on("bobber:landed", ({ distance, zone }) => {
  audio.play("splash", { strength: 0.9 });
  hud.setZone(`${CONFIG.zones.labels[zone]} waters · ${Math.round(distance)}m out`);
  bite.begin(zone);
  machine.set(Phase.WAITING);
});

events.on("bobber:retrieved", () => {
  machine.set(Phase.IDLE);
});

events.on("bite:nibble", () => {
  audio.play("plip");
  effects.ripple(bobber.pos, 1.5, 0.8);
});

events.on("bite:start", () => {
  lastBobberPos.copy(bobber.pos);
  audio.play("bite");
  hud.shake();
  rig.addShake(0.3);
  effects.splash(bobber.pos, 0.7);
  effects.ripple(bobber.pos, 2.2, 0.9);
  machine.set(Phase.BITE);
});

events.on("bite:missed", () => {
  hud.toast("Too slow — it spat the hook...", "warn");
  audio.play("escape");
  machine.set(Phase.WAITING);
});

events.on("bite:hooked", ({ fish, isPerfect }) => {
  lastBobberPos.copy(bobber.pos);
  
  // Track perfect hooks
  if (isPerfect) {
    S.stats.perfectHooks = (S.stats.perfectHooks || 0) + 1;
    
    // Update challenges with perfect hook event
    if (S.challenges) {
      const completed = updateChallengeProgress(S.challenges, {
        type: 'hook',
        perfectHook: true,
      });
      if (completed) events.emit("challenge:complete");
    }
  }
  
  machine.set(Phase.REELING, { fish });
});

events.on("fight:update", (data) => {
  hud.updateFight(data);
  casting.setLineTension(data.tension / 100);
  casting.setBend(0.25 + (data.tension / 100) * 0.75);
  if (data.surge === "active") rig.addShake(0.018);
});

events.on("fight:snap", () => {
  S.stats.snaps += 1;
  audio.play("snap");
  hud.shake();
  rig.addShake(0.5);
  hud.toast("SNAP! The line broke — it got away.", "warn");
  machine.set(Phase.IDLE);
});

events.on("fight:escape", ({ reason }) => {
  audio.play("escape");
  hud.toast(reason, "warn");
  machine.set(Phase.IDLE);
});

events.on("fight:landed", async ({ fish }) => {
  const result = await economy.registerCatch(fish);
  rig.addShake(0.25);
  machine.set(Phase.CATCH);
  catchCard.show(fish, result, () => machine.set(Phase.IDLE));
});

events.on("gear", () => {
  casting.castMult = economy.getStats().castMult;
});
casting.castMult = economy.getStats().castMult;

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

let inputHeld = false;
let waitingHoldT = 0;
let spaceHeld = false;

function pressDown() {
  if (paused) return;
  audio.init();
  switch (machine.current) {
    case Phase.IDLE:
      machine.set(Phase.CHARGING);
      break;
    case Phase.BITE:
      bite.hookAttempt();
      break;
    case Phase.REELING:
      fight.setReeling(true);
      break;
    default:
      break;
  }
}

function pressUp() {
  if (paused) return;
  switch (machine.current) {
    case Phase.CHARGING: {
      const power = casting.endCharge();
      const { origin, velocity } = casting.computeLaunch(power, economy.getStats().castMult);
      bobber.launch(origin, velocity, env.playerSpot);
      machine.set(Phase.FLYING);
      break;
    }
    case Phase.REELING:
      fight.setReeling(false);
      break;
    default:
      break;
  }
}

container.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  inputHeld = true;
  waitingHoldT = 0;
  pressDown();
});

window.addEventListener("pointerup", (e) => {
  if (e.button !== 0) return;
  if (!inputHeld) return;
  inputHeld = false;
  waitingHoldT = 0;
  pressUp();
});

window.addEventListener("pointermove", (e) => {
  casting.setPointerX(e.clientX / window.innerWidth);
});

window.addEventListener("contextmenu", (e) => {
  if (e.target.closest("#canvas-wrap")) e.preventDefault();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") e.preventDefault();
  if (e.repeat) return;

  switch (e.code) {
    case "Space":
      if (catchCard.active) return; // the card handles its own dismissal
      spaceHeld = true;
      inputHeld = true;
      waitingHoldT = 0;
      pressDown();
      break;
    case "KeyR":
      if (!paused && machine.is(Phase.WAITING)) machine.set(Phase.RETRIEVING);
      break;
    case "KeyM":
      toggleScreen(Phase.MAP);
      break;
    case "KeyB":
      toggleScreen(Phase.SHOP);
      break;
    case "KeyJ":
      toggleScreen(Phase.JOURNAL);
      break;
    case "KeyC":
      // Open fish collection journal
      if (!paused && isGameplayPhase(machine.current)) {
        progressionJournalUI.show();
      }
      break;
    case "KeyA":
      // Open achievements
      if (!paused && isGameplayPhase(machine.current)) {
        achievementsUI.show();
      }
      break;
    case "KeyP":
      // Open Profile
      if (!paused && isGameplayPhase(machine.current)) {
        audio.init();
        audio.play("click");
        profileUI.show();
      }
      break;
    case "KeyL":
      // Open leaderboard
      if (!paused && isGameplayPhase(machine.current)) {
        leaderboardUI.show();
      }
      break;
    case "KeyT":
      // Tournament info - widget is always visible when relevant
      // This key could show a detailed tournament history modal in future
      break;
    case "Escape":
      handleEscape();
      break;
    default:
      break;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && spaceHeld) {
    spaceHeld = false;
    inputHeld = false;
    waitingHoldT = 0;
    pressUp();
  }
});

function toggleScreen(phase) {
  if (paused) return;
  if (machine.is(phase)) {
    audio.play("click");
    machine.set(Phase.IDLE);
  } else if (machine.is(Phase.IDLE)) {
    audio.init();
    audio.play("click");
    machine.set(phase);
  }
}

function handleEscape() {
  if (catchCard.active) return;
  if (paused) {
    setPaused(false);
    return;
  }
  switch (machine.current) {
    case Phase.MENU:
      break;
    case Phase.CHARGING:
      casting.cancelCharge();
      machine.set(Phase.IDLE);
      break;
    case Phase.SHOP:
    case Phase.JOURNAL:
    case Phase.MAP:
      machine.set(Phase.IDLE);
      break;
    default:
      if (isGameplayPhase(machine.current)) setPaused(true);
      break;
  }
}

document.getElementById("btn-map").addEventListener("click", () => toggleScreen(Phase.MAP));
document.getElementById("btn-shop").addEventListener("click", () => toggleScreen(Phase.SHOP));
document.getElementById("btn-journal").addEventListener("click", () => toggleScreen(Phase.JOURNAL));
document.getElementById("btn-profile").addEventListener("click", () => {
  if (!paused && isGameplayPhase(machine.current)) {
    audio.init();
    audio.play("click");
    profileUI.show();
  }
});
document.getElementById("btn-pause").addEventListener("click", () => {
  audio.play("click");
  setPaused(true);
});
document.getElementById("hud-bag").addEventListener("click", () => {
  if (machine.is(Phase.IDLE)) {
    audio.play("click");
    machine.set(Phase.SHOP, { tab: "sell" });
  }
});

window.addEventListener("pointerdown", () => audio.init(), { once: true });

// ---------------------------------------------------------------------------
// weather
// ---------------------------------------------------------------------------

let weatherTimer = randRange(...CONFIG.weather.changeEvery);
let cloudFactor = S.world.weather === "cloudy" ? 1 : 0;

function updateWeather(dt) {
  weatherTimer -= dt;
  if (weatherTimer <= 0) {
    weatherTimer = randRange(...CONFIG.weather.changeEvery);
    const next = Math.random() < CONFIG.weather.cloudyChance ? "cloudy" : "clear";
    if (next !== S.world.weather) {
      S.world.weather = next;
      events.emit("weather", { weather: next });
    }
  }
  const target = S.world.weather === "cloudy" ? 1 : 0;
  cloudFactor = lerp(cloudFactor, target, 1 - Math.exp(-0.35 * dt));
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------

const clock3 = new THREE.Clock();
let autosaveT = 0;
let lastMinute = -1;
let lastSegment = "";
const biteScreenPos = { x: 0, y: 0 };

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock3.getDelta(), 0.05);
  const phase = machine.current;
  const gameplay = isGameplayPhase(phase) && !paused;

  if (gameplay) {
    gclock.advance(dt);
    S.world.hour = gclock.hours;
    updateWeather(dt);

    autosaveT += dt;
    if (autosaveT >= CONFIG.autosaveEvery) {
      autosaveT = 0;
      saveGame();
    }
  }

  // clock display + ambience mood follow the in-game time
  const minute = Math.floor(gclock.hours * 60);
  if (minute !== lastMinute) {
    lastMinute = minute;
    if (!hud.root.classList.contains("hidden")) hud.setClock(gclock.hours, gclock.segment);
  }
  if (gclock.segment !== lastSegment) {
    lastSegment = gclock.segment;
    audio.setAmbienceSegment(lastSegment);
  }

  // world always breathes, even behind menus
  water.update(dt);
  sky.update(gclock.hours, cloudFactor, currentLoc());
  effects.update(dt, camera, gclock.segment);

  if (!paused) {
    const aiming = phase === Phase.IDLE || phase === Phase.CHARGING;
    casting.update(dt, { aiming, previewVisible: aiming });

    switch (phase) {
      case Phase.CHARGING:
        hud.setPower(casting.power);
        rig.setFovPulse(casting.power);
        break;
      case Phase.FLYING:
        bobber.update(dt);
        break;
      case Phase.WAITING:
        bobber.update(dt);
        bite.update(dt);
        if (inputHeld) {
          waitingHoldT += dt;
          if (waitingHoldT >= CONFIG.bite.retrieveHoldTime) {
            waitingHoldT = 0;
            inputHeld = false;
            machine.set(Phase.RETRIEVING);
          }
        }
        break;
      case Phase.BITE: {
        bobber.update(dt);
        bite.update(dt);
        const p = projectToScreen(bobber.pos, camera, window.innerWidth, window.innerHeight, biteScreenPos);
        hud.positionBite(p);
        break;
      }
      case Phase.RETRIEVING:
        bobber.update(dt);
        break;
      case Phase.REELING:
        fight.update(dt);
        audio.reelTick(dt, fight.reeling, economy.getStats().reelSpeed);
        if (fight.active && fight.phase === "fight") {
          casting.aimAtPoint(fight.fishPoint);
        }
        break;
      default:
        break;
    }
  }

  // the fishing line follows whatever is on the end of it
  if (bobber.mode !== "hidden") casting.setLineTarget(bobber.pos);
  else if (fight.active) casting.setLineTarget(fight.phase === "landing" && fight.fishMesh ? fight.fishMesh.position : fight.fishPoint);
  else casting.setLineTarget(null);

  rig.setAimYaw(casting.aimYaw);
  rig.update(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// wallet ↔ save slot
//
// When a wallet connects: persist the current (possibly anonymous) progress,
// then switch the active save slot to that wallet's localStorage namespace.
// New wallets inherit the local anonymous save on first connection so players
// don't feel they've lost progress by signing in.
// ---------------------------------------------------------------------------

let prevWalletAddr = null;
onWalletChange(({ account }) => {
  const addr = account?.address ?? null;
  if (addr === prevWalletAddr) return; // initial subscribe fires with null; ignore
  prevWalletAddr = addr;

  const had = setWalletSlot(addr);
  applySettings();
  travelTo(S.world.current, true);
  gclock.hours = S.world.hour;
  hud.refreshAll();
  if (machine.current !== Phase.MENU) {
    if (addr) {
      hud.toast(had ? `Loaded save for ${shortAddress(addr)}` : `New save bound to ${shortAddress(addr)}`, "success");
    } else {
      hud.toast("Disconnected — playing on local save", "warn");
    }
  }
});

// ---------------------------------------------------------------------------
// go
// ---------------------------------------------------------------------------

applySettings();
travelTo(S.world.current, true);
machine.set(Phase.MENU);

window.addEventListener("beforeunload", () => saveGame());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveGame();
});

tick();
requestAnimationFrame(() => {
  document.getElementById("boot-loader")?.remove();
});

// small debug handle (used by automated smoke tests; harmless in production)
window.TIDAL = { S, machine, version: 1, walletPanel };
window.TIDELINE = window.TIDAL; // back-compat for any external smoke test scripts
