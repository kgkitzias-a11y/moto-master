import { h } from './dom.js';
import { MODE_LIST, previewCount } from './modes.js';
import { readiness, dueStreak, dueList, inBin } from '../engine/reducer.js';
import { RULES, MODES } from '../engine/constants.js';
import { startSession } from '../engine/session.js';
import { dayKey } from '../engine/time.js';

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

export function readinessCard(ctx) {
  const st = ctx.progress.state;
  const r = readiness(st, ctx.questions);
  const items = [
    { ok: r.masteryOk, text: `Mastery 100 % (${r.mastery.done}/${r.mastery.total} στο επίπεδο 5 και «σταθερές»)` },
    { ok: r.mocksOk, text: `${r.mocksNeeded} συνεχόμενα ${RULES.EXAM_QUESTIONS}/${RULES.EXAM_QUESTIONS} χρονομετρημένα mock σε ≥${r.mockDaysNeeded} μέρες (τώρα: ${r.consecutivePerfect} συνεχόμενα, ${r.mockDays} μέρες)` },
    { ok: r.gauntletOk, text: `Ένα Gauntlet βιβλίου (${r.mastery.total}) με 0 λάθη` },
    { ok: r.suddenOk, text: `Σερί Sudden Death ≥${r.suddenNeeded} (καλύτερο: ${r.suddenBest})` },
  ];
  return h('div', { class: `card readiness ${r.ready ? 'ready' : ''}` },
    h('div', { class: 'row between' }, h('div', null, h('div', { class: 'small muted' }, 'Έτοιμος για εξετάσεις;'), h('div', { class: 'big' }, r.ready ? 'ΝΑΙ' : 'ΟΧΙ ΑΚΟΜΑ')),
      h('a', { class: 'btn btn-sm', href: '#/certification' }, 'Πιστοποίηση')),
    h('ul', null, items.map((i) => h('li', { class: i.ok ? 'done' : '' }, `${i.ok ? '✓' : '✗'} ${i.text}`))),
  );
}

// Answers recorded today (local day) — drives the daily-goal bar.
export function answersToday(progress, now = Date.now()) {
  const today = dayKey(now);
  let n = 0;
  for (const e of progress.events) if (e.k === 'answer' && dayKey(e.t) === today) n++;
  return n;
}

