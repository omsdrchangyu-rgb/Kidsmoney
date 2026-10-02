// 繪圖：存錢罐造型、新台幣錢幣、盤子、背景
// 風格：兒童蠟筆畫——兩道稍微錯開的抖動線條，塗色用斜斜的筆觸、不塗滿、留一點紙色
// （跟「道路拼圖」車車遊戲的兒童手繪風格同一套做法）
import {
  TAU, lighten, darken, ellipsePts, pathPts, roundRectPts,
  bbox, insetPts, resample, makeCanvas,
} from './util.js';

export const LW = 360, LH = 440, PAD = 40, FLOOR = 400;
export const INK = '#4b3a2f';

/* ---------------- 蠟筆 ---------------- */
// 固定亂數種子：同一張圖每次畫出來都一樣，不會一直抖
export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 蠟筆的顆粒：紙張凸起的地方沾到顏色、凹下去的地方留白
const patCache = new Map();
function crayonPattern(c, color) {
  if (patCache.has(color)) return patCache.get(color);
  const S = 48, cv = makeCanvas(S, S), x = cv.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  const img = x.getImageData(0, 0, S, S), R = rng(color.length * 97 + 13);
  for (let i = 0; i < S * S; i++) {
    const r = R();
    img.data[i * 4 + 3] = r < 0.26 ? 0 : Math.round(255 * (0.55 + 0.45 * R()));
  }
  x.putImageData(img, 0, 0);
  const pat = c.createPattern(cv, 'repeat');
  patCache.set(color, pat);
  return pat;
}

