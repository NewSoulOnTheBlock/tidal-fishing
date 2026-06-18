// The celebratory catch-result card: species, size, weight, rarity, value,
// NEW/RECORD ribbons and confetti for special catches.

import { FISH_BY_ID, RARITIES } from "../data/fishData.js";
import { audio } from "../audio/audioManager.js";
import { formatMoney, formatLength, formatWeight, randRange } from "../utils/utils.js";
import { fishSVG } from "./fishSvg.js";
import { createFishPreview } from "./fishPreview.js";
import { recordCatchClip, shareClip } from "./catchShare.js";
import { events } from "../state/gameState.js";
import html2canvas from "html2canvas";

const CONFETTI_COLORS = ["#5fd4ff", "#ffc857", "#62d98b", "#c08bff", "#ff8da3"];

export class CatchCard {
  constructor() {
    this.root = document.getElementById("catch-root");
    this.active = false;
    this.onDone = null;
    this.keyHandler = (e) => {
      if (!this.active) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
        e.preventDefault();
        this.dismiss();
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  /**
   * @param {object} fish   rolled fish instance
   * @param {object} flags  { isNew, isRecord, xpGained }
   * @param {Function} onDone
   */
  show(fish, flags, onDone) {
    this.active = true;
    this.onDone = onDone;
    
    if (!this.root) {
      console.error("[CatchCard] catch-root not found!");
      return;
    }
    
    const sp = FISH_BY_ID[fish.speciesId];
    const rarity = RARITIES[fish.rarity];

    if (!sp || !rarity) {
      console.error("[CatchCard] Invalid fish data", fish);
      return;
    }

    // Details burned into the shareable video clip / image of this catch.
    this._share = {
      speciesId: fish.speciesId,
      name: sp.name,
      rarityLabel: rarity.label,
      rarityColor: rarity.color,
      statsText: `${formatLength(fish.sizeCm)} • ${formatWeight(fish.weightKg)}`,
      valueText: `Worth ${formatMoney(fish.value)}`,
    };

    const overlay = document.createElement("div");
    overlay.className = "catch-overlay";

    let ribbon = "";
    if (flags.isJackpot) ribbon = `<div class="catch-ribbon jackpot">🔥 JACKPOT 🔥</div>`;
    else if (flags.isNew) ribbon = `<div class="catch-ribbon">NEW SPECIES!</div>`;
    else if (flags.isRecord) ribbon = `<div class="catch-ribbon record">NEW RECORD!</div>`;

    const valueLine = flags.isJackpot
      ? `<div class="catch-value catch-jackpot-value">+${formatMoney(fish.value)}<div class="catch-jackpot-sub">credited instantly</div></div>`
      : `<div class="catch-value">Worth ${formatMoney(fish.value)}</div>`;

    overlay.innerHTML = `
      <div class="catch-card ${flags.isJackpot ? "catch-card-jackpot" : ""}" style="--rarity:${rarity.color}">
        ${ribbon}
        <div class="catch-rarity">${rarity.label}</div>
        <div class="catch-name">${sp.name}</div>
        <div class="catch-fish-stage">${fishSVG(sp.look)}</div>
        <div class="catch-stats">
          <div class="catch-stat"><span class="cs-label">Length</span><span class="cs-value">${formatLength(fish.sizeCm)}</span></div>
          <div class="catch-stat"><span class="cs-label">Weight</span><span class="cs-value">${formatWeight(fish.weightKg)}</span></div>
        </div>
        ${valueLine}
        <div class="catch-xp">+${flags.xpGained} XP${flags.isNew ? " (first catch bonus)" : ""}</div>
        <div class="catch-actions">
          <button class="btn btn-primary btn-big">${flags.isJackpot ? "I'm rich" : "Keep it"}</button>
          <button class="btn btn-share" title="Share your catch as a video">🎥 Share</button>
        </div>
      </div>
    `;

    try {
      overlay.querySelector(".btn-primary").addEventListener("click", () => this.dismiss());
      overlay.querySelector(".btn-share").addEventListener("click", (e) => this.shareCatch(e.currentTarget));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.dismiss();
      });

      this.root.appendChild(overlay);
      this.overlay = overlay;

      // Swap the static SVG for the animated 3D voxel model when WebGL is
      // available; the SVG stays as a fallback otherwise. preserveBuffer lets
      // the html2canvas share screenshot capture the live canvas.
      this._preview?.dispose();
      this._preview = null;
      const stage = overlay.querySelector(".catch-fish-stage");
      const preview = stage && createFishPreview(fish.speciesId, { width: 220, height: 150, preserveBuffer: true });
      if (preview) {
        stage.innerHTML = "";
        stage.appendChild(preview.canvas);
        this._preview = preview;
      }

      audio.play(flags.isJackpot || RARITIES[fish.rarity].order >= 4 ? "legendary" : "catch");
      if (flags.isJackpot || flags.isNew || flags.isRecord || RARITIES[fish.rarity].order >= 3) {
        this.confetti(overlay.querySelector(".catch-card"), flags.isJackpot ? 96 : 26);
      }
    } catch (error) {
      console.error("[CatchCard] Error showing card:", error);
      this.active = false;
      if (this.onDone) this.onDone();
    }
  }

