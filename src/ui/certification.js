import { h, fmtDate } from './dom.js';
import { readiness, isMastered, isSolid } from '../engine/reducer.js';
import { RULES } from '../engine/constants.js';

export function renderCertification(ctx) {
  const st = ctx.progress.state;
  const r = readiness(st, ctx.questions);
  const booklet = ctx.questions.filter((q) => q.tier === 'booklet');
  const notMastered = booklet.filter((q) => !isMastered(st.q[q.id]));
  const lvl5NotSolid = booklet.filter((q) => st.q[q.id] && st.q[q.id].level === 5 && !isSolid(st.q[q.id]));
  const timed = st.mocks.filter((m) => m.timed && m.total === RULES.EXAM_QUESTIONS);
  const bestGauntlet = st.gauntlet139.filter((g) => g.x && g.x.completed).sort((a, b) => a.wrongs.length - b.wrongs.length)[0];
  const items = [
    { ok: r.masteryOk, title: 'Mastery 100 %', detail: `${r.mastery.done}/${r.mastery.total}. Λείπουν ${notMastered.length} ερωτήσεις${lvl5NotSolid.length ? ` (${lvl5NotSolid.length} είναι επίπεδο 5 αλλά όχι «σταθερές»)` : ''}.` },
    { ok: r.mocksOk, title: `${RULES.READY_MOCKS} συνεχόμενες χρονομετρημένες προσομοιώσεις 10/10 σε ≥${RULES.READY_MOCK_DAYS} μέρες`, detail: `Τώρα: ${r.consecutivePerfect} συνεχόμενες τέλειες, σε ${r.mockDays} διαφορετικές μέρες. Σύνολο προσομοιώσεων: ${timed.length}.` },
    { ok: r.gauntletOk, title: `Όλο το βιβλίο (${r.mastery.total}) με 0 λάθη`, detail: bestGauntlet ? `Καλύτερη προσπάθεια: ${bestGauntlet.wrongs.length} λάθη (${fmtDate(bestGauntlet.t)})` : 'Δεν έχεις ολοκληρώσει ακόμα το τεστ «Όλο το βιβλίο».' },
    { ok: r.suddenOk, title: `Σερί ≥ ${RULES.READY_SUDDEN_DEATH} στο «Μέχρι το πρώτο λάθος»`, detail: `Καλύτερο σερί: ${r.suddenBest}.` },
  ];
  return h('div', null,
    h('h1', null, 'Ετοιμότητα'),
    h('div', { class: `card readiness ${r.ready ? 'ready' : ''}` },
      h('div', { class: 'verdict-big ' + (r.ready ? 'ok' : 'bad') }, r.ready ? 'ΕΤΟΙΜΟΣ' : 'ΟΧΙ ΑΚΟΜΑ'),
      h('p', { class: 'muted small' }, 'Η ετοιμότητα ελέγχεται σε κάθε άνοιγμα. Οι ερωτήσεις εκτός ύλης δεν μετράνε.')),
    items.map((i) => h('div', { class: 'card' }, h('div', { class: 'row between' }, h('b', { class: i.ok ? 'ok' : 'bad' }, `${i.ok ? '✓' : '✗'} ${i.title}`)), h('p', { class: 'small muted' }, i.detail))),
    notMastered.length ? h('details', null, h('summary', null, `Ερωτήσεις που δεν έχεις εμπεδώσει ακόμα (${notMastered.length})`),
      h('div', { class: 'list' }, notMastered.slice(0, 200).map((q) => { const s = st.q[q.id]; return h('a', { class: 'qrow', href: `#/q/${q.id}` }, h('span', { class: 'id' }, `#${q.id}`), h('span', { class: 'txt' }, q.text), h('span', { class: 'small muted' }, s ? `L${s.level} · ${s.correct}/${s.seen}` : 'νέα')); }))) : null,
    h('div', { class: 'btn-row', style: { marginTop: '12px' } }, h('a', { class: 'btn', href: '#/' }, 'Αρχική')),
  );
}