export class Pen {
  constructor(c, seed = 1) { this.c = c; this.R = rng(seed); }
  seed(n) { this.R = rng(n); }
  j(a) { return (this.R() - 0.5) * 2 * a; }
  wobble(pts, closed = true, amp = 1, step = 6) {
    const out = [], n = pts.length, segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let s = 0; s < k; s++) {
        const t = s / k;
        out.push([a[0] + (b[0] - a[0]) * t + this.j(amp), a[1] + (b[1] - a[1]) * t + this.j(amp)]);
      }
    }
    if (!closed) { const l = pts[n - 1]; out.push([l[0] + this.j(amp), l[1] + this.j(amp)]); }
    return out;
  }
  trace(pts, closed = true) {
    const c = this.c;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    if (closed) c.closePath();
  }
  // 實心（眼睛、鼻孔、投幣孔這種小地方）
  fill(pts, color, alpha = 1) {
    const c = this.c;
    c.save(); c.globalAlpha = alpha; c.fillStyle = color; this.trace(pts); c.fill(); c.restore();
  }
  // 描邊：一道主線 + 一道淡淡錯開的線
  line(pts, color = INK, lw = 2.4, closed = true, o = {}) {
    const c = this.c, amp = o.amp ?? 0.9;
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = crayonPattern(c, color);
    c.globalAlpha = o.alpha ?? 1; c.lineWidth = lw;
    this.trace(this.wobble(pts, closed, amp), closed); c.stroke();
    c.globalAlpha *= 0.5; c.lineWidth = lw * 0.75;
    this.trace(this.wobble(pts, closed, amp * 1.8), closed); c.stroke();
    c.restore();
  }
  // 蠟筆塗色：斜斜的平行筆觸，有的地方漏掉、邊緣不一定塗到線
  color(pts, color, o = {}) {
    const c = this.c, b = bbox(pts);
    const area = o.inset ? insetPts(pts, o.inset) : pts;
    c.save();
    this.trace(this.wobble(area, true, o.edge ?? 1.6, 5)); c.clip();
    c.strokeStyle = crayonPattern(c, color);
    c.globalAlpha = o.alpha ?? 0.9;
    c.lineCap = 'round';
    const ang = o.angle ?? -0.62, dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const diag = Math.hypot(b.w, b.h) / 2 + 6, gap = o.gap ?? 3.4, lw = o.lw ?? gap * 1.05;
    for (let d = -diag; d <= diag; d += gap) {
      if (this.R() > (o.cover ?? 0.94)) continue;
      const a = ang + this.j(0.05), ex = Math.cos(a), ey = Math.sin(a);
      const ox = b.cx + nx * (d + this.j(gap * 0.3)), oy = b.cy + ny * (d + this.j(gap * 0.3));
      c.lineWidth = lw * (0.8 + this.R() * 0.4);
      c.beginPath();
      c.moveTo(ox - ex * diag, oy - ey * diag);
      c.lineTo(ox + ex * diag, oy + ey * diag);
      c.stroke();
    }
    c.restore();
  }
  // 白色蠟筆的反光
  shine(pts, lw = 4, alpha = 0.95) {
    const c = this.c;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = crayonPattern(c, '#ffffff'); c.globalAlpha = alpha; c.lineWidth = lw;
    this.trace(this.wobble(pts, false, 0.5, 5), false); c.stroke();
    c.restore();
  }
  clipIn(pts, fn) { const c = this.c; c.save(); this.trace(pts); c.clip(); fn(); c.restore(); }
  clipOut(pts, fn) {
    const c = this.c;
    c.save(); c.beginPath();
    c.rect(-5000, -5000, 10000, 10000);
    for (let i = pts.length - 1; i >= 0; i--) i === pts.length - 1 ? c.moveTo(pts[i][0], pts[i][1]) : c.lineTo(pts[i][0], pts[i][1]);
    c.closePath(); c.clip('evenodd');
    fn(); c.restore();
  }
  // 地上的影子：橫向的淡淡筆觸
  shadow(cx, cy, rx, ry) {
    this.color(ell(cx, cy, rx, ry), '#8a6a4e', { alpha: 0.32, angle: 0.04, gap: 2.8, edge: 2.4 });
  }
}
export const ell = (cx, cy, rx, ry, rot = 0, n = 48) => ellipsePts(0, 0, rx, ry, n).map(([x, y]) =>
  [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

// 透明塑膠：整體淡淡塗一層（看得到裡面的錢），右下角再疊一層比較深的筆觸當陰影
function clearPlastic(pen, pts, m, o = {}) {
  const b = bbox(pts);
  pen.color(pts, m, { alpha: o.alpha ?? 0.34, gap: o.gap ?? 4.6, lw: 2.6, cover: 0.8, inset: 2 });
  pen.clipIn(pts, () => pen.clipOut(shift(pts, -b.w * 0.07, -b.h * 0.085),
    () => pen.color(pts, darken(m, 0.12), { alpha: 0.62, gap: 3, angle: 0.55, inset: 0 })));
}
// 不透明的小零件（腳、耳朵、鼻子）：塗滿一點，再加陰影
function solid(pen, pts, m, o = {}) {
  const b = bbox(pts);
  pen.color(pts, m, { alpha: 0.95, gap: o.gap ?? 2.8, inset: 1.5 });
  pen.clipIn(pts, () => pen.clipOut(shift(pts, -b.w * 0.14, -b.h * 0.12),
    () => pen.color(pts, darken(m, 0.16), { alpha: 0.7, gap: 2.6, angle: 0.55 })));
  pen.line(pts, INK, o.lw ?? 2.2);
}
function slot(pen, s, color) {
  const c = pen.c;
  c.save(); c.translate(s.x, s.y); c.rotate(s.a);
  const rim = roundRectPts(-s.w / 2 - 6, -8, s.w + 12, 16, 8);
  pen.color(rim, lighten(color, 0.45), { alpha: 0.95, gap: 2.4 });
  pen.fill(roundRectPts(-s.w / 2, -3.6, s.w, 7.2, 3.6), '#3a2c26');
  pen.line(rim, INK, 2);
  c.restore();
}
function eye(pen, x, y, r) {
  pen.fill(pen.wobble(ell(x, y, r, r * 1.08, 0, 24), true, 0.3, 3), '#2c2430');
  pen.fill(ell(x - r * 0.32, y - r * 0.36, r * 0.38, r * 0.4), '#ffffff');
  pen.fill(ell(x + r * 0.34, y + r * 0.34, r * 0.16, r * 0.16), '#ffffff', 0.9);
}

/* ---------------- 存錢罐造型 ---------------- */
// 每個造型：interior（物理內壁）、slot、spawn（掉進去的位置）、fullY（堆到這裡就滿了）、back/front 兩層
const PIG = (() => {
  const body = pathPts([
    ['M', 66, 262], ['Q', 64, 160, 172, 150], ['Q', 278, 142, 306, 214], ['Q', 322, 254, 312, 300],
    ['Q', 296, 382, 186, 384], ['Q', 72, 386, 66, 300], ['Q', 65, 280, 66, 262],
  ], 16);
  const earB = pathPts([['M', 104, 184], ['Q', 92, 130, 130, 118], ['Q', 158, 128, 164, 170]], 10);
  const earBin = pathPts([['M', 116, 176], ['Q', 108, 140, 131, 132], ['Q', 148, 140, 152, 168]], 8);
  const earF = pathPts([['M', 206, 160], ['Q', 212, 106, 252, 110], ['Q', 268, 134, 264, 172]], 10);
  const earFin = pathPts([['M', 218, 156], ['Q', 222, 122, 248, 124], ['Q', 256, 140, 254, 162]], 8);
  const snout = ell(304, 292, 31, 37);
  return {
    body, interior: resample(insetPts(body, 11), 9), material: 'plastic',
    slot: { x: 166, y: 154, w: 54, a: -0.04 }, spawn: { x: 166, y: 180 }, fullY: 184,
    back(pen, col) {
      const m = col.main;
      pen.seed(101);
      pen.shadow(190, FLOOR - 2, 156, 15);
      pen.clipOut(body, () => {
        for (const [x, bottom, sh] of [[110, 394, 0.1], [156, 396, 0.1], [228, 400, 0], [278, 398, 0]]) {
          solid(pen, roundRectPts(x - 21, 326, 42, bottom - 326, [10, 10, 18, 18]), darken(m, sh));
        }
        solid(pen, earB, darken(m, 0.08));
        pen.color(earBin, lighten(m, 0.35), { alpha: 0.85, gap: 2.4 });
        solid(pen, earF, m);
        pen.color(earFin, lighten(m, 0.4), { alpha: 0.85, gap: 2.4 });
        pen.shine([[224, 140], [233, 124]], 3);
        // 捲捲尾巴
        const tail = [];
        for (let i = 0; i <= 44; i++) {
          const a = (i / 44) * TAU * 1.3, r = 3 + i * 0.3;
          tail.push([70 - i * 0.62 - Math.cos(a) * r, 266 - Math.sin(a) * r]);
        }
        pen.line(tail, INK, 8.5, false, { amp: 0.4 });
        pen.line(tail, m, 5, false, { amp: 0.3 });
      });
      pen.fill(body, 'rgba(255,253,246,0.42)');
      pen.color(body, m, { alpha: 0.14, gap: 6, cover: 0.7 });
    },
    front(pen, col) {
      const m = col.main;
      pen.seed(202);
      clearPlastic(pen, body, m);
      // 白蠟筆反光
      pen.shine(pathPts([['M', 92, 300], ['Q', 86, 238, 112, 196]], 6), 6);
      pen.shine([[104, 318], [101, 330]], 5);
      pen.shine(pathPts([['M', 132, 172], ['Q', 170, 162, 212, 166]], 6), 4);
      pen.shine(pathPts([['M', 128, 366], ['Q', 186, 376, 250, 364]], 6), 3, 0.7);
      pen.line(body, INK, 2.8);
      // 鼻子
      solid(pen, snout, m, { gap: 2.6 });
      pen.fill(pen.wobble(ell(296, 286, 5.5, 10.5, 0.08, 16), true, 0.3, 3), '#4a2a2e');
      pen.fill(pen.wobble(ell(316, 289, 5, 10, 0.08, 16), true, 0.3, 3), '#4a2a2e');
      pen.shine([[292, 266], [306, 262]], 3.5);
      // 眼睛、眉毛、腮紅
      eye(pen, 238, 236, 11.5);
      eye(pen, 290, 226, 10);
      pen.line(pathPts([['M', 226, 213], ['Q', 236, 205, 248, 211]], 6), INK, 2.4, false);
      pen.color(ell(248, 270, 15, 8), '#ff8fa3', { alpha: 0.8, gap: 2.2, lw: 2, angle: -0.25 });
      slot(pen, this.slot, m);
    },
  };
})();

const JAR = (() => {
  const body = pathPts([
    ['M', 114, 104], ['Q', 80, 112, 78, 150], ['L', 78, 372], ['Q', 78, 400, 108, 400],
    ['L', 252, 400], ['Q', 282, 400, 282, 372], ['L', 282, 150], ['Q', 280, 112, 246, 104],
  ], 10);
  const neck = roundRectPts(104, 88, 152, 20, 7);
  const lid = roundRectPts(94, 54, 172, 40, 12);
  return {
    body, interior: resample(insetPts(body, 9), 9), material: 'glass',
    slot: { x: 180, y: 58, w: 54, a: 0 }, spawn: { x: 180, y: 128 }, fullY: 130,
    back(pen, col) {
      pen.seed(303);
      pen.shadow(180, FLOOR - 1, 126, 12);
      pen.fill(body, 'rgba(255,253,246,0.45)');
      pen.color(body, col.main, { alpha: 0.12, gap: 7, cover: 0.6 });
    },
    front(pen, col) {
      const m = col.main;
      pen.seed(404);
      // 玻璃：兩側比較厚，所以邊邊塗深一點，中間幾乎透明
      pen.color(body, m, { alpha: 0.2, gap: 7, cover: 0.55, inset: 2 });
      pen.clipIn(body, () => pen.clipOut(insetPts(body, 16), () => pen.color(body, m, { alpha: 0.75, gap: 2.8, angle: -1.3 })));
      pen.shine([[96, 160], [95, 250], [96, 350]], 6);
      pen.shine([[112, 176], [112, 300]], 3, 0.7);
      pen.shine([[96, 366], [97, 380]], 5);
      pen.shine([[264, 176], [265, 232]], 4);
      pen.shine(pathPts([['M', 100, 392], ['Q', 180, 402, 260, 392]], 6), 3, 0.7);
      pen.line(body, INK, 2.6);
      sticker(pen, col.deco, 180, 152, 30);
      // 瓶口
      pen.color(neck, m, { alpha: 0.8, gap: 2.6 });
      pen.line(neck, INK, 2.2);
      // 紅色點點蓋子
      solid(pen, lid, col.lid, { gap: 2.4 });
      pen.clipIn(lid, () => {
        for (let y = 63, r = 0; y < 94; y += 13, r++) {
          for (let x = 102 + (r % 2) * 9; x < 264; x += 18) pen.fill(pen.wobble(ell(x, y, 3.4, 3.2, 0, 10), true, 0.4, 2), '#fffaf0');
        }
      });
      pen.line(lid, INK, 2.6);
      pen.shine([[108, 63], [156, 61]], 3.5);
      slot(pen, this.slot, col.lid);
    },
  };
})();

const CAR = (() => {
  const body = pathPts([
    ['M', 42, 312], ['Q', 40, 256, 84, 250], ['L', 108, 248], ['Q', 124, 180, 168, 176], ['L', 222, 176],
    ['Q', 258, 178, 282, 242], ['L', 304, 246], ['Q', 332, 252, 332, 296], ['L', 332, 334], ['Q', 332, 358, 308, 360],
    ['A', 266, 368, 42.8, -0.19, -2.95], ['L', 142, 360],
    ['A', 100, 368, 42.8, -0.19, -2.95], ['Q', 42, 360, 42, 338],
  ], 10);
  const winR = pathPts([['M', 122, 244], ['Q', 136, 194, 176, 190], ['L', 184, 190], ['L', 184, 244]], 8);
  const winF = pathPts([['M', 196, 190], ['L', 218, 190], ['Q', 250, 192, 268, 240], ['L', 196, 242]], 8);
  const wheel = (pen, x, col) => {
    const y = 368;
    solid(pen, ell(x, y, 32, 32), '#4a4048', { gap: 2.4, lw: 2.6 });
    solid(pen, ell(x, y, 14, 14), col.hub, { gap: 2.4, lw: 2 });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU - Math.PI / 2;
      pen.fill(ell(x + Math.cos(a) * 7.5, y + Math.sin(a) * 7.5, 2, 2), INK);
    }
    pen.shine(ellipsePts(x, y, 25, 25, 8, Math.PI * 1.1, Math.PI * 1.42), 3, 0.6);
  };
  return {
    body, interior: resample(insetPts(body, 10), 9), material: 'plastic',
    slot: { x: 196, y: 178, w: 48, a: 0 }, spawn: { x: 196, y: 202 }, fullY: 204,
    back(pen, col) {
      pen.seed(505);
      pen.shadow(186, FLOOR - 1, 166, 12);
      pen.fill(body, 'rgba(255,253,246,0.42)');
      pen.color(body, col.main, { alpha: 0.14, gap: 6, cover: 0.7 });
    },
    front(pen, col) {
      const m = col.main;
      pen.seed(606);
      clearPlastic(pen, body, m);
      for (const w of [winR, winF]) {
        pen.color(w, '#dff3ff', { alpha: 0.6, gap: 3.4, angle: -1.0 });
        pen.line(w, INK, 2);
      }
      pen.shine([[138, 230], [152, 204]], 4);
      pen.shine([[208, 206], [224, 204]], 4);
      pen.line([[190, 250], [190, 352]], INK, 1.6, false, { alpha: 0.6 });
      pen.line([[154, 264], [170, 264]], INK, 3, false);
      pen.line([[208, 264], [224, 264]], INK, 3, false);
      pen.shine(pathPts([['M', 70, 276], ['Q', 180, 266, 300, 272]], 8), 4, 0.8);
      pen.shine([[60, 288], [58, 314]], 5);
      pen.line(body, INK, 2.8);
      // 車燈、保險桿
      solid(pen, ell(324, 278, 7, 10), '#ffe066', { lw: 1.8 });
      solid(pen, roundRectPts(37, 272, 10, 18, 4), '#ff6b6b', { lw: 1.8 });
      solid(pen, roundRectPts(302, 328, 36, 14, 7), col.hub, { lw: 2 });
      solid(pen, roundRectPts(34, 328, 28, 14, 7), col.hub, { lw: 2 });
      wheel(pen, 100, col); wheel(pen, 266, col);
      slot(pen, this.slot, m);
    },
  };
})();

// 玻璃罐上的貼紙
export const DECO_COLORS = { heart: '#ff6b81', star: '#ffd25e', sun: '#ffb03a' };
export const LIDS = { heart: '#e8443a', star: '#3f7fd6', sun: '#f2c230' };
function heartPts(x, y, s) {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    const hx = 16 * Math.pow(Math.sin(a), 3);
    const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    pts.push([x + (hx * s) / 17, y + (hy * s) / 17]);
  }
  return pts;
}
function starPts(x, y, s) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? s * 0.45 : s;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  return pts;
}
function sticker(pen, deco, x, y, s) {
  if (!deco) return;
  const color = DECO_COLORS[deco];
  if (deco === 'heart') {
    solid(pen, heartPts(x, y, s), color, { gap: 2.2 });
  } else if (deco === 'star') {
    solid(pen, starPts(x, y + 2, s * 1.1), color, { gap: 2.2 });
  } else if (deco === 'sun') {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      pen.line([[x + Math.cos(a) * s * 0.78, y + Math.sin(a) * s * 0.78], [x + Math.cos(a) * s * 1.12, y + Math.sin(a) * s * 1.12]], '#e8941a', 3.4, false);
    }
    solid(pen, ell(x, y, s * 0.6, s * 0.6), color, { gap: 2.2 });
    pen.fill(ell(x - s * 0.2, y - s * 0.08, 1.8, 2.2), INK);
    pen.fill(ell(x + s * 0.2, y - s * 0.08, 1.8, 2.2), INK);
    pen.line(ellipsePts(x, y + s * 0.05, s * 0.24, s * 0.2, 6, 0.3, Math.PI - 0.3), INK, 1.8, false);
  }
}

