import { h, LETTERS } from './dom.js';

// «Σκονάκι»: every question with its correct answer only, grouped by category — for reading,
// not answering (Genie's "cheat sheet"). Respects the εκτός ύλης toggle.
export function renderSheet(ctx) {
  const qs = ctx.activeQuestions();
  const cats = [...new Set(qs.map((q) => q.category))].sort((a, b) => a.localeCompare(b, 'el'));
  const search = h('input', { type: 'search', placeholder: 'Φίλτρο…' });
  const body = h('div', { class: 'sheet' });
  const render = () => {
    const f = search.value.trim().toLowerCase();
    body.replaceChildren(...cats.map((c) => {
      const rows = qs.filter((q) => q.category === c && (!f || q.text.toLowerCase().includes(f) || q.options[q.correct].toLowerCase().includes(f) || String(q.id) === f));
      if (!rows.length) return null;
      return h('div', null, h('h2', null, `${c} (${rows.length})`), rows.map((q) => h('div', { class: 'qa' },
        h('div', { class: 'q' }, h('span', { class: 'id' }, `#${q.id}`), q.text, q.tier === 'archive' ? h('span', { class: 'tag' }, 'εκτός ύλης') : null),
        h('div', { class: 'a' }, `${LETTERS[q.correct]}. ${q.options[q.correct]}`))));
    }).filter(Boolean));
  };
  search.addEventListener('input', render);
  render();
  return h('div', null,
    h('h1', null, 'Σκονάκι'),
    h('p', { class: 'small muted' }, `${qs.length} ερωτήσεις με τη σωστή απάντηση, ανά κατηγορία. Για διάβασμα πριν τον ύπνο — όχι αντί για τεστ.`),
    search, body,
    h('div', { class: 'btn-row', style: { marginTop: '12px' } }, h('a', { class: 'btn', href: '#/' }, 'Αρχική')));
}
