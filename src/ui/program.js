import { h } from './dom.js';
import { MODES, RULES } from '../engine/constants.js';
import { practiceSets } from '../engine/selection.js';
import { readiness, inBin } from '../engine/reducer.js';
import { readinessNumbers } from '../engine/chance.js';
import { fmtChance } from './final.js';

// «Πρόγραμμα»: DMV Genie's ordered path (tests → marathon → simulator → challenge bank → ready),
// with every rule stricter: a test passes only at 20/20 and ends at the first mistake, the marathon
// only without a single mistake, the simulator after 3 perfect runs in a row, mistakes are cleared
// by two correct answers in a row, and "ready" means a pass chance of ≥ 99,5 % (Genie: 80 %).

const realAnswers = (s) => (s && s.history ? s.history.filter((x) => x.m !== 'recall') : []);

// Every question ever missed must have its last two real answers right.
export function mistakesToClear(state, questions) {
  return questions.filter((q) => {
    if (q.tier !== 'booklet') return false;
    const s = state.q[q.id];
    if (!s || !s.wrong) return false;
    const hist = realAnswers(s);
    return !(hist.length >= 2 && hist[hist.length - 1].ok && hist[hist.length - 2].ok);
  }).map((q) => q.id);
}

export function programStages(ctx, now = Date.now()) {
  const st = ctx.progress.state;
  const { sets } = practiceSets(ctx.questions);
  const booklet = ctx.questions.filter((q) => q.tier === 'booklet');
  const passed = (i) => !!(st.ptests[i] && st.ptests[i].passed);
  const split = Math.min(3, sets.length);
  const r = readiness(st, ctx.questions);
  const cleanRun = st.sessions.some((x) => x.x && x.x.completed && x.wrongs.length === 0
    && ((x.mode === MODES.marathon && x.total >= booklet.length) || (x.mode === MODES.gauntlet139 && x.total === booklet.length)));
  const toClear = mistakesToClear(st, ctx.questions);
  const bin = booklet.filter((q) => inBin(st.q[q.id])).length;
  const nums = readinessNumbers(st, ctx.questions, ctx.progress.settings, now);
  const chance = nums.chance;
  const firstOpen = (from, to) => { for (let i = from; i < to; i++) if (!passed(i)) return i; return null; };
  const tests = (from, to) => ({ from, to, done: firstOpen(from, to) === null, next: firstOpen(from, to) });
  const t1 = tests(0, split), t2 = tests(split, sets.length);
  return {
    sets, chance,
    stages: [
      { id: 'tests1', title: `Τεστ 1–${split}`, detail: 'Περνάει μόνο με 20/20· το πρώτο λάθος τελειώνει το τεστ.', done: t1.done, tests: t1,
        next: t1.next !== null ? { label: `Τεστ ${t1.next + 1}`, mode: MODES.ptest, params: { set: t1.next } } : null },
      { id: 'tests2', title: `Τεστ ${split + 1}–${sets.length}`, detail: 'Ίδιος κανόνας: χωρίς κανένα λάθος.', done: t2.done, tests: t2,
        next: t2.next !== null ? { label: `Τεστ ${t2.next + 1}`, mode: MODES.ptest, params: { set: t2.next } } : null },
      { id: 'marathon', title: 'Μαραθώνιος χωρίς λάθος', detail: `Και οι ${booklet.length} ερωτήσεις μία φορά· περνάει μόνο αν δεν χάσεις καμία.`, done: cleanRun,
        next: { label: 'Μαραθώνιος', mode: MODES.gauntlet139, params: {} } },
      { id: 'simulator', title: `Προσομοίωση: 3 φορές ${RULES.EXAM_QUESTIONS}/${RULES.EXAM_QUESTIONS} στη σειρά`, detail: `Τώρα: ${Math.min(3, r.consecutivePerfect)}/3 συνεχόμενες τέλειες.`, done: r.consecutivePerfect >= 3,
        next: { label: 'Προσομοίωση', mode: MODES.exam, params: {} } },
      { id: 'mistakes', title: 'Καθάρισε τα λάθη σου', detail: toClear.length ? `${toClear.length} ερωτήσεις που έχεις χάσει θέλουν 2 σωστές στη σειρά.` : 'Κάθε ερώτηση που έχασες απαντήθηκε σωστά 2 φορές στη σειρά.', done: toClear.length === 0,
        next: bin ? { label: 'Επανάληψη λαθών', mode: MODES.wrong, params: {} } : { label: 'Όσες έχεις χάσει ποτέ', mode: MODES.morning, params: {} } },
      { id: 'ready', title: `Έτοιμος: πιθανότητα ≥ ${fmtChance(RULES.PASS_TARGET)}, καμία ερώτηση κάτω από ${fmtChance(RULES.PASS_FLOOR)}`, detail: `Στις εξετάσεις χωρίς άλλο διάβασμα: ${fmtChance(chance)} · πιο αδύναμη: ${fmtChance(nums.weakest)}.`, done: nums.ready,
        next: { label: 'Επιπλέον γύρος', mode: MODES.grind, params: {} } },
    ],
  };
}

