import { h, fmtMs, fmtDate, sparkline, LETTERS } from './dom.js';
import { isSolid, isMastered, inBin, confusions, dueForPromotion } from '../engine/reducer.js';
import { median } from '../engine/time.js';
import { levelDots } from './stats.js';
import { RULES } from '../engine/constants.js';

const filters = [['all', 'Όλες'], ['unseen', 'Νέες'], ['weak', 'Αδύναμες'], ['bin', 'Τα λάθη σου'], ['mastered', 'Εμπεδωμένες'], ['archive', 'Εκτός ύλης']];
let uiState = { filter: 'all', query: '', category: '' };

export function renderReview(ctx) {
  const st = ctx.progress.state;
  const all = ctx.questions;
  const categories = [...new Set(all.map((q) => q.category))].sort((a, b) => a.localeCompare(b, 'el'));
  const listEl = h('div', { class: 'list' });
  const info = h('p', { class: 'small muted' });

  function apply() {
    const q = uiState.query.trim().toLowerCase();
    const rows = all.filter((x) => {
      const s = st.q[x.id];
      if (uiState.filter === 'unseen' && s && s.seen) return false;
      if (uiState.filter === 'weak' && !(s && s.seen && (s.level < RULES.WEAK_LEVEL || inBin(s)))) return false;
      if (uiState.filter === 'bin' && !inBin(s)) return false;
      if (uiState.filter === 'mastered' && !isMastered(s)) return false;
      if (uiState.filter === 'archive' && x.tier !== 'archive') return false;
      if (uiState.filter !== 'archive' && x.tier === 'archive' && !ctx.progress.settings.includeArchive) return false;
      if (uiState.category && x.category !== uiState.category) return false;
      if (q && !(String(x.id) === q || x.text.toLowerCase().includes(q) || x.options.some((o) => o.toLowerCase().includes(q)))) return false;
      return true;
    });
    listEl.replaceChildren(...rows.map((x) => {
      const s = st.q[x.id];
      return h('a', { class: 'qrow', href: `#/q/${x.id}` }, h('span', { class: 'id' }, `#${x.id}`), h('span', { class: 'txt' }, x.text),
        s && s.seen ? h('span', { class: 'small muted' }, `${s.correct}/${s.seen}`) : h('span', { class: 'tag' }, 'νέα'), levelDots(s ? s.level : 0));
    }));
    info.textContent = `${rows.length} ερωτήσεις`;
  }

  const chips = h('div', { class: 'chips' }, filters.map(([v, l]) => h('button', { type: 'button', class: `chip ${uiState.filter === v ? 'on' : ''}`, onClick: (e) => { uiState.filter = v; for (const c of chips.children) c.classList.toggle('on', c === e.currentTarget); apply(); } }, l)));
  const search = h('input', { type: 'search', placeholder: 'Αναζήτηση κειμένου ή ID…', value: uiState.query, onInput: (e) => { uiState.query = e.target.value; apply(); } });
  const catSel = h('select', { onChange: (e) => { uiState.category = e.target.value; apply(); } }, h('option', { value: '' }, 'Όλες οι κατηγορίες'), categories.map((c) => h('option', { value: c, selected: c === uiState.category }, c)));
  apply();
  return h('div', null, h('h1', null, 'Ερωτήσεις'), search, chips, catSel, info, listEl);
}

