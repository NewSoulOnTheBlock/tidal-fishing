// Fully procedural Web Audio sound design: no external files, every cue is
// synthesized. Each public method is safe to call even if the AudioContext
// could not be created — the game must run silently without errors.

import { clamp, randRange } from "../utils/utils.js";

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this.muted = false;
    this.noiseBuffer = null;
    this.ambience = null; // { nodes: [], timers: [] }
    this.ambienceProfile = null;
    this.ambienceSegment = "day";
    this.reelAccum = 0;
    this.bgMusic = null; // { audio: HTMLAudioElement, gainNode: GainNode }
    this.bgMusicVolume = 0.15; // Background music at 15% volume
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      this.startBackgroundMusic();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoiseBuffer(2);
      if (this.ambienceProfile) this.setAmbience(this.ambienceProfile, this.ambienceSegment);
      this.startBackgroundMusic();
    } catch {
      this.ctx = null;
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === "running";
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    if (this.bgMusic && this.bgMusic.gainNode) {
      this.bgMusic.gainNode.gain.value = m ? 0 : this.bgMusicVolume;
    }
  }

  startBackgroundMusic() {
    if (this.bgMusic) return; // Already started
    if (!this.ctx) return;
    
    try {
      const audio = new Audio('/background-music.mp3');
      audio.loop = true;
      audio.volume = 1.0; // Control via gain node instead
      
      // Connect to Web Audio for volume control
      const source = this.ctx.createMediaElementSource(audio);
      const gainNode = this.ctx.createGain();
      gainNode.gain.value = this.muted ? 0 : this.bgMusicVolume;
      
      source.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      
      this.bgMusic = { audio, gainNode, source };
      
      // Start playing
      audio.play().catch(() => {
        // Autoplay blocked, will retry on next user interaction
      });
    } catch (err) {
      console.warn('Background music failed to load:', err);
    }
  }

  stopBackgroundMusic() {
    if (!this.bgMusic) return;
    try {
      this.bgMusic.audio.pause();
      this.bgMusic.audio.currentTime = 0;
      this.bgMusic = null;
    } catch {}
  }

  makeNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ----- low-level helpers -------------------------------------------------

  env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0011), t0 + attack);
    g.exponentialRampToValueAtTime(0.001, t0 + attack + decay);
  }

  tone({ type = "sine", freq = 440, freqEnd = null, t0 = 0, dur = 0.15, peak = 0.2, attack = 0.01 }) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      const start = this.ctx.currentTime + t0;
      osc.frequency.setValueAtTime(freq, start);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), start + dur);
      this.env(g, start, peak, attack, dur);
      osc.connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + attack + dur + 0.05);
    } catch {
      /* ignore */
    }
  }

  noise({ t0 = 0, dur = 0.3, peak = 0.3, filterType = "lowpass", freq = 800, freqEnd = null, Q = 1, attack = 0.01, rate = 1 }) {
    if (!this.ctx) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      src.playbackRate.value = rate;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      const start = this.ctx.currentTime + t0;
      filter.frequency.setValueAtTime(freq, start);
      if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 10), start + dur);
      filter.Q.value = Q;
      const g = this.ctx.createGain();
      this.env(g, start, peak, attack, dur);
      src.connect(filter).connect(g).connect(this.master);
      src.start(start);
      src.stop(start + attack + dur + 0.1);
    } catch {
      /* ignore */
    }
  }

  // ----- one-shot game cues ------------------------------------------------

  play(name, opts = {}) {
    if (!this.ctx) return;
    switch (name) {
      case "click":
        this.tone({ type: "sine", freq: 950, dur: 0.05, peak: 0.12 });
        break;
      case "error":
        this.tone({ type: "square", freq: 140, dur: 0.14, peak: 0.1 });
        break;
      case "whoosh":
        this.noise({ dur: 0.38, peak: 0.28, filterType: "bandpass", freq: 420, freqEnd: 1900, Q: 1.4, attack: 0.04 });
        break;
      case "splash": {
        const s = clamp(opts.strength ?? 1, 0.3, 2);
        this.noise({ dur: 0.45 * s, peak: 0.32 * s, filterType: "lowpass", freq: 1400, freqEnd: 260, attack: 0.005 });
        for (let i = 0; i < 3; i++) {
          this.tone({ type: "sine", freq: randRange(700, 1700), t0: randRange(0.06, 0.3), dur: 0.05, peak: 0.05 * s });
        }
        break;
      }
      case "plip":
        this.tone({ type: "sine", freq: 520, freqEnd: 300, dur: 0.09, peak: 0.1 });
        break;
      case "bite":
        this.tone({ type: "square", freq: 880, dur: 0.07, peak: 0.16 });
        this.tone({ type: "square", freq: 1318, t0: 0.08, dur: 0.09, peak: 0.16 });
        this.noise({ dur: 0.2, peak: 0.14, filterType: "lowpass", freq: 900, freqEnd: 300, attack: 0.005 });
        break;
      case "hook":
        this.tone({ type: "triangle", freq: 660, freqEnd: 990, dur: 0.12, peak: 0.18 });
        break;
      case "surgeWarn":
        this.tone({ type: "sawtooth", freq: 330, freqEnd: 440, dur: 0.16, peak: 0.1 });
        break;
      case "snap":
        this.noise({ dur: 0.12, peak: 0.4, filterType: "highpass", freq: 1800, attack: 0.002 });
        this.tone({ type: "sawtooth", freq: 320, freqEnd: 55, dur: 0.4, peak: 0.18 });
        break;
      case "escape":
        this.tone({ type: "sine", freq: 420, freqEnd: 210, dur: 0.35, peak: 0.12 });
        break;
      case "catch": {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => this.tone({ type: "triangle", freq: f, t0: i * 0.09, dur: 0.16, peak: 0.16 }));
        this.tone({ type: "sine", freq: 2093, t0: 0.36, dur: 0.3, peak: 0.07 });
        break;
      }
      case "legendary": {
        const notes = [392, 523, 659, 784, 1046, 1318];
        notes.forEach((f, i) => this.tone({ type: "triangle", freq: f, t0: i * 0.11, dur: 0.22, peak: 0.17 }));
        this.noise({ t0: 0.1, dur: 0.8, peak: 0.06, filterType: "highpass", freq: 5000, attack: 0.2 });
        break;
      }
      case "levelup": {
        const notes = [440, 554, 659, 880];
        notes.forEach((f, i) => this.tone({ type: "square", freq: f, t0: i * 0.08, dur: 0.12, peak: 0.09 }));
        break;
      }
      case "buy":
        this.tone({ type: "sine", freq: 740, dur: 0.06, peak: 0.12 });
        this.tone({ type: "sine", freq: 988, t0: 0.07, dur: 0.08, peak: 0.12 });
        this.tone({ type: "sine", freq: 1975, t0: 0.13, dur: 0.12, peak: 0.06 });
        break;
      case "sell":
        this.tone({ type: "sine", freq: 1175, dur: 0.05, peak: 0.1 });
        this.tone({ type: "sine", freq: 1568, t0: 0.05, dur: 0.09, peak: 0.1 });
        break;
      case "achievement": {
        // Triumphant achievement unlock fanfare
        const melody = [659, 784, 880, 1046, 1318];
        melody.forEach((f, i) => this.tone({ type: "triangle", freq: f, t0: i * 0.08, dur: 0.18, peak: 0.15 }));
        this.tone({ type: "sine", freq: 1318, t0: 0.4, dur: 0.5, peak: 0.08 });
        this.noise({ t0: 0.05, dur: 0.6, peak: 0.04, filterType: "highpass", freq: 4000, attack: 0.15 });
        break;
      }
      case "reward": {
        // Satisfying reward claim sound
        this.tone({ type: "sine", freq: 880, dur: 0.08, peak: 0.14 });
        this.tone({ type: "sine", freq: 1318, t0: 0.08, dur: 0.12, peak: 0.14 });
        this.tone({ type: "sine", freq: 1760, t0: 0.2, dur: 0.15, peak: 0.1 });
        break;
      }
      case "challenge": {
        // Challenge complete ding
        this.tone({ type: "triangle", freq: 988, dur: 0.1, peak: 0.16 });
        this.tone({ type: "triangle", freq: 1318, t0: 0.1, dur: 0.15, peak: 0.16 });
        break;
      }
      case "dailyLogin": {
        // Daily login streak sound - warm and welcoming
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => this.tone({ type: "sine", freq: f, t0: i * 0.1, dur: 0.2, peak: 0.13 }));
        this.tone({ type: "triangle", freq: 1318, t0: 0.35, dur: 0.3, peak: 0.08 });
        break;
      }
      case "countdown": {
        // Tournament countdown tick
        const intensity = opts.intensity || 0.5;
        this.tone({ type: "square", freq: 440 + (intensity * 880), dur: 0.08, peak: 0.14 * (1 + intensity) });
        break;
      }
      case "tournamentStart": {
        // Tournament begins - exciting fanfare
        const notes = [392, 523, 659, 880, 1046];
        notes.forEach((f, i) => this.tone({ type: "sawtooth", freq: f, t0: i * 0.07, dur: 0.15, peak: 0.16 }));
        this.noise({ t0: 0.1, dur: 0.5, peak: 0.08, filterType: "highpass", freq: 6000, attack: 0.2 });
        break;
      }
      case "tournamentEnd": {
        // Tournament ends - resolution
        const notes = [1046, 880, 784, 659, 523];
        notes.forEach((f, i) => this.tone({ type: "triangle", freq: f, t0: i * 0.12, dur: 0.2, peak: 0.14 }));
        break;
      }
      case "jackpot": {
        // Big win celebration
        for (let i = 0; i < 8; i++) {
          this.tone({ 
            type: "sine", 
            freq: 523 * Math.pow(2, i / 4), 
            t0: i * 0.06, 
            dur: 0.15, 
            peak: 0.12 - (i * 0.01) 
          });
        }
        this.noise({ t0: 0.2, dur: 1, peak: 0.06, filterType: "highpass", freq: 7000, attack: 0.3 });
        break;
      }
      case "notification": {
        // Gentle notification ping
        this.tone({ type: "sine", freq: 880, dur: 0.06, peak: 0.12 });
        this.tone({ type: "sine", freq: 1318, t0: 0.06, dur: 0.1, peak: 0.08 });
        break;
      }
      default:
        break;
    }
  }

  /** Ratchet clicks while reeling; called every frame with held state. */
  reelTick(dt, active, speed = 1) {
    if (!this.ctx || !active) {
      this.reelAccum = 0;
      return;
    }
    this.reelAccum += dt * 13 * speed;
    while (this.reelAccum >= 1) {
      this.reelAccum -= 1;
      this.tone({ type: "triangle", freq: randRange(1750, 1950), dur: 0.014, peak: 0.075, attack: 0.002 });
    }
  }

  // ----- looping ambience ---------------------------------------------------

  stopAmbience() {
    if (!this.ambience) return;
    for (const t of this.ambience.timers) clearTimeout(t);
    for (const n of this.ambience.nodes) {
      try {
        n.stop ? n.stop() : n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.ambience = null;
  }

  /**
   * Per-location ambient bed: lapping water + wind, plus randomized wildlife
   * chirps appropriate to the location and time of day.
   */
  setAmbience(profile, segment) {
    this.ambienceProfile = profile;
    this.ambienceSegment = segment;
    if (!this.ctx) return;
    this.stopAmbience();
    const amb = { nodes: [], timers: [] };
    this.ambience = amb;
    try {
      // water lapping: looped noise, lowpass, slow LFO on gain
      const water = this.ctx.createBufferSource();
      water.buffer = this.noiseBuffer;
      water.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      const wGain = this.ctx.createGain();
      wGain.gain.value = 0.05 * profile.waves;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.03 * profile.waves;
      lfo.connect(lfoGain).connect(wGain.gain);
      water.connect(lp).connect(wGain).connect(this.master);
      water.start();
      lfo.start();
      amb.nodes.push(water, lfo);

      // wind: looped noise through gentle bandpass
      const wind = this.ctx.createBufferSource();
      wind.buffer = this.noiseBuffer;
      wind.loop = true;
      wind.playbackRate.value = 0.7;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 700;
      bp.Q.value = 0.6;
      const windGain = this.ctx.createGain();
      windGain.gain.value = 0.022 * profile.wind;
      wind.connect(bp).connect(windGain).connect(this.master);
      wind.start();
      amb.nodes.push(wind);

      const scheduleWildlife = () => {
        if (this.ambience !== amb) return;
        const seg = this.ambienceSegment;
        const daytime = seg === "day" || seg === "dawn";
        if (profile.birds && daytime) this.birdChirp();
        if (profile.gulls && seg !== "night") this.gullCry();
        if (profile.crickets && (seg === "night" || seg === "dusk")) this.cricket();
        amb.timers.push(setTimeout(scheduleWildlife, randRange(5000, 14000)));
      };
      amb.timers.push(setTimeout(scheduleWildlife, randRange(2000, 6000)));
    } catch {
      /* ignore */
    }
  }

  setAmbienceSegment(segment) {
    this.ambienceSegment = segment;
  }

  birdChirp() {
    const base = randRange(2100, 3300);
    for (let i = 0; i < 3; i++) {
      this.tone({ type: "sine", freq: base + i * randRange(60, 200), freqEnd: base * 1.25, t0: i * 0.11, dur: 0.07, peak: 0.035 });
    }
  }

  gullCry() {
    this.tone({ type: "sawtooth", freq: randRange(1100, 1400), freqEnd: randRange(600, 750), dur: 0.5, peak: 0.028, attack: 0.08 });
  }

  cricket() {
    for (let i = 0; i < 5; i++) {
      this.tone({ type: "sine", freq: 4200, t0: i * 0.07, dur: 0.03, peak: 0.018 });
    }
  }
}

export const audio = new AudioManager();