  confetti(cardEl, count = 26) {
    for (let i = 0; i < count; i++) {
      const bit = document.createElement("span");
      bit.className = "confetti-bit";
      bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      bit.style.left = `${randRange(20, 80)}%`;
      bit.style.top = "30%";
      bit.style.setProperty("--cx", `${randRange(-160, 160)}px`);
      bit.style.setProperty("--cy", `${randRange(60, 280)}px`);
      bit.style.animationDelay = `${randRange(0, 0.25)}s`;
      cardEl.appendChild(bit);
    }
  }

  // Record the spinning voxel fish as a short branded video and share it so the
  // fish itself is visible in the post. Falls back to a static card image when
  // video recording isn't supported.
  async shareCatch(btnEl) {
    const info = this._share;
    if (!info) return;
    const original = btnEl ? btnEl.textContent : "";
    const setBtn = (txt, disabled) => {
      if (btnEl && btnEl.isConnected) { btnEl.textContent = txt; btnEl.disabled = disabled; }
    };
    setBtn("🎥 Recording…", true);
    try {
      const clip = await recordCatchClip(info.speciesId, {
        name: info.name,
        rarityLabel: info.rarityLabel,
        rarityColor: info.rarityColor,
        statsText: info.statsText,
        valueText: info.valueText,
      });
      if (clip) {
        setBtn("📤 Sharing…", true);
        const res = await shareClip({ ...clip, name: info.name });
        if (res === "downloaded") {
          events.emit("toast", { msg: "🎥 Catch clip saved — attach it to your post!", kind: "info" });
        }
        return;
      }
      // No MediaRecorder/WebGL — fall back to a static card image (still shows the fish).
      const card = this.overlay?.querySelector(".catch-card");
      if (card) await this.shareCardImage(card, info.name);
    } catch (err) {
      console.error("[CatchCard] share failed:", err);
      const card = this.overlay?.querySelector(".catch-card");
      if (card) await this.shareCardImage(card, info.name).catch(() => {});
      else events.emit("toast", { msg: "Couldn't create a share clip", kind: "warn" });
    } finally {
      setBtn(original || "🎥 Share", false);
    }
  }

  async shareCardImage(cardEl, fishName) {
    try {
      // Hide confetti and share button temporarily
      const confettiBits = cardEl.querySelectorAll('.confetti-bit');
      const shareBtn = cardEl.querySelector('.btn-share');
      confettiBits.forEach(b => b.style.display = 'none');
      if (shareBtn) shareBtn.style.display = 'none';

      // Capture screenshot with timeout
      const canvas = await Promise.race([
        html2canvas(cardEl, {
          backgroundColor: null,
          scale: 2,
          logging: false,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Screenshot timeout')), 5000))
      ]);

      // Restore elements
      confettiBits.forEach(b => b.style.display = '');
      if (shareBtn) shareBtn.style.display = '';

      // Convert to blob
      canvas.toBlob(async (blob) => {
        const file = new File([blob], `tidal-catch-${Date.now()}.png`, { type: 'image/png' });

        // Try native share API first
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `I caught a ${fishName}!`,
              text: `Check out my catch on Tidal! 🎣 #Tidal #Solana`,
              url: window.location.origin,
            });
            return;
          } catch (err) {
            if (err.name !== 'AbortError') console.error('Share failed:', err);
          }
        }

        // Fallback: Download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tidal-catch-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);

        // Show Twitter share link
        this.showTwitterShare(fishName);
      });
    } catch (error) {
      console.error('Screenshot failed:', error);
      // Skip screenshot, go straight to Twitter share
      this.showTwitterShare(fishName);
    }
  }

  showTwitterShare(fishName) {
    const tweetText = encodeURIComponent(`I just caught a ${fishName} on Tidal! 🎣\n\nPlay at ${window.location.origin} #Tidal #Solana`);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  }

  dismiss() {
    if (!this.active) return;
    this.active = false;
    audio.play("click");
    this._preview?.dispose();
    this._preview = null;
    this.overlay?.remove();
    this.overlay = null;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }
}
