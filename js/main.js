// 主畫面：左右滑換罐子、盤子上的錢拖進罐子、滿了換新罐子
import { TAU, rand, clamp, lerp, easeOutBounce, easeInOut, makeCanvas } from './util.js';
import {
  LW, LH, PAD, FLOOR, SHAPES, COIN_R, BILL_FLAT, renderJarLayers, buildSprites, drawMoney, drawPlate,
  drawBackground, drawShelfPlank, highlightBand, jarPreview, VARIANTS, FAMILY, lookKey,
} from './art.js';
import { buildWorld, addBody, step, moneyBodies, isFull } from './physics.js';
import { Sound } from './sound.js';
import { load, save, reset, activeKid } from './store.js';
import { ICONS, AVATAR_ICONS } from './icons.js';
import { zhuyin } from './zhuyin.js';
import { initParent } from './parent.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#stage'), ctx = canvas.getContext('2d');
const titleEl = $('#title'), dotsEl = $('#dots'), bg = $('#bg'), newJarBtn = $('#newJar');
let plankCv = null;

let root = load();
let rt = [];
let W = 0, H = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
let sprites = null, plateSprites = null, thumbSprites = null;
const plate = { x: 0, y: 0, rx: 100, ry: 36, ps: 1.4 };
const shelf = { top: 0, h: 76, k: 62 / LH };
let pos = 0, target = 0, active = 0;
const flyers = [];
let drag = null, swipe = null, archive = null;

const kid = () => activeKid(root);
const purposes = () => kid().purposes;
const currentJar = (p) => p.jars[p.jars.length - 1];
const saveAll = () => save(root);

/* ---------------- 每個罐子的執行狀態 ---------------- */
function initRuntime() {
  rt = purposes().map((p) => ({
    world: null, layers: null, thumbs: null, thumbLayers: null,
    plate: p.pending.map((k) => plateItem(k, false)),
    dropIn: -1e9, full: false,
  }));
}
function plateItem(kind, animate) {
  return { kind, face: Math.random() < 0.6 ? 0 : 1, rot: rand(-0.5, 0.5), x: 0, y: 0, tx: 0, ty: 0, t0: animate ? null : -1e9, hit: 0, back: null };
}
function ensureWorld(i) {
  const r = rt[i], p = purposes()[i];
  if (r && !r.world) { const j = currentJar(p); r.world = buildWorld(j.look.shape, j.items); }
}

/* ---------------- 版面 ---------------- */
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';

  const titleBottom = titleEl.getBoundingClientRect().bottom + 2;
  shelf.top = titleBottom;
  const bar = $('#bottom').getBoundingClientRect();
  plate.rx = clamp((W - 172) / 2, 78, 132);
  plate.ry = plate.rx * 0.36;
  plate.x = W / 2;
  plate.y = bar.top + bar.height * 0.48;

  const top = shelf.top + shelf.h + 4;
  const bottom = plate.y - plate.ry - 18;
  // 罐子實際畫到的寬度大約是 x 30～340，用這個寬度來放大
  scale = clamp(Math.min((W - 12) / 310, (bottom - top) / 364), 0.4, 1.7);
  ox = W / 2 - 185 * scale;
  oy = top + Math.max(0, bottom - top - 364 * scale) * 0.45 - 40 * scale;
  // 架子貼在罐子上方，多出來的空間留在標題和架子中間（牆面）
  shelf.top = Math.max(titleBottom, oy + 40 * scale - shelf.h - 4);
  plate.ps = scale * 1.15;

  // 背景（牆、桌子）和架子只在版面改變時畫一次
  bg.width = canvas.width; bg.height = canvas.height;
  bg.style.width = W + 'px'; bg.style.height = H + 'px';
  const bc = bg.getContext('2d');
  bc.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(bc, W, H, Math.round(oy + (FLOOR - 24) * scale));
  plankCv = makeCanvas(W * dpr, 24 * dpr);
  const pc = plankCv.getContext('2d');
  pc.scale(dpr, dpr);
  drawShelfPlank(pc, 12, 4, W - 24);
  document.documentElement.style.setProperty('--hl', `url(${highlightBand(320, 40)})`);
  newJarBtn.style.top = Math.round(oy + 70 * scale) + 'px';

  sprites = buildSprites(scale * dpr);
  plateSprites = buildSprites(plate.ps * dpr);
  thumbSprites = buildSprites(shelf.k * dpr);
  rt.forEach((r) => { r.layers = null; r.thumbs = null; });
  thumbLayerCache.clear();
  rt.forEach((_, i) => layoutPlate(i));
}

