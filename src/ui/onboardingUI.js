// Onboarding UI - first-time welcome flow.
// Shown once when a wallet signs in without a username. The angler name is
// REQUIRED: there is no close button and the overlay cannot be dismissed until
// a valid name is entered, so every player starts with an identity.

import { S, events } from "../state/gameState.js";
import { currentPublicKey } from "../web3/wallet.js";
import { updateProfile } from "../web3/database.js";
import { saveGame } from "../state/saveLoad.js";
import { isTelegram, tgSuggestedName } from "../platform/telegram.js";
import { mountCharacterChooser } from "./characterChooser.js";
import { getCharacter } from "../data/characters.js";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export class OnboardingUI {
  constructor() {
    this.panel = null;
    this.chooser = null;
  }

  show() {
    // Guard against double-show (event may fire more than once).
    if (this.panel) return;
    if (!currentPublicKey()) return;

    this.panel = document.createElement("div");
    this.panel.id = "onboarding-panel";
    this.panel.className = "modal-overlay onboarding-overlay";
    this.panel.innerHTML = `
      <div class="modal-content onboarding-modal">
        <div class="onboarding-hero">
          <div class="onboarding-logo">🎣</div>
          <h1 class="onboarding-title">Welcome to <span>Tidal Fishing</span></h1>
          <p class="onboarding-tagline">
            The web3 fishing adventure on Solana. Cast your line, reel in rare
            fish, climb the leaderboard, and earn&nbsp;$TIDE.
          </p>
        </div>

        <div class="onboarding-body">
          <label class="onboarding-label" for="onboarding-name">Choose your angler name</label>
          <input
            id="onboarding-name"
            class="onboarding-input"
            type="text"
            maxlength="30"
            placeholder="e.g. ReelDeal"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="onboarding-meta">
            <span class="onboarding-error" hidden>Enter at least 2 characters to continue.</span>
            <span class="onboarding-counter"><span class="oc">0</span>/30</span>
          </div>
          <button class="btn btn-primary onboarding-start" disabled>Continue →</button>
          <p class="onboarding-hint">You can change this anytime in your Profile.</p>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);
    this.bindEvents();
  }

  bindEvents() {
    const input = this.panel.querySelector("#onboarding-name");
    const counter = this.panel.querySelector(".oc");
    const startBtn = this.panel.querySelector(".onboarding-start");
    const error = this.panel.querySelector(".onboarding-error");

    setTimeout(() => input.focus(), 60);

    const validate = () => {
      counter.textContent = input.value.length;
      const ok = input.value.trim().length >= 2;
      startBtn.disabled = !ok;
      if (ok) error.hidden = true;
      return ok;
    };

    input.addEventListener("input", validate);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (validate()) this.submitName();
        else error.hidden = false;
      }
      // Escape intentionally does nothing — the name is required.
    });
    startBtn.addEventListener("click", () => {
      if (validate()) this.submitName();
      else error.hidden = false;
    });

    // Inside Telegram, pre-fill the angler name from the player's Telegram
    // username so most users can simply tap "Start Fishing". Still editable.
    if (isTelegram()) {
      const suggested = tgSuggestedName();
      if (suggested && !input.value) {
        input.value = suggested;
        validate();
      }
    }

    // No overlay-click dismissal and no close button: onboarding is mandatory.
  }

  async submitName() {
    const input = this.panel?.querySelector("#onboarding-name");
    if (!input) return;
    // Sanitize: trim, cap length, strip angle brackets to avoid markup injection.
    const name = input.value.trim().replace(/[<>]/g, "").slice(0, 30);
    if (name.length < 2) return;

    // Local state is the source of truth (instant, offline-safe).
    S.profile.username = name;
    try {
      saveGame();
    } catch (e) {
      console.warn("[onboarding] local save failed:", e?.message);
    }

    // Best-effort: persist the name to the server in the background so it follows
    // the wallet across devices. Fire-and-forget — a fresh wallet has no SIWS
    // session yet, so awaiting it here would stall behind a signature prompt and
    // make the flow feel frozen. Its success must not gate play.
    const publicKey = currentPublicKey();
    if (publicKey) {
      updateProfile(publicKey.toString(), { username: name }).catch((e) => {
        console.warn("[onboarding] server name save failed (saved locally):", e?.message);
      });
    }

    // Step 2: choose the voxel character to fish as, then start the tutorial.
    this.showCharacterStep();
  }

  showCharacterStep() {
    if (!this.panel) return;
    const modal = this.panel.querySelector(".onboarding-modal");
    if (!modal) {
      // Defensive: if the modal shell is gone, skip straight to the tutorial.
      this.finishCharacter(S.profile.character || "r2d2");
      return;
    }
    const name = S.profile.username || "angler";
    modal.innerHTML = `
      <div class="onboarding-hero onboarding-hero-compact">
        <h1 class="onboarding-title">Choose your <span>angler</span></h1>
        <p class="onboarding-tagline">
          Pick the voxel character you'll fish as, ${escapeHtml(name)}.
          You can change it anytime in your Profile.
        </p>
      </div>
      <div class="onboarding-body onboarding-character-body"></div>
    `;
    const mount = modal.querySelector(".onboarding-character-body");
    this.chooser = mountCharacterChooser(mount, {
      initial: S.profile.character || "r2d2",
      confirmLabel: "Fish as {name} →",
      onConfirm: (id) => this.finishCharacter(id),
    });
  }

  finishCharacter(characterId) {
    const char = getCharacter(characterId);
    S.profile.character = char.id;
    try {
      saveGame();
    } catch (e) {
      console.warn("[onboarding] local save failed:", e?.message);
    }

    // Swap the live angler body to the chosen character.
    events.emit("character", char.id);

    const name = S.profile.username || "angler";

    // Tear the overlay down first so the tutorial overlay can take over cleanly.
    this.close();
    events.emit("toast", {
      msg: `🎉 Welcome aboard, ${name}! Fishing as ${char.name}. Tight lines!`,
      kind: "gold",
    });
    // First-time anglers get the how-to-fish walkthrough right after choosing.
    events.emit("onboarding:complete");
  }

  close() {
    if (this.chooser) {
      try {
        this.chooser.dispose();
      } catch {
        /* ignore */
      }
      this.chooser = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
