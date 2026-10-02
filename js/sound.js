// 音效：全部用 Web Audio 即時合成，不需要音檔
import { rand } from './util.js';

export const Sound = {
  ctx: null, out: null, noiseBuf: null, lastClink: 0, muted: false,

  // iPhone 的聲音要在「手指放開」或「點一下」的那一刻才能打開，
  // 而且切到背景、接電話之後會被暫停（interrupted），所以每次碰螢幕都檢查一次
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 舊版 Safari */ }
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      this.out.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // 播一小段無聲音訊，讓 iOS 把聲音通道真的打開（也能讓舊版 iOS 不受靜音鍵影響）
    if (!this.primed) {
      this.primed = true;
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate), s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      try {
        const el = new Audio(silentWav());
        el.setAttribute('playsinline', ''); el.volume = 0.01;
        el.play().catch(() => { this.primed = false; });
      } catch (e) { /* 不支援就算了 */ }
    }
  },
  get ready() { return !!this.ctx && this.ctx.state === 'running'; },

  // 金屬鐘聲：幾個不和諧泛音，快速衰減
  bell(f0, partials, vol, when = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t0 = c.currentTime + when;
    for (const [ratio, amp, dur] of partials) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f0 * ratio * rand(0.995, 1.005);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol * amp, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.out);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
  },
  noise(dur, vol, type, freq, q, when = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t0 = c.currentTime + when;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  },

  // 投進投幣孔的「叮」
  ding(kind) {
    const f = kind === '50' ? 1780 : 2150;
    this.noise(0.02, 0.25, 'highpass', 4000, 0.7);
    this.bell(f, [[1, 0.5, 0.9], [2.32, 0.32, 0.55], [3.88, 0.2, 0.35], [5.6, 0.12, 0.2]], 0.55);
    this.bell(f * 1.5, [[1, 0.2, 0.25], [2.7, 0.1, 0.15]], 0.4, 0.07);
  },
  // 錢幣在罐子裡碰撞
  clink(vol, material) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastClink < 28) return;
    this.lastClink = now;
    if (material === 'plastic') {
      this.noise(0.05, 0.25 * vol, 'bandpass', rand(900, 1400), 3);
      this.bell(rand(1500, 1900), [[1, 0.5, 0.08], [2.1, 0.2, 0.05]], 0.25 * vol);
    } else if (material === 'glass') {
      this.bell(rand(2700, 3300), [[1, 0.6, 0.35], [2.76, 0.25, 0.2]], 0.3 * vol);
    } else {
      this.bell(rand(3300, 4800), [[1, 0.6, 0.16], [1.73, 0.35, 0.1], [2.9, 0.2, 0.07]], 0.32 * vol);
    }
  },
  // 硬幣掉到盤子上（陶瓷）
  plate(kind, vol = 1) {
    if (kind === '100') { this.noise(0.1, 0.1 * vol, 'lowpass', 1200, 0.7); return; }
    this.bell(kind === '50' ? 2300 : 2700, [[1, 0.5, 0.3], [2.4, 0.3, 0.18], [4.1, 0.15, 0.1]], 0.4 * vol);
    this.noise(0.03, 0.18 * vol, 'highpass', 3000, 0.7);
  },
  // 鈔票的沙沙聲
  rustle(dur = 1.4) {
    const c = this.ctx; if (!c || this.muted) return;
    const t0 = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.6;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const g = c.createGain(); g.gain.value = 0.0001;
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(this.out);
    let t = t0;
    while (t < t0 + dur) {
      const peak = rand(0.04, 0.16) * (1 - ((t - t0) / dur) * 0.6);
      g.gain.setTargetAtTime(peak, t, 0.012);
      t += rand(0.04, 0.12);
      g.gain.setTargetAtTime(0.0001, t, 0.03);
      t += rand(0.02, 0.1);
      bp.frequency.setValueAtTime(rand(2400, 4600), t);
    }
    src.start(t0); src.stop(t0 + dur + 0.3);
  },
  plop() { this.noise(0.12, 0.12, 'lowpass', 900, 0.8); },
  bonk() { this.bell(220, [[1, 0.6, 0.18], [1.5, 0.3, 0.12]], 0.4); },
  // 新罐子掉下來
  pop() {
    this.bell(330, [[1, 0.6, 0.25], [2, 0.2, 0.15]], 0.5);
    [0, 0.08, 0.16].forEach((w, i) => this.bell(1568 * Math.pow(1.26, i), [[1, 0.4, 0.4], [2, 0.1, 0.2]], 0.25, 0.12 + w));
  },
  // 收到零用錢
  chime() {
    [0, 0.1, 0.2, 0.32].forEach((w, i) => this.bell([1047, 1319, 1568, 2093][i], [[1, 0.5, 0.6], [2, 0.12, 0.3]], 0.3, w));
  },
  whoosh() { this.noise(0.35, 0.08, 'bandpass', 900, 0.6); },
};

// 0.1 秒的無聲 WAV
let wavUrl = null;
function silentWav() {
  if (wavUrl) return wavUrl;
  const rate = 8000, n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, str) => [...str].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  wavUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return wavUrl;
}
