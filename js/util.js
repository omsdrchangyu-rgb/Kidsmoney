// 數學、顏色、幾何的小工具
export const TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

/* ---------- 顏色 ---------- */
export function toRgb(c) {
  if (c.startsWith('rgb')) return c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) {
  const A = toRgb(a), B = toRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);
export const rgba = (c, a) => `rgba(${toRgb(c).join(',')},${a})`;

/* ---------- 幾何 ---------- */
export function ellipsePts(cx, cy, rx, ry, n = 64, a0 = 0, a1 = TAU) {
  const full = Math.abs(a1 - a0 - TAU) < 1e-6;
  const pts = [];
  for (let i = 0; i < (full ? n : n + 1); i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}
// 迷你 path：['M',x,y] ['L',x,y] ['Q',cx,cy,x,y] ['A',cx,cy,r,a0,a1]
export function pathPts(cmds, seg = 12) {
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
    } else if (c[0] === 'A') {
      const [, cx, cy, r, a0, a1] = c;
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (a1 - a0) * (i / seg);
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      px = pts[pts.length - 1][0]; py = pts[pts.length - 1][1];
    }
  }
  return pts;
}
export function roundRectPts(x, y, w, h, r, seg = 6) {
  const R = Array.isArray(r) ? r : [r, r, r, r];
  const pts = [];
  const corner = (cx, cy, rr, a0, fx, fy) => {
    if (!rr) { pts.push([fx, fy]); return; }
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (Math.PI / 2) * (i / seg);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  corner(x + R[0], y + R[0], R[0], Math.PI, x, y);
  corner(x + w - R[1], y + R[1], R[1], -Math.PI / 2, x + w, y);
  corner(x + w - R[2], y + h - R[2], R[2], 0, x + w, y + h);
  corner(x + R[3], y + h - R[3], R[3], Math.PI / 2, x, y + h);
  return pts;
}
export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
// 在 y 高度上，多邊形內部最寬的那一段 x 範圍
export function spanAt(pts, y, margin) {
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
  return best && best[1] - best[0] > margin * 2 ? [best[0] + margin, best[1] - margin] : null;
}
// 把多邊形往內縮 d（用來做物理內壁）
export function insetPts(pts, d, retry = true) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1; // 螢幕座標（y 向下）
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const n1 = norm(-(c[1] - p[1]) * s, (c[0] - p[0]) * s);
    const n2 = norm(-(q[1] - c[1]) * s, (q[0] - c[0]) * s);
    let nx = n1[0] + n2[0], ny = n1[1] + n2[1];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const k = Math.min(2, 1 / Math.max(0.35, nx * n1[0] + ny * n1[1]));
    out.push([c[0] + nx * d * k, c[1] + ny * d * k]);
  }
  // 確認方向正確（內縮後的點要在原形狀內）
  const inside = out.filter(([x, y]) => pointInPoly(x, y, pts)).length;
  if (retry && inside < out.length / 2) return insetPts(pts, -d, false);
  return out;
}
function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
// 均勻重新取樣（物理牆不需要太多點）
export function resample(pts, step) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    acc += len;
    if (acc >= step) { out.push(b); acc = 0; }
  }
  return out;
}

export function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h));
  return cv;
}