export function programCard(ctx, start) {
  const st = ctx.progress.state, s = ctx.progress.settings;
  const { sets, stages } = programStages(ctx);
  const { archive } = practiceSets(ctx.questions);
  const done = stages.filter((x) => x.done).length;
  const next = stages.find((x) => !x.done);
  const passedCount = sets.filter((_, i) => st.ptests[i] && st.ptests[i].passed).length;

  const ptCard = (idx, ids, label) => {
    const p = st.ptests[idx === 'archive' ? -1 : idx];
    const ok = !!(p && p.passed);
    const best = p ? `${p.best}/${ids.length}` : '—';
    return h('button', { class: `ptest ${ok ? 'passed' : ''}`, type: 'button', dataset: { set: idx }, onClick: () => start(MODES.ptest, { set: idx }) },
      h('span', { class: 't' }, label), h('span', { class: 'b' }, ok ? '✓ 100 %' : `καλύτερο ${best}`), h('span', { class: 'c' }, `${ids.length} ερ.`));
  };

  return h('section', { class: 'card program', id: 'program', 'aria-label': 'Πρόγραμμα' },
    h('div', { class: 'row between' },
      h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'eyebrow' }, `${done}/${stages.length} στάδια · τεστ ${passedCount}/${sets.length} με 100 %`), h('h3', { style: { margin: '2px 0 0' } }, 'Πρόγραμμα')),
      next ? null : h('span', { class: 'tag ready-tag' }, 'ΕΤΟΙΜΟΣ')),
    next && next.next ? h('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'program-next', style: { marginTop: '10px' }, onClick: () => start(next.next.mode, next.next.params) }, `Επόμενο: ${next.next.label} ▶`) : null,
    h('ol', { class: 'stages' }, stages.map((x, i) => h('li', { class: `${x.done ? 'done' : ''} ${x === next ? 'current' : ''}`, dataset: { stage: x.id } },
      h('div', { class: 'stage-head' }, h('span', { class: 'stage-n' }, x.done ? '✓' : i + 1), h('div', { class: 'step-main' }, h('b', null, x.title), h('div', { class: 'small muted' }, x.detail))),
      x.tests ? h('div', { class: 'ptests' }, sets.slice(x.tests.from, x.tests.to).map((ids, k) => ptCard(x.tests.from + k, ids, `Τεστ ${x.tests.from + k + 1}`))) : null,
      !x.tests && !x.done && x !== next && x.next ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => start(x.next.mode, x.next.params) }, 'Ξεκίνα') : null))),
    s.includeArchive && archive.length ? h('div', { class: 'ptests', style: { marginTop: '8px' } }, ptCard('archive', archive, 'Εκτός ύλης')) : null,
  );
}