const TRAIN = (() => {
  const body = pathPts([
    ['M', 44, 180], ['L', 136, 180], ['L', 136, 236], ['L', 286, 236], ['Q', 318, 236, 318, 268],
    ['L', 318, 322], ['Q', 318, 346, 294, 346], ['L', 44, 346],
  ], 10);
  const wheel = (pen, x, r, col) => {
    const y = 400 - r;
    solid(pen, ell(x, y, r, r), '#4a4048', { gap: 2.4, lw: 2.6 });
    solid(pen, ell(x, y, r * 0.42, r * 0.42), col.hub, { gap: 2.4, lw: 2 });
    pen.shine(ellipsePts(x, y, r * 0.78, r * 0.78, 8, Math.PI * 1.1, Math.PI * 1.42), 3, 0.6);
  };
  return {
    body, interior: resample(insetPts(body, 10), 9), material: 'plastic',
    slot: { x: 90, y: 164, w: 46, a: 0 }, spawn: { x: 90, y: 198 }, fullY: 200,
    back(pen, col) {
      pen.seed(707);
      pen.shadow(186, FLOOR - 1, 166, 12);
      pen.fill(body, 'rgba(255,253,246,0.42)');
      pen.color(body, col.main, { alpha: 0.14, gap: 6, cover: 0.7 });
    },
    front(pen, col) {
      const m = col.main;
      pen.seed(808);
      // 煙囪冒煙
      solid(pen, ell(286, 150, 15, 12), '#eef0f2', { gap: 2.6, lw: 2 });
      solid(pen, ell(306, 122, 19, 15), '#eef0f2', { gap: 2.6, lw: 2 });
      solid(pen, [[262, 236], [266, 200], [252, 186], [298, 186], [284, 200], [288, 236]], col.trim, { gap: 2.4 });
      solid(pen, ellipsePts(198, 237, 17, 15, 10, Math.PI, TAU), darken(m, 0.08), { gap: 2.4 });
      clearPlastic(pen, body, m);
      pen.color(roundRectPts(64, 198, 52, 44, 8), '#dff3ff', { alpha: 0.6, gap: 3.4, angle: -1.0 });
      pen.line(roundRectPts(64, 198, 52, 44, 8), INK, 2);
      pen.line([[190, 240], [190, 342]], INK, 2, false, { alpha: 0.55 });
      pen.line([[252, 240], [252, 342]], INK, 2, false, { alpha: 0.55 });
      pen.shine([[56, 210], [56, 300]], 5);
      pen.shine(pathPts([['M', 150, 250], ['Q', 220, 244, 290, 250]], 6), 4, 0.8);
      pen.line(body, INK, 2.8);
      solid(pen, roundRectPts(30, 160, 120, 22, 8), col.trim, { gap: 2.4 });
      pen.shine([[42, 166], [100, 165]], 3, 0.7);
      solid(pen, ell(320, 264, 7, 10), '#ffe066', { lw: 1.8 });
      solid(pen, roundRectPts(36, 344, 282, 12, 4), col.trim, { gap: 2.4 });
      solid(pen, [[304, 346], [344, 398], [304, 398]], col.trim, { gap: 2.4 });
      wheel(pen, 84, 32, col); wheel(pen, 176, 26, col); wheel(pen, 252, 26, col);
      pen.line([[84, 368], [176, 374], [252, 374]], '#c0392b', 4.5, false);
      slot(pen, this.slot, col.trim);
    },
  };
})();

