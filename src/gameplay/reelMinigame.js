// The reel-in fight: tension vs catch-progress with telegraphed surges, fish
// fatigue, gear modifiers, a wandering fight point on the water, leaping fish
// during surges, and the final landing arc into the boat/dock.

import * as THREE from "three";
import { CONFIG } from "../data/config.js";
import { events } from "../state/gameState.js";
import { FISH_BY_ID } from "../data/fishData.js";
import { createFishMesh } from "../fish/fishFactory.js";
import { clamp, lerp, randRange } from "../utils/utils.js";

const WATER_Y = CONFIG.water.level;

export class ReelFight {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.active = false;
    this.phase = "idle"; // idle | fight | landing
    this.fishPoint = new THREE.Vector3();
    this.playerSpot = new THREE.Vector3();
    this.fishMesh = null;
  }

  /**
   * @param {object} fish   rolled fish instance
   * @param {Vector3} startPos bobber position when hooked
   * @param {Vector3} playerSpot
   * @param {object} stats { reelSpeed, lineStrength, control }
   */
  start(fish, startPos, playerSpot, stats, opts = {}) {
    const R = CONFIG.reel;
    this.fish = fish;
    this.stats = stats;
    this.playerSpot.copy(playerSpot);
    this.active = true;
    this.phase = "fight";
    this.t = 0;
    this.reeling = false;
    this.perfect = !!opts.perfect;
    this.tension = this.perfect ? R.perfectStartTension : R.startTension;
    this.progress = R.startProgress + (this.perfect ? R.perfectProgressBonus : 0);
    this.graceT = this.perfect ? R.perfectGrace : 0; // post-perfect surge immunity

    // active surge-dodge state
    this.dodgeArmed = false; // a dodge tap is accepted during the telegraph
    this.dodged = false; // the upcoming surge was dodged
    this.surgeSoften = 1; // <1 while an active surge is softened by a dodge

    // near-snap save state
    this.snapArmed = false; // tension crossed 100; save window is open
    this.snapTimer = 0;
    this.savesLeft = R.snapSavesPerFight;

    const dx = startPos.x - playerSpot.x;
    const dz = startPos.z - playerSpot.z;
    this.startDist = Math.max(4, Math.sqrt(dx * dx + dz * dz));
    this.angle = Math.atan2(dx, dz); // angle around player, z-forward convention
    this.angleDrift = randRange(0.2, 0.5) * (Math.random() < 0.5 ? -1 : 1);
    this.fishPoint.copy(startPos);
    this.fishPoint.y = WATER_Y;

    this.surgeState = "calm"; // calm | telegraph | active
    this.surgeTimer = randRange(...fish.fight.surgeEvery) * 0.7; // first surge comes a bit early
    this.surgeT = 0;
    this.splashTimer = 0;

    // a real mesh of the actual rolled fish, revealed during jumps + landing
    this.fishMesh = createFishMesh(FISH_BY_ID[fish.speciesId], fish.sizeCm);
    this.fishMesh.visible = false;
    this.scene.add(this.fishMesh);
    this.jump = null;
    this.landing = null;
  }

  setReeling(on) {
    if (this.phase === "fight") this.reeling = on;
  }

  end() {
    this.active = false;
    this.phase = "idle";
    this.reeling = false;
    if (this.fishMesh) {
      this.scene.remove(this.fishMesh);
      this.fishMesh = null;
    }
  }

  get tired() {
    return this.t > this.fish.fight.stamina;
  }

  // ---------- surge cycle ----------

  updateSurge(dt) {
    const R = CONFIG.reel;
    const f = this.fish.fight;
    if (this.surgeState === "calm") {
      this.surgeTimer -= dt;
      if (this.surgeTimer <= 0) {
        this.surgeState = "telegraph";
        this.surgeT = R.telegraphTime;
        this.dodgeArmed = true;
        this.dodged = false;
        this.audio.play("surgeWarn");
        this.tryJump();
      }
    } else if (this.surgeState === "telegraph") {
      this.surgeT -= dt;
      if (this.surgeT <= 0) {
        this.surgeState = "active";
        this.surgeSoften = this.dodged ? R.dodgeSoften : 1;
        this.surgeT = randRange(...R.surgeDuration) * this.surgeSoften;
        this.dodgeArmed = false;
      }
    } else if (this.surgeState === "active") {
      this.surgeT -= dt;
      if (this.surgeT <= 0) {
        this.surgeState = "calm";
        this.surgeSoften = 1;
        const spacing = this.tired ? R.tiredSurgeSpacing : 1;
        this.surgeTimer = randRange(...f.surgeEvery) * spacing;
      }
    }
  }

  /** A well-timed tap during the telegraph softens the coming surge. */
  tryDodge() {
    if (this.phase !== "fight") return false;
    if (this.surgeState !== "telegraph" || !this.dodgeArmed || this.dodged) return false;
    this.dodged = true;
    this.dodgeArmed = false;
    events.emit("fight:dodge");
    return true;
  }

  tryJump() {
    if (this.fish.sizeCm < 30 || Math.random() > 0.75) {
      this.effects.splash(this.fishPoint, 0.9);
      return;
    }
    this.jump = { t: 0, dur: 0.85, from: this.fishPoint.clone() };
    this.effects.splash(this.fishPoint, 1.2);
    this.audio.play("splash", { strength: 0.8 });
  }

  updateJump(dt) {
    if (!this.jump) return;
    this.jump.t += dt;
    const k = this.jump.t / this.jump.dur;
    if (k >= 1) {
      this.effects.splash(this.fishPoint, 1.1);
      this.effects.ripple(this.fishPoint, 2.4, 1);
      this.fishMesh.visible = false;
      this.jump = null;
      return;
    }
    const h = clamp(this.fish.sizeCm / 110, 0.5, 2.2);
    const arc = Math.sin(k * Math.PI) * h;
    this.fishMesh.visible = true;
    this.fishMesh.position.set(this.fishPoint.x, WATER_Y + arc, this.fishPoint.z);
    this.fishMesh.rotation.z = lerp(0.9, -1.2, k);
    this.fishMesh.rotation.y = this.angle + Math.PI / 2;
  }

  // ---------- main update ----------

  update(dt) {
    if (!this.active) return;

    if (this.phase === "landing") {
      this.updateLanding(dt);
      return;
    }

    const R = CONFIG.reel;
    const f = this.fish.fight;
    this.t += dt;

    const strength = f.strength * (this.tired ? R.tiredStrengthMult : 1);
    const { reelSpeed, lineStrength, control } = this.stats;

    // a perfect hook buys a brief window where the fish can't surge
    if (this.graceT > 0) {
      this.graceT -= dt;
    } else {
      this.updateSurge(dt);
    }
    this.updateJump(dt);
    const surging = this.surgeState === "active";
    const inSweet = this.tension >= R.sweetLow && this.tension <= R.sweetHigh;

    if (this.reeling) {
      // rod control tames how vicious a surge is allowed to get; a dodged surge
      // is softened further by surgeSoften
      const surgeMult = surging ? 1 + ((R.surgeReelMult - 1) / control) * this.surgeSoften : 1;
      // over-reeling above the green zone makes tension spike toward a snap
      const overReel = this.tension > R.sweetHigh ? R.overReelTensionMult : 1;
      this.tension += dt * R.tensionGain * strength * surgeMult * overReel / lineStrength;
      // keeping tension in the green zone rewards a faster haul
      const sweetMult = inSweet ? R.sweetReelBonus : 1;
      this.progress += dt * (R.reelRate * reelSpeed / f.heft) * (surging ? 0.55 : 1) * sweetMult;
    } else {
      this.tension -= dt * R.tensionRecover * (surging ? 0.45 : 1);
      if (surging) this.tension += dt * R.surgeRestGain * strength * this.surgeSoften / lineStrength;
      this.progress -= dt * R.escapeRate * strength * (surging ? 1.5 : 0.9);
    }

    // near-snap save: only dangerous while actively reeling at max tension.
    // resting at the brink is a safe holding pattern (you're already easing off)
    // and never burns a save.
    if (this.tension >= 100 && this.reeling && !this.snapArmed) {
      if (this.savesLeft > 0) {
        this.snapArmed = true;
        this.snapTimer = R.snapSaveWindow;
        events.emit("fight:nearsnap");
      } else {
        const fish = this.fish;
        this.end();
        events.emit("fight:snap", { fish });
        return;
      }
    }
    if (this.snapArmed) {
      this.tension = 100; // pinned at the brink while the save window is open
      if (!this.reeling) {
        this.snapArmed = false;
        this.savesLeft -= 1;
        this.tension = R.snapSaveTension;
        events.emit("fight:save", { savesLeft: this.savesLeft });
      } else {
        this.snapTimer -= dt;
        if (this.snapTimer <= 0) {
          const fish = this.fish;
          this.end();
          events.emit("fight:snap", { fish });
          return;
        }
      }
    }

    if (this.progress <= 0 && this.t > R.escapeGraceTime) {
      const fish = this.fish;
      this.end();
      events.emit("fight:escape", { fish, reason: "It slipped the hook and swam off..." });
      return;
    }
    if (this.t > R.maxFightTime) {
      const fish = this.fish;
      this.end();
      events.emit("fight:escape", { fish, reason: "It outlasted you and shook free..." });
      return;
    }

    this.tension = clamp(this.tension, 0, 100);

    if (this.progress >= 100) {
      this.beginLanding();
      return;
    }

    // fight point wanders around the player and closes in with progress
    const dist = lerp(this.startDist, R.minFishDist, this.progress / 100);
    this.angle += Math.sin(this.t * 0.7) * this.angleDrift * dt;
    if (surging) this.angle += Math.sin(this.t * 6) * 1.1 * dt;
    this.fishPoint.set(
      this.playerSpot.x + Math.sin(this.angle) * dist,
      WATER_Y,
      this.playerSpot.z + Math.cos(this.angle) * dist
    );

    this.splashTimer -= dt;
    if (this.splashTimer <= 0 && !this.jump) {
      this.effects.ripple(this.fishPoint, surging ? 2.2 : 1.4, 0.8);
      if (surging || Math.random() < 0.4) this.effects.splash(this.fishPoint, surging ? 0.8 : 0.4);
      this.splashTimer = surging ? 0.13 : 0.26;
    }

    events.emit("fight:update", {
      tension: this.tension,
      progress: clamp(this.progress, 0, 100),
      surge: this.surgeState,
      time: this.t,
      inSweet: this.reeling && inSweet,
      canDodge: this.surgeState === "telegraph" && this.dodgeArmed && !this.dodged,
      dodged: this.dodged,
      snapArmed: this.snapArmed,
    });
  }

  // ---------- landing ----------

  beginLanding() {
    this.phase = "landing";
    this.reeling = false;
    this.effects.splash(this.fishPoint, 1.6);
    this.effects.ripple(this.fishPoint, 3.4, 1.4);
    this.audio.play("splash", { strength: 1.3 });
    const from = this.fishPoint.clone();
    from.y = WATER_Y;
    const to = this.playerSpot.clone();
    to.y += 1.1;
    const mid = from.clone().lerp(to, 0.5);
    mid.y += 3.4;
    this.landing = { t: 0, dur: 0.9, from, mid, to };
    events.emit("fight:update", { tension: 0, progress: 100, surge: "calm", landing: true });
  }

  updateLanding(dt) {
    const L = this.landing;
    L.t += dt;
    const k = clamp(L.t / L.dur, 0, 1);
    // quadratic bezier through the high midpoint
    const a = L.from.clone().lerp(L.mid, k);
    const b = L.mid.clone().lerp(L.to, k);
    const p = a.lerp(b, k);
    this.fishMesh.visible = true;
    this.fishMesh.position.copy(p);
    this.fishMesh.rotation.y += dt * 4;
    this.fishMesh.rotation.z = lerp(0.8, -0.4, k);
    if (k >= 1) {
      const fish = this.fish;
      this.end();
      events.emit("fight:landed", { fish });
    }
  }
}
