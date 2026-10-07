// Exam-day estimates derived from the reduced state (no new events, no stored numbers).
//   questionChance  — chance of answering one question right AT A GIVEN MOMENT (normally the exam)
//   passChance      — chance of ≤1 wrong in the real exam: one question from each official group
//   isProven        — «Τελικός έλεγχος»: last real answer correct within 48 h (twice in a row if ever missed)
//
// Memory model (v1.8, D-041), a simplified FSRS / half-life model, deliberately strict:
//   • stability S (days) = time after which recall drops to 90 %; recall R(t) = 0.9^(t/S)
//   • a right answer grows S only as much as the question had started to fade (answering it again
//     a minute later adds almost nothing); every past miss halves the growth
//   • a miss cuts S to a fifth; until it is answered right again recall is capped at 50 %
//   • trust: each past miss removes 10 % of recall, halved by every right answer ≥1 h apart since
//   • what you would answer = recall × (1 − slip) + (1 − recall) × blind guess (1 / options)
//     slip = 0,5 % misreading/mis-tapping per question, 2 % for look-alike questions
// Checked against the owner's 297 real answers: in every probability range the model predicted
// fewer right answers than actually happened (work/calib.mjs, not deployed).
import { RULES } from './constants.js';

const DAY = 24 * 60 * 60 * 1000;

export const MODEL = Object.freeze({
  S_FIRST_RIGHT: 1.0,     // days of 90 % recall after a first right answer (could be a lucky guess)
  S_FIRST_WRONG: 0.3,     // the right answer was shown after a miss
  S_MIN: 0.3,
  LAPSE_KEEP: 0.2,        // a miss keeps a fifth of the stability
  GROWTH: 9,              // growth scale for a right answer that had started to fade
  GROWTH_DECAY: 0.2,      // strong memories grow more slowly
  LAPSE_DAMP: 1.0,        // each past miss divides the growth by (1 + misses)
  CAP_AFTER_WRONG: 0.5,   // last answer wrong → recall at most 50 %
  LEECH: 0.1,             // trust lost per past miss
  SLIP: 0.005,            // misread / mis-tapped although known
  TWIN_SLIP: 0.02,        // look-alike questions: confusion with the twin
  EXAM_HOUR: 9,           // default exam start when no time is set (settings.examTime)
});

// Correct answers only count as separate evidence when at least an hour apart: answering the same
// question five times in five minutes is short-term memory, not learning.
export const STREAK_GAP_MS = 60 * 60 * 1000;

// Answers that test recall with shuffled options (self-graded «Από μνήμης» does not count).
function realAnswers(s) {
  return s && s.history ? s.history.filter((h) => h.m !== 'recall') : [];
}

const recall = (days, S) => Math.pow(0.9, Math.max(0, days) / S);
const guess = (q) => (q && q.options ? 1 / q.options.length : 1 / 3);

// Replays one question's real answers into { S, last, lapses, spaced, lastOk }.
export function memoryOf(s) {
  const hist = realAnswers(s);
  if (!hist.length) return null;
  const first = hist[0];
  let S = first.ok ? MODEL.S_FIRST_RIGHT : MODEL.S_FIRST_WRONG;
  let lapses = first.ok ? 0 : 1, last = first.t;
  let spaced = first.ok ? 1 : 0, counted = first.ok ? first.t : -Infinity; // right answers ≥1 h apart since the last miss
  for (const h of hist.slice(1)) {
    const r = recall((h.t - last) / DAY, S);
    if (h.ok) {
      S *= 1 + MODEL.GROWTH * (1 - r) * Math.pow(S, -MODEL.GROWTH_DECAY) / (1 + MODEL.LAPSE_DAMP * lapses);
      if (h.t - counted >= STREAK_GAP_MS) { spaced++; counted = h.t; }
    } else {
      lapses++; S = Math.max(MODEL.S_MIN, S * MODEL.LAPSE_KEEP); spaced = 0; counted = -Infinity;
    }
    last = h.t;
  }
  return { S, last, lapses, spaced, lastOk: hist[hist.length - 1].ok };
}

// Chance of answering question q right at time `at` (ms). Unseen → a blind guess.
export function questionChance(s, at, q = null) {
  const g = guess(q);
  const m = memoryOf(s);
  if (!m) return g;
  let r = recall((at - m.last) / DAY, m.S);
  if (!m.lastOk) r = Math.min(r, MODEL.CAP_AFTER_WRONG);
  if (m.lapses) r *= 1 - MODEL.LEECH * m.lapses * Math.pow(0.5, Math.max(0, m.spaced - 1));
  const slip = q && (q.twins || []).length ? MODEL.TWIN_SLIP : MODEL.SLIP;
  return Math.max(0, r) * (1 - slip) + (1 - Math.max(0, r)) * g;
}

