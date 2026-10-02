// 資料：先存在手機裡（localStorage）。之後接 Firebase / Mac mini 只要換掉 load / save。
//
// 結構：
// root = { v: 2, activeKid, kids: [kid] }
// kid  = { id, name, avatar, purposes: [purpose], presetId, ratio, carry, log }
// purpose = { id, title, bpmf, icon, jars: [{ items: ['10','50','100'…], look }], pending: [...] }
// look = { shape: 'pig'|'jar'|'car'|'train'|'hsr', color, deco }   ← 每一罐自己的樣子
const KEY = 'piggy-bank-v2';
const OLD_KEY = 'piggy-bank-v1';

export const PURPOSES = [
  { id: 'snack', title: '買零食', bpmf: ['ㄇㄞˇ', 'ㄌㄧㄥˊ', 'ㄕˊ'], icon: 'candy', look: { shape: 'pig', color: 'red' } },
  { id: 'car', title: '買車車', bpmf: ['ㄇㄞˇ', 'ㄔㄜ', 'ㄔㄜ'], icon: 'car', look: { shape: 'car', color: 'blue' } },
  { id: 'save', title: '存起來', bpmf: ['ㄘㄨㄣˊ', 'ㄑㄧˇ', 'ㄌㄞˊ'], icon: 'sprout', look: { shape: 'jar', color: 'glass', deco: 'heart' } },
  { id: 'sos', title: '緊急用', bpmf: ['ㄐㄧㄣˇ', 'ㄐㄧˊ', 'ㄩㄥˋ'], icon: 'aid', look: { shape: 'pig', color: 'yellow' } },
];

// 預設比例：每一種都挑過，配合「建議金額」不會有分不完的零頭
export const PRESETS = [
  { id: 'half', name: '一半花・一半存', ratio: { snack: 25, car: 25, save: 25, sos: 25 } },
  { id: 'more-save', name: '多存一點', ratio: { snack: 20, car: 20, save: 40, sos: 20 } },
  { id: 'car-goal', name: '存車車', ratio: { snack: 20, car: 40, save: 20, sos: 20 } },
  { id: 'all-save', name: '全部存起來', ratio: { snack: 0, car: 0, save: 100, sos: 0 } },
];

export const AVATARS = ['bear', 'bunny', 'cat', 'chick', 'frog'];

const DEMO = {
  snack: ['10', '10', '50', '10', '10', '100', '10'],
  car: ['10', '50', '10', '10', '100', '10'],
  save: ['50', '10', '100', '10', '10', '50', '10', '10'],
  sos: ['10', '10', '50', '10'],
};

const uid = () => Math.random().toString(36).slice(2, 9);

export function newKid(name, avatar, demo = false) {
  return {
    id: uid(), name, avatar,
    purposes: PURPOSES.map(({ look, ...p }) => ({ ...p, jars: [{ items: demo ? DEMO[p.id].slice() : [], look: { ...look } }], pending: [] })),
    presetId: 'half',
    ratio: { ...PRESETS[0].ratio },
    carry: Object.fromEntries(PURPOSES.map((p) => [p.id, 0])),
    log: [],
  };
}
function fresh(demo) {
  const kid = newKid('寶貝', 'bear', demo);
  return { v: 2, activeKid: kid.id, kids: [kid] };
}

// 舊版（只有一個小孩、罐子是單純的陣列）轉成新版
function migrate(old) {
  const kid = newKid('寶貝', 'bear');
  kid.purposes = PURPOSES.map(({ look, ...p }) => {
    const o = old.purposes.find((x) => x.id === p.id) || { jars: [[]], pending: [] };
    return { ...p, jars: o.jars.map((items) => ({ items, look: { ...look } })), pending: o.pending || [] };
  });
  Object.assign(kid, { presetId: old.presetId, ratio: old.ratio, carry: old.carry, log: old.log || [] });
  return { v: 2, activeKid: kid.id, kids: [kid] };
}

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.v === 2 && s.kids && s.kids.length) {
      // 用途的名稱、圖示用程式裡最新的
      for (const kid of s.kids) {
        for (const p of PURPOSES) {
          const cur = kid.purposes.find((x) => x.id === p.id);
          if (cur) Object.assign(cur, { title: p.title, bpmf: p.bpmf, icon: p.icon });
        }
      }
      if (!s.kids.some((k) => k.id === s.activeKid)) s.activeKid = s.kids[0].id;
      return s;
    }
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    if (old && old.v === 1) return migrate(old);
  } catch (e) { /* 無痕模式或資料壞掉 */ }
  return fresh(true);
}
export function save(root) {
  try { localStorage.setItem(KEY, JSON.stringify(root)); } catch (e) { /* 無痕模式 */ }
}
export function reset(empty) { return fresh(!empty); }
export const activeKid = (root) => root.kids.find((k) => k.id === root.activeKid) || root.kids[0];

export const VALUE = { '10': 10, '50': 50, '100': 100 };
export const sum = (items) => items.reduce((a, k) => a + VALUE[k], 0);
export function purposeTotal(p) {
  return p.jars.reduce((a, j) => a + sum(j.items), 0) + sum(p.pending);
}
export const kidTotal = (kid) => kid.purposes.reduce((a, p) => a + purposeTotal(p), 0);
