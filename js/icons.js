// 用途圖示（繪本風：咖啡色描邊、柔和填色、小高光）
const S = 'stroke="#4b3a2f" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"';

export const ICONS = {
  // 買零食：包裝糖果
  candy: `<svg viewBox="0 0 64 64" aria-hidden="true"><g filter="url(#rough)">
    <path d="M14 32 3 21l2 22z" fill="#ffd25e" ${S}/>
    <path d="M50 32l11-11-2 22z" fill="#ffd25e" ${S}/>
    <ellipse cx="32" cy="32" rx="19" ry="15" fill="#ff8c9a" ${S}/>
    <path d="M22 20q6 12 0 24M32 17q6 15 0 30M42 20q6 12 0 24" stroke="#fff" stroke-width="3.2" fill="none" opacity=".85"/>
    <ellipse cx="24" cy="25" rx="5" ry="3" fill="#fff" opacity=".7" transform="rotate(-25 24 25)"/>
  </g></svg>`,
  // 買車車：玩具車
  car: `<svg viewBox="0 0 64 64" aria-hidden="true"><g filter="url(#rough)">
    <path d="M6 40q0-9 9-10l6-1 6-10q2-3 6-3h10q4 0 6 4l5 9 3 1q4 1 4 6v6q0 3-3 3H9q-3 0-3-3z" fill="#5aa8f0" ${S}/>
    <path d="M24 29l5-9h7v9zM40 20h4q2 0 3 2l4 7H40z" fill="#dff1ff" ${S} stroke-width="1.8"/>
    <circle cx="18" cy="47" r="7" fill="#4a3c46" ${S}/><circle cx="18" cy="47" r="2.6" fill="#eef1f5"/>
    <circle cx="46" cy="47" r="7" fill="#4a3c46" ${S}/><circle cx="46" cy="47" r="2.6" fill="#eef1f5"/>
    <path d="M12 35h40" stroke="#fff" stroke-width="2.4" opacity=".6" stroke-linecap="round"/>
  </g></svg>`,
  // 存起來：錢幣上長出小芽（會長大＝利息）
  sprout: `<svg viewBox="0 0 64 64" aria-hidden="true"><g filter="url(#rough)">
    <ellipse cx="32" cy="52" rx="17" ry="6" fill="#e8c255" ${S}/>
    <path d="M15 46v6M49 46v6" ${S}/>
    <ellipse cx="32" cy="46" rx="17" ry="6" fill="#f3d36d" ${S}/>
    <ellipse cx="32" cy="40" rx="17" ry="6" fill="#f6dc7f" ${S}/>
    <path d="M32 37V22" ${S} fill="none"/>
    <path d="M32 26q-3-11-15-10 1 11 15 10z" fill="#7cc96a" ${S}/>
    <path d="M32 23q2-12 15-12 0 12-15 12z" fill="#93d97f" ${S}/>
    <ellipse cx="26" cy="38.5" rx="5" ry="1.6" fill="#fff" opacity=".7"/>
  </g></svg>`,
  // 緊急用：急救箱
  aid: `<svg viewBox="0 0 64 64" aria-hidden="true"><g filter="url(#rough)">
    <path d="M24 18v-4q0-3 3-3h10q3 0 3 3v4" fill="none" ${S}/>
    <rect x="7" y="18" width="50" height="36" rx="7" fill="#ff7070" ${S}/>
    <path d="M28 25h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="#fff" ${S} stroke-width="1.8"/>
    <path d="M12 24q0-2 3-2h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>
  </g></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" fill="#ffd25e" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
  calc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="3" fill="#bfe7ff"/><rect x="8" y="5.5" width="8" height="4" rx="1" fill="#fff"/><path d="M8.6 13.2h.1M12 13.2h.1M15.4 13.2h.1M8.6 17h.1M12 17h.1M15.4 17h.1" stroke-width="2.6"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>`,
  // 換新罐子
  newJar: `<svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="11" y="9" width="22" height="6" rx="2.5" fill="#e8564f" stroke="#4b3a2f" stroke-width="2.2"/>
    <path d="M13 15h18q4 2 4 7v16q0 4-4 4H13q-4 0-4-4V22q0-5 4-7z" fill="#dff3fa" stroke="#4b3a2f" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="37" cy="35" r="9" fill="#7cc96a" stroke="#4b3a2f" stroke-width="2.2"/>
    <path d="M37 30v10M32 35h10" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-1.8-3.2a1.5 1.5 0 0 1 2.6-1.5L8 14"/></svg>`,
};

