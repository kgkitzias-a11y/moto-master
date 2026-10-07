import { h, fmtDate } from './dom.js';
import { readiness, isMastered, isSolid } from '../engine/reducer.js';
import { RULES } from '../engine/constants.js';
import { passChance, groupChances, riskiest, proofStatus } from '../engine/chance.js';
import { fmtChance } from './final.js';

export function renderCertification(ctx) {
  const st = ctx.progress.state;
  const r = readiness(st, ctx.questions);
  const booklet = ctx.questions.filter((q) => q.tier === 'booklet');
  const notMastered = booklet.filter((q) => !isMastered(st.q[q.id]));
  const lvl5NotSolid = booklet.filter((q) => st.q[q.id] && st.q[q.id].level === 5 && !isSolid(st.q[q.id]));
  const timed = st.mocks.filter((m) => m.timed && m.total === RULES.EXAM_QUESTIONS);
  const bestGauntlet = st.gauntlet139.filter((g) => g.x && g.x.completed).sort((a, b) => a.wrongs.length - b.wrongs.length)[0];
  const items = [
    { ok: r.masteryOk, title: 'Εμπέδωση 100 %', detail: `${r.mastery.done}/${r.mastery.total}. Λείπουν ${notMastered.length} ερωτήσεις${lvl5NotSolid.length ? ` (${lvl5NotSolid.length} είναι επίπεδο 5 αλλά όχι «σταθερές»)` : ''}.` },
    { ok: r.mocksOk, title: `${RULES.READY_MOCKS} συνεχόμενες χρονομετρημένες προσομοιώσεις 10/10 σε ≥${RULES.READY_MOCK_DAYS} μέρες`, detail: `Τώρα: ${r.consecutivePerfect} συνεχόμενες τέλειες, σε ${r.mockDays} διαφορετικές μέρες. Σύνολο προσομοιώσεων: ${timed.length}.` },
    { ok: r.gauntletOk, title: `Όλο το βιβλίο (${r.mastery.total}) με 0 λάθη`, detail: bestGauntlet ? `Καλύτερη προσπάθεια: ${bestGauntlet.wrongs.length} λάθη (${fmtDate(bestGauntlet.t)})` : 'Δεν έχεις ολοκληρώσει ακόμα το τεστ «Όλο το βιβλίο».' },
    { ok: r.suddenOk, title: `Σερί ≥ ${RULES.READY_SUDDEN_DEATH} στο «Μέχρι το πρώτο λάθος»`, detail: `Καλύτερο σερί: ${r.suddenBest}.` },
    { ok: r.hardOk, title: `${r.hardNeeded} τέλειες «Σκληρές προσομοιώσεις» (${RULES.EXAM_QUESTIONS}/${RULES.EXAM_QUESTIONS} σε ${RULES.HARD_EXAM_TIME_MS / 60000}′)`, detail: `Τώρα: ${r.hardPerfect} τέλειες από ${st.hardMocks.length} προσπάθειες.` },
  ];
  const now = Date.now();
  const chance = passChance(st, ctx.questions, now);
  const groups = groupChances(st, ctx.questions, now);
  const risky = riskiest(st, ctx.questions, now).slice(0, 25);
  const proof = proofStatus(st, ctx.questions, now);
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  const chanceCard = h('div', { class: `card ${chance >= RULES.PASS_TARGET ? 'readiness ready' : ''}`, id: 'chance-card' },
    h('div', { class: 'row between' }, h('b', null, 'Πιθανότητα επιτυχίας'), h('span', { class: `big ${chance >= RULES.PASS_TARGET ? 'ok' : ''}` }, fmtChance(chance))),
    h('p', { class: 'small muted' }, `Εκτίμηση: για κάθε ερώτηση μετράμε πόσες φορές στη σειρά την απάντησες σωστά (με μπόνους όταν είναι σε διαφορετικές μέρες και ποινή όταν έχεις να τη δεις πάνω από 3 μέρες). Οι εξετάσεις παίρνουν μία ερώτηση από κάθε ομάδα· υπολογίζουμε την πιθανότητα για το πολύ ${RULES.EXAM_MAX_WRONG} λάθος. Στόχος: ≥ ${fmtChance(RULES.PASS_TARGET)}.`),
    groups.length ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Ομάδα'), h('th', null, 'Ερωτήσεις'), h('th', null, 'Πιθανότητα σωστής'))),
      h('tbody', null, groups.map((g) => h('tr', null, h('td', null, g.group), h('td', null, g.size), h('td', { class: g.p < 0.97 ? 'warn' : 'ok' }, fmtChance(g.p)))))) : null,
    risky.length ? h('details', null, h('summary', null, `Ερωτήσεις που ρίχνουν την πιθανότητα (${risky.length})`),
      h('div', { class: 'list' }, risky.map((x) => { const q = byId.get(x.id); return h('a', { class: 'qrow', href: `#/q/${x.id}` }, h('span', { class: 'id' }, `#${x.id}`), h('span', { class: 'txt' }, q.text), h('span', { class: 'small muted' }, fmtChance(x.p))); }))) : null);
  const proofCard = h('div', { class: `card ${proof.done === proof.total ? 'readiness ready' : ''}`, id: 'proof-card' },
    h('div', { class: 'row between' }, h('b', null, 'Τελικός έλεγχος'), h('span', { class: 'big' }, `${proof.done}/${proof.total}`)),
    h('p', { class: 'small muted' }, 'Κάθε ερώτηση του βιβλίου απαντημένη σωστά τις τελευταίες 48 ώρες, μέσα σε 15″ — και δύο φορές στη σειρά, αν την έχεις χάσει ποτέ.'),
    proof.missing.length ? h('details', null, h('summary', null, `Λείπουν (${proof.missing.length})`),
      h('div', { class: 'list' }, proof.missing.slice(0, 200).map((id) => { const q = byId.get(id); return h('a', { class: 'qrow', href: `#/q/${id}` }, h('span', { class: 'id' }, `#${id}`), h('span', { class: 'txt' }, q.text)); }))) : null);
  return h('div', null,
    h('h1', null, 'Ετοιμότητα'),
    chanceCard, proofCard,
    h('div', { class: `card readiness ${r.ready ? 'ready' : ''}` },
      h('div', { class: 'verdict-big ' + (r.ready ? 'ok' : 'bad') }, r.ready ? 'ΕΤΟΙΜΟΣ' : 'ΟΧΙ ΑΚΟΜΑ'),
      h('p', { class: 'muted small' }, 'Η ετοιμότητα ελέγχεται σε κάθε άνοιγμα. Οι ερωτήσεις εκτός ύλης δεν μετράνε.')),
    items.map((i) => h('div', { class: 'card' }, h('div', { class: 'row between' }, h('b', { class: i.ok ? 'ok' : 'bad' }, `${i.ok ? '✓' : '✗'} ${i.title}`)), h('p', { class: 'small muted' }, i.detail))),
    notMastered.length ? h('details', null, h('summary', null, `Ερωτήσεις που δεν έχεις εμπεδώσει ακόμα (${notMastered.length})`),
      h('div', { class: 'list' }, notMastered.slice(0, 200).map((q) => { const s = st.q[q.id]; return h('a', { class: 'qrow', href: `#/q/${q.id}` }, h('span', { class: 'id' }, `#${q.id}`), h('span', { class: 'txt' }, q.text), h('span', { class: 'small muted' }, s ? `L${s.level} · ${s.correct}/${s.seen}` : 'νέα')); }))) : null,
    h('div', { class: 'btn-row', style: { marginTop: '12px' } }, h('a', { class: 'btn', href: '#/' }, 'Αρχική')),
  );
}