// 盤子上的位置：向日葵排列，數量多也會平均鋪開
function layoutPlate(i) {
  const items = rt[i].plate, n = items.length;
  items.forEach((it, k) => {
    const r = n === 1 ? 0 : 0.56 * Math.sqrt((k + 0.5) / n);
    const a = k * 2.39996 + 0.7;
    it.tx = Math.cos(a) * r * plate.rx;
    it.ty = Math.sin(a) * r * plate.ry;
    if (it.t0 === -1e9 && !it.x && !it.y) { it.x = it.tx; it.y = it.ty; }
  });
}

/* ---------------- 標題、小點 ---------------- */
function setTitle(i, instant) {
  const p = purposes()[i];
  const html = `<span class="ico">${ICONS[p.icon]}</span><span class="ttl">${zhuyin(p.title, p.bpmf)}</span>`;
  if (instant) { titleEl.innerHTML = html; return; }
  titleEl.classList.add('swap');
  setTimeout(() => { titleEl.innerHTML = html; titleEl.classList.remove('swap'); }, 140);
}
function renderDots() {
  dotsEl.innerHTML = purposes().map((p, k) =>
    `<i class="${k === active ? 'on' : ''} ${p.pending.length ? 'coin' : ''}"></i>`).join('');
}

/* ---------------- 發零用錢：錢掉到盤子上 ---------------- */
function onGiven() {
  purposes().forEach((p, i) => {
    const r = rt[i];
    while (r.plate.length < p.pending.length) r.plate.push(plateItem(p.pending[r.plate.length], true));
    layoutPlate(i);
  });
  startDrops(active);
  renderDots();
  Sound.chime();
}
function startDrops(i) {
  const now = performance.now();
  let k = 0, rustled = false;
  for (const it of rt[i].plate) {
    if (it.t0 !== null) continue;
    it.t0 = now + 350 + k * 150; k++;
    it.x = it.tx; it.y = it.ty;
    if (it.kind === '100' && !rustled) { rustled = true; setTimeout(() => Sound.rustle(1.2), 350 + k * 150); }
  }
}
// 掉落中的位置（盤子座標）
function plateItemPos(it, now) {
  if (it.t0 === null) return null;
  const dur = it.kind === '100' ? 1100 : 650;
  const u = clamp((now - it.t0) / dur, 0, 1);
  if (now < it.t0) return null;
  const fromY = -plate.y - 60;
  if (it.kind === '100') {
    const e = 1 - Math.pow(1 - u, 2);
    if (u >= 1 && !it.hit) { it.hit = 1; Sound.plate('100'); }
    return { x: it.x + Math.sin(u * TAU * 1.3) * 34 * (1 - u), y: lerp(fromY, it.y, e), rot: it.rot + Math.sin(u * TAU) * 0.5 * (1 - u), sy: 0.72 + 0.28 * Math.abs(Math.cos(u * 9)) * (1 - u) };
  }
  if (u > 0.36 && it.hit < 1) { it.hit = 1; Sound.plate(it.kind, 1); }
  if (u > 0.73 && it.hit < 2) { it.hit = 2; Sound.plate(it.kind, 0.35); }
  return { x: it.x, y: lerp(fromY, it.y, easeOutBounce(u)), rot: it.rot, sy: 0.72 };
}

/* ---------------- 投進罐子 ---------------- */
function toLogical(i, x, y) { return [(x - ox - (i - pos) * W) / scale, (y - oy) / scale]; }