const HSR = (() => {
  const body = pathPts([
    ['M', 28, 216], ['Q', 28, 198, 48, 198], ['L', 226, 198], ['Q', 294, 202, 330, 284],
    ['Q', 340, 312, 316, 330], ['L', 300, 338], ['L', 46, 338], ['Q', 28, 338, 28, 320],
  ], 10);
  const wheel = (pen, x, col) => {
    solid(pen, ell(x, 385, 15, 15), '#4a4048', { gap: 2.2, lw: 2.2 });
    pen.fill(ell(x, 385, 4.5, 4.5), col.hub);
  };
  return {
    body, interior: resample(insetPts(body, 10), 9), material: 'plastic',
    slot: { x: 130, y: 200, w: 46, a: 0 }, spawn: { x: 130, y: 226 }, fullY: 228,
    back(pen, col) {
      pen.seed(909);
      pen.shadow(184, FLOOR - 1, 170, 11);
      pen.fill(body, 'rgba(255,253,246,0.42)');
      pen.color(body, col.main, { alpha: 0.18, gap: 6, cover: 0.7 });
    },
    front(pen, col) {
      const m = col.main;
      pen.seed(1010);
      clearPlastic(pen, body, m, { alpha: 0.45 });
      for (let k = 0; k < 5; k++) {
        const w = roundRectPts(44 + k * 36, 214, 24, 22, 6);
        if (k === 3) continue; // 車門的位置
        pen.color(w, '#dff3ff', { alpha: 0.7, gap: 3, angle: -1.0 });
        pen.line(w, col.navy, 2);
      }
      const door = roundRectPts(152, 212, 26, 112, 5);
      pen.line(door, INK, 1.8, true, { alpha: 0.6 });
      const shield = [[238, 208], [262, 208], [290, 240], [240, 240]];
      pen.color(shield, '#dff3ff', { alpha: 0.75, gap: 3, angle: -1.0 });
      pen.line(shield, col.navy, 2.2);
      // 橘色線條
      pen.line([[30, 282], [324, 282]], col.stripe, 8, false, { amp: 0.4 });
      pen.line([[30, 296], [318, 296]], col.navy, 3, false, { amp: 0.4 });
      pen.shine([[40, 230], [40, 300]], 5);
      pen.shine(pathPts([['M', 60, 206], ['Q', 150, 203, 222, 206]], 6), 3.5, 0.8);
      pen.line(body, INK, 2.8);
      solid(pen, ell(320, 306, 5, 6), '#fff3b0', { lw: 1.6 });
      solid(pen, roundRectPts(48, 336, 96, 14, 5), col.trim, { gap: 2.4 });
      solid(pen, roundRectPts(214, 336, 96, 14, 5), col.trim, { gap: 2.4 });
      wheel(pen, 72, col); wheel(pen, 120, col); wheel(pen, 238, col); wheel(pen, 286, col);
      slot(pen, this.slot, col.navy);
    },
  };
})();