// 小朋友的頭像
const A = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true"><g filter="url(#rough)" stroke="#4b3a2f" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
const eyes = (y = 32, dx = 9) => `<circle cx="${32 - dx}" cy="${y}" r="2.8" fill="#2c2430" stroke="none"/><circle cx="${32 + dx}" cy="${y}" r="2.8" fill="#2c2430" stroke="none"/>`;
const cheeks = (y = 39) => `<ellipse cx="17" cy="${y}" rx="4" ry="2.4" fill="#ff9fb0" stroke="none" opacity=".8"/><ellipse cx="47" cy="${y}" rx="4" ry="2.4" fill="#ff9fb0" stroke="none" opacity=".8"/>`;
export const AVATAR_ICONS = {
  bear: A(`<circle cx="15" cy="16" r="8" fill="#c98b5a"/><circle cx="49" cy="16" r="8" fill="#c98b5a"/>
    <circle cx="32" cy="35" r="22" fill="#d79a66"/><ellipse cx="32" cy="42" rx="9" ry="7" fill="#f3d9bd"/>
    <ellipse cx="32" cy="39" rx="3.4" ry="2.4" fill="#4b3a2f"/>${eyes(31)}${cheeks(41)}`),
  bunny: A(`<ellipse cx="22" cy="14" rx="6" ry="13" fill="#fbeef0"/><ellipse cx="42" cy="14" rx="6" ry="13" fill="#fbeef0"/>
    <ellipse cx="22" cy="15" rx="2.6" ry="8" fill="#ffb3c1" stroke="none"/><ellipse cx="42" cy="15" rx="2.6" ry="8" fill="#ffb3c1" stroke="none"/>
    <circle cx="32" cy="38" r="20" fill="#fbeef0"/><path d="M30 42h4l-2 2.4z" fill="#ff8fa3"/>${eyes(35, 8)}${cheeks(42)}`),
  cat: A(`<path d="M12 30 14 8l14 12zM52 30 50 8 36 20z" fill="#f6a54b"/>
    <circle cx="32" cy="36" r="21" fill="#f8b260"/><path d="M29 41h6l-3 3z" fill="#ff8fa3"/>
    <path d="M10 40h10M10 45l10-2M54 40H44M54 45l-10-2" stroke-width="1.6"/>${eyes(33)}`),
  chick: A(`<path d="M30 12q2-8 6-4M34 12q4-6 6-2" fill="none"/>
    <circle cx="32" cy="35" r="22" fill="#ffd84d"/><path d="M27 38h10l-5 6z" fill="#f59a3a"/>${eyes(31, 8)}${cheeks(40)}`),
  frog: A(`<circle cx="19" cy="18" r="9" fill="#7cc96a"/><circle cx="45" cy="18" r="9" fill="#7cc96a"/>
    <circle cx="19" cy="18" r="4.6" fill="#fff"/><circle cx="45" cy="18" r="4.6" fill="#fff"/>
    <circle cx="20" cy="19" r="2.4" fill="#2c2430" stroke="none"/><circle cx="46" cy="19" r="2.4" fill="#2c2430" stroke="none"/>
    <ellipse cx="32" cy="38" rx="24" ry="18" fill="#8fd47c"/><path d="M20 40q12 10 24 0" fill="none"/>${cheeks(38)}`),
};