function examCountdown(settings, now) {
  if (!settings.examDate) return null;
  const d = new Date(settings.examDate + 'T09:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - now) / 86400000);
  return { days, urgent: days <= 7 };
}

function recommend(ctx, due, bin, weakCount) {
  // Single best next action (removes the choice cost that kills habits).
  if (due > 0) return { mode: MODES.due, title: 'Το σημερινό drill', sub: `${due} ερωτήσεις σε περιμένουν — ${bin ? bin + ' από το κουτί λαθών, ' : ''}μία σειρά και τελείωσες.` };
  if (bin > 0) return { mode: MODES.wrong, title: 'Καθάρισε το κουτί λαθών', sub: `${bin} ερωτήσεις που σε έριξαν. Μέχρι να μηδενιστούν.` };
  if (weakCount > 0) return { mode: MODES.tomorrow, title: 'Σφίξε τις αδύναμες', sub: `${weakCount} ερωτήσεις κάτω από επίπεδο ${RULES.WEAK_LEVEL}.` };
  return { mode: MODES.exam, title: 'Mock εξέταση', sub: '10 ερωτήσεις, 10 λεπτά, το πολύ 1 λάθος. Όπως η αληθινή.' };
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
  const ans = answersToday(p, now);
  const goal = s.dailyGoal || 40;
  const goalPct = Math.min(1, ans / goal);
  const cd = examCountdown(s, now);
  const rec = recommend(ctx, due, bin, weakCount);
  const start = (mode) => { ctx.session = startSession(mode, { questions: ctx.questions, state: st, settings: s }); if (ctx.session.isEmpty) { ctx.toast('Τίποτα για αυτή τη λειτουργία τώρα.'); return; } ctx.navigate('#/session'); };

  const hero = h('div', { class: 'card hero' },
    h('div', { class: 'eyebrow' }, cd ? (cd.days > 0 ? `${cd.days} ${cd.days === 1 ? 'μέρα' : 'μέρες'} μέχρι τις εξετάσεις` : cd.days === 0 ? 'ΣΗΜΕΡΑ εξετάσεις' : 'Οι εξετάσεις πέρασαν — όρισε νέα ημερομηνία') : 'Επόμενο βήμα'),
    h('div', { class: 'title' }, rec.title),
    h('div', { class: 'sub' }, rec.sub),
    h('div', { class: 'rings' },
      ring(r.mastery.pct / 100, `${Math.round(r.mastery.pct)}%`, 'MASTERY', r.masteryOk ? 'gold' : ''),
      h('div', { style: { flex: 1 } },
        h('div', { class: 'row between small' }, h('span', null, h('b', { class: 'num' }, `${ans}/${goal}`), ' απαντήσεις σήμερα'), h('span', { class: goalPct >= 1 ? 'ok' : 'muted' }, goalPct >= 1 ? 'στόχος ✓' : `${goal - ans} ακόμα`)),
        h('div', { class: `goalbar ${goalPct >= 1 ? 'done' : ''}` }, h('div', { style: { width: `${goalPct * 100}%` } })),
        h('div', { class: 'kpis', style: { marginTop: '8px' } },
          h('div', { class: `kpi ${streakAtRisk ? 'danger' : ''}` }, h('div', { class: 'v' }, `${streak}🔥`), h('div', { class: 'l' }, streakAtRisk ? 'σερί σε κίνδυνο!' : 'σερί ημερών')),
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, due), h('div', { class: 'l' }, 'για σήμερα')),
          h('div', { class: 'kpi' }, h('div', { class: 'v' }, bin), h('div', { class: 'l' }, 'κουτί λαθών'))))),
    h('button', { class: 'btn btn-primary btn-block btn-hero', type: 'button', id: 'hero-btn', onClick: () => start(rec.mode) }, todayDone && rec.mode !== MODES.due ? 'Συνέχισε ▶' : 'Ξεκίνα τώρα ▶'),
    streakAtRisk ? h('p', { class: 'small bad', style: { marginTop: '8px', textAlign: 'center' } }, `Το σερί ${streak} ημερών χάνεται τα μεσάνυχτα αν δεν ολοκληρώσεις το σημερινό drill.`) : null,
    !s.examDate ? h('p', { class: 'small muted', style: { marginTop: '8px', textAlign: 'center' } }, h('a', { href: '#/settings' }, 'Όρισε ημερομηνία εξετάσεων'), ' για αντίστροφη μέτρηση.') : null,
  );

  const modes = MODE_LIST.map((m) => {
    const n = previewCount(ctx, m.id);
    const disabled = n === 0;
    const hot = m.id === rec.mode;
    return h('button', { class: `mode ${disabled ? 'disabled' : ''} ${hot ? 'hot' : ''}`, type: 'button', dataset: { mode: m.id },
      onClick: () => {
        if (disabled) { ctx.toast(emptyReason(m.id)); return; }
        if (m.setup) ctx.navigate(`#/setup/${m.id}`); else start(m.id);
      } },
      m.id === MODES.wrong && bin ? h('span', { class: 'nb' }, bin) : null,
      m.id === MODES.due && due ? h('span', { class: 'nb' }, due) : null,
      h('span', { class: 't' }, m.title), h('span', { class: 'd' }, m.desc), h('span', { class: 'n' }, countLabel(m.id, n)));
  });

  return h('div', null,
    hero,
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('span', { class: 'small muted' }, 'Mastery βιβλίου'), h('span', { class: 'small muted num' }, `${r.mastery.done}/${r.mastery.total} ερωτήσεις · ${st.counts.answers} απαντήσεις συνολικά`)),
      h('div', { class: 'mastery-bar' }, h('div', { style: { width: `${r.mastery.pct}%` } }))),
    readinessCard(ctx),
    h('h2', null, 'Λειτουργίες'),
    h('div', { class: 'modes' }, modes),
  );
}

function countLabel(mode, n) {
  if (mode === MODES.sudden) return 'χωρίς όριο';
  if (mode === MODES.exam) return `${RULES.EXAM_QUESTIONS} ερωτήσεις`;
  return `${n} ερωτήσεις`;
}
function emptyReason(mode) {
  if (mode === MODES.wrong) return 'Το κουτί λαθών είναι άδειο.';
  if (mode === MODES.tomorrow) return 'Δεν υπάρχουν αδύναμες ερωτήσεις αυτή τη στιγμή.';
  if (mode === MODES.signs) return 'Το βιβλίο δεν έχει ερωτήσεις με εικόνα.';
  if (mode === MODES.trap) return 'Δεν βρέθηκαν όμοια ζευγάρια.';
  if (mode === MODES.due) return 'Τίποτα για σήμερα — όλα στην ώρα τους.';
  return 'Δεν υπάρχουν διαθέσιμες ερωτήσεις.';
}