// The moment the estimate is for: the exam date at settings.examTime (default 09:00), or now once
// the exam has started; without a valid future date, tomorrow at this time ("if it were tomorrow").
export function examMoment(settings, now = Date.now()) {
  const v = settings && settings.examDate;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, mo, d] = v.split('-').map(Number);
    const tm = settings && typeof settings.examTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.examTime) ? settings.examTime.split(':').map(Number) : [MODEL.EXAM_HOUR, 0];
    const start = new Date(y, mo - 1, d, tm[0], tm[1], 0, 0).getTime();
    const endOfDay = new Date(y, mo - 1, d, 23, 59, 59, 999).getTime();
    if (now <= endOfDay) return Math.max(start, now);
  }
  return now + DAY;
}

// P(at most `maxWrong` wrong) for independent items with success chances ps (Poisson binomial).
export function atMostWrong(ps, maxWrong = RULES.EXAM_MAX_WRONG) {
  let dist = [1]; // dist[w] = P(w wrong so far)
  for (const p of ps) {
    const next = new Array(Math.min(dist.length + 1, maxWrong + 2)).fill(0);
    dist.forEach((v, w) => {
      next[w] += v * p;
      if (w + 1 < next.length) next[w + 1] += v * (1 - p);
    });
    dist = next;
  }
  return dist.slice(0, maxWrong + 1).reduce((a, b) => a + b, 0);
}

// The exam questionnaire takes one random question from each official group; within a group
// every question is equally likely. Without groups (synthetic data) it falls back to 10 draws
// from the whole booklet.
export function groupChances(state, questions, at) {
  const booklet = questions.filter((q) => q.tier === 'booklet');
  const groups = new Map();
  for (const q of booklet) {
    if (!Number.isInteger(q.group)) continue;
    if (!groups.has(q.group)) groups.set(q.group, []);
    groups.get(q.group).push(questionChance(state.q[q.id], at, q));
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0])
    .map(([group, ps]) => ({ group, size: ps.length, p: ps.reduce((a, b) => a + b, 0) / ps.length }));
}

export function passChance(state, questions, at) {
  const groups = groupChances(state, questions, at);
  if (groups.length >= RULES.EXAM_GROUPS) return atMostWrong(groups.map((g) => g.p));
  const booklet = questions.filter((q) => q.tier === 'booklet');
  if (!booklet.length) return 0;
  const mean = booklet.reduce((a, q) => a + questionChance(state.q[q.id], at, q), 0) / booklet.length;
  return atMostWrong(new Array(RULES.EXAM_QUESTIONS).fill(mean));
}

// Lowest single-question chance in the booklet (the "no weak spot" floor).
export function weakestChance(state, questions, at) {
  return questions.filter((q) => q.tier === 'booklet')
    .reduce((m, q) => Math.min(m, questionChance(state.q[q.id], at, q)), 1);
}

// Questions sorted by chance, weakest first (only those below `limit`).
export function riskiest(state, questions, at, limit = RULES.PASS_FLOOR) {
  return questions.filter((q) => q.tier === 'booklet')
    .map((q) => ({ id: q.id, p: questionChance(state.q[q.id], at, q) }))
    .filter((x) => x.p < limit)
    .sort((a, b) => (a.p - b.p) || (a.id - b.id));
}

// Everything the screens show, for one moment (the exam) and for "if it were now".
export function readinessNumbers(state, questions, settings, now = Date.now()) {
  const at = examMoment(settings, now);
  const chance = passChance(state, questions, at);
  const weakest = weakestChance(state, questions, at);
  return { at, chance, weakest, nowChance: passChance(state, questions, now), ready: chance >= RULES.PASS_TARGET && weakest >= RULES.PASS_FLOOR };
}

export function isProven(s, now) {
  const hist = realAnswers(s);
  const last = hist[hist.length - 1];
  if (!last || !last.ok || now - last.t > RULES.PROOF_WINDOW_MS || last.ms > RULES.PROMOTION_TIME_LIMIT_MS) return false;
  if (s.wrong > 0) {
    const prev = hist[hist.length - 2];
    if (!prev || !prev.ok) return false;
  }
  return true;
}

export function proofStatus(state, questions, now) {
  const booklet = questions.filter((q) => q.tier === 'booklet');
  const missing = booklet.filter((q) => !isProven(state.q[q.id], now)).map((q) => q.id);
  return { done: booklet.length - missing.length, total: booklet.length, missing };
}