export const SHAPES = { pig: PIG, jar: JAR, car: CAR, train: TRAIN, hsr: HSR };

export const PALETTE = {
  red: { main: '#ef5b67' },
  yellow: { main: '#f6b23a' },
  blue: { main: '#3f8fe0' },
  green: { main: '#4cbf7a' },
  pink: { main: '#ff8fb1' },
  glass: { main: '#8fd0e6' },
  train: { main: '#e8443a' },
  hsr: { main: '#cfd8e3' },
};
export const COMMON = { hub: '#e9ecf0', trim: '#4a4048', stripe: '#f08a24', navy: '#2f3a56', lid: LIDS.heart };

// 同一種罐子可以換的樣子
export const FAMILY = { pig: 'pig', jar: 'jar', car: 'vehicle', train: 'vehicle', hsr: 'vehicle' };
export const VARIANTS = {
  pig: ['red', 'yellow', 'blue', 'green', 'pink'].map((color) => ({ shape: 'pig', color })),
  jar: ['heart', 'star', 'sun'].map((deco) => ({ shape: 'jar', color: 'glass', deco })),
  vehicle: [{ shape: 'car', color: 'blue' }, { shape: 'train', color: 'train' }, { shape: 'hsr', color: 'hsr' }],
};
export const lookKey = (l) => `${l.shape}-${l.color}-${l.deco || ''}`;

