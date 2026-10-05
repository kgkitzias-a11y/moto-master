import test from 'node:test';
import assert from 'node:assert/strict';
import { studyPlan, answersToday, calendarDay } from '../../src/engine/planner.js';
import { genQuestions } from './fixtures.js';
import { buildQueue } from '../../src/engine/session.js';
import { emptyState } from '../../src/engine/reducer.js';

const Q = genQuestions(140, 19);
const now = new Date(2026, 9, 5, 15).getTime();
const settings = { examDate: '2026-10-09', dailyGoal: 40 };
const answer = (q, t = now - 1000, ok = true) => ({ id: crypto.randomUUID(), k: 'answer', q, t, ok, ms: 3000, sh: true });
const plan = (events = [], patch = {}, at = now) => studyPlan(Q, events, { ...settings, ...patch }, at);

test('140 questions / four study days = 35; archive opt-in = 40', () => {
  assert.equal(plan().target, 35);
  assert.equal(plan().days, 4);
  assert.equal(plan([], { includeArchive: true }).target, 40);
});
test('today’s target stays fixed; repeats cannot replace unseen questions', () => {
  const events = Array.from({ length: 10 }, (_, i) => answer(i + 1));
  events.push(...Array.from({ length: 40 }, () => answer(1)));
  const p = plan(events);
  assert.equal(p.newTarget, 35);
  assert.equal(p.done, 10);
  assert.equal(p.remaining, 25);
  assert.equal(p.answerCount, 50);
  assert.equal(p.queue.length, 25);
  assert.ok(p.queue.every((id) => id > 10));
});
test('missed days increase the goal; changing exam date recalculates it', () => {
  assert.equal(plan([], {}, new Date(2026, 9, 6, 10).getTime()).newTarget, 47);
  assert.equal(plan([], { examDate: '2026-10-07' }).newTarget, 70);
  assert.equal(plan([], { examDate: '2026-10-12' }).newTarget, 20);
});
test('yesterday’s covered questions become distinct reviews; reviews do not replace new work', () => {
  const yesterday = new Date(2026, 9, 4, 18).getTime();
  const events = Array.from({ length: 20 }, (_, i) => answer(i + 1, yesterday));
  events.push(...Array.from({ length: 8 }, () => answer(1)));
  const p = plan(events);
  assert.equal(p.newTarget, 30);
  assert.equal(p.reviewTarget, 20);
  assert.equal(p.reviewDone, 1);
  assert.equal(p.target, 50);
  assert.equal(p.remaining, 49);
  assert.ok(p.queue.slice(0, 30).every((id) => id > 20));
});
test('extra new questions today lower tomorrow’s quota', () => {
  const events = Array.from({ length: 50 }, (_, i) => answer(i + 1));
  assert.equal(plan(events).remaining, 0);
  assert.equal(plan(events, {}, new Date(2026, 9, 6, 12).getTime()).newTarget, 30);
});
test('same-day reset ignores earlier answers in automatic and manual modes', () => {
  const events = [answer(1, now - 2000), { id: crypto.randomUUID(), t: now - 1000, k: 'reset' }];
  assert.equal(plan(events).done, 0);
  assert.equal(plan(events).unseen, 140);
  assert.equal(answersToday({ events }, now), 0);
  assert.equal(plan(events, { examDate: null }).remaining, 40);
  events.push(answer(1, now));
  assert.equal(plan(events).done, 1);
  assert.equal(plan(events).reviewTarget, 0);
});
test('empty/invalid/past dates use a finite manual fallback; test day has no division by zero', () => {
  for (const examDate of [null, '', 'garbage', '2026-02-30', '2026-10-04']) {
    const p = plan([], { examDate });
    assert.equal(p.automatic, false);
    assert.equal(p.target, 40);
  }
  assert.equal(plan([], { examDate: '2026-10-05' }).target, 140);
  assert.equal(plan([], { examDate: '2026-10-05' }).status, 'today');
});
test('calendar arithmetic stays correct across DST, midnight and leap days', () => {
  assert.equal(calendarDay('2026-10-26') - calendarDay('2026-10-24'), 2);
  assert.equal(calendarDay('2028-03-01') - calendarDay('2028-02-28'), 2);
  assert.equal(calendarDay('2026-02-29'), null);
  assert.equal(plan([], {}, new Date(2026, 9, 8, 23, 59).getTime()).days, 1);
  assert.equal(plan([], {}, new Date(2026, 9, 9, 0, 1).getTime()).days, 0);
});
test('coverage complete means reviews, not a false readiness claim or zero-work filler', () => {
  const events = Array.from({ length: 140 }, (_, i) => answer(i + 1, new Date(2026, 9, 4, 18).getTime()));
  const p = plan(events);
  assert.equal(p.newTarget, 0);
  assert.equal(p.reviewTarget, 140);
  assert.equal(p.target, 140);
});
test('empty bank and exact final planned batch never manufacture questions', () => {
  assert.equal(studyPlan([], [], settings, now).target, 0);
  assert.deepEqual(buildQueue('goal', Q, emptyState(), settings, now, { plannedIds: [1, 2, 2, 99999] }), [1, 2]);
  assert.deepEqual(buildQueue('goal', Q, emptyState(), settings, now, { plannedIds: [] }), []);
});
