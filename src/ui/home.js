import { h } from './dom.js';
import { SECTIONS, previewCount } from './modes.js';
import { practiceSets } from '../engine/selection.js';
import { readiness, dueStreak, dueList, inBin, isSolid } from '../engine/reducer.js';
import { RULES, MODES } from '../engine/constants.js';
import { startSession } from '../engine/session.js';
import { dayKey } from '../engine/time.js';
import { planControls } from './planner.js';
export { answersToday } from '../engine/planner.js';

export function ring(pct, label, sub, cls = '') {
  const r = 38, c = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 92 92');
  const mk = (k) => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); e.setAttribute('cx', 46); e.setAttribute('cy', 46); e.setAttribute('r', r); e.setAttribute('class', k); return e; };
  const track = mk('track'), bar = mk('bar');
  bar.setAttribute('stroke-dasharray', c); bar.setAttribute('stroke-dashoffset', c);
  svg.append(track, bar);
  const el = h('div', { class: `ring ${cls}` }, svg, h('div', { class: 'lbl' }, label, h('small', null, sub)));
  requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, Math.min(1, pct))))));
  return el;
}

// Progress in layers: what you have done today → seen/correct → level ladder → the strict «Εμπέδωση».
export function progressCard(ctx) {
  const st = ctx.progress.state;
  const booklet = ctx.questions.filter((q) => q.tier === 'booklet');
  const r = readiness(st, ctx.questions);
  let seen = 0, correct = 0, answers = 0, solid = 0;
  const levels = [0, 0, 0, 0, 0, 0];
  for (const q of booklet) {
    const x = st.q[q.id];
    if (x && x.seen) { seen++; correct += x.correct; answers += x.seen; }
    levels[x ? x.level : 0]++;
    if (isSolid(x)) solid++;
  }
  const acc = answers ? Math.round(correct / answers * 100) : null;
  const seenPct = seen / booklet.length * 100;
  const above0 = booklet.length - levels[0];
  const ladder = h('div', { class: 'ladder' }, levels.map((n, l) => h('div', { class: `lvl l${l}`, style: { flex: `${Math.max(n, 0.0001)} 0 0` }, title: `Επίπεδο ${l}: ${n}` })));
  return h('div', { class: 'card' },
    h('div', { class: 'grid' },
      h('div', { class: 'stat' }, h('div', { class: 'v ok' }, `${correct}`), h('div', { class: 'l' }, `σωστές από ${answers}${acc !== null ? ` (${acc} %)` : ''}`)),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, `${seen}/${booklet.length}`), h('div', { class: 'l' }, 'ερωτήσεις που είδες')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, `${above0}`), h('div', { class: 'l' }, 'ανέβηκαν επίπεδο'))),
    h('div', { class: 'row between', style: { marginTop: '10px' } }, h('span', { class: 'small muted' }, 'Κάλυψη βιβλίου'), h('span', { class: 'small muted num' }, `${Math.round(seenPct)} %`)),
    h('div', { class: 'mastery-bar' }, h('div', { style: { width: `${seenPct}%` } })),
    h('div', { class: 'row between', style: { marginTop: '10px' } }, h('span', { class: 'small muted' }, 'Επίπεδα (0 → 5)'), h('span', { class: 'small muted num' }, levels.map((n, l) => `L${l}:${n}`).join(' · '))),
    ladder,
    h('div', { class: 'row between', style: { marginTop: '10px' } }, h('span', { class: 'small muted' }, 'Εμπέδωση (επίπεδο 5 + σίγουρη)'), h('span', { class: 'small muted num' }, `${r.mastery.done}/${booklet.length} · σίγουρες ${solid}`)),
    h('div', { class: 'mastery-bar' }, h('div', { style: { width: `${r.mastery.pct}%` } })),
    h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Η εμπέδωση ανεβαίνει αργά επίτηδες: κάθε επίπεδο θέλει σωστή απάντηση ≥8 ώρες μετά το προηγούμενο, και το 5 θέλει τουλάχιστον 3 διαφορετικές μέρες.'),
  );
}

