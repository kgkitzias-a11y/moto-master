import test from 'node:test';
import assert from 'node:assert/strict';
import { initialPreferences, mergePreferences, samePreferences, sanitizePreferences } from '../../src/sync/preferences.js';

const t = Date.UTC(2026, 9, 5, 12);
const idA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const record = (value, time = t, id = idA) => ({ value, t: time, id });

test('new device defaults adopt the cloud plan; deliberate offline edits win by timestamp', () => {
  const local = initialPreferences({ examDate: null, examTentative: false, dailyGoal: 40, includeArchive: false, hardMode: false });
  const remote = initialPreferences({ examDate: '2026-10-09', examTentative: true, dailyGoal: 50, includeArchive: true, hardMode: false });
  assert.deepEqual(mergePreferences(local, remote), remote);
  local.examDate = record('2026-10-12');
  assert.equal(mergePreferences(local, remote).examDate.value, '2026-10-12');
});

test('concurrent edits to different fields both survive; equal-time edits resolve deterministically', () => {
  const a = { examDate: record('2026-10-09'), includeArchive: record(true, t - 1) };
  const b = { examDate: record('2026-10-10', t, idB), includeArchive: record(false, t - 2, idB) };
  const merged = mergePreferences(a, b);
  assert.equal(merged.examDate.value, '2026-10-10');
  assert.equal(merged.includeArchive.value, true);
  assert.deepEqual(merged, mergePreferences(b, a));
  assert.deepEqual(merged, mergePreferences(merged, a));
});

test('only valid study fields sync; tokens, appearance, malformed dates and future clocks are excluded', () => {
  const cleaned = sanitizePreferences({ examDate: record('2026-02-30'), dailyGoal: record(1000),
    includeArchive: record('yes'), hardMode: record(true, t + 3 * 86400000),
    examTentative: record(true), token: record('secret'), theme: record('light'), deviceId: record('PC') }, t);
  assert.deepEqual(cleaned, { examTentative: record(true) });
  assert.deepEqual(sanitizePreferences({ examDate: record('2026-10-09', 0) }, t), {});
  assert.deepEqual(sanitizePreferences({ examDate: record(null) }, t), { examDate: record(null) });
});

test('existing settings migrate without changing values or explicit edit timestamps', () => {
  const previous = record('2026-10-09');
  const p = initialPreferences({ examDate: '2026-10-09', dailyGoal: 50, sharedPreferences: { examDate: previous }, theme: 'light', gistId: 'id', token: 'secret' });
  assert.deepEqual(p.examDate, previous);
  assert.deepEqual(p.dailyGoal, { value: 50, t: 0, id: '' });
  assert.equal(Object.hasOwn(p, 'theme'), false);
  assert.equal(samePreferences(p, { ...p }), true);
  assert.equal(samePreferences(p, { ...p, examDate: record(null) }), false);
});