function launch(i, it, sx, sy) {
  const p = purposes()[i], r = rt[i];
  ensureWorld(i);
  if (r.full || (isFull(r.world) && !flyers.some((f) => f.jar === i))) {
    r.full = true;
    r.world.shakeT = performance.now();
    Sound.bonk();
    newJarBtn.classList.remove('nudge'); void newJarBtn.offsetWidth; newJarBtn.classList.add('nudge');
    it.back = { x: sx - plate.x - (i - pos) * W, y: sy - plate.y, t0: performance.now() };
    return;
  }
  const idx = r.plate.indexOf(it);
  r.plate.splice(idx, 1);
  p.pending.splice(idx, 1);
  currentJar(p).items.push(it.kind);
  kid().log.push({ t: Date.now(), type: 'deposit', id: p.id, kind: it.kind });
  saveAll();
  layoutPlate(i);
  renderDots();
  const shape = SHAPES[currentJar(p).look.shape];
  const [lx, ly] = toLogical(i, sx, sy);
  const startScale = plate.ps / scale;
  flyers.push(it.kind === '100' ? billFlyer(i, lx, ly, shape) : coinFlyer(i, it.kind, lx, ly, startScale, shape, it.face));
}

function coinFlyer(i, kind, sx, sy, startScale, shape, face0) {
  const s = shape.slot, r = COIN_R[kind];
  const ex = s.x, ey = s.y - 26;
  const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 150;
  return {
    jar: i, t0: performance.now(), dur: 760,
    draw(c, t) {
      let x, y, size, sx2, face;
      if (t < 0.78) {
        const u = t / 0.78, e = 1 - Math.pow(1 - u, 2.2);
        x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * ex;
        y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * ey;
        const spin = u * TAU * 2.25;
        size = lerp(startScale, 1, Math.min(1, u * 1.4));
        sx2 = Math.max(0.12, Math.abs(Math.cos(spin)));
        face = Math.cos(spin) > 0 ? face0 : 1 - face0;
      } else {
        const u = (t - 0.78) / 0.22;
        x = ex; y = lerp(ey, shape.spawn.y, u * u); size = 1; sx2 = 0.13; face = 0;
      }
      c.save(); c.translate(x, y); c.scale(sx2 * size, size);
      drawMoney(c, size > 1.02 ? plateSprites : sprites, kind, face, false);
      c.restore();
    },
    done(world) {
      Sound.ding(kind);
      addBody(world, kind, shape.spawn.x + rand(-4, 4), shape.spawn.y, 3.2, false);
    },
  };
}
function billFlyer(i, sx, sy, shape) {
  const s = shape.slot;
  const topY = shelf.top / scale - oy / scale - 10;
  const phase = rand(0, TAU);
  let rustled = false;
  return {
    jar: i, t0: performance.now(), dur: 2400,
    draw(c, t) {
      let x, y, rot, fx, fy;
      if (t < 0.18) {
        const u = t / 0.18, e = 1 - Math.pow(1 - u, 2);
        x = lerp(sx, s.x + 30, e); y = lerp(sy, topY, e); rot = lerp(0, -0.3, e);
        fx = lerp(0.95, 1, e); fy = lerp(0.68, 1, e);
      } else {
        if (!rustled) { rustled = true; Sound.rustle(1.7); }
        const u = (t - 0.18) / 0.82;
        const fold = u > 0.82 ? (u - 0.82) / 0.18 : 0;
        x = s.x + 30 * (1 - u) + Math.sin(u * TAU * 1.6 + phase) * 46 * (1 - u * 0.9);
        y = lerp(topY, s.y - 6, u * u * 0.55 + u * 0.45);
        rot = Math.sin(u * TAU * 1.6 + phase + 0.9) * 0.45 * (1 - u * 0.8);
        fx = lerp(1, 0.42, fold);
        fy = (0.55 + 0.45 * Math.abs(Math.cos(u * TAU * 2.2 + phase))) * lerp(1, 0.4, fold);
      }
      c.save(); c.translate(x, y); c.rotate(rot); c.scale(fx, fy);
      drawMoney(c, sprites, '100', 0, false);
      c.restore();
    },
    done(world) {
      Sound.plop();
      addBody(world, '100', shape.spawn.x + rand(-6, 6), shape.spawn.y + 4, 1, false);
    },
  };
}