export function readinessCard(ctx) {
  const st = ctx.progress.state;
  const r = readiness(st, ctx.questions);
  const items = [
    { ok: r.masteryOk, text: `Εμπέδωση 100 % (${r.mastery.done}/${r.mastery.total} στο επίπεδο 5 και σίγουρες)` },
    { ok: r.mocksOk, text: `${r.mocksNeeded} συνεχόμενες χρονομετρημένες προσομοιώσεις ${RULES.EXAM_QUESTIONS}/${RULES.EXAM_QUESTIONS} σε ≥${r.mockDaysNeeded} μέρες (τώρα: ${r.consecutivePerfect} συνεχόμενες, ${r.mockDays} μέρες)` },
    { ok: r.gauntletOk, text: `Μία φορά «Όλο το βιβλίο» (${r.mastery.total}) με 0 λάθη` },
    { ok: r.suddenOk, text: `Σερί ≥${r.suddenNeeded} στο «Μέχρι το πρώτο λάθος» (καλύτερο: ${r.suddenBest})` },
    { ok: r.hardOk, text: `${r.hardNeeded} τέλειες «Σκληρές προσομοιώσεις» (τώρα: ${r.hardPerfect})` },
  ];
  return h('div', { class: `card readiness ${r.ready ? 'ready' : ''}` },
    h('div', { class: 'row between' }, h('div', null, h('div', { class: 'small muted' }, 'Έτοιμος για εξετάσεις;'), h('div', { class: 'big' }, r.ready ? 'ΝΑΙ' : 'ΟΧΙ ΑΚΟΜΑ')),
      h('a', { class: 'btn btn-sm', href: '#/certification' }, 'Ετοιμότητα')),
    h('ul', null, items.map((i) => h('li', { class: i.ok ? 'done' : '' }, `${i.ok ? '✓' : '✗'} ${i.text}`))),
  );
}

function recommend(ctx, due, bin, weakCount, remainingToGoal, todayDone) {
  // Single best next action (removes the choice cost that kills habits).
  if (remainingToGoal === 0) return { mode: bin ? MODES.wrong : MODES.exam, params: {}, title: 'Ο σημερινός στόχος ολοκληρώθηκε', sub: bin ? 'Συνέχισε με τα λάθη σου.' : 'Συνέχισε με μια προσομοίωση εξετάσεων.', label: 'Ξεκίνα τώρα ▶' };
  if (remainingToGoal > 0 && (todayDone || due === 0)) return { mode: MODES.goal, params: { remaining: remainingToGoal }, title: 'Συνέχισε προς τον στόχο', sub: `${remainingToGoal} ερωτήσεις ακόμα για το σημερινό ${ctx.progress.settings.dailyGoal || 40}.`, label: `Συνέχισε (${remainingToGoal} ακόμα) ▶` };
  if (due > 0 && due <= Math.max(remainingToGoal, 5)) return { mode: MODES.due, params: {}, title: 'Η σημερινή εξάσκηση', sub: `Σε περιμένουν ${due} ερωτήσεις — ${bin ? bin + ' από τα λάθη σου, ' : ''}ένας γύρος και τελείωσες.`, label: 'Ξεκίνα τώρα ▶' };
  if (due > 0) return { mode: MODES.goal, params: { remaining: remainingToGoal }, title: 'Η σημερινή εξάσκηση', sub: `${due} ερωτήσεις είναι για επανάληψη — ${bin ? bin + ' από τα λάθη σου. ' : ''}Παίρνεις τις ${remainingToGoal} επόμενες προς τον στόχο.`, label: remainingToGoal < (ctx.progress.settings.dailyGoal || 40) ? `Συνέχισε (${remainingToGoal} ακόμα) ▶` : 'Ξεκίνα τώρα ▶' };
  if (bin > 0) return { mode: MODES.wrong, params: {}, title: 'Διόρθωσε τα λάθη σου', sub: `${bin} ερωτήσεις που σε έριξαν. Μέχρι να μη μείνει καμία.`, label: 'Ξεκίνα τώρα ▶' };
  if (weakCount > 0) return { mode: MODES.tomorrow, params: {}, title: 'Δούλεψε τις αδύναμες', sub: `${weakCount} ερωτήσεις κάτω από επίπεδο ${RULES.WEAK_LEVEL}.`, label: 'Ξεκίνα τώρα ▶' };
  return { mode: MODES.exam, params: {}, title: 'Προσομοίωση εξετάσεων', sub: '10 ερωτήσεις, 10 λεπτά, το πολύ 1 λάθος. Όπως στις πραγματικές εξετάσεις.', label: 'Ξεκίνα τώρα ▶' };
}