// 依縮放把罐子的前後兩層畫成圖片快取
export function renderJarLayers(look, px) {
  const shape = SHAPES[look.shape];
  const col = Object.assign({}, COMMON, PALETTE[look.color]);
  if (look.deco) { col.deco = look.deco; col.lid = LIDS[look.deco]; }
  const mk = (fn) => {
    const cv = makeCanvas((LW + PAD * 2) * px, (LH + PAD * 2) * px);
    const c = cv.getContext('2d');
    c.scale(px, px); c.translate(PAD, PAD);
    fn.call(shape, new Pen(c), col);
    return cv;
  };
  return { back: mk(shape.back), front: mk(shape.front) };
}
// 選罐子用的小圖（空罐子）
const previewCache = new Map();
export function jarPreview(look, w) {
  const key = lookKey(look) + w;
  if (previewCache.has(key)) return previewCache.get(key);
  // 只取罐子本身的範圍（x 20～350、y 48～412），小圖才不會一堆空白
  const px = (w * 2) / 330;
  const L = renderJarLayers(look, px);
  const cv = makeCanvas(330 * px, 364 * px), c = cv.getContext('2d');
  const sx = (PAD + 20) * px, sy = (PAD + 48) * px;
  c.drawImage(L.back, -sx, -sy); c.drawImage(L.front, -sx, -sy);
  const url = cv.toDataURL();
  previewCache.set(key, url);
  return url;
}

/* ---------------- 背景：牆、桌子 ---------------- */
// css 像素座標；tableTop = 桌面的高度
export function drawBackground(c, W, H, tableTop) {
  const pen = new Pen(c, 7);
  c.fillStyle = '#fbf3e6'; c.fillRect(0, 0, W, H);
  // 牆上淡淡的蠟筆色塊
  pen.color(ell(W * 0.95, 30, W * 0.3, 90), '#ffc7c7', { alpha: 0.22, gap: 6, cover: 0.7, angle: -0.5, edge: 4 });
  pen.color(ell(-10, H * 0.3, W * 0.22, 110), '#ffe0a0', { alpha: 0.22, gap: 6, cover: 0.7, angle: -0.7, edge: 4 });
  // 紙張小點
  const R = rng(5);
  for (let i = 0; i < (W * H) / 900; i++) {
    c.fillStyle = `rgba(120,100,60,${R() * 0.09})`;
    c.fillRect(R() * W, R() * H, 1.5, 1.5);
  }
  // 桌子：綠色蠟筆塗色
  const top = [[-10, tableTop], [W + 10, tableTop], [W + 10, H + 10], [-10, H + 10]];
  pen.color(top, '#8fca7c', { alpha: 0.95, gap: 3.6, angle: -0.35, edge: 0.6 });
  pen.clipIn(top, () => pen.color([[-10, tableTop + 18], [W + 10, tableTop + 18], [W + 10, H + 10], [-10, H + 10]],
    '#79b467', { alpha: 0.35, gap: 4.4, angle: 0.5, cover: 0.7 }));
  pen.line([[-10, tableTop], [W + 10, tableTop]], INK, 2.6, false);
}

// 標題底下的黃色螢光筆
export function highlightBand(w, h) {
  const cv = makeCanvas(w, h), c = cv.getContext('2d');
  const pen = new Pen(c, 9);
  pen.color(roundRectPts(4, 4, w - 8, h - 8, 6), '#ffd25e', { alpha: 0.9, gap: 3.2, angle: -0.25, edge: 2.2 });
  return cv.toDataURL();
}

// 架子
export function drawShelfPlank(c, x, y, w) {
  const pen = new Pen(c, 31);
  const plank = roundRectPts(x, y, w, 9, 3);
  pen.color(plank, '#d9a36f', { alpha: 0.95, gap: 2.4, angle: -0.2 });
  pen.line(plank, INK, 2);
  pen.color(roundRectPts(x + 6, y + 9, w - 12, 5, 2), '#8a6a4e', { alpha: 0.25, gap: 2.4, angle: 0 });
}

/* ---------------- 新台幣 ---------------- */
export const COIN_R = { '10': 16.5, '50': 18 };   // 10 元 26mm、50 元 28mm 的比例
export const BILL_FOLD = { w: 64, h: 27 };         // 在罐子裡摺起來的 100 元
export const BILL_FLAT = { w: 124, h: 60 };        // 攤開（真鈔 145×70mm 的比例）
const METAL = {
  '10': { hi: '#ffffff', mid: '#d5d9de', lo: '#8d949c', field: '#c8cdd3', ink: '#6b727a' },
  '50': { hi: '#fff6c8', mid: '#e8c255', lo: '#9c7222', field: '#ddb44c', ink: '#7a5614' },
};
const NUM_FONT = '"Avenir Next","Helvetica Neue",Arial,sans-serif';
const HAN_FONT = '"PingFang TC","Heiti TC",sans-serif';