/* ---------------- 滿了：換新罐子 ---------------- */
function drawBodies(c, world, spr, now) {
  for (const b of moneyBodies(world)) {
    const k = b.plugin.kind;
    c.save();
    c.translate(b.position.x, b.position.y);
    c.rotate(b.angle);
    if (k !== '100') {
      const age = now - b.plugin.born;
      if (age < 220) c.scale(lerp(0.13, 1, age / 220), 1);
    }
    drawMoney(c, spr, k, b.plugin.face, true);
    c.restore();
  }
}
function snapshot(world, layers, spr, px) {
  const cv = makeCanvas((LW + PAD * 2) * px, (LH + PAD * 2) * px), c = cv.getContext('2d');
  c.scale(px, px); c.translate(PAD, PAD);
  c.drawImage(layers.back, -PAD, -PAD, LW + PAD * 2, LH + PAD * 2);
  drawBodies(c, world, spr, Infinity);
  c.drawImage(layers.front, -PAD, -PAD, LW + PAD * 2, LH + PAD * 2);
  return cv;
}
const thumbLayerCache = new Map();
function thumbLayers(look) {
  const k = lookKey(look);
  if (!thumbLayerCache.has(k)) thumbLayerCache.set(k, renderJarLayers(look, shelf.k * dpr));
  return thumbLayerCache.get(k);
}
function ensureThumbs(i) {
  const r = rt[i], p = purposes()[i];
  if (r.thumbs) return;
  r.thumbs = p.jars.slice(0, -1).map((j) => snapshot(buildWorld(j.look.shape, j.items), thumbLayers(j.look), thumbSprites, shelf.k * dpr));
}
function shelfSlot(i, idx, count) {
  const k = shelf.k, tw = (LW + PAD * 2) * k, th = (LH + PAD * 2) * k;
  const plankY = shelf.top + shelf.h - 6;
  const gap = Math.min(tw * 0.78, (W - 40 - tw) / Math.max(1, count - 1));
  return { x: 20 + idx * gap, y: plankY - (FLOOR + PAD) * k, w: tw, h: th };
}

function archiveJar(look) {
  const i = active, p = purposes()[i], r = rt[i];
  if (archive || !r.world) return;
  ensureThumbs(i);
  const big = snapshot(r.world, r.layers, sprites, scale * dpr);
  const now = performance.now();
  p.jars.push({ items: [], look: { ...look } });
  kid().log.push({ t: Date.now(), type: 'newJar', id: p.id, look });
  saveAll();
  r.layers = null;
  r.world = buildWorld(look.shape, []);
  r.full = false;
  r.dropIn = now + 520;
  newJarBtn.classList.remove('show');
  archive = { i, cv: big, t0: now, dur: 800, idx: r.thumbs.length };
  Sound.whoosh();
  setTimeout(() => Sound.pop(), 520 + 380);
}
newJarBtn.addEventListener('click', () => { Sound.unlock(); openPicker('new', active); });