export function renderHome(ctx) {
  const p = ctx.progress; const st = p.state; const s = p.settings;
  const r = readiness(st, ctx.questions);
  const now = Date.now();
  const active = ctx.activeQuestions();
  const due = dueList(st, active, now).length;
  const bin = active.filter((q) => inBin(st.q[q.id])).length;
  const weakCount = active.filter((q) => { const x = st.q[q.id]; return x && x.seen && x.level < RULES.WEAK_LEVEL; }).length;
  const streak = dueStreak(st, now);
  const todayDone = st.dueDays.includes(dayKey(now));
  const hour = new Date(now).getHours();
  const streakAtRisk = !todayDone && streak > 0 && hour >= 18; // loss aversion, only when it is real
  const plan = p.plan(now);
  const ans = plan.automatic ? plan.done : plan.answerCount;
  const goal = plan.target;
  const goalPct = goal ? Math.min(1, ans / goal) : 1;
  const cd = plan.days === null ? null : { days: plan.days };
  const remainingToGoal = plan.remaining;
  const rec = plan.automatic && remainingToGoal > 0
    ? { mode: MODES.goal, params: { plannedIds: plan.queue }, title: 'Το σημερινό σου πλάνο',
      sub: `${plan.newRemaining} νέες + ${plan.reviewTarget - plan.reviewDone} για επανάληψη απομένουν.`,
      label: `Συνέχισε (${remainingToGoal} ακόμα) ▶` }
    : plan.automatic
      ? { mode: bin ? MODES.wrong : MODES.exam, params: {}, title: 'Ο σημερινός στόχος ολοκληρώθηκε',
        sub: bin ? `${bin} ερωτήσεις παραμένουν στα λάθη σου. Κάνε έναν επιπλέον γύρο.` : 'Συνέχισε με μια προσομοίωση για να ελέγξεις την ετοιμότητά σου.',
        label: bin ? 'Επανάληψη λαθών ▶' : 'Προσομοίωση εξετάσεων ▶' }
      : recommend(ctx, due, bin, weakCount, remainingToGoal, todayDone);
  const start = (mode, params = {}) => { ctx.session = startSession(mode, { questions: ctx.questions, state: st, settings: s, params }); if (ctx.session.isEmpty) { ctx.toast('Δεν υπάρχουν ερωτήσεις για αυτό το τεστ τώρα.'); return; } ctx.navigate('#/session'); };

  const hero = h('div', { class: 'card hero' },
    h('div', { class: 'eyebrow' }, cd ? (cd.days > 0 ? `${cd.days} ${cd.days === 1 ? 'μέρα' : 'μέρες'} μέχρι τις εξετάσεις` : cd.days === 0 ? 'ΣΗΜΕΡΑ εξετάσεις' : 'Οι εξετάσεις πέρασαν — όρισε νέα ημερομηνία') : 'Επόμενο βήμα'),
    h('div', { class: 'title' }, rec.title),
    h('div', { class: 'sub' }, rec.sub),
    h('div', { class: 'rings' },
      ring(r.mastery.pct / 100, `${Math.round(r.mastery.pct)}%`, 'ΕΜΠΕΔΩΣΗ', r.masteryOk ? 'gold' : ''),
      h('div', { style: { flex: 1 } },
        h('div', { class: 'row between small' }, h('span', null, h('b', { class: 'num' }, `${ans}/${goal}`), plan.automatic ? ' ερωτήσεις του πλάνου' : ' απαντήσεις σήμερα'), h('span', { class: goalPct >= 1 ? 'ok' : 'muted' }, goalPct >= 1 ? 'στόχος ✓' : `${remainingToGoal} ακόμα`)),
        h('div', { class: `goalbar ${goalPct >= 1 ? 'done' : ''}` }, h('div', { style: { width: `${goalPct * 100}%` } })),
        plan.automatic ? h('p', { class: 'small muted' }, `Νέες ${plan.newDone}/${plan.newTarget} · Επανάληψη ${plan.reviewDone}/${plan.reviewTarget} · ${plan.answerCount} απαντήσεις σήμερα`) : null,
        h('div', { class: 'kpis', style: { marginTop: '8px' } },
          h('div', { class: `kpi ${streakAtRisk ? 'danger' : ''}` }, h('div', { class: 'v' }, `${streak}🔥`), h('div', { class: 'l' }, streakAtRisk ? 'κινδυνεύει το σερί!' : 'μέρες σερί')),
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, plan.automatic ? remainingToGoal : due), h('div', { class: 'l' }, 'για σήμερα')),
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, bin), h('div', { class: 'l' }, 'τα λάθη σου'))))),
    h('button', { class: 'btn btn-primary btn-block btn-hero', type: 'button', id: 'hero-btn', onClick: () => start(rec.mode, rec.params) }, rec.label),
    streakAtRisk ? h('p', { class: 'small bad', style: { marginTop: '8px', textAlign: 'center' } }, `Αν δεν πιάσεις τον σημερινό στόχο μέχρι τα μεσάνυχτα, χάνεις τις ${streak} μέρες σερί.`) : null,
    !s.examDate ? h('p', { class: 'small muted', style: { marginTop: '8px', textAlign: 'center' } }, h('a', { href: '#/settings' }, 'Όρισε ημερομηνία εξετάσεων'), ' για αντίστροφη μέτρηση.') : null,
  );

  const modeCard = (m) => {
    const n = previewCount(ctx, m.id);
    const disabled = n === 0;
    const hot = m.id === rec.mode;
    return h('button', { class: `mode ${disabled ? 'disabled' : ''} ${hot ? 'hot' : ''} ${m.hard ? 'hardm' : ''}`, type: 'button', dataset: { mode: m.id },
      onClick: () => {
        if (disabled) { ctx.toast(emptyReason(m.id)); return; }
        if (m.setup) ctx.navigate(`#/setup/${m.id}`); else start(m.id);
      } },
      m.id === MODES.wrong && bin ? h('span', { class: 'nb' }, bin) : null,
      m.id === MODES.due && due ? h('span', { class: 'nb' }, due) : null,
      m.hard ? h('span', { class: 'hardtag' }, '🔥') : null,
      h('span', { class: 't' }, m.title), h('span', { class: 'd' }, m.desc), h('span', { class: 'n' }, countLabel(m.id, n)));
  };

  // Numbered practice tests (fixed sets, same on every device); pass = 100 %.
  const { sets, archive } = practiceSets(ctx.questions);
  const ptCard = (idx, ids, label) => {
    const p = st.ptests[idx === 'archive' ? -1 : idx];
    const passed = !!(p && p.passed);
    const best = p ? `${p.best}/${ids.length}` : '—';
    return h('button', { class: `ptest ${passed ? 'passed' : ''}`, type: 'button', dataset: { set: idx }, onClick: () => start(MODES.ptest, { set: idx }) },
      h('span', { class: 't' }, label), h('span', { class: 'b' }, passed ? '✓ 100 %' : `καλύτερο ${best}`), h('span', { class: 'c' }, `${ids.length} ερ.`));
  };
  const ptests = h('div', { class: 'ptests' }, sets.map((ids, i) => ptCard(i, ids, `Τεστ ${i + 1}`)), s.includeArchive && archive.length ? ptCard('archive', archive, 'Εκτός ύλης') : null);
  const passedCount = sets.filter((_, i) => st.ptests[i] && st.ptests[i].passed).length;

  const sections = SECTIONS.map((sec) => h('div', null, h('h2', null, sec.title), h('div', { class: 'modes' }, sec.modes.map(modeCard))));

  return h('div', null,
    hero,
    planControls(ctx),
    progressCard(ctx),
    readinessCard(ctx),
    h('div', { class: 'row between', style: { marginTop: '18px' } }, h('h2', { style: { margin: 0 } }, 'Τεστ εξάσκησης'), h('span', { class: 'small muted' }, `${passedCount}/${sets.length} με 100 %`)),
    h('p', { class: 'small muted' }, `Όλο το βιβλίο σε ${sets.length} σταθερά τεστ των ${RULES.PTEST_SIZE}. Ένα τεστ «περνάει» μόνο αν απαντήσεις σωστά σε όλες τις ερωτήσεις του (100 %).`),
    ptests,
    sections,
    h('p', { class: 'small muted', style: { marginTop: '14px' } }, h('a', { href: '#/sheet' }, '📄 Σκονάκι'), ' — όλες οι ερωτήσεις με τη σωστή απάντηση, ανά κατηγορία.'),
  );
}

function countLabel(mode, n) {
  if (mode === MODES.sudden) return 'χωρίς όριο';
  if (mode === MODES.exam) return `${RULES.EXAM_QUESTIONS} ερωτήσεις`;
  return `${n} ερωτήσεις`;
}
function emptyReason(mode) {
  if (mode === MODES.wrong) return 'Δεν έχεις λάθη αυτή τη στιγμή.';
  if (mode === MODES.hardest) return 'Απάντησε πρώτα μερικές ερωτήσεις για να φανεί ποιες σε δυσκολεύουν.';
  if (mode === MODES.numbers) return 'Δεν βρέθηκαν ερωτήσεις με αριθμούς.';
  if (mode === MODES.tomorrow) return 'Δεν υπάρχουν αδύναμες ερωτήσεις αυτή τη στιγμή.';
  if (mode === MODES.signs) return 'Το βιβλίο δεν έχει ερωτήσεις με εικόνα.';
  if (mode === MODES.trap) return 'Δεν βρέθηκαν ζευγάρια όμοιων ερωτήσεων.';
  if (mode === MODES.due) return 'Τίποτα για σήμερα — όλα στην ώρα τους.';
  return 'Δεν υπάρχουν διαθέσιμες ερωτήσεις.';
}
