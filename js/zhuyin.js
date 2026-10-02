// 國字 + 右側直排注音
export function zhuyin(text, bpmf) {
  return [...text].map((ch, i) => {
    const b = bpmf[i] || '';
    const m = b.match(/[ˊˇˋ˙]/), tone = m ? m[0] : '';
    const syms = [...b.replace(/[ˊˇˋ˙]/g, '')];
    const light = tone === '˙';
    return `<span class="zy"><span class="zy-c">${ch}</span><span class="zy-b">` +
      (light ? '<i class="zy-l">˙</i>' : '') +
      syms.map((s) => `<i>${s}</i>`).join('') +
      (tone && !light ? `<i class="zy-t n${syms.length}">${tone}</i>` : '') +
      '</span></span>';
  }).join('');
}
