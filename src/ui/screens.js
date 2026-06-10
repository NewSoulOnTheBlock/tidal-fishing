// Main menu, pause, settings and how-to-play overlays. The settings and
// how-to panels can be opened from either the menu or pause screen and
// return to whichever opened them.

import { S } from "../state/gameState.js";
import { audio } from "../audio/audioManager.js";

const $ = (id) => document.getElementById(id);

export class Screens {
  /**
   * callbacks: { onPlay, onResume, onQuitToMenu, onResetSave, onQualityChange }
   */
  constructor(callbacks) {
    this.cb = callbacks;
    this.menu = $("screen-menu");
    this.howto = $("screen-howto");
    this.settings = $("screen-settings");
    this.pause = $("screen-pause");
    this.returnTo = null; // 'menu' | 'pause'
    this.bind();
  }

  bind() {
    const click = (id, fn) =>
      $(id).addEventListener("click", () => {
        audio.init();
        audio.play("click");
        fn();
      });

    click("menu-play", () => this.cb.onPlay());
    click("menu-howto", () => this.showHowto("menu"));
    click("menu-settings", () => this.showSettings("menu"));
    click("menu-reset", () => this.confirmReset());

    click("pause-resume", () => this.cb.onResume());
    click("pause-settings", () => this.showSettings("pause"));
    click("pause-howto", () => this.showHowto("pause"));
    click("pause-quit", () => this.cb.onQuitToMenu());

    click("howto-back", () => this.back());
    click("settings-back", () => this.back());
    click("set-reset", () => this.confirmReset());

    const vol = $("set-volume");
    vol.addEventListener("input", () => {
      S.settings.volume = vol.value / 100;
      audio.setVolume(S.settings.volume);
    });
    const mute = $("set-mute");
    mute.addEventListener("change", () => {
      S.settings.muted = mute.checked;
      audio.setMuted(mute.checked);
    });
    const quality = $("set-quality");
    quality.addEventListener("change", () => {
      S.settings.quality = quality.value;
      this.cb.onQualityChange(quality.value);
    });
  }

  confirmReset() {
    if (window.confirm("Erase all progress and start fresh? This cannot be undone.")) {
      this.cb.onResetSave();
    }
  }

  syncSettingsInputs() {
    $("set-volume").value = Math.round(S.settings.volume * 100);
    $("set-mute").checked = S.settings.muted;
    $("set-quality").value = S.settings.quality;
  }

  hideAll() {
    for (const el of [this.menu, this.howto, this.settings, this.pause]) {
      el.classList.add("hidden");
    }
  }

  showMenu(hasProgress) {
    this.hideAll();
    $("menu-play").textContent = hasProgress ? "Continue" : "Play";
    $("menu-save-info").textContent = hasProgress
      ? `Angler level ${S.profile.level} · ${S.stats.catches} fish caught · ${S.world.unlocked.length} spot${S.world.unlocked.length > 1 ? "s" : ""} unlocked`
      : "A fresh logbook awaits.";
    this.menu.classList.remove("hidden");
  }

  showPause() {
    this.hideAll();
    this.pause.classList.remove("hidden");
  }

  showHowto(from) {
    this.returnTo = from;
    this.hideAll();
    this.howto.classList.remove("hidden");
  }

  showSettings(from) {
    this.returnTo = from;
    this.hideAll();
    this.syncSettingsInputs();
    this.settings.classList.remove("hidden");
  }

  back() {
    this.hideAll();
    if (this.returnTo === "pause") this.pause.classList.remove("hidden");
    else this.menu.classList.remove("hidden");
    this.returnTo = null;
  }
}
