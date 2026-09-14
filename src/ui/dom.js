// Tiny DOM helper: h(tag, props, ...children). Text children are escaped by construction.
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list' && k !== 'form') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtDate(t) {
  if (!t) return '—';
  const d = new Date(t);
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
}
export function fmtRel(t, now = Date.now()) {
  if (!t) return '—';
  const d = now - t;
  if (d < 60000) return 'μόλις τώρα';
  if (d < 3600000) return `πριν ${Math.floor(d / 60000)} λ.`;
  if (d < 86400000) return `πριν ${Math.floor(d / 3600000)} ώ.`;
  return fmtDate(t);
}
export const LETTERS = ['α', 'β', 'γ', 'δ', 'ε', 'στ', 'ζ'];

// Sparkline of booleans (last N answers) as an inline SVG.
export function sparkline(history, n = 20) {
  const items = history.slice(-n);
  const w = Math.max(1, items.length) * 8, hgt = 14;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('width', w); svg.setAttribute('height', hgt); svg.setAttribute('class', 'spark');
  items.forEach((x, i) => {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', i * 8 + 1); r.setAttribute('y', x.ok ? 2 : 6); r.setAttribute('width', 6); r.setAttribute('height', x.ok ? 10 : 6);
    r.setAttribute('rx', 1.5); r.setAttribute('class', x.ok ? 'ok' : 'bad');
    svg.appendChild(r);
  });
  return svg;
}
