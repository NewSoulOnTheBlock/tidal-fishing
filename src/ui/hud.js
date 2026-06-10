// HUD: top bars, phase prompt, power meter, reel-fight overlay, bite
// indicator, zone hint, toasts. Mostly event-driven off the shared bus.

import { S, events, Phase } from "../state/gameState.js";
import { xpToNext, getEquipped, inventoryValue } from "../economy/economy.js";
import { LOCATION_BY_ID } from "../data/locationData.js";
import { formatMoney, hourToClock, clamp } from "../utils/utils.js";

const $ = (id) => document.getElementById(id);

const PROMPTS = {
  [Phase.IDLE]: "Aim with the <b>mouse</b> — hold <b>Click</b> or <b>Space</b> to charge a cast",
  [Phase.CHARGING]: "Release to <b>cast!</b>",
  [Phase.FLYING]: "Nice arc...",
  [Phase.WAITING]: "Wait for a bite... <b>hold Click</b> or press <b>R</b> to reel back",
  [Phase.BITE]: "HOOK IT! CLICK NOW!",
  [Phase.REELING]: "<b>Hold Click</b> to reel — release during <b>surges!</b>",
  [Phase.CATCH]: "",
  [Phase.RETRIEVING]: "Reeling the line back in...",
};

export class HUD {
  constructor() {
    this.root = $("hud");
    this.money = $("hud-money");
    this.level = $("hud-level");
    this.xpFill = $("hud-xpfill");
    this.xpText = $("hud-xptext");
    this.clock = $("hud-clock");
    this.seg = $("hud-seg");
    this.weather = $("hud-weather");
    this.loc = $("hud-loc");
    this.rodChip = $("hud-rod");
    this.baitChip = $("hud-bait");
    this.bag = $("hud-bag");
    this.prompt = $("hud-prompt");
    this.zone = $("hud-zone");
    this.powerWrap = $("power-wrap");
    this.powerFill = $("power-fill");
    this.reelWrap = $("reel-wrap");
    this.fightName = $("fight-name");
    this.fightStars = $("fight-stars");
    this.surgeBanner = $("surge-banner");
    this.tensionFill = $("tension-fill");
    this.progressFill = $("progress-fill");
    this.bite = $("bite-indicator");
    this.toasts = $("toasts");
    this.vignette = $("vignette");
    this.buttons = [$("btn-map"), $("btn-shop"), $("btn-journal")];

    this.bindEvents();
  }

  bindEvents() {
    events.on("money", () => {
      this.updateMoney();
      this.money.classList.remove("pulse");
      void this.money.offsetWidth; // restart the pulse animation
      this.money.classList.add("pulse");
    });
    events.on("xp", () => this.updateXp());
    events.on("levelup", ({ level, unlocks }) => {
      this.toast(`Level ${level} Angler!`, "gold");
      for (const u of unlocks) this.toast(u, "success");
    });
    events.on("journal:new", () => this.toast("New species logged in the Journal!", "success"));
    events.on("inventory", () => this.updateBag());
    events.on("gear", () => this.updateGear());
    events.on("weather", ({ weather }) => {
      this.weather.textContent = weather === "cloudy" ? "Cloudy" : "Clear";
    });
    events.on("toast", ({ msg, kind }) => this.toast(msg, kind));
    events.on("phase", ({ to }) => {
      this.setPrompt(PROMPTS[to] ?? "");
      this.prompt.classList.toggle("urgent", to === Phase.BITE);
      const idle = to === Phase.IDLE;
      for (const b of this.buttons) b.disabled = !idle;
      if (to === Phase.IDLE) this.setZone(null);
      if (to !== Phase.CHARGING) this.showPower(false);
      if (to !== Phase.REELING) this.showReel(false);
      if (to !== Phase.BITE) this.positionBite(null);
    });
  }

  show() {
    this.root.classList.remove("hidden");
    this.refreshAll();
  }

  hide() {
    this.root.classList.add("hidden");
    this.vignette.classList.remove("tension-danger");
  }

