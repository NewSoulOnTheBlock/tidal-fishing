// Records a short, branded video clip of the animated voxel fish so the catch
// can be SHARED as media (the fish is visible in the post), not just text.
//
// Why a video file: Twitter/X web-intent URLs cannot attach media — the only
// way to attach the fish to a social post from the browser is the Web Share API
// with a File. So we render the spinning voxel fish to an offscreen canvas,
// composite the catch details + watermark on top, capture it with MediaRecorder,
// and hand the resulting clip to navigator.share().

import { createFishPreview } from "./fishPreview.js";

// Prefer MP4/H.264 (what X accepts natively); fall back to WebM where MP4
// muxing isn't available in MediaRecorder (e.g. Firefox).
function pickVideoMime() {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* isTypeSupported can throw on bad input — ignore */
    }
  }
  return "";
}

const extFor = (mime) => (mime.includes("mp4") ? "mp4" : "webm");

function shrinkFont(ctx, text, weight, startPx, maxWidth) {
  let px = startPx;
  do {
    ctx.font = `${weight} ${px}px 'Segoe UI', system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || px <= 16) break;
    px -= 2;
  } while (px > 16);
  return px;
}

/**
 * Record a square clip of the spinning voxel fish with the catch details burned
 * in. Owns a temporary high-res preview (its own WebGL context) and disposes it
 * when finished, so it never disturbs the on-screen card preview.
 *
 * @param {string} speciesId
 * @param {object} info { name, rarityLabel, rarityColor, statsText, valueText, durationMs }
 * @returns {Promise<{ blob: Blob, ext: string, type: string } | null>} null when
 *          MediaRecorder/WebGL is unavailable — caller should fall back to an image.
 */
export async function recordCatchClip(speciesId, info = {}) {
  const mime = pickVideoMime();
  if (!mime) return null;

  const SIZE = 600;
  const preview = createFishPreview(speciesId, { width: SIZE, height: SIZE, preserveBuffer: true });
  if (!preview) return null;

  const {
    name = "Fish",
    rarityLabel = "",
    rarityColor = "#58a6ff",
    statsText = "",
    valueText = "",
    durationMs = 3500,
  } = info;

  const composite = document.createElement("canvas");
  composite.width = SIZE;
  composite.height = SIZE;
  const ctx = composite.getContext("2d");

  function drawFrame() {
    // Opaque rarity-tinted background (video has no alpha channel).
    const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
    bg.addColorStop(0, "#0c1a28");
    bg.addColorStop(1, "#06101a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Soft rarity glow behind the fish.
    ctx.save();
    ctx.globalAlpha = 0.28;
    const glow = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 30, SIZE / 2, SIZE / 2, SIZE * 0.55);
    glow.addColorStop(0, rarityColor);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();

    // The live spinning voxel fish (preserveDrawingBuffer keeps it readable).
    try {
      ctx.drawImage(preview.canvas, 0, 0, SIZE, SIZE);
    } catch {
      /* context not ready on the first frame — background still shows */
    }

    // Top band + name + rarity.
    const topBand = ctx.createLinearGradient(0, 0, 0, 150);
    topBand.addColorStop(0, "rgba(6,16,26,0.92)");
    topBand.addColorStop(1, "rgba(6,16,26,0)");
    ctx.fillStyle = topBand;
    ctx.fillRect(0, 0, SIZE, 150);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (rarityLabel) {
      ctx.font = "800 22px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = rarityColor;
      ctx.fillText(rarityLabel.toUpperCase(), SIZE / 2, 42);
    }
    shrinkFont(ctx, name, "800", 46, SIZE - 70);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, SIZE / 2, 90);

    // Bottom band + stats + value + watermark.
    const botBand = ctx.createLinearGradient(0, SIZE - 170, 0, SIZE);
    botBand.addColorStop(0, "rgba(6,16,26,0)");
    botBand.addColorStop(1, "rgba(6,16,26,0.95)");
    ctx.fillStyle = botBand;
    ctx.fillRect(0, SIZE - 170, SIZE, 170);

    if (statsText) {
      ctx.font = "600 24px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#cfe6ff";
      ctx.fillText(statsText, SIZE / 2, SIZE - 96);
    }
    if (valueText) {
      ctx.font = "800 30px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#ffd66e";
      ctx.fillText(valueText, SIZE / 2, SIZE - 58);
    }
    ctx.font = "700 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "rgba(190,214,235,0.85)";
    ctx.fillText("🎣 tidalfishing.fun", SIZE / 2, SIZE - 22);
  }

  // Let the fish render a couple of frames before recording so frame 1 isn't blank.
  await new Promise((r) => setTimeout(r, 180));

  let rafId = 0;
  const loop = () => {
    drawFrame();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  const stream = composite.captureStream(30);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  } catch {
    cancelAnimationFrame(rafId);
    preview.dispose();
    return null;
  }

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  try {
    recorder.start();
    // Stop after the clip duration, with a hard safety cap so it can never hang.
    const stopTimer = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, durationMs);
    await stopped;
    clearTimeout(stopTimer);
  } catch (err) {
    console.error("[catchShare] recording failed:", err);
    return null;
  } finally {
    cancelAnimationFrame(rafId);
    preview.dispose();
  }

  if (!chunks.length) return null;
  const type = mime.split(";")[0] || "video/webm";
  return { blob: new Blob(chunks, { type }), ext: extFor(mime), type };
}

/**
 * Share a recorded clip. Uses the Web Share API (the only way to attach media to
 * a post from the browser) when available; otherwise downloads the clip and
 * opens the X composer so the user can attach the just-saved file.
 *
 * @returns {Promise<"shared"|"downloaded"|"cancelled">}
 */
export async function shareClip({ blob, ext, type, name }) {
  const file = new File([blob], `tidal-catch-${Date.now()}.${ext}`, { type });
  const text = `I just caught a ${name} on Tidal! 🎣 #Tidal #Solana`;

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // fall through to download on any other share failure
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  const tweet = encodeURIComponent(`${text}\n\nPlay at ${window.location.origin}`);
  window.open(`https://twitter.com/intent/tweet?text=${tweet}`, "_blank", "width=550,height=460");
  return "downloaded";
}
