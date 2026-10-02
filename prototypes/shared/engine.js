/* 存錢罐原型 — 共用引擎
 * 物理（Matter.js）、音效（Web Audio 即時合成）、存錢罐與錢幣繪製、左右滑動切換。
 * 三種風格只差在 theme 設定與各自的 CSS。
 */
(function () {
  'use strict';
  const { Engine, Bodies, Body, Composite, Events } = Matter;

  // 存錢罐的邏輯座標空間（所有罐子都畫在 360 × 440 的盒子裡，再依螢幕縮放）
  const LW = 360, LH = 440, PAD = 40;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  /* ---------------- 顏色工具 ---------------- */
  function toRgb(hex) {
    if (hex.startsWith('rgb')) return hex.match(/[\d.]+/g).slice(0, 3).map(Number);
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = toRgb(a), B = toRgb(b);
    return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
  }
  const lighten = (c, t) => mix(c, '#ffffff', t);
  const darken = (c, t) => mix(c, '#000000', t);

  /* ---------------- 幾何工具 ---------------- */
  function ellipsePts(cx, cy, rx, ry, n = 64, a0 = 0, a1 = TAU) {
    const pts = [];
    const full = Math.abs(a1 - a0 - TAU) < 1e-6;
    const cnt = full ? n : n + 1;
    for (let i = 0; i < cnt; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  }
  // 迷你 path：['M',x,y] ['L',x,y] ['Q',cx,cy,x,y]
  function pathPts(cmds, seg = 10) {
    const pts = [];
    let px = 0, py = 0;
    for (const c of cmds) {
      if (c[0] === 'M' || c[0] === 'L') { px = c[1]; py = c[2]; pts.push([px, py]); }
      else if (c[0] === 'Q') {
        const [, cx, cy, x, y] = c;
        for (let i = 1; i <= seg; i++) {
          const t = i / seg, u = 1 - t;
          pts.push([u * u * px + 2 * u * t * cx + t * t * x, u * u * py + 2 * u * t * cy + t * t * y]);
        }
        px = x; py = y;
      }
    }
    return pts;
  }
  function roundRectPts(x, y, w, h, r, seg = 6) {
    const R = Array.isArray(r) ? r : [r, r, r, r]; // tl tr br bl
    const pts = [];
    const corner = (cx, cy, rr, a0) => {
      if (!rr) { pts.push([cx, cy]); return; }
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (Math.PI / 2) * (i / seg);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
    };
    corner(x + R[0], y + R[0], R[0], Math.PI);
    if (!R[0]) pts[pts.length - 1] = [x, y];
    corner(x + w - R[1], y + R[1], R[1], -Math.PI / 2);
    if (!R[1]) pts[pts.length - 1] = [x + w, y];
    corner(x + w - R[2], y + h - R[2], R[2], 0);
    if (!R[2]) pts[pts.length - 1] = [x + w, y + h];
    corner(x + R[3], y + h - R[3], R[3], Math.PI / 2);
    if (!R[3]) pts[pts.length - 1] = [x, y + h];
    return pts;
  }
  function pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
  // 在 y 高度上，多邊形內部的 x 範圍（取最寬的一段）
  function spanAt(pts, y, margin) {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    let best = null;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
    }
    return best ? [best[0] + margin, best[1] - margin] : null;
  }

  /* ---------------- 音效（全部即時合成，不需要音檔） ---------------- */
  const Sound = {
    ctx: null, out: null, noiseBuf: null, lastClink: 0,
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
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    // 金屬鐘聲：多個不和諧泛音，快速衰減
    bell(f0, partials, vol, when = 0) {
      const c = this.ctx; if (!c) return;
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
      const c = this.ctx; if (!c) return null;
      const t0 = c.currentTime + when;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.out);
      src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
      return g;
    },
    // 投進投幣孔的「叮」
    ding(kind) {
      const f = kind === '50' ? 1780 : 2150;
      this.noise(0.02, 0.25, 'highpass', 4000, 0.7);
      this.bell(f, [[1, 0.5, 0.9], [2.32, 0.32, 0.55], [3.88, 0.2, 0.35], [5.6, 0.12, 0.2]], 0.55);
      this.bell(f * 1.5, [[1, 0.2, 0.25], [2.7, 0.1, 0.15]], 0.4, 0.07);
    },
    // 錢幣互相碰撞
    clink(vol, material) {
      const c = this.ctx; if (!c) return;
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
    // 鈔票的沙沙聲
    rustle(dur = 1.4) {
      const c = this.ctx; if (!c) return;
      const t0 = c.currentTime;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.6;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      const g = c.createGain(); g.gain.value = 0.0001;
      src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(this.out);
      let t = t0;
      while (t < t0 + dur) {
        const peak = rand(0.04, 0.16) * (1 - (t - t0) / dur * 0.6);
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
  };

  /* ---------------- 畫筆（依風格決定線條質感） ---------------- */
  const patternCache = new Map();
  function chalkPattern(ctx, color, scale) {
    const key = color + '|' + scale.toFixed(2);
    if (patternCache.has(key)) return patternCache.get(key);
    const S = 64, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const [r, g, b] = toRgb(color);
    const img = c.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const on = Math.random() > 0.22;
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = on ? 140 + Math.random() * 115 : 0;
    }
    c.putImageData(img, 0, 0);
    const pat = ctx.createPattern(cv, 'repeat');
    if (pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix().scale(1 / scale));
    patternCache.set(key, pat);
    return pat;
  }

  class Painter {
    constructor(ctx, theme, scale) { this.c = ctx; this.t = theme; this.scale = scale; }
    path(pts, closed, jit, seed) {
      const c = this.c;
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        let [x, y] = pts[i];
        if (jit) { x += (hash(i * 1.7 + seed) - 0.5) * 2 * jit; y += (hash(i * 3.1 + seed + 9) - 0.5) * 2 * jit; }
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      if (closed) c.closePath();
    }
    grad(pts, color) {
      const b = bbox(pts);
      const g = this.c.createLinearGradient(b.x0, b.y0, b.x1 * 0.3 + b.x0 * 0.7, b.y1);
      g.addColorStop(0, lighten(color, 0.45));
      g.addColorStop(0.55, color);
      g.addColorStop(1, darken(color, 0.18));
      return g;
    }
    // o: fill, alpha, stroke(false 關閉), ink, lw, closed, hatch, flat
    shape(pts, o = {}) {
      const c = this.c, t = this.t, closed = o.closed !== false;
      c.save();
      if (o.fill && closed) {
        c.globalAlpha = o.alpha ?? 1;
        c.fillStyle = t.gloss && !o.flat ? this.grad(pts, o.fill) : o.fill;
        this.path(pts, true, 0, 0);
        c.fill();
        if (t.chalk && o.hatch !== false && !o.flat) this.hatch(pts, o.fill, o.alpha ?? 1);
        if (t.crayon && o.hatch !== false && !o.flat && (o.alpha ?? 1) >= 0.6) this.crayonGrain(pts);
      }
      if (o.stroke !== false) {
        const ink = o.ink || (t.inkFromFill && o.fill ? (t.inkFromFill === 'light' ? lighten(o.fill, 0.35) : darken(o.fill, 0.28)) : t.ink);
        c.globalAlpha = o.strokeAlpha ?? 1;
        c.lineWidth = (o.lw ?? 1) * t.lw;
        c.lineJoin = 'round'; c.lineCap = 'round';
        if (t.chalk) {
          c.strokeStyle = chalkPattern(c, ink, this.scale);
          this.path(pts, closed, t.rough, 1); c.stroke();
          c.globalAlpha *= 0.55; c.lineWidth *= 0.7;
          this.path(pts, closed, t.rough * 1.6, 7); c.stroke();
        } else {
          c.strokeStyle = ink;
          this.path(pts, closed, t.rough, 1); c.stroke();
        }
      }
      c.restore();
    }
    hatch(pts, color, alpha) {
      const c = this.c, b = bbox(pts);
      c.save();
      this.path(pts, true, 0, 0); c.clip();
      c.globalAlpha = Math.min(1, alpha * (this.t.hatchBoost || 1.6));
      c.strokeStyle = chalkPattern(c, color, this.scale);
      c.lineWidth = this.t.hatchLw || 2.2;
      const span = b.x1 - b.x0 + b.y1 - b.y0, gap = this.t.hatchGap || 7;
      for (let k = 0; k < span; k += gap) {
        c.beginPath();
        c.moveTo(b.x0 + k + hash(k) * 3, b.y0);
        c.lineTo(b.x0 + k - (b.y1 - b.y0) * 0.6, b.y1);
        c.stroke();
      }
      c.restore();
    }
    crayonGrain(pts) {
      const c = this.c, b = bbox(pts);
      c.save();
      this.path(pts, true, 0, 0); c.clip();
      c.globalAlpha = 0.12; c.strokeStyle = '#ffffff'; c.lineWidth = 1;
      for (let y = b.y0; y < b.y1; y += 3.5) {
        c.beginPath(); c.moveTo(b.x0, y + hash(y) * 2); c.lineTo(b.x1, y + hash(y + 3) * 2); c.stroke();
      }
      c.restore();
    }
    ellipse(cx, cy, rx, ry, o) { this.shape(ellipsePts(cx, cy, rx, ry, 72), o); }
    line(pts, o = {}) { this.shape(pts, Object.assign({}, o, { closed: false, fill: null })); }
    // 透明材質的反光
    shine(pts, w = 1) {
      const c = this.c, t = this.t;
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (t.gloss) {
        c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 7 * w;
        this.path(pts, false, 0, 0); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2.5 * w;
        this.path(pts, false, 0, 0); c.stroke();
      } else if (t.chalk) {
        c.strokeStyle = chalkPattern(c, '#ffffff', this.scale); c.lineWidth = 3 * w; c.globalAlpha = 0.85;
        this.path(pts, false, 0.8, 3); c.stroke();
      } else {
        c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 4 * w;
        this.path(pts, false, 0, 0); c.stroke();
      }
      c.restore();
    }
    // 不畫在某個形狀內部（例如豬腳不要穿過透明肚子）
    outside(pts, fn) {
      const c = this.c;
      c.save();
      c.beginPath();
      c.rect(-PAD * 2, -PAD * 2, LW + PAD * 4, LH + PAD * 4);
      for (let i = pts.length - 1; i >= 0; i--) i === pts.length - 1 ? c.moveTo(pts[i][0], pts[i][1]) : c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
      c.clip('evenodd');
      fn();
      c.restore();
    }
  }

  /* ---------------- 存錢罐造型 ---------------- */
  // 每個造型提供：interior（物理內壁）、slot（投幣孔）、spawn（掉進去的位置）、back/front 兩層繪圖
  const SHAPES = {
    pig: (() => {
      const body = ellipsePts(185, 262, 136, 112, 96);
      const interior = ellipsePts(185, 262, 126, 102, 40);
      return {
        interior, material: 'plastic',
        slot: { x: 208, y: 152, w: 50, a: 0.12 },
        spawn: { x: 208, y: 178 }, fullY: 172,
        back(p, col) {
          const t = p.t;
          p.ellipse(185, 404, 132, 11, { fill: t.shadow, stroke: false, flat: true });
          p.outside(body, () => {
            for (const x of [104, 150, 222, 268]) {
              p.shape(roundRectPts(x - 18, 330, 36, 70, [6, 6, 14, 14]), { fill: col.main, alpha: 0.95 });
              p.line([[x - 9, 392], [x - 9, 399]], { ink: darken(col.main, 0.35), lw: 0.6 });
              p.line([[x + 9, 392], [x + 9, 399]], { ink: darken(col.main, 0.35), lw: 0.6 });
            }
            // 耳朵
            p.shape([[84, 196], [92, 136], [134, 176]], { fill: col.main, alpha: 0.95 });
            p.shape([[96, 186], [99, 152], [122, 176]], { fill: col.inner, alpha: 0.9, stroke: false });
            p.shape([[132, 168], [152, 116], [180, 158]], { fill: col.main, alpha: 0.95 });
            p.shape([[143, 160], [155, 130], [171, 156]], { fill: col.inner, alpha: 0.9, stroke: false });
            // 尾巴
            const tail = [];
            for (let i = 0; i <= 40; i++) {
              const a = i / 40 * TAU * 1.35, r = 4 + i * 0.32;
              tail.push([322 + i * 0.55 + Math.cos(a) * r, 248 - Math.sin(a) * r]);
            }
            p.line(tail, { ink: col.main, lw: 2.2 });
          });
          backBase(p, body);
          p.shape(body, { fill: col.main, alpha: t.backAlpha, stroke: false, hatch: false });
        },
        front(p, col) {
          const t = p.t;
          p.shape(body, { fill: col.main, alpha: t.fillAlpha });
          p.shine(ellipsePts(185, 262, 112, 92, 30, Math.PI * 1.08, Math.PI * 1.42), 1);
          p.shine(ellipsePts(185, 262, 112, 92, 10, Math.PI * 1.5, Math.PI * 1.6), 0.8);
          // 鼻子
          p.ellipse(56, 272, 24, 32, { fill: col.main, alpha: 0.96 });
          p.ellipse(52, 272, 15, 22, { fill: col.inner, alpha: 0.9, stroke: false });
          p.ellipse(50, 261, 4, 7, { fill: t.dark, stroke: false, flat: true });
          p.ellipse(50, 283, 4, 7, { fill: t.dark, stroke: false, flat: true });
          // 眼睛、腮紅
          p.ellipse(108, 222, 8.5, 10, { fill: t.dark, stroke: false, flat: true });
          p.ellipse(111, 218, 3, 3.5, { fill: '#ffffff', stroke: false, flat: true });
          p.ellipse(118, 258, 15, 9, { fill: col.blush, alpha: 0.55, stroke: false, flat: true });
          // 投幣孔
          slotArt(p, this.slot);
        },
      };
    })(),

    jar: (() => {
      const body = pathPts([
        ['M', 112, 100], ['Q', 80, 110, 78, 146], ['L', 78, 382], ['Q', 78, 414, 110, 414],
        ['L', 250, 414], ['Q', 282, 414, 282, 382], ['L', 282, 146], ['Q', 280, 110, 248, 100],
      ]);
      const interior = pathPts([
        ['M', 116, 110], ['Q', 90, 118, 88, 150], ['L', 88, 380], ['Q', 88, 404, 112, 404],
        ['L', 248, 404], ['Q', 272, 404, 272, 380], ['L', 272, 150], ['Q', 270, 118, 244, 110],
      ], 6);
      return {
        interior, material: 'glass',
        slot: { x: 180, y: 58, w: 52, a: 0 },
        spawn: { x: 180, y: 128 }, fullY: 124,
        back(p, col) {
          const t = p.t;
          p.ellipse(180, 414, 118, 10, { fill: t.shadow, stroke: false, flat: true });
          backBase(p, body);
          p.shape(body, { fill: col.main, alpha: t.backAlpha, stroke: false, hatch: false });
        },
        front(p, col) {
          const t = p.t;
          p.shape(body, { fill: col.main, alpha: t.fillAlpha * 0.8 });
          p.shine([[100, 156], [97, 210], [97, 330]], 1.1);
          p.shine([[100, 352], [100, 372]], 1.1);
          p.shine([[262, 170], [263, 230]], 0.7);
          // 瓶口螺紋
          p.shape(roundRectPts(104, 88, 152, 16, 5), { fill: col.main, alpha: Math.min(1, t.fillAlpha * 2.2) });
          // 蓋子
          const lid = roundRectPts(96, 54, 168, 38, 9);
          p.shape(lid, { fill: col.lid });
          for (let x = 110; x < 256; x += 12) p.line([[x, 60], [x, 87]], { ink: darken(col.lid, 0.2), lw: 0.45, strokeAlpha: 0.8 });
          p.shine([[106, 62], [150, 62]], 0.6);
          slotArt(p, this.slot);
          // 小標籤（愛心）
          heart(p, 180, 250, 22, col.tag);
        },
      };
    })(),

    car: (() => {
      const body = pathPts([
        ['M', 36, 238], ['Q', 36, 222, 54, 220], ['L', 98, 214], ['L', 130, 146], ['Q', 134, 136, 146, 136],
        ['L', 230, 136], ['Q', 242, 136, 248, 146], ['L', 292, 212], ['L', 318, 218], ['Q', 336, 222, 336, 242],
        ['L', 336, 322], ['Q', 336, 342, 316, 342], ['L', 56, 342], ['Q', 36, 342, 36, 322],
      ], 6);
      const interior = pathPts([
        ['M', 46, 242], ['Q', 46, 231, 58, 229], ['L', 105, 222], ['L', 138, 152], ['Q', 140, 146, 148, 146],
        ['L', 228, 146], ['Q', 236, 146, 240, 152], ['L', 285, 220], ['L', 314, 227], ['Q', 326, 230, 326, 244],
        ['L', 326, 320], ['Q', 326, 332, 312, 332], ['L', 60, 332], ['Q', 46, 332, 46, 320],
      ], 5);
      const wheel = (p, x, col) => {
        const t = p.t;
        const y = 354;
        p.ellipse(x, y, 33, 33, { fill: col.tire, flat: true });
        p.ellipse(x, y, 15, 15, { fill: col.hub });
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * TAU - Math.PI / 2;
          p.ellipse(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 2, 2, { fill: darken(col.hub, 0.35), stroke: false, flat: true });
        }
        if (t.gloss) p.shine(ellipsePts(x, y, 25, 25, 10, Math.PI * 1.1, Math.PI * 1.45), 0.6);
      };
      return {
        interior, material: 'plastic',
        slot: { x: 188, y: 138, w: 48, a: 0 },
        spawn: { x: 188, y: 166 }, fullY: 160,
        back(p, col) {
          const t = p.t;
          p.ellipse(186, 386, 160, 10, { fill: t.shadow, stroke: false, flat: true });
          backBase(p, body);
          p.shape(body, { fill: col.main, alpha: t.backAlpha, stroke: false, hatch: false });
        },
        front(p, col) {
          const t = p.t;
          p.shape(body, { fill: col.main, alpha: t.fillAlpha });
          // 車窗框
          p.shape([[146, 150], [182, 150], [182, 212], [114, 214]], { fill: col.window, alpha: 0.22, lw: 0.7 });
          p.shape([[194, 150], [232, 150], [276, 212], [194, 212]], { fill: col.window, alpha: 0.22, lw: 0.7 });
          p.shine([[204, 160], [224, 160]], 0.6);
          p.shine([[154, 160], [170, 160]], 0.6);
          // 門縫、門把
          p.line([[188, 220], [188, 318]], { lw: 0.5, strokeAlpha: 0.6 });
          p.line([[150, 238], [166, 238]], { lw: 0.9 });
          p.line([[208, 238], [224, 238]], { lw: 0.9 });
          // 車身反光
          p.shine([[60, 262], [60, 300]], 0.9);
          p.shine([[100, 228], [170, 224]], 0.7);
          // 車燈
          p.ellipse(327, 252, 8, 11, { fill: col.light, alpha: 1 });
          p.shape(roundRectPts(34, 246, 10, 20, 4), { fill: '#ff6b6b' });
          // 保險桿
          p.shape(roundRectPts(310, 300, 32, 14, 7), { fill: col.hub });
          p.shape(roundRectPts(30, 300, 26, 14, 7), { fill: col.hub });
          wheel(p, 98, col); wheel(p, 268, col);
          slotArt(p, this.slot);
        },
      };
    })(),
  };

  function backBase(p, pts) {
    if (p.t.backBase) p.shape(pts, { fill: p.t.backBase, alpha: p.t.backBaseAlpha ?? 0.4, stroke: false, flat: true });
  }
  function slotArt(p, s) {
    const c = p.c;
    c.save();
    c.translate(s.x, s.y); c.rotate(s.a);
    p.shape(roundRectPts(-s.w / 2 - 5, -8, s.w + 10, 16, 8), { fill: p.t.slotRim, alpha: 0.95 });
    p.shape(roundRectPts(-s.w / 2, -3.5, s.w, 7, 3.5), { fill: p.t.dark, stroke: false, flat: true });
    c.restore();
  }
  function heart(p, x, y, s, color) {
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * TAU;
      const hx = 16 * Math.pow(Math.sin(a), 3);
      const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      pts.push([x + hx * s / 17, y + hy * s / 17]);
    }
    p.shape(pts, { fill: color, alpha: 0.9, lw: 0.8 });
  }

  /* ---------------- 新台幣錢幣與鈔票 ---------------- */
  const COIN_R = { '10': 14, '50': 15.5 };          // 10 元 26mm、50 元 28mm 的比例
  const BILL_FOLD = { w: 58, h: 24 };               // 在罐子裡摺起來的 100 元
  const BILL_FLAT = { w: 124, h: 60 };              // 飄落時攤開（真鈔 145×70mm 比例）
  const METAL = {
    '10': { hi: '#ffffff', mid: '#d5d9de', lo: '#8d949c', field: '#c5cad0', ink: '#6f767e' },
    '50': { hi: '#fff6c8', mid: '#e8c255', lo: '#9c7222', field: '#dcb24a', ink: '#7d5915' },
  };

  function makeCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h));
    return cv;
  }

  function drawCoin(c, R, kind, face, theme) {
    const m = METAL[kind];
    // 外緣
    let g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, m.hi); g.addColorStop(0.55, m.mid); g.addColorStop(1, m.lo);
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    // 邊緣齒紋
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = Math.max(0.6, R * 0.025);
    for (let k = 0; k < 90; k++) {
      const a = k / 90 * TAU;
      c.beginPath(); c.moveTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9); c.lineTo(Math.cos(a) * R * 0.985, Math.sin(a) * R * 0.985); c.stroke();
    }
    // 內圈
    g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R * 0.86);
    g.addColorStop(0, m.hi); g.addColorStop(0.6, m.field); g.addColorStop(1, darken(m.field, 0.12));
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, R * 0.84, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = R * 0.035;
    c.beginPath(); c.arc(0, 0, R * 0.84, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = R * 0.03;
    c.beginPath(); c.arc(R * 0.01, R * 0.02, R * 0.8, Math.PI * 0.9, Math.PI * 1.6); c.stroke();

    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (face === 0) {
      // 面額面：大大的數字 + 國字
      const f = `800 ${R * 0.78}px "Avenir Next","Helvetica Neue",Arial,sans-serif`;
      c.font = f;
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillText(kind, -R * 0.03, -R * 0.08);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillText(kind, R * 0.04, -R * 0.02);
      c.fillStyle = m.ink; c.fillText(kind, 0, -R * 0.05);
      c.font = `600 ${R * 0.2}px "PingFang TC","Heiti TC",sans-serif`;
      c.fillStyle = m.ink;
      c.fillText(kind === '10' ? '拾圓' : '伍拾圓', 0, R * 0.52);
    } else {
      // 人像面：簡化的側臉剪影 + 中華民國
      c.save();
      c.beginPath(); c.arc(0, 0, R * 0.8, 0, TAU); c.clip();
      c.fillStyle = darken(m.field, 0.22); c.globalAlpha = 0.55;
      c.beginPath(); c.ellipse(R * 0.02, R * 0.72, R * 0.55, R * 0.38, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(-R * 0.02, -R * 0.02, R * 0.27, R * 0.33, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(-R * 0.27, R * 0.02, R * 0.06, R * 0.07, 0, 0, TAU); c.fill();
      c.globalAlpha = 0.6; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = R * 0.03;
      c.beginPath(); c.ellipse(-R * 0.02, -R * 0.02, R * 0.27, R * 0.33, 0, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
      c.restore();
      c.fillStyle = m.ink; c.font = `600 ${R * 0.15}px "PingFang TC","Heiti TC",sans-serif`;
      const txt = '中華民國';
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.36;
        c.save(); c.translate(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66); c.rotate(a + Math.PI / 2);
        c.fillText(txt[i], 0, 0); c.restore();
      }
    }
    if (theme.coinInk) {
      c.strokeStyle = theme.coinInk; c.lineWidth = theme.coinLw * R / 14;
      c.beginPath(); c.arc(0, 0, R - c.lineWidth / 2, 0, TAU); c.stroke();
    }
  }

  function billBase(c, w, h) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#e8636b'); g.addColorStop(0.5, '#d9434f'); g.addColorStop(1, '#bf2f3d');
    c.fillStyle = g;
    rr(c, 0, 0, w, h, h * 0.06); c.fill();
    // 細紋
    c.strokeStyle = 'rgba(255,225,225,0.22)'; c.lineWidth = Math.max(0.5, h * 0.012);
    for (let k = 0; k < 7; k++) {
      c.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const y = h * (0.15 + k * 0.12) + Math.sin(x / w * TAU * 3 + k) * h * 0.03;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function drawBillFlat(c, w, h, theme) {
    billBase(c, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = h * 0.025;
    rr(c, h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12, h * 0.04); c.stroke();
    // 左側浮水印
    c.fillStyle = 'rgba(255,236,236,0.55)';
    c.beginPath(); c.ellipse(w * 0.16, h * 0.55, h * 0.24, h * 0.3, 0, 0, TAU); c.fill();
    // 中間建築（簡化的中式屋頂）
    c.fillStyle = 'rgba(110,10,25,0.42)';
    const bx = w * 0.44, by = h * 0.62;
    c.fillRect(bx - h * 0.32, by, h * 0.64, h * 0.2);
    c.beginPath();
    c.moveTo(bx - h * 0.45, by + h * 0.02); c.quadraticCurveTo(bx - h * 0.2, by - h * 0.05, bx, by - h * 0.2);
    c.quadraticCurveTo(bx + h * 0.2, by - h * 0.05, bx + h * 0.45, by + h * 0.02); c.closePath(); c.fill();
    for (let k = -2; k <= 2; k++) { c.fillStyle = 'rgba(255,230,230,0.5)'; c.fillRect(bx + k * h * 0.11 - h * 0.025, by + h * 0.05, h * 0.05, h * 0.13); }
    // 右側人像（剪影）
    c.fillStyle = 'rgba(255,230,230,0.35)';
    c.beginPath(); c.ellipse(w * 0.78, h * 0.5, h * 0.3, h * 0.38, 0, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.ellipse(w * 0.78, h * 0.5, h * 0.3, h * 0.38, 0, 0, TAU); c.clip();
    c.fillStyle = 'rgba(110,10,25,0.55)';
    c.beginPath(); c.ellipse(w * 0.78, h * 0.42, h * 0.13, h * 0.16, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(w * 0.78, h * 0.9, h * 0.26, h * 0.22, 0, 0, TAU); c.fill();
    c.restore();
    // 面額
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#fff4f0';
    c.font = `800 ${h * 0.24}px "Avenir Next","Helvetica Neue",Arial,sans-serif`;
    c.fillText('100', w * 0.05, h * 0.22);
    c.textAlign = 'right'; c.font = `800 ${h * 0.17}px "Avenir Next","Helvetica Neue",Arial,sans-serif`;
    c.fillText('100', w * 0.95, h * 0.84);
    c.textAlign = 'center'; c.font = `600 ${h * 0.11}px "PingFang TC","Heiti TC",sans-serif`;
    c.fillText('中華民國', w * 0.44, h * 0.18);
    c.font = `700 ${h * 0.12}px "PingFang TC","Heiti TC",sans-serif`;
    c.fillText('壹佰圓', w * 0.44, h * 0.32);
    if (theme.coinInk) { c.strokeStyle = theme.coinInk; c.lineWidth = theme.coinLw * h / 40; rr(c, 0, 0, w, h, h * 0.06); c.stroke(); }
  }
  function drawBillFolded(c, w, h, theme) {
    billBase(c, w, h);
    c.fillStyle = 'rgba(80,0,15,0.18)'; c.fillRect(w * 0.62, 0, w * 0.38, h);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = h * 0.05;
    c.beginPath(); c.moveTo(w * 0.62, h * 0.08); c.lineTo(w * 0.62, h * 0.92); c.stroke();
    c.fillStyle = 'rgba(255,236,236,0.5)';
    c.beginPath(); c.ellipse(w * 0.8, h * 0.5, h * 0.24, h * 0.3, 0, 0, TAU); c.fill();
    c.fillStyle = '#fff4f0'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `800 ${h * 0.5}px "Avenir Next","Helvetica Neue",Arial,sans-serif`;
    c.fillText('100', w * 0.07, h * 0.54);
    if (theme.coinInk) { c.strokeStyle = theme.coinInk; c.lineWidth = theme.coinLw * h / 22; rr(c, 0, 0, w, h, h * 0.12); c.stroke(); }
  }

  // 依目前縮放產生錢幣圖片快取
  function buildSprites(theme, px) {
    const S = {};
    for (const k of ['10', '50']) {
      S[k] = [0, 1].map(face => {
        const R = COIN_R[k] * px;
        const cv = makeCanvas(R * 2 + 4, R * 2 + 4), c = cv.getContext('2d');
        c.translate(cv.width / 2, cv.height / 2);
        drawCoin(c, R, k, face, theme);
        return cv;
      });
    }
    let cv = makeCanvas(BILL_FOLD.w * px, BILL_FOLD.h * px);
    drawBillFolded(cv.getContext('2d'), cv.width, cv.height, theme);
    S.fold = cv;
    cv = makeCanvas(BILL_FLAT.w * px, BILL_FLAT.h * px);
    drawBillFlat(cv.getContext('2d'), cv.width, cv.height, theme);
    S.flat = cv;
    return S;
  }

  /* ---------------- 注音 ---------------- */
  function zhuyin(text, bpmf) {
    return [...text].map((ch, i) => {
      const b = bpmf[i] || '';
      const m = b.match(/[ˊˇˋ˙]/), tone = m ? m[0] : '';
      const syms = [...b.replace(/[ˊˇˋ˙]/g, '')];
      const light = tone === '˙';
      return `<span class="zy"><span class="zy-c">${ch}</span><span class="zy-b">` +
        (light ? '<i class="zy-l">˙</i>' : '') +
        syms.map(s => `<i>${s}</i>`).join('') +
        (tone && !light ? `<i class="zy-t n${syms.length}">${tone}</i>` : '') +
        '</span></span>';
    }).join('');
  }

  /* ---------------- 罐子清單（原型示範用） ---------------- */
  const JARS = [
    { id: 'snack', shape: 'pig', color: 'red', title: '買零食', bpmf: ['ㄇㄞˇ', 'ㄌㄧㄥˊ', 'ㄕˊ'],
      seed: ['10', '10', '50', '10', '10', '100', '10', '50', '10'] },
    { id: 'car', shape: 'car', color: 'blue', title: '買車車', bpmf: ['ㄇㄞˇ', 'ㄔㄜ', 'ㄔㄜ'],
      seed: ['10', '50', '10', '10', '100', '10', '10'] },
    { id: 'save', shape: 'jar', color: 'glass', title: '存起來', bpmf: ['ㄘㄨㄣˊ', 'ㄑㄧˇ', 'ㄌㄞˊ'],
      seed: ['50', '50', '10', '100', '10', '10', '50', '10', '10', '10', '100', '50'] },
    { id: 'sos', shape: 'pig', color: 'yellow', title: '緊急用', bpmf: ['ㄐㄧㄣˇ', 'ㄐㄧˊ', 'ㄩㄥˋ'],
      seed: ['10', '10', '50', '10'] },
    { id: 'wish', shape: 'pig', color: 'sky', title: '大願望', bpmf: ['ㄉㄚˋ', 'ㄩㄢˋ', 'ㄨㄤˋ'],
      seed: [] },
  ];
  const STORE_KEY = 'piggy-proto-v1';
  function loadItems() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (raw && raw.jars) return raw.jars;
    } catch (e) { /* 無痕模式 */ }
    return null;
  }
  function saveItems(jars) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ jars: Object.fromEntries(jars.map(j => [j.def.id, j.items])) })); } catch (e) { /* 無痕模式 */ }
  }

  /* ---------------- 物理世界 ---------------- */
  function buildWorld(jar) {
    const shape = SHAPES[jar.def.shape];
    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = 1;
    const pts = shape.interior, T = 34, walls = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      let nx = dy / len, ny = -dx / len;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (pointInPoly(mx + nx, my + ny, pts)) { nx = -nx; ny = -ny; }
      walls.push(Bodies.rectangle(mx + nx * T / 2, my + ny * T / 2, len + 2, T, {
        isStatic: true, angle: Math.atan2(dy, dx), friction: 0.5, restitution: 0.1,
      }));
    }
    Composite.add(engine.world, walls);
    const world = { engine, shape, muted: true, shakeT: 0 };
    Events.on(engine, 'collisionStart', (ev) => {
      if (world.muted) return;
      for (const pr of ev.pairs) {
        const A = pr.bodyA, B = pr.bodyB;
        const ka = A.plugin.kind, kb = B.plugin.kind;
        if (!ka && !kb) continue;
        if (ka === '100' && (kb === '100' || !kb)) continue;
        if (kb === '100' && !ka) continue;
        const sp = Math.hypot(A.velocity.x - B.velocity.x, A.velocity.y - B.velocity.y);
        if (sp < 1.3) continue;
        const vol = clamp((sp - 1) / 7, 0.06, 1);
        const wall = A.isStatic || B.isStatic;
        Sound.clink(vol, wall ? shape.material : 'metal');
      }
    });
    // 依存入順序一批一批倒進去，讓它自然堆疊（數量 = 存入的數量）
    const items = jar.items.slice();
    let i = 0;
    while (i < items.length) {
      const y = shape.spawn.y + 8;
      const span = spanAt(pts, y + 16, 20) || [shape.spawn.x - 20, shape.spawn.x + 20];
      const n = Math.max(1, Math.floor((span[1] - span[0]) / 40));
      for (let k = 0; k < n && i < items.length; k++, i++) {
        const x = n === 1 ? (span[0] + span[1]) / 2 : lerp(span[0], span[1], k / (n - 1));
        addBody(world, items[i], x + rand(-3, 3), y + rand(0, 10), 0, true);
      }
      for (let s = 0; s < 22; s++) Engine.update(engine, 1000 / 60);
    }
    for (let s = 0; s < 120; s++) Engine.update(engine, 1000 / 60);
    world.muted = false;
    return world;
  }

  function addBody(world, kind, x, y, vy, settled) {
    let b;
    if (kind === '100') {
      b = Bodies.rectangle(x, y, BILL_FOLD.w, BILL_FOLD.h, {
        chamfer: { radius: 4 }, density: 0.0007, friction: 0.7, frictionAir: 0.045, restitution: 0.02,
        angle: rand(-0.25, 0.25),
      });
    } else {
      b = Bodies.circle(x, y, COIN_R[kind], {
        density: 0.003, friction: 0.35, frictionStatic: 0.6, frictionAir: 0.004, restitution: 0.22,
        angle: rand(0, TAU),
      });
    }
    b.plugin = { kind, face: Math.random() < 0.55 ? 0 : 1, born: settled ? -1e9 : performance.now() };
    Body.setVelocity(b, { x: rand(-0.4, 0.4), y: vy || 0 });
    Composite.add(world.engine.world, b);
    return b;
  }

  function pileTop(world) {
    let top = Infinity;
    for (const b of Composite.allBodies(world.engine.world)) {
      if (!b.plugin.kind || b.speed > 0.6) continue;
      const r = b.plugin.kind === '100' ? BILL_FOLD.h / 2 : COIN_R[b.plugin.kind];
      top = Math.min(top, b.position.y - r);
    }
    return top;
  }

  /* ---------------- 主程式 ---------------- */
  function start(theme) {
    const $ = (s) => document.querySelector(s);
    const canvas = $('#stage'), ctx = canvas.getContext('2d');
    const titleEl = $('#title'), dotsEl = $('#dots'), trayEl = $('#tray');

    const saved = loadItems();
    const jars = JARS.map(def => ({ def, items: saved && saved[def.id] ? saved[def.id].slice() : def.seed.slice(), world: null, layers: null }));
    const colorsFor = (def) => Object.assign({}, theme.common, theme.colors[def.color]);

    let W = 0, H = 0, dpr = 1, scale = 1, ox = 0, oy = 0, sprites = null;
    let pos = 0, target = 0, active = 0;
    const flyers = [];

    function ensureWorld(i) {
      const j = jars[i];
      if (j && !j.world) j.world = buildWorld(j);
    }

    function renderLayers(j) {
      const shape = SHAPES[j.def.shape], col = colorsFor(j.def);
      const px = scale * dpr;
      const mk = (fn) => {
        const cv = makeCanvas((LW + PAD * 2) * px, (LH + PAD * 2) * px);
        const c = cv.getContext('2d');
        c.scale(px, px); c.translate(PAD, PAD);
        fn.call(shape, new Painter(c, theme, px), col);
        return cv;
      };
      j.layers = { back: mk(shape.back), front: mk(shape.front), px };
    }

    function layout() {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      const top = titleEl.getBoundingClientRect().bottom + 6;
      const bottom = dotsEl.getBoundingClientRect().top - 4;
      scale = clamp(Math.min((W - 16) / LW, (bottom - top) / LH, 1.6), 0.3, 1.6);
      ox = (W - LW * scale) / 2;
      oy = top + Math.max(0, bottom - top - LH * scale) * 0.4;
      sprites = buildSprites(theme, scale * dpr);
      jars.forEach(j => { j.layers = null; });
    }

    // ---- 標題、頁面小點 ----
    function setTitle(i) {
      const def = jars[i].def;
      titleEl.classList.add('swap');
      setTimeout(() => {
        titleEl.innerHTML = `<div class="ttl">${zhuyin(def.title, def.bpmf)}</div>`;
        titleEl.classList.remove('swap');
      }, 140);
      [...dotsEl.children].forEach((d, k) => d.classList.toggle('on', k === i));
    }
    dotsEl.innerHTML = jars.map(() => '<i></i>').join('');
    titleEl.innerHTML = `<div class="ttl">${zhuyin(jars[0].def.title, jars[0].def.bpmf)}</div>`;

    // ---- 投幣盤 ----
    function trayImage(kind) {
      const c = makeCanvas(kind === '100' ? 200 : 120, kind === '100' ? 98 : 120);
      const x = c.getContext('2d');
      if (kind === '100') drawBillFlat(x, 200, 98, theme);
      else { x.translate(60, 60); drawCoin(x, 58, kind, 0, theme); }
      return c.toDataURL();
    }
    trayEl.innerHTML = ['10', '50', '100'].map(k =>
      `<button class="money m${k}" data-kind="${k}" aria-label="${k}"><img src="${trayImage(k)}" alt=""></button>`).join('');
    trayEl.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.money');
      if (!btn) return;
      e.preventDefault();
      Sound.unlock();
      btn.classList.remove('tap'); void btn.offsetWidth; btn.classList.add('tap');
      deposit(btn.dataset.kind, btn.getBoundingClientRect());
    });

    function toLogical(i, x, y) {
      return [(x - ox - (i - pos) * W) / scale, (y - oy) / scale];
    }

    function deposit(kind, rect) {
      const i = active, j = jars[i];
      ensureWorld(i);
      const shape = SHAPES[j.def.shape];
      const inFlight = flyers.filter(f => f.jar === i).length;
      if (pileTop(j.world) < shape.fullY + 10 + inFlight * 4) {
        j.world.shakeT = performance.now();
        Sound.bonk();
        return;
      }
      j.items.push(kind);
      saveItems(jars);
      const [sx, sy] = toLogical(i, rect.left + rect.width / 2, rect.top + rect.height / 2);
      const startSize = rect.width / scale;
      flyers.push(kind === '100' ? billFlyer(i, sx, sy, startSize, shape) : coinFlyer(i, kind, sx, sy, startSize, shape));
    }

    function coinFlyer(i, kind, sx, sy, startSize, shape) {
      const s = shape.slot, r = COIN_R[kind];
      const ex = s.x, ey = s.y - 26;
      const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 190;
      const startScale = clamp(startSize / (r * 2) * 0.9, 1, 3);
      return {
        jar: i, kind, t0: performance.now(), dur: 820, face: 0, dinged: false,
        state(t) {
          if (t < 0.78) {
            const u = t / 0.78, e = 1 - Math.pow(1 - u, 2.2);
            const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * ex;
            const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * ey;
            const spin = u * TAU * 2.25;
            return { x, y, size: lerp(startScale, 1, Math.min(1, u * 1.4)), sx: Math.max(0.12, Math.abs(Math.cos(spin))), face: Math.cos(spin) > 0 ? 0 : 1 };
          }
          const u = (t - 0.78) / 0.22;
          return { x: ex, y: lerp(ey, shape.spawn.y, u * u), size: 1, sx: lerp(Math.abs(Math.cos(TAU * 2.25)), 0.14, Math.min(1, u * 3)), face: 0 };
        },
        draw(c, st) {
          const h = (r + 2 / (scale * dpr)) * st.size;
          c.save(); c.translate(st.x, st.y); c.scale(st.sx, 1);
          c.drawImage(sprites[kind][st.face], -h, -h, h * 2, h * 2);
          c.restore();
        },
        done(world) {
          Sound.ding(kind);
          addBody(world, kind, shape.spawn.x + rand(-4, 4), shape.spawn.y, 3.2, false);
        },
      };
    }

    function billFlyer(i, sx, sy, startSize, shape) {
      const s = shape.slot;
      const topY = toLogical(i, 0, Math.max(30, oy * 0.4))[1] - 30;
      const startScale = clamp(startSize / BILL_FLAT.w, 0.4, 1.4);
      const phase = rand(0, TAU);
      let rustled = false;
      return {
        jar: i, kind: '100', t0: performance.now(), dur: 2500,
        state(t) {
          if (t < 0.18) {
            const u = t / 0.18, e = 1 - Math.pow(1 - u, 2);
            return { x: lerp(sx, s.x + 30, e), y: lerp(sy, topY, e), rot: lerp(0, -0.3, e), fx: lerp(startScale, 1, e), fy: lerp(startScale, 1, e) };
          }
          if (!rustled) { rustled = true; Sound.rustle(1.7); }
          const u = (t - 0.18) / 0.82;
          const sway = Math.sin(u * TAU * 1.6 + phase) * 46 * (1 - u * 0.9);
          const y = lerp(topY, s.y - 6, u * u * 0.55 + u * 0.45);
          const flip = Math.cos(u * TAU * 2.2 + phase);
          const fold = u > 0.82 ? (u - 0.82) / 0.18 : 0;
          return {
            x: s.x + 30 * (1 - u) + sway, y,
            rot: Math.sin(u * TAU * 1.6 + phase + 0.9) * 0.45 * (1 - u * 0.8),
            fx: lerp(1, 0.42, fold), fy: (0.55 + 0.45 * Math.abs(flip)) * lerp(1, 0.4, fold),
          };
        },
        draw(c, st) {
          c.save(); c.translate(st.x, st.y); c.rotate(st.rot); c.scale(st.fx, st.fy);
          c.drawImage(sprites.flat, -BILL_FLAT.w / 2, -BILL_FLAT.h / 2, BILL_FLAT.w, BILL_FLAT.h);
          c.restore();
        },
        done(world) {
          Sound.plop();
          addBody(world, '100', shape.spawn.x + rand(-6, 6), shape.spawn.y + 4, 1, false);
        },
      };
    }

    // ---- 左右滑動切換罐子 ----
    let drag = null;
    window.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .sheet, a')) return;
      Sound.unlock();
      drag = { x0: e.clientX, pos0: pos, hist: [[e.clientX, performance.now()]] };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x0;
      let p = drag.pos0 - dx / W;
      if (p < 0) p = p * 0.35;
      if (p > jars.length - 1) p = jars.length - 1 + (p - jars.length + 1) * 0.35;
      pos = target = p;
      drag.hist.push([e.clientX, performance.now()]);
      if (drag.hist.length > 6) drag.hist.shift();
      ensureWorld(Math.floor(pos)); ensureWorld(Math.ceil(pos));
    });
    const endDrag = () => {
      if (!drag) return;
      const h = drag.hist, a = h[0], b = h[h.length - 1];
      const v = (b[0] - a[0]) / Math.max(1, b[1] - a[1]); // px/ms
      let t = Math.round(pos);
      if (Math.abs(v) > 0.35) t = Math.round(drag.pos0) + (v < 0 ? 1 : -1);
      target = clamp(t, 0, jars.length - 1);
      drag = null;
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') target = Math.min(jars.length - 1, Math.round(target) + 1);
      if (e.key === 'ArrowLeft') target = Math.max(0, Math.round(target) - 1);
      ensureWorld(target);
    });

    // ---- 每一幀 ----
    let last = performance.now(), acc = 0;
    function frame(now) {
      const dt = Math.min(64, now - last); last = now;
      if (!drag) pos += (target - pos) * (1 - Math.exp(-dt / 70));
      if (Math.abs(target - pos) < 0.0005 && !drag) pos = target;
      const a = clamp(Math.round(pos), 0, jars.length - 1);
      if (a !== active) { active = a; setTitle(a); ensureWorld(a); }

      // 物理：固定 60Hz 步進
      acc += dt;
      let steps = 0;
      while (acc >= 1000 / 60 && steps < 4) {
        for (const j of jars) if (j.world) Engine.update(j.world.engine, 1000 / 60);
        acc -= 1000 / 60; steps++;
      }
      if (steps === 4) acc = 0;

      // 飛行中的錢
      for (let k = flyers.length - 1; k >= 0; k--) {
        const f = flyers[k];
        const t = (now - f.t0) / f.dur;
        if (t >= 1) { ensureWorld(f.jar); f.done(jars[f.jar].world); flyers.splice(k, 1); }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < jars.length; i++) {
        const off = (i - pos) * W;
        if (Math.abs(off) > W * 1.05) continue;
        drawJar(i, off, now);
      }
      requestAnimationFrame(frame);
    }

    function drawJar(i, off, now) {
      const j = jars[i];
      ensureWorld(i);
      if (!j.layers) renderLayers(j);
      let shake = 0;
      const st = now - j.world.shakeT;
      if (st < 380) shake = Math.sin(st / 380 * TAU * 4) * 9 * (1 - st / 380);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + off + shake * scale), dpr * oy);
      const L = j.layers;
      ctx.drawImage(L.back, -PAD, -PAD, LW + PAD * 2, LH + PAD * 2);
      for (const b of Composite.allBodies(j.world.engine.world)) {
        const k = b.plugin.kind;
        if (!k) continue;
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        if (k === '100') {
          ctx.drawImage(sprites.fold, -BILL_FOLD.w / 2, -BILL_FOLD.h / 2, BILL_FOLD.w, BILL_FOLD.h);
        } else {
          const h = COIN_R[k] + 2 / (scale * dpr);
          const age = now - b.plugin.born;
          if (age < 220) ctx.scale(lerp(0.14, 1, age / 220), 1);
          ctx.drawImage(sprites[k][b.plugin.face], -h, -h, h * 2, h * 2);
        }
        ctx.restore();
      }
      ctx.drawImage(L.front, -PAD, -PAD, LW + PAD * 2, LH + PAD * 2);
      for (const f of flyers) {
        if (f.jar !== i) continue;
        const t = clamp((now - f.t0) / f.dur, 0, 1);
        f.draw(ctx, f.state(t));
      }
    }

    // ---- 角落按鈕（原型先放提示） ----
    const toast = $('#toast');
    let toastTimer = 0;
    function showToast(html) {
      toast.innerHTML = html; toast.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
    }
    $('#btnCalc').addEventListener('click', () => showToast($('#btnCalc').innerHTML + '<span>' + zhuyin('計算機', ['ㄐㄧˋ', 'ㄙㄨㄢˋ', 'ㄐㄧ']) + '</span>'));
    $('#btnWish').addEventListener('click', () => showToast($('#btnWish').innerHTML + '<span>' + zhuyin('願望', ['ㄩㄢˋ', 'ㄨㄤˋ']) + '</span>'));
    const sheet = $('#sheet');
    $('#btnSettings').addEventListener('click', () => sheet.classList.add('open'));
    sheet.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (e.target === sheet || (act && act.dataset.act === 'close')) sheet.classList.remove('open');
      if (act && act.dataset.act === 'empty') {
        const j = jars[active];
        j.items = []; j.world = null; saveItems(jars); ensureWorld(active);
        sheet.classList.remove('open');
      }
      if (act && act.dataset.act === 'reset') {
        jars.forEach(j => { j.items = j.def.seed.slice(); j.world = null; });
        saveItems(jars); ensureWorld(active);
        sheet.classList.remove('open');
      }
    });

    let resizeTimer = 0;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
    const go = () => {
      layout();
      [...dotsEl.children][0].classList.add('on');
      ensureWorld(0);
      requestAnimationFrame((t) => { last = t; frame(t); });
      // 其他罐子趁空檔先堆好，滑過去時不會卡
      jars.forEach((_, i) => setTimeout(() => ensureWorld(i), 300 + i * 120));
    };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go);
  }

  window.PiggyProto = { start, zhuyin };
})();