export function renderQuestion(ctx, id) {
  const q = ctx.questions.find((x) => x.id === id);
  if (!q) return h('div', { class: 'card' }, 'Δεν βρέθηκε η ερώτηση.');
  const st = ctx.progress.state;
  const s = st.q[id];
  const now = Date.now();
  const byId = new Map(ctx.questions.map((x) => [x.id, x]));
  const conf = confusions(s);
  const wrongChoices = s ? Object.entries(s.wrongChoices).sort((a, b) => b[1] - a[1]) : [];
  const idx = ctx.questions.findIndex((x) => x.id === id);
  const prev = ctx.questions[idx - 1], next = ctx.questions[idx + 1];
  return h('div', null,
    h('div', { class: 'row between' }, h('a', { class: 'btn btn-sm', href: prev ? `#/q/${prev.id}` : '#/review' }, prev ? `← #${prev.id}` : '← Λίστα'), h('a', { class: 'btn btn-sm', href: '#/review' }, 'Λίστα'), h('a', { class: 'btn btn-sm', href: next ? `#/q/${next.id}` : '#/review' }, next ? `#${next.id} →` : 'Λίστα →')),
    h('div', { class: 'qcard', style: { marginTop: '10px' } },
      h('div', { class: 'qid' }, h('span', null, `#${q.id} · ${q.category}`), h('span', null, h('span', { class: 'tag' }, q.tier === 'booklet' ? 'βιβλίο' : 'εκτός ύλης'), q.image ? h('span', { class: 'tag' }, 'εικόνα') : null)),
      h('div', { class: 'qtext' }, q.text),
      q.image ? h('img', { class: 'qimg', src: q.image, alt: 'εικόνα ερώτησης' }) : null,
      h('div', { class: 'options' }, q.options.map((o, i) => h('div', { class: `opt ${i === q.correct ? 'correct' : 'dim'}` }, h('span', { class: 'k' }, LETTERS[i] + '.'), h('span', null, o)))),
      q.explanation ? h('div', { class: 'explain' }, h('b', null, 'Γιατί: '), q.explanation, h('span', { class: 'small' }, ' (αυτόματη επεξήγηση)')) : null,
      q.exam ? h('div', { class: 'alt-wording', id: 'exam-wording' }, h('b', null, 'Στις εξετάσεις: '), q.exam.text && q.exam.text !== q.text ? `«${q.exam.text}» — ` : '', `σωστή «${q.exam.options[q.correct]}»`) : null,
      Number.isInteger(q.group) ? h('p', { class: 'small muted' }, `Ομάδα εξετάσεων ${q.group}`) : null,
    ),
    (q.twins || []).length ? h('div', { class: 'card' }, h('h3', null, '⚠ Δίδυμες ερωτήσεις'), h('p', { class: 'small muted' }, 'Μοιάζουν με αυτή, αλλά έχουν άλλη σωστή απάντηση.'),
      h('div', { class: 'list' }, q.twins.map((tid) => { const o = byId.get(tid); return o ? h('a', { class: 'qrow', href: `#/q/${tid}` }, h('span', { class: 'id' }, `#${tid}`), h('span', { class: 'txt' }, `${o.text} → ${o.options[o.correct]}`)) : null; }))) : null,
    h('div', { class: 'card' },
      h('h3', null, 'Στατιστικά'),
      s && s.seen ? h('div', null,
        h('div', { class: 'grid' },
          h('div', { class: 'stat' }, h('div', { class: 'v' }, `${s.correct}/${s.seen}`), h('div', { class: 'l' }, 'σωστές / σύνολο')),
          h('div', { class: 'stat' }, h('div', { class: 'v' }, `${s.level}/5`), h('div', { class: 'l' }, 'επίπεδο')),
          h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtMs(median(s.ms))), h('div', { class: 'l' }, 'διάμεσος χρόνος'))),
        h('p', { class: 'small' }, h('span', { class: 'tag' }, isSolid(s) ? 'σίγουρη ✓' : 'όχι σίγουρη'), h('span', { class: 'tag' }, isMastered(s) ? 'εμπεδωμένη ✓' : 'όχι εμπεδωμένη'),
          inBin(s) ? h('span', { class: 'tag warn' }, `στα λάθη σου (${s.bin.days.length}/${RULES.BIN_EXIT_DAYS} μέρες)`) : null,
          s.level >= RULES.MAX_LEVEL ? h('span', { class: 'tag' }, 'επίπεδο 5 — μέγιστο') : dueForPromotion(s, now) ? h('span', { class: 'tag' }, 'για επανάληψη') : h('span', { class: 'tag' }, 'επανάληψη σε ' + Math.max(1, Math.ceil((s.lastPromoT + RULES.PROMOTION_GAP_MS - now) / 3600000)) + ' ώρες')),
        h('p', { class: 'small muted' }, `Τελευταία φορά: ${fmtDate(s.lastT)} · ανέβηκε επίπεδο ${s.promoCount} φορές σε ${s.promoDays.length} μέρες`),
        h('div', null, sparkline(s.history, 30)),
        wrongChoices.length ? h('p', { class: 'small' }, 'Λάθος επιλογές: ', wrongChoices.map(([i, n]) => `${LETTERS[i]} ×${n}`).join(', ')) : null,
        conf.length ? h('div', null, h('p', { class: 'small warn' }, 'Την μπερδεύεις με:'), h('div', { class: 'list' }, conf.map((c) => { const o = byId.get(c.id); return o ? h('a', { class: 'qrow', href: `#/q/${c.id}` }, h('span', { class: 'id' }, `#${c.id}`), h('span', { class: 'txt' }, o.text), h('span', { class: 'small muted' }, `×${c.count}`)) : null; }))) : null,
      ) : h('p', { class: 'muted' }, 'Δεν την έχεις απαντήσει ακόμα.'),
    ),
    q.similar && q.similar.length ? h('div', { class: 'card' }, h('h3', null, 'Όμοιες ερωτήσεις'), h('div', { class: 'list' }, q.similar.map((sid) => { const o = byId.get(sid); return o ? h('a', { class: 'qrow', href: `#/q/${sid}` }, h('span', { class: 'id' }, `#${sid}`), h('span', { class: 'txt' }, o.text)) : null; }))) : null,
    q.sources ? h('p', { class: 'small muted' }, `Πηγή: ${q.tier === 'booklet' ? `φωτογραφία ${q.sources.photo || ''}, κλειδί ${q.sources.key || ''}, ✓ ${q.sources.mark || ''}` : (q.sources.archive || []).map((x) => x.name || x).join(' + ')}`) : null,
  );
}
