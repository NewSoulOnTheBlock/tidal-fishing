// In-game 24h clock. Advances only while gameplay phases are active.

import { CONFIG } from "../data/config.js";
import { getTimeSegment } from "../data/fishData.js";

export class GameClock {
  constructor(startHour = CONFIG.time.startHour) {
    this.hours = startHour;
  }

  advance(dt) {
    this.hours = (this.hours + (dt / CONFIG.time.dayLengthSec) * 24) % 24;
  }

  get segment() {
    return getTimeSegment(this.hours);
  }

  /** 0 at midnight, 1 at noon — used for light/fog blending. */
  get dayFactor() {
    const elev = Math.sin(((this.hours - 6) / 12) * Math.PI);
    return Math.max(0, Math.min(1, (elev + 0.18) / 1.18));
  }
}