/* ---------------- 選罐子（換新罐子、或家長幫目前的罐子換樣子） ---------------- */
const picker = $('#picker');
let pickerCtx = null;
function openPicker(mode, i) {
  const p = purposes()[i], cur = currentJar(p).look;
  const options = VARIANTS[FAMILY[cur.shape]];
  pickerCtx = { mode, i, options };
  picker.querySelector('.panel').innerHTML = `<div class="opts">${options.map((look, k) =>
    `<button class="opt ${mode === 'restyle' && lookKey(look) === lookKey(cur) ? 'on' : ''}" data-k="${k}"><img src="${jarPreview(look, 112)}" alt=""></button>`).join('')}</div>`;
  picker.classList.add('open');
}
picker.addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) { if (e.target === picker) picker.classList.remove('open'); return; }
  const { mode, i, options } = pickerCtx, look = options[+b.dataset.k];
  picker.classList.remove('open');
  if (mode === 'new') archiveJar(look);
  else restyle(i, look);
});
// 家長幫目前的罐子換樣子（裡面的錢不變）
function restyle(i, look) {
  const p = purposes()[i], r = rt[i], j = currentJar(p);
  j.look = { ...look };
  saveAll();
  r.layers = null;
  r.world = buildWorld(look.shape, j.items);
  r.full = false;
  r.dropIn = performance.now();
  Sound.pop();
}

/* ---------------- 切換小孩 ---------------- */
const kidBtn = $('#kidBtn'), kidSheet = $('#kids');
function renderKidBtn() {
  const many = root.kids.length > 1;
  kidBtn.hidden = !many;
  if (many) kidBtn.innerHTML = AVATAR_ICONS[kid().avatar] || AVATAR_ICONS.bear;
}
kidBtn.addEventListener('click', () => {
  kidSheet.querySelector('.panel').innerHTML = `<div class="opts">${root.kids.map((k) =>
    `<button class="opt kid ${k.id === root.activeKid ? 'on' : ''}" data-kid="${k.id}">${AVATAR_ICONS[k.avatar] || ''}<span>${k.name}</span></button>`).join('')}</div>`;
  kidSheet.classList.add('open');
});
kidSheet.addEventListener('click', (e) => {
  const b = e.target.closest('[data-kid]');
  kidSheet.classList.remove('open');
  if (b && b.dataset.kid !== root.activeKid) switchKid(b.dataset.kid);
});
function switchKid(id) {
  root.activeKid = id;
  saveAll();
  reloadKid();
  Sound.whoosh();
}
function reloadKid() {
  flyers.length = 0; archive = null; drag = null;
  pos = target = active = 0;
  initRuntime(); layout(); ensureWorld(0);
  setTitle(0, true); renderDots(); renderKidBtn();
  purposes().forEach((_, i) => setTimeout(() => ensureWorld(i), 200 + i * 120));
}

/* ---------------- 每一幀 ---------------- */
let last = performance.now(), acc = 0, fullTimer = 0;
function frame(now) {
  ctx.imageSmoothingQuality = 'high';
  const dt = Math.min(64, now - last); last = now;
  if (!swipe) pos += (target - pos) * (1 - Math.exp(-dt / 70));
  if (Math.abs(target - pos) < 0.0005 && !swipe) pos = target;
  const a = clamp(Math.round(pos), 0, rt.length - 1);
  if (a !== active) { active = a; setTitle(a); renderDots(); ensureWorld(a); startDrops(a); }

  acc += dt;
  let steps = 0;
  while (acc >= 1000 / 60 && steps < 4) {
    for (const r of rt) if (r.world) step(r.world);
    acc -= 1000 / 60; steps++;
  }
  if (steps === 4) acc = 0;

  for (let k = flyers.length - 1; k >= 0; k--) {
    const f = flyers[k];
    if (now - f.t0 >= f.dur) { ensureWorld(f.jar); f.done(rt[f.jar].world); flyers.splice(k, 1); }
  }

  // 每 0.4 秒檢查目前的罐子滿了沒
  fullTimer += dt;
  if (fullTimer > 400) {
    fullTimer = 0;
    const r = rt[active];
    if (r.world && !archive && !flyers.some((f) => f.jar === active)) r.full = isFull(r.world);
    newJarBtn.classList.toggle('show', !!r.full && !archive && Math.abs(pos - target) < 0.02);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < rt.length; i++) {
    const off = (i - pos) * W;
    if (Math.abs(off) > W * 1.05) continue;
    drawShelf(i, off);
    drawJar(i, off, now);
    drawPlateFor(i, off, now);
  }
  if (drag) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlateMoney(drag.it, drag.x, drag.y, 1.15, 0.86, true);
  }
  if (archive) drawArchive(now);
  requestAnimationFrame(frame);
}

