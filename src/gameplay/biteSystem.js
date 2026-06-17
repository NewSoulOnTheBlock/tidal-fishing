// Wait-for-bite phase: dt-driven timers (pause-safe), teaser nibbles, the real
// bite, and the short hook reaction window. The fish is rolled at bite time so
// the time of day at that moment matters.

import { CONFIG } from "../data/config.js";
import { events } from "../state/gameState.js";
import { rollFish, rollBiteWait } from "../fish/spawning.js";
import { chance, randRange } from "../utils/utils.js";

export class BiteSystem {
  /**
   * @param {Function} getEnv returns { location, hours, weather, bait }
   * @param {Bobber} bobber
   */
  constructor(getEnv, bobber) {
    this.getEnv = getEnv;
    this.bobber = bobber;
    this.state = "idle"; // idle | waiting | window
    this.zone = "shallow";
    this.t = 0;
    this.wait = 0;
    this.windowT = 0;
    this.fish = null;
    this.nibbles = [];
    this.nibbleEnd = 0;
  }

  begin(zone) {
    const env = this.getEnv();
    this.zone = zone;
    this.wait = rollBiteWait({ ...env, zone });
    this.t = 0;
    this.fish = null;
    this.state = "waiting";
    this.nibbles = [];
    this.nibbleEnd = 0;
    if (chance(CONFIG.bite.nibbleChance)) this.nibbles.push(this.wait * randRange(0.4, 0.55));
    if (chance(0.35)) this.nibbles.push(this.wait * randRange(0.7, 0.85));
  }

  cancel() {
    this.state = "idle";
    this.fish = null;
    this.bobber.setDip(0);
  }

  /** Player pressed during the window. Returns the hooked fish or null. */
  hookAttempt() {
    if (this.state !== "window") return null;
    const fish = this.fish;
    // Calculate if this was a perfect hook (within first 30% of window)
    const totalWindow = fish.hookWindow;
    const elapsedInWindow = fish.hookWindow - this.windowT;
    const isPerfect = (elapsedInWindow / totalWindow) <= 0.3;
    
    this.state = "idle";
    this.fish = null;
    events.emit("bite:hooked", { fish, isPerfect });
    return fish;
  }

  update(dt) {
    if (this.state === "waiting") {
      this.t += dt;

      if (this.nibbleEnd > 0 && this.t >= this.nibbleEnd) {
        this.bobber.setDip(0);
        this.nibbleEnd = 0;
      }
      if (this.nibbles.length && this.t >= this.nibbles[0]) {
        this.nibbles.shift();
        this.bobber.setDip(0.13);
        this.nibbleEnd = this.t + 0.35;
        events.emit("bite:nibble");
      }

      if (this.t >= this.wait) {
        const env = this.getEnv();
        this.fish = rollFish({ ...env, zone: this.zone });
        this.windowT = this.fish.hookWindow;
        this.state = "window";
        this.bobber.setDip(0.42);
        events.emit("bite:start", { fish: this.fish });
      }
    } else if (this.state === "window") {
      this.windowT -= dt;
      if (this.windowT <= 0) {
        const fish = this.fish;
        this.fish = null;
        this.bobber.setDip(0);
        // fish swims off, the wait restarts automatically
        this.begin(this.zone);
        events.emit("bite:missed", { fish });
      }
    }
  }
}