export function drawCoin(c, R, kind, face) {
  const m = METAL[kind];
  let g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  g.addColorStop(0, m.hi); g.addColorStop(0.55, m.mid); g.addColorStop(1, m.lo);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  // 邊緣齒紋
  c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = Math.max(0.6, R * 0.025);
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * TAU;
    c.beginPath(); c.moveTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9); c.lineTo(Math.cos(a) * R * 0.985, Math.sin(a) * R * 0.985); c.stroke();
  }
  g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.05, 0, 0, R * 0.86);
  g.addColorStop(0, m.hi); g.addColorStop(0.6, m.field); g.addColorStop(1, darken(m.field, 0.12));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 0.84, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = R * 0.035;
  c.beginPath(); c.arc(0, 0, R * 0.84, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = R * 0.03;
  c.beginPath(); c.arc(R * 0.01, R * 0.02, R * 0.8, Math.PI * 0.9, Math.PI * 1.6); c.stroke();

  c.textAlign = 'center'; c.textBaseline = 'middle';
  const emboss = (txt, x, y) => {
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillText(txt, x - R * 0.025, y - R * 0.03);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillText(txt, x + R * 0.03, y + R * 0.03);
    c.fillStyle = m.ink; c.fillText(txt, x, y);
  };
  if (face === 0) {
    // 面額面：上面「圓拾」，下面大大的數字（跟真的硬幣一樣由右往左讀）
    c.font = `700 ${R * (kind === '10' ? 0.3 : 0.24)}px ${HAN_FONT}`;
    emboss(kind === '10' ? '圓拾' : '圓拾伍', 0, -R * 0.36);
    c.font = `800 ${R * 0.62}px ${NUM_FONT}`;
    emboss(kind, 0, R * 0.16);
  } else {
    // 人像面：簡化剪影 + 中華民國
    c.save();
    c.beginPath(); c.arc(0, 0, R * 0.8, 0, TAU); c.clip();
    c.fillStyle = darken(m.field, 0.22); c.globalAlpha = 0.5;
    c.beginPath(); c.ellipse(R * 0.02, R * 0.72, R * 0.55, R * 0.38, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(-R * 0.02, -R * 0.02, R * 0.27, R * 0.33, 0, 0, TAU); c.fill();
    c.globalAlpha = 0.6; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = R * 0.03;
    c.beginPath(); c.ellipse(-R * 0.02, -R * 0.02, R * 0.27, R * 0.33, 0, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
    c.restore();
    c.fillStyle = m.ink; c.font = `600 ${R * 0.15}px ${HAN_FONT}`;
    const txt = '中華民國';
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.36;
      c.save(); c.translate(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66); c.rotate(a + Math.PI / 2);
      c.fillText(txt[i], 0, 0); c.restore();
    }
  }
  sketchRing(c, ell(0, 0, R * 0.97, R * 0.97, 0, 28), R * 0.075, kind === '10' ? 3 : 5);
}
// 錢幣、鈔票的手繪外框（像素座標）
function sketchRing(c, pts, lw, seed) {
  const pen = new Pen(c, seed);
  c.save();
  c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = Math.max(1, lw);
  c.globalAlpha = 0.85; pen.trace(pen.wobble(pts, true, lw * 0.25, lw * 2.4)); c.stroke();
  c.globalAlpha = 0.35; c.lineWidth *= 0.7; pen.trace(pen.wobble(pts, true, lw * 0.45, lw * 2.4)); c.stroke();
  c.restore();
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function billBase(c, w, h) {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ec6f75'); g.addColorStop(0.5, '#dc4a54'); g.addColorStop(1, '#c23644');
  c.fillStyle = g; rr(c, 0, 0, w, h, h * 0.06); c.fill();
  c.strokeStyle = 'rgba(255,225,225,0.22)'; c.lineWidth = Math.max(0.5, h * 0.012);
  for (let k = 0; k < 7; k++) {
    c.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const y = h * (0.15 + k * 0.12) + Math.sin((x / w) * TAU * 3 + k) * h * 0.03;
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }
}
export function drawBillFlat(c, w, h) {
  billBase(c, w, h);
  c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = h * 0.025;
  rr(c, h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12, h * 0.04); c.stroke();
  c.fillStyle = 'rgba(255,236,236,0.55)';
  c.beginPath(); c.ellipse(w * 0.16, h * 0.55, h * 0.24, h * 0.3, 0, 0, TAU); c.fill();
  // 中間的建築（簡化中式屋頂）
  c.fillStyle = 'rgba(110,10,25,0.42)';
  const bx = w * 0.44, by = h * 0.62;
  c.fillRect(bx - h * 0.32, by, h * 0.64, h * 0.2);
  c.beginPath();
  c.moveTo(bx - h * 0.45, by + h * 0.02); c.quadraticCurveTo(bx - h * 0.2, by - h * 0.05, bx, by - h * 0.2);
  c.quadraticCurveTo(bx + h * 0.2, by - h * 0.05, bx + h * 0.45, by + h * 0.02); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,230,230,0.5)';
  for (let k = -2; k <= 2; k++) c.fillRect(bx + k * h * 0.11 - h * 0.025, by + h * 0.05, h * 0.05, h * 0.13);
  // 右側人像（剪影）
  c.fillStyle = 'rgba(255,230,230,0.35)';
  c.beginPath(); c.ellipse(w * 0.78, h * 0.5, h * 0.3, h * 0.38, 0, 0, TAU); c.fill();
  c.save(); c.beginPath(); c.ellipse(w * 0.78, h * 0.5, h * 0.3, h * 0.38, 0, 0, TAU); c.clip();
  c.fillStyle = 'rgba(110,10,25,0.55)';
  c.beginPath(); c.ellipse(w * 0.78, h * 0.42, h * 0.13, h * 0.16, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(w * 0.78, h * 0.9, h * 0.26, h * 0.22, 0, 0, TAU); c.fill();
  c.restore();
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#fff4f0';
  c.font = `800 ${h * 0.24}px ${NUM_FONT}`; c.fillText('100', w * 0.05, h * 0.22);
  c.textAlign = 'right'; c.font = `800 ${h * 0.17}px ${NUM_FONT}`; c.fillText('100', w * 0.95, h * 0.84);
  c.textAlign = 'center'; c.font = `600 ${h * 0.11}px ${HAN_FONT}`; c.fillText('中華民國', w * 0.44, h * 0.18);
  c.font = `700 ${h * 0.12}px ${HAN_FONT}`; c.fillText('壹佰圓', w * 0.44, h * 0.32);
  sketchRing(c, roundRectPts(1, 1, w - 2, h - 2, h * 0.06, 3), h * 0.04, 7);
}
export function drawBillFolded(c, w, h) {
  billBase(c, w, h);
  c.fillStyle = 'rgba(80,0,15,0.18)'; c.fillRect(w * 0.62, 0, w * 0.38, h);
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = h * 0.05;
  c.beginPath(); c.moveTo(w * 0.62, h * 0.08); c.lineTo(w * 0.62, h * 0.92); c.stroke();
  c.fillStyle = 'rgba(255,236,236,0.5)';
  c.beginPath(); c.ellipse(w * 0.8, h * 0.5, h * 0.24, h * 0.3, 0, 0, TAU); c.fill();
  c.fillStyle = '#fff4f0'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = `800 ${h * 0.5}px ${NUM_FONT}`; c.fillText('100', w * 0.07, h * 0.54);
  sketchRing(c, roundRectPts(1, 1, w - 2, h - 2, h * 0.12, 3), h * 0.07, 8);
}

// 錢幣圖片快取（px = 每個邏輯單位的像素數）
export function buildSprites(px) {
  const S = { px };
  for (const k of ['10', '50']) {
    S[k] = [0, 1].map((face) => {
      const R = COIN_R[k] * px;
      const cv = makeCanvas(R * 2 + 4, R * 2 + 4), c = cv.getContext('2d');
      c.translate(cv.width / 2, cv.height / 2);
      drawCoin(c, R, k, face);
      return cv;
    });
  }
  let cv = makeCanvas(BILL_FOLD.w * px, BILL_FOLD.h * px);
  drawBillFolded(cv.getContext('2d'), cv.width, cv.height);
  S.fold = cv;
  cv = makeCanvas(BILL_FLAT.w * px, BILL_FLAT.h * px);
  drawBillFlat(cv.getContext('2d'), cv.width, cv.height);
  S.flat = cv;
  return S;
}
// 把錢畫在邏輯座標的 (0,0)
export function drawMoney(c, S, kind, face, folded) {
  if (kind === '100') {
    const B = folded ? BILL_FOLD : BILL_FLAT;
    c.drawImage(folded ? S.fold : S.flat, -B.w / 2, -B.h / 2, B.w, B.h);
  } else {
    const h = COIN_R[kind] + 2 / S.px;
    c.drawImage(S[kind][face], -h, -h, h * 2, h * 2);
  }
}

/* ---------------- 盤子 ---------------- */
// 俯視的陶瓷盤，畫在 (0,0)，橫向半徑 rx，縱向壓扁成 ry（css 像素）
export function drawPlate(c, rx, ry) {
  const pen = new Pen(c, 77);
  pen.color(ell(rx * 0.03, ry * 0.3, rx * 1.03, ry * 0.98), '#5f8f4f', { alpha: 0.4, gap: 3, angle: 0.05, edge: 2 });
  pen.fill(ell(0, 0, rx, ry), '#fffdf7');
  pen.clipIn(ell(0, 0, rx, ry), () => pen.clipOut(ell(-rx * 0.04, -ry * 0.1, rx, ry),
    () => pen.color(ell(0, 0, rx, ry), '#e6d6bd', { alpha: 0.8, gap: 2.6, angle: 0.5 })));
  pen.line(ell(0, 0, rx * 0.87, ry * 0.87), '#5d9bd3', 2.6);
  pen.line(ell(0, 0, rx * 0.8, ry * 0.8), '#5d9bd3', 1.2, true, { alpha: 0.6 });
  const well = ell(0, ry * 0.04, rx * 0.66, ry * 0.64);
  pen.fill(well, '#fffaf0');
  pen.clipIn(well, () => pen.clipOut(ell(rx * 0.02, ry * 0.16, rx * 0.66, ry * 0.64),
    () => pen.color(well, '#e6d6bd', { alpha: 0.7, gap: 2.4, angle: 0.3 })));
  pen.line(well, INK, 1.4, true, { alpha: 0.45 });
  pen.line(ell(0, 0, rx, ry), INK, 2.4);
  pen.shine(ellipsePts(0, 0, rx * 0.93, ry * 0.93, 8, Math.PI * 1.12, Math.PI * 1.38), 3);
}