function drawShelf(i, off) {
  const y = shelf.top + shelf.h - 6;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(plankCv, Math.round(dpr * off), Math.round(dpr * (y - 4)));
  const r = rt[i];
  if (purposes()[i].jars.length > 1) ensureThumbs(i);
  if (!r.thumbs) return;
  const count = r.thumbs.length + (archive && archive.i === i ? 1 : 0);
  r.thumbs.forEach((cv, idx) => {
    const s = shelfSlot(i, idx, count);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cv, Math.round(dpr * (s.x + off)), Math.round(dpr * s.y));
    ctx.restore();
  });
}

function drawJar(i, off, now) {
  const p = purposes()[i], r = rt[i];
  ensureWorld(i);
  if (now < r.dropIn) return;
  if (!r.layers) r.layers = renderJarLayers(currentJar(p).look, scale * dpr);
  let shake = 0, dy = 0;
  const st = now - r.world.shakeT;
  if (st < 380) shake = Math.sin((st / 380) * TAU * 4) * 9 * (1 - st / 380);
  const di = now - r.dropIn;
  if (di < 700) dy = -(1 - easeOutBounce(di / 700)) * (oy + LH * scale);
  // 圖層用原尺寸、對齊整數像素來畫，才不會因為縮放變糊
  const lx = Math.round(dpr * (ox + off + shake * scale - PAD * scale));
  const ly = Math.round(dpr * (oy + dy - PAD * scale));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(r.layers.back, lx, ly);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, lx + PAD * scale * dpr, ly + PAD * scale * dpr);
  drawBodies(ctx, r.world, sprites, now);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(r.layers.front, lx, ly);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, lx + PAD * scale * dpr, ly + PAD * scale * dpr);
  for (const f of flyers) if (f.jar === i) f.draw(ctx, clamp((now - f.t0) / f.dur, 0, 1));
}

