'use strict';
/* ================================================================
 * 程序化音效引擎 —— 全部声音由 Web Audio API 实时合成，无外部文件
 * ================================================================ */

const Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  muted: false,
  bgmTimer: null,
  step: 0,
  nextNoteTime: 0,

  /* 必须在用户首次点击后调用 */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);

    this.startBGM();
  },

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {}
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  },

  /* ---------- 基础：滑音振荡器 ---------- */
  tone(f0, f1, dur, type, vol, dest) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  /* ---------- 基础：噪声（爆炸用） ---------- */
  noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(filterFreq || 1200, t);
    flt.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t);
  },

  /* ---------- 各类音效 ---------- */
  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'shoot_archer': this.tone(900, 420, 0.09, 'square', 0.05); break;
      case 'shoot_fire':   this.tone(320, 130, 0.16, 'sawtooth', 0.07); break;
      case 'shoot_ice':    this.tone(1250, 1750, 0.12, 'sine', 0.06); break;
      case 'shoot_cannon': this.tone(180, 70, 0.18, 'sawtooth', 0.10); break;
      case 'boom':         this.noise(0.35, 0.22, 900); this.tone(120, 40, 0.3, 'sine', 0.12); break;
      case 'meteor':       this.noise(0.7, 0.32, 1600); this.tone(90, 30, 0.6, 'sawtooth', 0.18); break;
      case 'build':        this.tone(520, 520, 0.08, 'square', 0.1);
                           setTimeout(() => this.tone(700, 700, 0.12, 'square', 0.1), 80); break;
      case 'upgrade':      [523, 659, 784, 1047].forEach((f, i) =>
                             setTimeout(() => this.tone(f, f, 0.12, 'triangle', 0.1), i * 70)); break;
      case 'sell':         this.tone(700, 350, 0.18, 'triangle', 0.1); break;
      case 'kill':         this.tone(380, 160, 0.12, 'square', 0.06); break;
      case 'leak':         this.tone(220, 90, 0.35, 'sawtooth', 0.16); break;
      case 'wave':         [392, 523, 659].forEach((f, i) =>
                             setTimeout(() => this.tone(f, f, 0.15, 'triangle', 0.11), i * 110)); break;
      case 'ui':           this.tone(600, 600, 0.06, 'square', 0.07); break;
      case 'charge':       [659, 880].forEach((f, i) =>
                             setTimeout(() => this.tone(f, f, 0.18, 'sine', 0.1), i * 150)); break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          setTimeout(() => this.tone(f, f, 0.28, 'triangle', 0.14), i * 160)); break;
      case 'lose':
        [440, 370, 311, 233].forEach((f, i) =>
          setTimeout(() => this.tone(f, f * 0.97, 0.35, 'sawtooth', 0.12), i * 220)); break;
    }
  },

  /* ---------- 轻快五声音阶背景乐 ---------- */
  startBGM() {
    if (this.bgmTimer || !this.ctx) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.bgmTimer = setInterval(() => this.scheduler(), 60);
  },

  scheduler() {
    if (!this.ctx) return;
    const spb = 0.21;                 // 每个十六分音符时长
    while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += spb;
      this.step = (this.step + 1) % 32;
    }
  },

  playStep(step, when) {
    if (this.muted) return;
    const melody = [
      523, 0, 659, 0, 784, 0, 659, 0,
      587, 0, 659, 0, 880, 0, 784, 0,
      523, 0, 659, 0, 784, 0, 880, 0,
      784, 659, 587, 0, 523, 0, 0, 0
    ];
    const bass = [262, 0, 0, 0, 262, 0, 0, 0, 330, 0, 0, 0, 294, 0, 0, 0,
                  262, 0, 0, 0, 392, 0, 0, 0, 330, 0, 294, 0, 262, 0, 0, 0];

    const freq = melody[step];
    if (freq) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.16, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.32);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(when); osc.stop(when + 0.36);
    }
    const bf = bass[step];
    if (bf) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = bf;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.22, when + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(when); osc.stop(when + 0.55);
    }
  }
};

/* 读取静音偏好 */
try {
  Sound.muted = localStorage.getItem(MUTE_KEY) === '1';
} catch (e) { Sound.muted = false; }