  refreshAll() {
    this.updateMoney();
    this.updateXp();
    this.updateGear();
    this.updateBag();
    this.updateLocation();
    this.weather.textContent = S.world.weather === "cloudy" ? "Cloudy" : "Clear";
  }

  updateMoney() {
    this.money.textContent = formatMoney(S.profile.money);
  }

  updateXp() {
    const next = xpToNext(S.profile.level);
    this.level.textContent = `Lv ${S.profile.level}`;
    this.xpFill.style.width = `${clamp((S.profile.xp / next) * 100, 0, 100)}%`;
    this.xpText.textContent = `${S.profile.xp} / ${next} XP`;
  }

  updateGear() {
    const eq = getEquipped();
    this.rodChip.querySelector(".gear-name").textContent = eq.rod.name;
    this.baitChip.querySelector(".gear-name").textContent = eq.bait.name;
  }

  updateBag() {
    const n = S.inventory.length;
    this.bag.textContent = n === 0 ? "Catch Bag: empty" : `Catch Bag: ${n} fish · ${formatMoney(inventoryValue())}`;
  }

  updateLocation() {
    this.loc.textContent = LOCATION_BY_ID[S.world.current]?.name ?? "";
  }

  setClock(hours, segment) {
    this.clock.textContent = hourToClock(hours);
    const label = segment[0].toUpperCase() + segment.slice(1);
    if (this.seg.textContent !== label) {
      this.seg.textContent = label;
      this.seg.className = `seg-chip seg-${segment}`;
    }
  }

  setPrompt(html) {
    this.prompt.innerHTML = html;
    this.prompt.classList.toggle("hidden", !html);
  }

  setZone(text) {
    if (!text) {
      this.zone.classList.add("hidden");
    } else {
      this.zone.textContent = text;
      this.zone.classList.remove("hidden");
    }
  }

  showPower(visible) {
    this.powerWrap.classList.toggle("hidden", !visible);
  }

  setPower(p) {
    this.powerFill.style.width = `${Math.round(p * 100)}%`;
  }

  showReel(visible, fish = null) {
    this.reelWrap.classList.toggle("hidden", !visible);
    if (visible && fish) {
      this.fightName.textContent = "Something is hooked...";
      this.fightStars.textContent = "★".repeat(fish.stars) + "☆".repeat(5 - fish.stars);
      this.surgeBanner.classList.add("hidden");
      this.tensionFill.style.width = "18%";
      this.progressFill.style.width = "8%";
    }
    if (!visible) this.vignette.classList.remove("tension-danger");
  }

  updateFight({ tension, progress, surge, landing }) {
    if (landing) {
      this.reelWrap.classList.add("hidden");
      this.vignette.classList.remove("tension-danger");
      this.setPrompt("Got it!");
      return;
    }
    this.tensionFill.style.width = `${tension}%`;
    this.progressFill.style.width = `${progress}%`;
    this.vignette.classList.toggle("tension-danger", tension > 75);
    if (surge === "telegraph") {
      this.surgeBanner.textContent = "IT'S ABOUT TO SURGE...";
      this.surgeBanner.classList.remove("hidden");
      this.surgeBanner.classList.add("telegraph");
    } else if (surge === "active") {
      this.surgeBanner.textContent = "SURGE — EASE OFF!";
      this.surgeBanner.classList.remove("hidden", "telegraph");
    } else {
      this.surgeBanner.classList.add("hidden");
    }
  }

  /** Position the "!" over the bobber; pass null to hide. */
  positionBite(screenPos) {
    if (!screenPos) {
      this.bite.classList.add("hidden");
      return;
    }
    this.bite.classList.remove("hidden");
    this.bite.style.left = `${screenPos.x}px`;
    this.bite.style.top = `${screenPos.y}px`;
  }

  toast(msg, kind = "info") {
    const el = document.createElement("div");
    el.className = `toast${kind && kind !== "info" ? ` toast-${kind}` : ""}`;
    el.textContent = msg;
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3600);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
  }

  shake() {
    const app = document.getElementById("app");
    app.classList.remove("shake");
    void app.offsetWidth;
    app.classList.add("shake");
  }
}