let plateCache = null;
function drawPlateFor(i, off, now) {
  const px = plate.rx * 2 + 30, py = plate.ry * 2 + 30;
  if (!plateCache || plateCache.w !== px || plateCache.dpr !== dpr) {
    const cv = makeCanvas(px * dpr, py * dpr), c = cv.getContext('2d');
    c.scale(dpr, dpr); c.translate(px / 2, py / 2 - 4);
    drawPlate(c, plate.rx, plate.ry);
    plateCache = { cv, w: px, dpr };
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(plateCache.cv, Math.round(dpr * (plate.x + off - px / 2)), Math.round(dpr * (plate.y - py / 2 + 4)));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const items = [];
  for (const it of rt[i].plate) {
    if (drag && drag.it === it) continue;
    if (it.back) {
      const u = clamp((now - it.back.t0) / 320, 0, 1), e = easeInOut(u);
      items.push({ it, x: lerp(it.back.x, it.x, e), y: lerp(it.back.y, it.y, e), rot: it.rot, sy: 0.72 });
      if (u >= 1) it.back = null;
    } else if (it.t0 === null) {
      continue; // 還沒輪到它掉下來
    } else if (it.t0 > -1e8) {
      const d = plateItemPos(it, now);
      if (d) items.push(Object.assign({ it }, d));
    } else {
      it.x += (it.tx - it.x) * 0.2; it.y += (it.ty - it.y) * 0.2;
      items.push({ it, x: it.x, y: it.y, rot: it.rot, sy: 0.72 });
    }
  }
  // 鈔票放下面，硬幣疊上面，後面的先畫
  items.sort((a, b) => (a.it.kind === '100' ? -1 : 0) - (b.it.kind === '100' ? -1 : 0) || a.y - b.y);
  for (const d of items) {
    // 落地後就回到一般狀態
    if (d.it.t0 > -1e8 && now - d.it.t0 > (d.it.kind === '100' ? 1100 : 650)) d.it.t0 = -1e9;
    drawPlateMoney(d.it, plate.x + off + d.x, plate.y + d.y, 1, d.sy, false, d.rot);
  }
}
function drawPlateMoney(it, x, y, s, sy, lifted, rot = it.rot) {
  const ps = plate.ps * s;
  ctx.save();
  ctx.translate(x, y);
  if (lifted) { ctx.shadowColor = 'rgba(70,40,20,0.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 10; }
  ctx.scale(ps, ps * sy);
  ctx.rotate(rot * (it.kind === '100' ? 0.4 : 1));
  if (it.kind === '100') ctx.scale(0.5, 0.5);
  drawMoney(ctx, plateSprites, it.kind, it.face, false);
  ctx.restore();
}
function plateItemAt(x, y) {
  const r = rt[active];
  if (!r) return null;
  const now = performance.now();
  const list = r.plate.filter((it) => it.t0 !== null && (it.t0 < -1e8 || now - it.t0 > 300));
  for (let k = list.length - 1; k >= 0; k--) {
    const it = list[k];
    const cx = plate.x + it.x, cy = plate.y + it.y;
    if (it.kind === '100') {
      if (Math.abs(x - cx) < BILL_FLAT.w * 0.25 * plate.ps + 6 && Math.abs(y - cy) < BILL_FLAT.h * 0.18 * plate.ps + 8) return it;
    } else if (Math.hypot(x - cx, (y - cy) / 0.72) < COIN_R[it.kind] * plate.ps + 10) return it;
  }
  return null;
}

function drawArchive(now) {
  const a = archive, u = clamp((now - a.t0) / a.dur, 0, 1), e = easeInOut(u);
  const r = rt[a.i];
  const to = shelfSlot(a.i, a.idx, a.idx + 1);
  const from = { x: ox - PAD * scale, y: oy - PAD * scale, w: (LW + PAD * 2) * scale, h: (LH + PAD * 2) * scale };
  const off = (a.i - pos) * W;
  ctx.setTransform(dpr, 0, 0, dpr, dpr * off, 0);
  const x = lerp(from.x, to.x, e), y = lerp(from.y, to.y, e) - Math.sin(u * Math.PI) * 50;
  ctx.drawImage(a.cv, x, y, lerp(from.w, to.w, e), lerp(from.h, to.h, e));
  if (u >= 1) {
    const t = makeCanvas(to.w * dpr, to.h * dpr);
    t.getContext('2d').drawImage(a.cv, 0, 0, t.width, t.height);
    r.thumbs.push(t);
    archive = null;
  }
}

/* ---------------- 手勢 ---------------- */
// 任何一次碰螢幕（包括按鈕、家長畫面）都順便把聲音打開。
// 之前只有碰到盤子或滑動時才打開，所以「先開家長畫面發錢」那次會沒有聲音。
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, () => Sound.unlock(), { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Sound.ctx && Sound.ctx.state !== 'running') Sound.ctx.resume().catch(() => {});
});
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .sheet, a, input')) return;
  Sound.unlock();
  const it = Math.abs(pos - target) < 0.02 ? plateItemAt(e.clientX, e.clientY) : null;
  if (it) {
    drag = { it, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: 0 };
    Sound.plate(it.kind, 0.25);
    return;
  }
  swipe = { x0: e.clientX, y0: e.clientY, pos0: pos, hist: [[e.clientX, performance.now()]], horiz: null };
});
window.addEventListener('pointermove', (e) => {
  if (drag) {
    drag.x = e.clientX; drag.y = e.clientY;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    return;
  }
  if (!swipe) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  // 先判斷是左右滑還是上下滑，上下滑不換頁
  if (swipe.horiz === null && Math.hypot(dx, dy) > 8) swipe.horiz = Math.abs(dx) > Math.abs(dy);
  if (!swipe.horiz) return;
  let p = swipe.pos0 - dx / W;
  if (p < 0) p *= 0.35;
  if (p > rt.length - 1) p = rt.length - 1 + (p - rt.length + 1) * 0.35;
  pos = target = p;
  swipe.hist.push([e.clientX, performance.now()]);
  if (swipe.hist.length > 6) swipe.hist.shift();
  ensureWorld(Math.floor(clamp(pos, 0, rt.length - 1))); ensureWorld(Math.ceil(clamp(pos, 0, rt.length - 1)));
});
const endPointer = () => {
  if (drag) {
    const d = drag; drag = null;
    // 點一下、或往上拖，就投進罐子；往旁邊拖就放回盤子
    if (d.moved < 10 || d.y < plate.y - plate.ry - 24) launch(active, d.it, d.x, d.y);
    else d.it.back = { x: d.x - plate.x, y: d.y - plate.y, t0: performance.now() };
    return;
  }
  if (!swipe) return;
  if (!swipe.horiz) { swipe = null; return; }
  const h = swipe.hist, a = h[0], b = h[h.length - 1];
  const v = (b[0] - a[0]) / Math.max(1, b[1] - a[1]);
  let t = Math.round(pos);
  if (Math.abs(v) > 0.35) t = Math.round(swipe.pos0) + (v < 0 ? 1 : -1);
  target = clamp(t, 0, rt.length - 1);
  swipe = null;
};
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input')) return;
  if (e.key === 'ArrowRight') target = Math.min(rt.length - 1, Math.round(target) + 1);
  if (e.key === 'ArrowLeft') target = Math.max(0, Math.round(target) - 1);
});

