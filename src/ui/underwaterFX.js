// A brief "dip below the surface" flourish that plays the instant a fish takes
// the bait: a blue underwater frame with god-ray light shafts raking down,
// rising bubbles and swaying kelp at the edges. Drawn on a self-contained 2D
// canvas overlay (pointer-events: none) so it never interferes with the WebGL
// render, the bite reticle or input — the centre stays clear for the strike.

export class UnderwaterFX {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;opacity:0;";
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = 0;
    this.h = 0;
    this.active = false;
    this.t = 0;
    this.dur = 1.7;
    this.raf = 0;
    this.last = 0;

    this.bubbles = Array.from({ length: 46 }, () => this._spawnBubble(true));
    this.shafts = Array.from({ length: 7 }, (_, i) => ({
      x: Math.random(),
      w: 0.04 + Math.random() * 0.09,
      sway: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.5,
      a: 0.05 + Math.random() * 0.08,
    }));
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
  }

  _resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
  }

  _spawnBubble(initial) {
    return {
      x: Math.random(),
      y: initial ? Math.random() : 1.05 + Math.random() * 0.1,
      r: 1.5 + Math.random() * 5,
      spd: 0.12 + Math.random() * 0.28,
      wob: Math.random() * Math.PI * 2,
      wspd: 0.6 + Math.random() * 1.4,
    };
  }

  trigger(duration = 1.7) {
    this.dur = duration;
    this.t = 0;
    if (!this.active) {
      this.active = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this._loop);
    }
  }

  _loop = () => {
    if (!this.active) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.t += dt;

    // opacity envelope: quick ease-in, gentle ease-out
    const k = this.t / this.dur;
    let env;
    if (k < 0.22) env = k / 0.22;
    else if (k > 0.62) env = Math.max(0, 1 - (k - 0.62) / 0.38);
    else env = 1;
    env = Math.max(0, Math.min(1, env));

    this._draw(dt, env);
    this.canvas.style.opacity = String(env);

    if (k >= 1) {
      this.active = false;
      this.canvas.style.opacity = "0";
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      cancelAnimationFrame(this.raf);
      return;
    }
    this.raf = requestAnimationFrame(this._loop);
  };

  _draw(dt, env) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const time = performance.now() * 0.001;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const w = this.w;
    const h = this.h;

    // 1) blue depth gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(70,170,205,0.95)");
    grad.addColorStop(0.45, "rgba(20,86,130,0.95)");
    grad.addColorStop(1, "rgba(4,28,52,0.98)");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // keep the centre clear so the strike stays visible — punch a soft hole
    const hole = ctx.createRadialGradient(w / 2, h * 0.52, 0, w / 2, h * 0.52, Math.max(w, h) * 0.52);
    hole.addColorStop(0, "rgba(0,0,0,1)");
    hole.addColorStop(0.55, "rgba(0,0,0,0.65)");
    hole.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = hole;
    ctx.fillRect(0, 0, w, h);

    // 2) god-ray light shafts from the surface
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.shafts) {
      s.sway += dt * s.speed;
      const cx = (s.x + Math.sin(s.sway) * 0.02) * w;
      const topW = s.w * w;
      const botW = topW * 2.4;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(190,235,255,${s.a})`);
      g.addColorStop(1, "rgba(190,235,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - topW / 2, 0);
      ctx.lineTo(cx + topW / 2, 0);
      ctx.lineTo(cx + botW / 2, h);
      ctx.lineTo(cx - botW / 2, h);
      ctx.closePath();
      ctx.fill();
    }

    // 3) rising bubbles
    for (const b of this.bubbles) {
      b.y -= b.spd * dt;
      b.wob += dt * b.wspd;
      if (b.y < -0.05) Object.assign(b, this._spawnBubble(false));
      const bx = (b.x + Math.sin(b.wob) * 0.012) * w;
      const by = b.y * h;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(220,245,255,0.18)";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(235,250,255,0.35)";
      ctx.stroke();
    }

    // 4) kelp silhouettes swaying at the bottom edges
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(6,30,28,0.55)";
    this._kelp(ctx, w * 0.06, h, time, 1);
    this._kelp(ctx, w * 0.14, h, time + 1.3, 0.8);
    this._kelp(ctx, w * 0.93, h, time + 0.6, 1.1);
    this._kelp(ctx, w * 0.85, h, time + 2.1, 0.7);

    ctx.restore();
  }

  _kelp(ctx, baseX, h, time, scale) {
    const segs = 9;
    const segH = (h * 0.4 * scale) / segs;
    const width = 14 * scale;
    ctx.beginPath();
    ctx.moveTo(baseX - width / 2, h);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = baseX + Math.sin(time * 1.4 + t * 3) * 18 * t * scale;
      const y = h - i * segH;
      ctx.lineTo(x - width / 2 * (1 - t), y);
    }
    for (let i = segs; i >= 0; i--) {
      const t = i / segs;
      const x = baseX + Math.sin(time * 1.4 + t * 3) * 18 * t * scale;
      const y = h - i * segH;
      ctx.lineTo(x + width / 2 * (1 - t), y);
    }
    ctx.closePath();
    ctx.fill();
  }

  dispose() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this._onResize);
    this.canvas.remove();
  }
}
