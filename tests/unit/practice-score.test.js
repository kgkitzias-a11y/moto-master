import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceScore, examPerformance } from '../../src/engine/practice-score.js';

const now = Date.UTC(2026, 9, 14, 12), hour = 3600000;
const qs = [{ id: 1, tier: 'booklet' }, { id: 2, tier: 'booklet' }, { id: 3, tier: 'archive' }];
const a = (ok, t = now, m = 'practice') => ({ ok, t, m });
const attempt = (correct, endReason = 'done', t = now, mode = 'exam') => ({ t, mode, total: 10, correct, x: { timed: true, endReason } });

test('new and reset states have zero readiness and no invented simulation pass rate', () => {
  assert.equal(practiceScore({ q: {}, sessions: [] }, qs, now).score, 0);
  assert.equal(examPerformance({ sessions: [] }, now).rate, null);
});
test('repeated answers on one item cannot outweigh unseen questions; archive and recall are excluded', () => {
  const state = { q: { 1: { history: [a(true)] }, 2: { history: [a(true, now, 'recall')] }, 3: { history: [a(true)] } }, sessions: [] };
  const before = practiceScore(state, qs, now);
  state.q[1].history.push(...Array.from({ length: 1000 }, () => a(true)));
  assert.deepEqual(practiceScore(state, qs, now), before);
  assert.equal(before.score, 0.375);
  assert.equal(before.seen, 1);
});
test('an immediate correction cannot erase a miss from recent accuracy; two rights clear recovery', () => {
  const state = { q: { 1: { history: [a(false, now - 10000), a(true, now - 5000), a(true)] } }, sessions: [] };
  const m = practiceScore(state, qs, now);
  assert.equal(m.factors.accuracy, 0);
  assert.equal(m.recovered, 1);
  assert.equal(m.unresolved, 0);
  state.q[1].history.push(a(true, now + hour));
  assert.equal(practiceScore(state, qs, now + hour).factors.accuracy, 0.25);
});
test('old answers retain coverage but not recent evidence; future answers do not count', () => {
  const m = practiceScore({ q: { 1: { history: [a(true, now - 8 * 24 * hour)] }, 2: { history: [a(true, now + hour)] } }, sessions: [] }, qs, now);
  assert.equal(m.score, 0.125);
  assert.equal(m.factors.coverage, 0.5);
  assert.equal(m.factors.accuracy, 0);
});
test('simulation rate counts finished and timed-out real mocks, excludes aborted, hard, old and future attempts', () => {
  const sessions = [attempt(9), attempt(8), attempt(9, 'time'), attempt(10, 'abort'), attempt(10, 'done', now, 'hardexam'), attempt(10, 'done', now - 8 * 24 * hour), attempt(10, 'done', now + 1)];
  assert.deepEqual(examPerformance({ sessions }, now), { total: 3, passed: 1, rate: 1 / 3 });
});
test('only latest 20 eligible exams count, and five are needed for full simulation evidence', () => {
  const sessions = [attempt(0, 'done', now - 100), ...Array.from({ length: 20 }, (_, i) => attempt(10, 'done', now - 20 + i))];
  assert.deepEqual(examPerformance({ sessions }, now), { total: 20, passed: 20, rate: 1 });
  const state = { q: { 1: { history: [a(true)] }, 2: { history: [a(true)] } }, sessions: [attempt(10)] };
  assert.equal(practiceScore(state, qs, now).score, 0.8);
  state.sessions = sessions;
  assert.equal(practiceScore(state, qs, now).score, 1);
});
