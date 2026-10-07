// Exam-day estimates derived from the reduced state (no new events, no stored numbers).
//   questionChance  — chance of answering one question right on exam day
//   passChance      — chance of ≤1 wrong in the real exam: one question from each official group
//   isProven        — «Τελικός έλεγχος»: last real answer correct within 48 h (twice in a row if ever missed)
import { RULES } from './constants.js';
import { dayKey } from './time.js';

const DAY = 24 * 60 * 60 * 1000;
export const P_UNSEEN = 0.4;        // never answered: a guess helped by elimination
export const P_LAST_WRONG = 0.5;    // last answer wrong (the right one was shown afterwards)
const BASE_MISS = 0.6;              // miss rate before any correct answer in a row
const MISS_FACTOR = 0.35;           // every correct answer in a row keeps ~1/3 of the miss rate

// Answers that test recall with shuffled options (self-graded «Από μνήμης» does not count).
function realAnswers(s) {
  return s && s.history ? s.history.filter((h) => h.m !== 'recall') : [];
}

// Correct answers in a row only count when they are at least an hour apart: answering the same
// question five times in five minutes is short-term memory, not learning.
export const STREAK_GAP_MS = 60 * 60 * 1000;

// Streak of spaced correct answers at the end; +1 when the streak spans ≥2 days (spacing),
// −1 when the question was last seen more than 3 days ago (forgetting).
export function questionChance(s, now) {
  const hist = realAnswers(s);
  if (!hist.length) return P_UNSEEN;
  let first = hist.length;
  while (first > 0 && hist[first - 1].ok) first--;
  const streak = hist.slice(first);
  if (!streak.length) return P_LAST_WRONG;
  let k = 0, counted = -Infinity;
  for (const h of streak) if (h.t - counted >= STREAK_GAP_MS) { k++; counted = h.t; }
  const days = new Set(streak.map((h) => dayKey(h.t))).size;
  let eff = k + (days >= 2 ? 1 : 0);
  if (now - hist[hist.length - 1].t > 3 * DAY) eff -= 1;
  return 1 - BASE_MISS * Math.pow(MISS_FACTOR, Math.max(0, eff));
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
export function groupChances(state, questions, now) {
  const booklet = questions.filter((q) => q.tier === 'booklet');
  const groups = new Map();
  for (const q of booklet) {
    if (!Number.isInteger(q.group)) continue;
    if (!groups.has(q.group)) groups.set(q.group, []);
    groups.get(q.group).push(questionChance(state.q[q.id], now));
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0])
    .map(([group, ps]) => ({ group, size: ps.length, p: ps.reduce((a, b) => a + b, 0) / ps.length }));
}

export function passChance(state, questions, now) {
  const groups = groupChances(state, questions, now);
  if (groups.length >= RULES.EXAM_GROUPS) return atMostWrong(groups.map((g) => g.p));
  const booklet = questions.filter((q) => q.tier === 'booklet');
  if (!booklet.length) return 0;
  const mean = booklet.reduce((a, q) => a + questionChance(state.q[q.id], now), 0) / booklet.length;
  return atMostWrong(new Array(RULES.EXAM_QUESTIONS).fill(mean));
}

// Questions sorted by chance, weakest first (only those below `limit`).
export function riskiest(state, questions, now, limit = 0.97) {
  return questions.filter((q) => q.tier === 'booklet')
    .map((q) => ({ id: q.id, p: questionChance(state.q[q.id], now) }))
    .filter((x) => x.p < limit)
    .sort((a, b) => (a.p - b.p) || (a.id - b.id));
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
