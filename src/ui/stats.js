import { h, fmtMs, fmtClock, fmtDate, sparkline } from './dom.js';
import { readiness, categoryStats, weakList, dueStreak, isSolid, inBin } from '../engine/reducer.js';
import { median } from '../engine/time.js';
import { modeMeta } from './modes.js';
import { readinessCard } from './home.js';

export function levelDots(level) {
  return h('span', { class: 'level', title: `επίπεδο ${level}/5` }, [0, 1, 2, 3, 4].map((i) => h('i', { class: i < level ? 'on' : '' })));
}

export function renderStats(ctx) {
  const st = ctx.progress.state;
  const qs = ctx.activeQuestions();
  const r = readiness(st, ctx.questions);
  const cats = categoryStats(st, qs);
  const weak = weakList(st, qs).slice(0, 30);
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  const allMs = qs.flatMap((q) => (st.q[q.id] ? st.q[q.id].ms : []));
  const seen = qs.filter((q) => st.q[q.id] && st.q[q.id].seen).length;
  const solid = qs.filter((q) => isSolid(st.q[q.id])).length;
  const bin = qs.filter((q) => inBin(st.q[q.id])).length;
  const levels = [0, 1, 2, 3, 4, 5].map((l) => qs.filter((q) => (st.q[q.id] ? st.q[q.id].level : 0) === l).length);
  const mocks = [...st.mocks].reverse().slice(0, 20);
  const sessions = [...st.sessions].reverse().slice(0, 30);
  const suddenRuns = [...st.sudden.runs].sort((a, b) => (b.run - a.run) || (b.t - a.t)).slice(0, 5);
  const confusionPairs = qs.flatMap((q) => { const s = st.q[q.id]; return s ? Object.entries(s.confusedWith).map(([o, n]) => ({ a: q.id, b: Number(o), n })) : []; })
    .sort((x, y) => y.n - x.n).slice(0, 15);
  const totalCorrect = qs.reduce((a, q) => a + (st.q[q.id] ? st.q[q.id].correct : 0), 0);
  const totalAns = qs.reduce((a, q) => a + (st.q[q.id] ? st.q[q.id].seen : 0), 0);

  return h('div', null,
    h('h1', null, 'Στατιστικά'),
    h('div', { class: 'card' },
      h('div', { class: 'grid' },
        h('div', { class: 'stat' }, h('div', { class: 'v' }, `${r.mastery.pct.toFixed(1)} %`), h('div', { class: 'l' }, 'mastery')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, `${seen}/${qs.length}`), h('div', { class: 'l' }, 'ερωτήσεις που είδες')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, totalAns ? `${Math.round(totalCorrect / totalAns * 100)} %` : '—'), h('div', { class: 'l' }, 'ακρίβεια')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, solid), h('div', { class: 'l' }, '«σταθερές»')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, bin), h('div', { class: 'l' }, 'κουτί λαθών')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtMs(median(allMs))), h('div', { class: 'l' }, 'διάμεσος χρόνος')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, `${dueStreak(st, Date.now())}🔥`), h('div', { class: 'l' }, 'σερί ημερών')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, st.sudden.best), h('div', { class: 'l' }, 'Sudden Death best')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, r.consecutivePerfect), h('div', { class: 'l' }, 'συνεχόμενα 10/10')),
      ),
      h('h3', null, 'Κατανομή επιπέδων'),
      h('div', { class: 'row' }, levels.map((n, l) => h('span', { class: 'tag' }, `L${l}: ${n}`))),
    ),
    readinessCard(ctx),
    h('h2', null, 'Ανά κατηγορία'),
    h('div', { class: 'card tight' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Κατηγορία'), h('th', null, 'Ερ.'), h('th', null, 'Ακρίβεια'), h('th', null, 'Mastered'), h('th', null, 'Αδύναμες'))),
      h('tbody', null, cats.map((c) => h('tr', null, h('td', null, c.category), h('td', null, c.total), h('td', null, c.answers ? `${Math.round(c.correct / c.answers * 100)} %` : '—'), h('td', null, c.mastered), h('td', { class: c.weak ? 'warn' : '' }, c.weak)))))),
    h('h2', null, 'Αδύναμες ερωτήσεις'),
    weak.length ? h('div', { class: 'list' }, weak.map((w) => { const q = byId.get(w.id); return h('a', { class: 'qrow', href: `#/q/${w.id}` }, h('span', { class: 'id' }, `#${w.id}`), h('span', { class: 'txt' }, q.text), h('span', { class: 'small muted' }, `${Math.round(w.acc * 100)} %`), levelDots(w.s.level)); })) : h('p', { class: 'muted' }, 'Καμία (ακόμα).'),
    h('h2', null, 'Συγχύσεις («μπερδεύεται με»)'),
    confusionPairs.length ? h('div', { class: 'list' }, confusionPairs.map((p) => { const qa = byId.get(p.a), qb = byId.get(p.b); return qa && qb ? h('a', { class: 'qrow', href: `#/q/${p.a}` }, h('span', { class: 'id' }, `#${p.a}`), h('span', { class: 'txt' }, `${qa.text.slice(0, 60)}… ↔ #${p.b}`), h('span', { class: 'small muted' }, `×${p.n}`)) : null; })) : h('p', { class: 'muted' }, 'Καμία καταγεγραμμένη σύγχυση.'),
    h('h2', null, 'Sudden Death — καλύτερα σερί'),
    suddenRuns.length ? h('div', { class: 'card tight' }, h('table', null, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Σερί'), h('th', null, 'Πότε'))),
      h('tbody', null, suddenRuns.map((r, i) => h('tr', null, h('td', null, i + 1), h('td', { class: r.run >= 60 ? 'ok' : '' }, r.run), h('td', null, fmtDate(r.t))))))) : h('p', { class: 'muted' }, 'Δεν έχεις παίξει Sudden Death ακόμα.'),
    h('h2', null, 'Ιστορικό mock εξετάσεων'),
    mocks.length ? h('div', { class: 'card tight' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Πότε'), h('th', null, 'Σκορ'), h('th', null, 'Λάθη'), h('th', null, 'Χρόνος'), h('th', null, ''))),
      h('tbody', null, mocks.map((m) => h('tr', null, h('td', null, fmtDate(m.t)), h('td', null, `${m.correct}/${m.total}`), h('td', null, m.wrongs.map((id) => h('a', { href: `#/q/${id}` }, `#${id} `))), h('td', null, fmtClock(m.durationMs)), h('td', { class: m.passed ? 'ok' : 'bad' }, m.passed ? 'ΠΕΡΑΣΕΣ' : 'ΚΟΠΗΚΕΣ')))))) : h('p', { class: 'muted' }, 'Δεν έχεις κάνει mock ακόμα.'),
    h('h2', null, 'Ιστορικό συνεδριών'),
    sessions.length ? h('div', { class: 'card tight' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Πότε'), h('th', null, 'Λειτουργία'), h('th', null, 'Σκορ'), h('th', null, 'Χρόνος'))),
      h('tbody', null, sessions.map((s) => { const m = modeMeta(s.mode); return h('tr', null, h('td', null, fmtDate(s.t)), h('td', null, m ? m.title : s.mode), h('td', null, `${s.correct}/${s.total}`), h('td', null, fmtClock(s.durationMs))); })))) : h('p', { class: 'muted' }, 'Καμία συνεδρία ακόμα.'),
  );
}

export { sparkline };
