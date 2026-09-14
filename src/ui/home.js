import { h } from './dom.js';
import { MODE_LIST, previewCount } from './modes.js';
import { readiness, dueStreak, dueList, inBin } from '../engine/reducer.js';
import { RULES, MODES } from '../engine/constants.js';
import { startSession } from '../engine/session.js';

export function readinessCard(ctx) {
  const st = ctx.progress.state;
  const r = readiness(st, ctx.questions);
  const items = [
    { ok: r.masteryOk, text: `Mastery 100 % (${r.mastery.done}/${r.mastery.total} στο επίπεδο 5 και «σταθερές»)` },
    { ok: r.mocksOk, text: `${r.mocksNeeded} συνεχόμενα ${RULES.EXAM_QUESTIONS}/${RULES.EXAM_QUESTIONS} χρονομετρημένα mock σε ≥${r.mockDaysNeeded} μέρες (τώρα: ${r.consecutivePerfect} συνεχόμενα, ${r.mockDays} μέρες)` },
    { ok: r.gauntletOk, text: `Ένα Gauntlet βιβλίου (${r.mastery.total}) με 0 λάθη` },
    { ok: r.suddenOk, text: `Sudden Death σερί ≥${r.suddenNeeded} (καλύτερο: ${r.suddenBest})` },
  ];
  return h('div', { class: `card readiness ${r.ready ? 'ready' : ''}` },
    h('div', { class: 'row between' }, h('div', null, h('div', { class: 'small muted' }, 'Έτοιμος για εξετάσεις;'), h('div', { class: 'big' }, r.ready ? 'ΝΑΙ' : 'ΟΧΙ ΑΚΟΜΑ')),
      h('a', { class: 'btn btn-sm', href: '#/certification' }, 'Πιστοποίηση')),
    h('ul', null, items.map((i) => h('li', { class: i.ok ? 'done' : '' }, `${i.ok ? '✓' : '✗'} ${i.text}`))),
  );
}

export function renderHome(ctx) {
  const st = ctx.progress.state;
  const r = readiness(st, ctx.questions);
  const now = Date.now();
  const active = ctx.activeQuestions();
  const due = dueList(st, active, now).length;
  const bin = active.filter((q) => inBin(st.q[q.id])).length;
  const streak = dueStreak(st, now);
  const answers = st.counts.answers;

  const modes = MODE_LIST.map((m) => {
    const n = previewCount(ctx, m.id);
    const disabled = n === 0;
    const el = h('button', { class: `mode ${disabled ? 'disabled' : ''}`, type: 'button', dataset: { mode: m.id },
      onClick: () => {
        if (disabled) { ctx.toast(emptyReason(m.id)); return; }
        if (m.setup) ctx.navigate(`#/setup/${m.id}`);
        else { ctx.session = startSession(m.id, { questions: ctx.questions, state: ctx.progress.state, settings: ctx.progress.settings }); ctx.navigate('#/session'); }
      } },
      h('span', { class: 't' }, m.title), h('span', { class: 'd' }, m.desc), h('span', { class: 'n' }, countLabel(m.id, n)));
    return el;
  });

  return h('div', null,
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', null, h('div', { class: 'small muted' }, 'Mastery βιβλίου'), h('div', { class: 'big' }, `${r.mastery.pct.toFixed(1)} %`)),
        h('div', { class: 'small muted' }, `${r.mastery.done}/${r.mastery.total} ερωτήσεις`)),
      h('div', { class: 'mastery-bar' }, h('div', { style: { width: `${r.mastery.pct}%` } })),
      h('div', { class: 'grid', style: { marginTop: '10px' } },
        h('div', { class: 'stat' }, h('div', { class: 'v' }, due), h('div', { class: 'l' }, 'για σήμερα')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, bin), h('div', { class: 'l' }, 'κουτί λαθών')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, `${streak}🔥`), h('div', { class: 'l' }, 'σερί ημερών')),
      ),
      h('p', { class: 'small muted' }, `${answers} απαντήσεις συνολικά · ${active.length} ενεργές ερωτήσεις${ctx.progress.settings.includeArchive ? ' (με αρχείο)' : ''}`),
    ),
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
