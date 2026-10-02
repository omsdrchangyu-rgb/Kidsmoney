// 分配零用錢：依比例分到各罐子，以 10 元為單位。
// 分不完的零頭記在 carry 裡，下次再補，長期下來比例是準的。

// 這個金額用這個比例分，會不會剛好都是 10 的倍數
export function divides(amount, ratio) {
  return Object.values(ratio).every((p) => ((amount * p) / 100) % 10 === 0);
}
// 建議金額：不會有零頭的前幾個金額
export function suggestions(ratio, count = 5) {
  const out = [];
  for (let a = 10; a <= 2000 && out.length < count; a += 10) if (divides(a, ratio)) out.push(a);
  return out;
}

export function split(amount, ratio, carry) {
  const ids = Object.keys(ratio);
  const share = {}, give = {}, next = {};
  let given = 0;
  for (const id of ids) {
    share[id] = (amount * ratio[id]) / 100 + (carry[id] || 0);
    give[id] = Math.max(0, Math.floor(share[id] / 10 + 1e-9) * 10);
    given += give[id];
  }
  // 剩下的 10 元，給「欠最多」的罐子
  let left = amount - given;
  while (left >= 10) {
    const id = ids.filter((x) => ratio[x] > 0).sort((a, b) => (share[b] - give[b]) - (share[a] - give[a]))[0];
    if (!id) break;
    give[id] += 10; left -= 10;
  }
  for (const id of ids) next[id] = Math.round((share[id] - give[id]) * 100) / 100;
  return { give, carry: next };
}

// 金額換成錢幣（先用大的）
export function toCoins(amount) {
  const out = [];
  let a = amount;
  while (a >= 100) { out.push('100'); a -= 100; }
  while (a >= 50) { out.push('50'); a -= 50; }
  while (a >= 10) { out.push('10'); a -= 10; }
  return out;
}
