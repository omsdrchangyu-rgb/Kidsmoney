// 家長畫面：選小朋友、發零用錢、分配比例、看存了多少、管理小朋友
import { PRESETS, AVATARS, purposeTotal, kidTotal, newKid } from './store.js';
import { split, suggestions, divides, toCoins } from './allocate.js';
import { drawCoin, drawBillFlat } from './art.js';
import { ICONS, AVATAR_ICONS } from './icons.js';
import { makeCanvas } from './util.js';

const money = (n) => '$' + Math.round(n).toLocaleString('zh-TW');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let coinImgs = null;
function coinImg(kind) {
  if (!coinImgs) {
    coinImgs = {};
    for (const k of ['10', '50']) {
      const c = makeCanvas(96, 96), x = c.getContext('2d');
      x.translate(48, 48); drawCoin(x, 46, k, 0);
      coinImgs[k] = c.toDataURL();
    }
    const c = makeCanvas(200, 98);
    drawBillFlat(c.getContext('2d'), 200, 98);
    coinImgs['100'] = c.toDataURL();
  }
  return coinImgs[kind];
}

export function initParent({ getRoot, getKid, save, onGiven, onSwitchKid, onKidsChanged, onRestyle, onReset }) {
  const sheet = document.querySelector('#parent');
  let amount = 0, customOpen = false;

  function render() {
    const root = getRoot(), st = getKid();
    const ids = st.purposes.map((p) => p.id);
    const ratioSum = ids.reduce((a, id) => a + (st.ratio[id] || 0), 0);
    const preview = amount > 0 && ratioSum === 100 ? split(amount, st.ratio, st.carry) : null;
    const sugg = ratioSum === 100 ? suggestions(st.ratio) : [];
    const icon = (p) => `<span class="pi">${ICONS[p.icon]}</span>`;
    const av = (k) => AVATAR_ICONS[k.avatar] || AVATAR_ICONS.bear;

    sheet.querySelector('.panel').innerHTML = `
      <header><h2>發零用錢</h2><button class="x" data-act="close" aria-label="關閉">✕</button></header>

      ${root.kids.length > 1 ? `<div class="kidtabs">${root.kids.map((k) =>
        `<button class="kidtab ${k.id === root.activeKid ? 'on' : ''}" data-kid="${k.id}">${av(k)}${esc(k.name)}</button>`).join('')}</div>` : ''}

      <section class="amount">
        <div class="big">${money(amount)}</div>
        <div class="adders">
          ${['10', '50', '100'].map((k) => `<button class="add a${k}" data-add="${k}" aria-label="加 ${k} 元"><img src="${coinImg(k)}" alt=""></button>`).join('')}
          <button class="clear" data-act="clear" aria-label="歸零">↺</button>
        </div>
        ${sugg.length ? `<div class="chips">${sugg.map((a) => `<button class="chip ${a === amount ? 'on' : ''}" data-amt="${a}">${money(a)}</button>`).join('')}</div>` : ''}
      </section>

      <section>
        <h3>分配比例</h3>
        <div class="presets">
          ${PRESETS.map((pr) => `<button class="preset ${st.presetId === pr.id ? 'on' : ''}" data-preset="${pr.id}">
              <b>${pr.name}</b>
              <span class="mini">${st.purposes.map((p) => `<span>${icon(p)}${pr.ratio[p.id]}%</span>`).join('')}</span>
            </button>`).join('')}
          <button class="preset ${st.presetId === 'custom' ? 'on' : ''}" data-act="custom"><b>自訂</b>
            <span class="mini">${st.presetId === 'custom' ? st.purposes.map((p) => `<span>${icon(p)}${st.ratio[p.id]}%</span>`).join('') : '自己調整'}</span></button>
        </div>
        ${customOpen ? `<div class="custom">
          ${st.purposes.map((p) => `<div class="row">${icon(p)}<span class="t">${p.title}</span>
            <button data-step="${p.id}" data-d="-5">−</button><span class="v">${st.ratio[p.id]}%</span><button data-step="${p.id}" data-d="5">＋</button></div>`).join('')}
          <div class="sum ${ratioSum === 100 ? '' : 'bad'}">合計 ${ratioSum}%${ratioSum === 100 ? '' : '（要剛好 100%）'}</div>
        </div>` : ''}
      </section>

      <section class="preview">
        ${st.purposes.map((p) => {
          const g = preview ? preview.give[p.id] : 0;
          return `<div class="row">${icon(p)}<span class="t">${p.title}</span><span class="coins">${toCoins(g).map((k) => `<img class="c${k}" src="${coinImg(k)}" alt="">`).join('')}</span><span class="v">${g ? money(g) : '–'}</span></div>`;
        }).join('')}
        ${preview && !divides(amount, st.ratio) ? `<p class="note">這個金額分不平均，零頭會記著，下次發錢時補上。建議用上面的金額。</p>` : ''}
      </section>

      <button class="give" data-act="give" ${preview ? '' : 'disabled'}>發給 ${esc(st.name)} ↓</button>

      <section class="totals">
        <h3>${esc(st.name)} 存了多少</h3>
        ${st.purposes.map((p, i) => `<div class="row">${icon(p)}<span class="t">${p.title}</span>
          <button class="style" data-style="${i}">換樣子</button>
          <span class="jars">${p.jars.length > 1 ? `${p.jars.length} 罐` : ''}</span><span class="v">${money(purposeTotal(p))}</span></div>`).join('')}
        <div class="row grand"><span class="t">全部</span><span class="v">${money(kidTotal(st))}</span></div>
      </section>

      <section class="kids">
        <h3>小朋友</h3>
        ${root.kids.map((k) => `<div class="row">
          <button class="av" data-avatar="${k.id}" aria-label="換頭像">${av(k)}</button>
          <input data-name="${k.id}" value="${esc(k.name)}" maxlength="8" aria-label="名字">
          <span class="v">${money(kidTotal(k))}</span>
          ${root.kids.length > 1 ? `<button class="del" data-del="${k.id}" aria-label="刪除">✕</button>` : ''}
        </div>`).join('')}
        <button class="add" data-act="addkid">＋ 新增小朋友</button>
      </section>

      <section class="danger">
        <button data-act="wipe">全部清空，重新開始</button>
        <button data-act="demo">放回示範金額</button>
      </section>`;
  }

  sheet.addEventListener('change', (e) => {
    const id = e.target.dataset && e.target.dataset.name;
    if (!id) return;
    const k = getRoot().kids.find((x) => x.id === id);
    if (k) { k.name = e.target.value.trim() || k.name; save(); onKidsChanged(); render(); }
  });

  sheet.addEventListener('click', (e) => {
    const root = getRoot(), st = getKid();
    if (e.target === sheet) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add) amount += +b.dataset.add;
    if (b.dataset.amt) amount = +b.dataset.amt;
    if (b.dataset.kid) { onSwitchKid(b.dataset.kid); customOpen = false; }
    if (b.dataset.preset) {
      const pr = PRESETS.find((x) => x.id === b.dataset.preset);
      st.presetId = pr.id; st.ratio = { ...pr.ratio }; customOpen = false;
      save();
    }
    if (b.dataset.step) {
      const id = b.dataset.step;
      st.ratio[id] = Math.max(0, Math.min(100, st.ratio[id] + +b.dataset.d));
      st.presetId = 'custom';
      save();
    }
    if (b.dataset.style) { onRestyle(+b.dataset.style); return; }
    if (b.dataset.avatar) {
      const k = root.kids.find((x) => x.id === b.dataset.avatar);
      k.avatar = AVATARS[(AVATARS.indexOf(k.avatar) + 1) % AVATARS.length];
      save(); onKidsChanged();
    }
    if (b.dataset.del) {
      const k = root.kids.find((x) => x.id === b.dataset.del);
      if (confirm(`確定要刪除「${k.name}」和他所有的存錢紀錄嗎？`)) {
        root.kids = root.kids.filter((x) => x !== k);
        if (root.activeKid === k.id) onSwitchKid(root.kids[0].id);
        save(); onKidsChanged();
      }
    }
    const act = b.dataset.act;
    if (act === 'close') return close();
    if (act === 'clear') amount = 0;
    if (act === 'custom') { customOpen = !customOpen; st.presetId = 'custom'; save(); }
    if (act === 'addkid') {
      const used = new Set(root.kids.map((k) => k.avatar));
      const k = newKid(`小朋友${root.kids.length + 1}`, AVATARS.find((a) => !used.has(a)) || 'bear');
      root.kids.push(k);
      save(); onKidsChanged();
    }
    if (act === 'give') {
      const r = split(amount, st.ratio, st.carry);
      for (const p of st.purposes) p.pending.push(...toCoins(r.give[p.id] || 0));
      st.carry = r.carry;
      st.log.push({ t: Date.now(), type: 'give', amount, give: r.give });
      save();
      amount = 0;
      close();
      setTimeout(onGiven, 250);
      return;
    }
    if (act === 'wipe') {
      if (confirm('確定要清空所有小朋友的罐子和紀錄嗎？')) { onReset(true); close(); }
      return;
    }
    if (act === 'demo') { onReset(false); close(); return; }
    render();
  });

  function open() { amount = 0; render(); sheet.classList.add('open'); }
  function close() { sheet.classList.remove('open'); }
  return { open, close, render };
}
