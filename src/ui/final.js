import { h } from './dom.js';
import { MODES, RULES } from '../engine/constants.js';
import { passChance, proofStatus } from '../engine/chance.js';
import { dayKey } from '../engine/time.js';

// "97,3 %" in Greek notation; never shows 100 % for an estimate below 1.
export function fmtChance(p) {
  const pct = p * 100;
  if (pct >= 99.95 && p < 1) return '>99,9 %';
  return `${pct.toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

// «Τελική ευθεία»: one guided list of today's steps, chosen by the days left to the exam.
export function finalStretchCard(ctx, start) {
  const p = ctx.progress, st = p.state, now = Date.now();
  const plan = p.plan(now);
  const days = plan.days;
  if (days !== null && days < 0) return null;
  const today = dayKey(now);
  const todays = st.sessions.filter((x) => dayKey(x.t) === today);
  const completed = (mode) => todays.some((x) => x.mode === mode && x.x && x.x.completed);
  const perfectExams = todays.filter((x) => x.mode === MODES.exam && x.total === RULES.EXAM_QUESTIONS && x.correct === x.total).length;
  const chance = passChance(st, ctx.questions, now);
  const proof = proofStatus(st, ctx.questions, now);
  const goalParams = plan.automatic ? { plannedIds: plan.queue } : { remaining: plan.remaining };

  let phase, steps;
  if (days === 0) {
    phase = 'Σήμερα εξετάσεις';
    steps = [
      { id: 'morning', label: 'Πρωί των εξετάσεων', detail: 'Όσες έχεις χάσει ποτέ, οι δίδυμες και οι αριθμοί, μέχρι να μη μείνει καμία.', done: completed(MODES.morning), run: () => start(MODES.morning) },
      { id: 'cards', label: 'Κάρτα αριθμών', detail: 'Τα όρια ταχύτητας και όλοι οι αριθμοί του βιβλίου σε μία σελίδα.', href: '#/cards' },
      { id: 'examday', label: 'Τι ισχύει στις εξετάσεις', detail: 'Πώς δουλεύει η οθόνη, η παράλειψη και τι να έχεις μαζί σου.', href: '#/cards' },
    ];
  } else if (days === 1) {
    phase = 'Αύριο εξετάσεις — παραμονή';
    steps = [
      { id: 'proof', label: 'Τελικός έλεγχος', detail: `${proof.done}/${proof.total} σωστές τις τελευταίες 48 ώρες· όσες λείπουν, μέχρι να τις περάσεις όλες.`, done: proof.done === proof.total, run: () => start(MODES.proof) },
      { id: 'marathon', label: 'Μαραθώνιος', detail: 'Όλο το βιβλίο· ό,τι χάνεις ξαναμπαίνει μέχρι να μη μείνει κανένα λάθος.', done: completed(MODES.marathon), run: () => start(MODES.marathon) },
      { id: 'exams', label: `3 προσομοιώσεις με ${RULES.EXAM_QUESTIONS}/${RULES.EXAM_QUESTIONS}`, detail: `Σήμερα: ${Math.min(perfectExams, 3)}/3 τέλειες.`, done: perfectExams >= 3, run: () => start(MODES.exam) },
      { id: 'cards', label: 'Διάβασε τις κάρτες', detail: 'Αριθμοί, δίδυμες ερωτήσεις και τι ισχύει στις εξετάσεις.', href: '#/cards' },
    ];
  } else {
    phase = days === null ? 'Κάθε μέρα μέχρι τις εξετάσεις' : `${days} μέρες μέχρι τις εξετάσεις`;
    steps = [
      { id: 'plan', label: 'Το σημερινό πλάνο', detail: plan.remaining > 0 ? `${plan.remaining} ερωτήσεις ακόμα.` : 'Ολοκληρώθηκε.', done: plan.remaining === 0, run: () => start(MODES.goal, goalParams) },
      { id: 'twins', label: 'Δίδυμες ερωτήσεις', detail: 'Ίδια ερώτηση, άλλη σωστή απάντηση· η μία μετά την άλλη.', done: completed(MODES.twins), run: () => start(MODES.twins) },
      { id: 'exam', label: `Μία προσομοίωση με ${RULES.EXAM_QUESTIONS}/${RULES.EXAM_QUESTIONS}`, detail: perfectExams ? 'Έγινε σήμερα ✓' : `${RULES.EXAM_QUESTIONS} ερωτήσεις, μία από κάθε ομάδα, ${RULES.EXAM_TIME_MS / 60000}′.`, done: perfectExams >= 1, run: () => start(MODES.exam) },
    ];
  }
  const next = steps.find((s) => !s.done && s.run);
  const ok = chance >= RULES.PASS_TARGET;
  return h('section', { class: 'card final-stretch', id: 'final-stretch', 'aria-label': 'Τελική ευθεία' },
    h('div', { class: 'row between' }, h('div', null, h('div', { class: 'eyebrow' }, phase), h('h3', { style: { margin: '2px 0 0' } }, 'Τελική ευθεία')),
      h('a', { class: 'btn btn-sm', href: '#/certification' }, 'Ετοιμότητα')),
    h('div', { class: 'kpis', style: { marginTop: '10px' } },
      h('div', { class: `kpi ${ok ? 'good' : ''}`, id: 'pass-chance', title: 'Εκτίμηση από τις πρόσφατες απαντήσεις σου σε κάθε ερώτηση' },
        h('div', { class: 'v' }, fmtChance(chance)), h('div', { class: 'l' }, `πιθανότητα επιτυχίας (στόχος ≥ ${fmtChance(RULES.PASS_TARGET)})`)),
      h('div', { class: `kpi ${proof.done === proof.total ? 'good' : ''}`, id: 'proof-count' },
        h('div', { class: 'v' }, `${proof.done}/${proof.total}`), h('div', { class: 'l' }, 'σωστές τις τελευταίες 48 ώρες'))),
    h('ol', { class: 'steps' }, steps.map((s) => h('li', { class: s.done ? 'done' : '', dataset: { step: s.id } },
      h('div', { class: 'step-main' }, h('b', null, `${s.done ? '✓ ' : ''}${s.label}`), h('div', { class: 'small muted' }, s.detail)),
      s.href ? h('a', { class: 'btn btn-sm', href: s.href }, 'Άνοιξε')
        : h('button', { class: `btn btn-sm ${s === next ? 'btn-primary' : ''}`, type: 'button', onClick: s.run }, s.done ? 'Ξανά' : 'Ξεκίνα')))),
  );
}
