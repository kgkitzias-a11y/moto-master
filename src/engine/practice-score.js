// Transparent practice index, not a probability or DMV Genie's unpublished formula.
// Derived only: no migrations, stored scores, or changes to historical events.
import { MODES, RULES } from './constants.js';

export const PRACTICE_SCORE = Object.freeze({ windowDays: 7, examLimit: 20, examEvidence: 5, answerGapMs: 3600000 });
const DAY = 86400000;

export function examPerformance(state, now = Date.now()) {
  const attempts = (state.sessions || []).filter((s) => s.mode === MODES.exam
    && s.x?.timed && s.total === RULES.EXAM_QUESTIONS
    && (s.x?.endReason === 'done' || s.x?.endReason === 'time')
    && s.t <= now && now - s.t <= PRACTICE_SCORE.windowDays * DAY)
    .sort((a, b) => a.t - b.t || String(a.id || '').localeCompare(String(b.id || '')))
    .slice(-PRACTICE_SCORE.examLimit);
  const passed = attempts.filter((s) => s.x.endReason === 'done' && s.correct >= RULES.EXAM_QUESTIONS - RULES.EXAM_MAX_WRONG).length;
  return { total: attempts.length, passed, rate: attempts.length ? passed / attempts.length : null };
}

export function practiceScore(state, questions, now = Date.now()) {
  const booklet = questions.filter((q) => q.tier === 'booklet');
  let seen = 0, accuracySum = 0, recovered = 0, unresolved = 0;
  for (const q of booklet) {
    const history = (state.q[q.id]?.history || []).filter((a) => a.m !== MODES.recall && a.t <= now);
    if (!history.length) continue;
    seen++;
    const recent = history.filter((a) => now - a.t <= PRACTICE_SCORE.windowDays * DAY);
    // A block is correct only if all its answers were correct. Repeating one question cannot
    // dominate the bank, and an immediate correction does not erase a recent miss.
    const blocks = [];
    for (const a of recent) {
      const previous = blocks[blocks.length - 1];
      if (previous && a.t - previous.start < PRACTICE_SCORE.answerGapMs) {
        previous.ok = previous.ok && a.ok;
      } else blocks.push({ start: a.t, ok: !!a.ok });
    }
    const evidence = blocks.slice(-3);
    if (evidence.length) accuracySum += evidence.filter((a) => a.ok).length / evidence.length;
    const hadMiss = history.some((a) => !a.ok);
    const lastTwo = history.slice(-2);
    const clear = history.at(-1).ok && (!hadMiss || (lastTwo.length === 2 && lastTwo.every((a) => a.ok)));
    if (clear && recent.length) recovered++;
    if (hadMiss && !clear) unresolved++;
  }
  const exams = examPerformance(state, now);
  const total = booklet.length;
  const coverage = total ? seen / total : 0;
  const accuracy = total ? accuracySum / total : 0;
  const recovery = total ? recovered / total : 0;
  const simulation = (exams.rate || 0) * Math.min(1, exams.total / PRACTICE_SCORE.examEvidence);
  const factors = { coverage, accuracy, recovery, simulation };
  const score = Object.values(factors).reduce((a, b) => a + b, 0) / 4;
  return { score, factors, seen, total, recovered, unresolved, exams };
}
