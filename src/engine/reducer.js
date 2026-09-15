// Deterministic reducer: (events, questions) → state. Events are sorted by (t, id) so any
// insertion order (union of two devices' logs) yields byte-identical state.
import { RULES } from './constants.js';
import { dayKey, median } from './time.js';

export function normalizeText(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function sortEvents(events) {
  return [...events].sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function emptyQ() {
  return {
    seen: 0, correct: 0, wrong: 0, level: 0,
    lastPromoT: null, promoDays: [], promoCount: 0,
    bin: null,                 // { since, days: [] }
    ms: [], last: [],          // last = last N booleans
    history: [],               // { t, ok, ms, m, cf }
    wrongChoices: {},          // optionIndex → count
    confusedWith: {},          // otherId → count
    lastT: null, lastOk: null,
  };
}

export function emptyState() {
  return {
    q: {}, mocks: [], gauntlet139: [], gauntlet172: [],
    sudden: { best: 0, runs: [] }, dueDays: [], sessions: [],
    ptests: {},        // set → { best, attempts, passed, last }
    hardMocks: [],     // hard simulator runs
    counts: { events: 0, answers: 0 },
    resetAt: null,
  };
}

function buildCorrectIndex(questions) {
  const byText = new Map(); // normalized correct-option text → [qid]
  for (const q of questions) {
    const key = normalizeText(q.options[q.correct]);
    if (!byText.has(key)) byText.set(key, []);
    byText.get(key).push(q.id);
  }
  return byText;
}

export function reduce(events, questions) {
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const correctIdx = buildCorrectIndex(questions);
  const sorted = sortEvents(events);
  const state = emptyState();

  // Latest reset wins: everything at or before it is ignored.
  let resetAt = null;
  for (const e of sorted) if (e.k === 'reset' && (resetAt === null || e.t > resetAt)) resetAt = e.t;
  state.resetAt = resetAt;

  for (const e of sorted) {
    if (resetAt !== null && e.t <= resetAt) continue;
    state.counts.events++;
    if (e.k === 'answer') applyAnswer(state, e, qmap, correctIdx);
    else if (e.k === 'session') applySession(state, e);
  }
  return state;
}

function getQ(state, qid) {
  if (!state.q[qid]) state.q[qid] = emptyQ();
  return state.q[qid];
}

function applyAnswer(state, e, qmap, correctIdx) {
  const q = qmap.get(e.q);
  if (!q) return; // unknown question (removed from dataset) — ignored
  const s = getQ(state, e.q);
  state.counts.answers++;
  const ok = !!e.ok;
  const ms = Number.isFinite(e.ms) ? e.ms : 0;
  s.seen++;
  if (ok) s.correct++; else s.wrong++;
  s.ms.push(ms);
  s.last.push(ok); if (s.last.length > RULES.SOLID_LAST_N) s.last.shift();
  s.history.push({ t: e.t, ok, ms, m: e.m || null, cf: e.cf || null });
  s.lastT = e.t; s.lastOk = ok;

  const countsForMastery = !!e.sh && !e.rc; // shuffled options, real choice (not self-grade)
  const limit = (Number.isFinite(e.tl) && e.tl > 0 && e.tl < RULES.PROMOTION_TIME_LIMIT_MS) ? e.tl : RULES.PROMOTION_TIME_LIMIT_MS;
  const inTime = ms <= limit;
  const day = dayKey(e.t);

  if (ok) {
    if (countsForMastery && inTime && s.level < RULES.MAX_LEVEL) {
      const gapOk = s.lastPromoT === null || (e.t - s.lastPromoT) >= RULES.PROMOTION_GAP_MS;
      if (gapOk) {
        const days = new Set(s.promoDays); days.add(day);
        const wouldBeMax = s.level + 1 === RULES.MAX_LEVEL;
        if (!wouldBeMax || days.size >= RULES.LEVEL5_MIN_DAYS) {
          s.level++; s.lastPromoT = e.t; s.promoCount++;
          if (!s.promoDays.includes(day)) s.promoDays.push(day);
        }
      }
    }
    if (s.bin && countsForMastery) {
      if (!s.bin.days.includes(day)) s.bin.days.push(day);
      if (s.bin.days.length >= RULES.BIN_EXIT_DAYS) s.bin = null;
    }
  } else {
    const toZero = !!e.hd || e.cf === 'sure';
    s.level = toZero ? 0 : Math.max(0, s.level - RULES.DEMOTION_STEP);
    if (toZero) { s.lastPromoT = null; s.promoDays = []; }
    s.bin = { since: e.t, days: [] }; // (re)enter the bin; progress towards exit restarts
    if (Number.isInteger(e.ch) && e.ch >= 0) {
      s.wrongChoices[e.ch] = (s.wrongChoices[e.ch] || 0) + 1;
      // Confusion: chosen text is the correct option of another question…
      const key = normalizeText(q.options[e.ch]);
      for (const other of correctIdx.get(key) || []) {
        if (other !== q.id) s.confusedWith[other] = (s.confusedWith[other] || 0) + 1;
      }
      // …or the question sits in a similarity cluster.
      for (const other of q.similar || []) {
        if (other !== q.id) s.confusedWith[other] = (s.confusedWith[other] || 0) + 1;
      }
    }
  }
}

function applySession(state, e) {
  const rec = {
    t: e.t, sid: e.s, mode: e.m, total: e.n || 0, correct: e.c || 0,
    wrongs: Array.isArray(e.w) ? [...e.w] : [], durationMs: e.d || 0, x: e.x || {},
  };
  state.sessions.push(rec);
  if (e.m === 'exam') {
    state.mocks.push({ ...rec, passed: !!(e.x && e.x.passed), timed: !!(e.x && e.x.timed) });
  } else if (e.m === 'gauntlet139') {
    state.gauntlet139.push(rec);
  } else if (e.m === 'gauntlet172') {
    state.gauntlet172.push(rec);
  } else if (e.m === 'sudden') {
    const run = (e.x && Number.isFinite(e.x.run)) ? e.x.run : rec.correct;
    state.sudden.runs.push({ t: e.t, run });
    if (run > state.sudden.best) state.sudden.best = run;
  } else if (e.m === 'hardexam') {
    state.hardMocks.push({ ...rec, passed: !!(e.x && e.x.passed), timed: !!(e.x && e.x.timed) });
  } else if (e.m === 'ptest') {
    const set = e.x && Number.isInteger(e.x.set) ? e.x.set : 0;
    const p = state.ptests[set] || (state.ptests[set] = { best: 0, attempts: 0, passed: false, last: null, total: 0 });
    p.attempts++; p.last = e.t; p.total = Math.max(p.total, rec.total);
    if (rec.correct > p.best) p.best = rec.correct;
    if (e.x && e.x.passed) p.passed = true;
  }
  // A day counts for the streak when the daily drill was completed OR the answer goal was reached.
  if ((e.m === 'due' && e.x && e.x.completed) || (e.x && e.x.goalReached)) {
    const d = dayKey(e.t);
    if (!state.dueDays.includes(d)) state.dueDays.push(d);
  }
}

// ---------- derived views ----------

export function isSolid(s) {
  if (!s || s.seen < RULES.SOLID_MIN_SEEN) return false;
  if (s.correct / s.seen < RULES.SOLID_MIN_ACCURACY) return false;
  if (s.last.length < RULES.SOLID_LAST_N || !s.last.every(Boolean)) return false;
  const med = median(s.ms);
  return med !== null && med <= RULES.SOLID_MEDIAN_MS;
}

export function isMastered(s) {
  return !!s && s.level >= RULES.MAX_LEVEL && isSolid(s);
}

export function mastery(state, questions) {
  const booklet = questions.filter((q) => q.tier === 'booklet');
  const done = booklet.filter((q) => isMastered(state.q[q.id])).length;
  return { done, total: booklet.length, pct: booklet.length ? (done / booklet.length) * 100 : 0 };
}

export function dueForPromotion(s, now) {
  if (!s || s.seen === 0) return true;
  if (s.level >= RULES.MAX_LEVEL) return false;
  return s.lastPromoT === null || (now - s.lastPromoT) >= RULES.PROMOTION_GAP_MS;
}

export function inBin(s) { return !!(s && s.bin); }

export function binNeedsToday(s, now) {
  return inBin(s) && !s.bin.days.includes(dayKey(now));
}

export function isWeak(s) {
  return !s || s.seen === 0 || s.level < RULES.WEAK_LEVEL || inBin(s) || (s.correct / s.seen < 0.8);
}

export function dueList(state, questions, now) {
  return questions.filter((q) => {
    const s = state.q[q.id];
    return !s || s.seen === 0 || dueForPromotion(s, now) || binNeedsToday(s, now);
  }).map((q) => q.id);
}

export function dueStreak(state, now) {
  const days = new Set(state.dueDays);
  let streak = 0;
  const d = new Date(now); d.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1); // today not done yet → count from yesterday
  while (days.has(dayKey(d.getTime()))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

export function readiness(state, questions) {
  const m = mastery(state, questions);
  const bookletCount = m.total;
  const timedMocks = state.mocks.filter((x) => x.timed && x.total === RULES.EXAM_QUESTIONS);
  const lastN = timedMocks.slice(-RULES.READY_MOCKS);
  const perfect = lastN.length === RULES.READY_MOCKS && lastN.every((x) => x.correct === x.total);
  const mockDays = new Set(lastN.map((x) => dayKey(x.t))).size;
  const mocksOk = perfect && mockDays >= RULES.READY_MOCK_DAYS;
  let consecutive = 0;
  for (let i = timedMocks.length - 1; i >= 0; i--) { if (timedMocks[i].correct === timedMocks[i].total) consecutive++; else break; }
  const gauntletOk = state.gauntlet139.some((g) => g.total === bookletCount && g.wrongs.length === 0 && g.x && g.x.completed);
  const suddenOk = state.sudden.best >= RULES.READY_SUDDEN_DEATH;
  const masteryOk = m.total > 0 && m.done === m.total;
  const hardPerfect = state.hardMocks.filter((x) => x.timed && x.total === RULES.EXAM_QUESTIONS && x.correct === x.total).length;
  const hardOk = hardPerfect >= RULES.READY_HARD_EXAMS;
  return {
    ready: masteryOk && mocksOk && gauntletOk && suddenOk && hardOk,
    mastery: m, masteryOk, hardOk, hardPerfect, hardNeeded: RULES.READY_HARD_EXAMS,
    mocksOk, consecutivePerfect: consecutive, mockDays, mocksNeeded: RULES.READY_MOCKS, mockDaysNeeded: RULES.READY_MOCK_DAYS,
    gauntletOk, suddenOk, suddenBest: state.sudden.best, suddenNeeded: RULES.READY_SUDDEN_DEATH,
  };
}

export function categoryStats(state, questions) {
  const cats = {};
  for (const q of questions) {
    const c = cats[q.category] || (cats[q.category] = { category: q.category, total: 0, seen: 0, correct: 0, answers: 0, mastered: 0, weak: 0 });
    c.total++;
    const s = state.q[q.id];
    if (s && s.seen) { c.seen++; c.correct += s.correct; c.answers += s.seen; }
    if (isMastered(s)) c.mastered++;
    if (isWeak(s)) c.weak++;
  }
  return Object.values(cats).sort((a, b) => a.category.localeCompare(b.category, 'el'));
}

export function weakList(state, questions) {
  return questions.filter((q) => { const s = state.q[q.id]; return s && s.seen > 0 && isWeak(s); })
    .map((q) => ({ id: q.id, s: state.q[q.id], acc: state.q[q.id].correct / state.q[q.id].seen }))
    .sort((a, b) => (a.acc - b.acc) || (a.s.level - b.s.level));
}

// Confusion summary for a question: [{ id, count }] sorted desc.
export function confusions(s) {
  if (!s) return [];
  return Object.entries(s.confusedWith).map(([id, count]) => ({ id: Number(id), count })).sort((a, b) => b.count - a.count);
}