/* ---------------- 角落按鈕 ---------------- */
const toast = $('#toast');
let toastTimer = 0;
function showToast(html) {
  toast.innerHTML = html; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}
$('#btnCalc').innerHTML = ICONS.calc;
$('#btnWish').innerHTML = ICONS.star;
$('#btnSettings').innerHTML = ICONS.gear;
newJarBtn.innerHTML = ICONS.newJar;
$('#btnCalc').addEventListener('click', () => showToast(ICONS.calc + zhuyin('計算機', ['ㄐㄧˋ', 'ㄙㄨㄢˋ', 'ㄐㄧ'])));
$('#btnWish').addEventListener('click', () => showToast(ICONS.star + zhuyin('願望', ['ㄩㄢˋ', 'ㄨㄤˋ'])));

// 家長設定：按住齒輪 0.8 秒（小朋友不會不小心打開）
const gear = $('#btnSettings');
let holdTimer = 0, held = false;
gear.addEventListener('pointerdown', (e) => {
  e.preventDefault(); held = false;
  gear.classList.add('holding');
  holdTimer = setTimeout(() => { held = true; gear.classList.remove('holding'); parent.open(); }, 800);
});
const cancelHold = () => {
  clearTimeout(holdTimer);
  if (gear.classList.contains('holding') && !held) showToast(ICONS.hand + zhuyin('按住', ['ㄢˋ', 'ㄓㄨˋ']));
  gear.classList.remove('holding');
};
gear.addEventListener('pointerup', cancelHold);
gear.addEventListener('pointerleave', cancelHold);
gear.addEventListener('contextmenu', (e) => e.preventDefault());

const parent = initParent({
  getRoot: () => root,
  getKid: kid,
  save: saveAll,
  onGiven,
  onSwitchKid: (id) => { if (id !== root.activeKid) { root.activeKid = id; saveAll(); reloadKid(); } },
  onKidsChanged: renderKidBtn,
  onRestyle: (i) => openPicker('restyle', i),
  onReset: (empty) => { root = reset(empty); saveAll(); reloadKid(); },
});

/* ---------------- 開始 ---------------- */
let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
initRuntime();
setTitle(0, true);
renderDots();
renderKidBtn();
// 離線也能打開（加到主畫面後）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// 請瀏覽器不要自動清掉這個 App 的資料
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
  layout();
  ensureWorld(0);
  requestAnimationFrame((t) => { last = t; frame(t); });
  purposes().forEach((_, i) => setTimeout(() => ensureWorld(i), 300 + i * 120));
});
