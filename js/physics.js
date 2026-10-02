// 物理：每個罐子一個 Matter.js 世界，錢真的會一枚一枚堆起來
import { TAU, rand, clamp, lerp, pointInPoly, spanAt } from './util.js';
import { SHAPES, COIN_R, BILL_FOLD } from './art.js';
import { Sound } from './sound.js';

const { Engine, Bodies, Body, Composite, Events } = window.Matter;
const STEP = 1000 / 60;

export function buildWorld(shapeName, items) {
  const shape = SHAPES[shapeName];
  const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
  const pts = shape.interior, T = 34, walls = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    let nx = dy / len, ny = -dx / len;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (pointInPoly(mx + nx, my + ny, pts)) { nx = -nx; ny = -ny; }
    walls.push(Bodies.rectangle(mx + (nx * T) / 2, my + (ny * T) / 2, len + 2, T, {
      isStatic: true, angle: Math.atan2(dy, dx), friction: 0.5, restitution: 0.1,
    }));
  }
  Composite.add(engine.world, walls);
  const world = { engine, shape, muted: true, shakeT: -1e9 };

  Events.on(engine, 'collisionStart', (ev) => {
    if (world.muted) return;
    for (const pr of ev.pairs) {
      const A = pr.bodyA, B = pr.bodyB, ka = A.plugin.kind, kb = B.plugin.kind;
      if (!ka && !kb) continue;
      if ((ka === '100' || !ka) && (kb === '100' || !kb)) continue;
      const sp = Math.hypot(A.velocity.x - B.velocity.x, A.velocity.y - B.velocity.y);
      if (sp < 1.3) continue;
      Sound.clink(clamp((sp - 1) / 7, 0.06, 1), A.isStatic || B.isStatic ? shape.material : 'metal');
    }
  });

  // 照存入的順序一批一批倒進去，讓它自然堆疊（畫面上的數量 = 存入的數量）
  let i = 0;
  while (i < items.length) {
    const y = shape.spawn.y + 8;
    const span = spanAt(pts, y + 16, 20) || [shape.spawn.x - 10, shape.spawn.x + 10];
    const n = Math.max(1, Math.floor((span[1] - span[0]) / 40));
    for (let k = 0; k < n && i < items.length; k++, i++) {
      const x = n === 1 ? (span[0] + span[1]) / 2 : lerp(span[0], span[1], k / (n - 1));
      addBody(world, items[i], x + rand(-3, 3), y + rand(0, 10), 0, true);
    }
    for (let s = 0; s < 22; s++) Engine.update(engine, STEP);
  }
  for (let s = 0; s < 120; s++) Engine.update(engine, STEP);
  world.muted = false;
  return world;
}

export function addBody(world, kind, x, y, vy, settled) {
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

export const step = (world) => Engine.update(world.engine, STEP);
export const moneyBodies = (world) => Composite.allBodies(world.engine.world).filter((b) => b.plugin.kind);

// 錢堆最高點（只算已經停下來的）
export function pileTop(world) {
  let top = Infinity, moving = false;
  for (const b of moneyBodies(world)) {
    if (b.speed > 0.5) { moving = true; continue; }
    const r = b.plugin.kind === '100' ? BILL_FOLD.h / 2 : COIN_R[b.plugin.kind];
    top = Math.min(top, b.position.y - r);
  }
  return { top, moving };
}
export function isFull(world) {
  const { top } = pileTop(world);
  return top < world.shape.fullY + 12;
}
