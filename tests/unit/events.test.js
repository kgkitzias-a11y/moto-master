import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEvent, sanitizeEvents } from '../../src/engine/events.js';
import { uuid } from '../../src/engine/shuffle.js';
import { reduce } from '../../src/engine/reducer.js';

const NOW = Date.UTC(2026, 8, 14, 12);
const good = () => ({ id: uuid(), t: NOW - 1000, k: 'answer', q: 3, ch: 1, ok: false, ms: 2500, m: 'practice', s: 'abc', cf: 'sure', sh: true, tl: null, hd: false, rc: false });

test('sanitize: a well-formed answer passes through unchanged (keys whitelisted)', () => {
  const e = good();
  const c = sanitizeEvent({ ...e, extra: 'x', __proto__: { polluted: true } }, NOW);
  assert.deepEqual(c, e);
  assert.equal('extra' in c, false);
});

test('sanitize: rejects bad ids, unknown kinds, non-numeric or out-of-range timestamps', () => {
  assert.equal(sanitizeEvent({ ...good(), id: 'not-a-uuid' }, NOW), null);
  assert.equal(sanitizeEvent({ ...good(), id: 42 }, NOW), null);
  assert.equal(sanitizeEvent({ ...good(), k: 'evil' }, NOW), null);
  assert.equal(sanitizeEvent({ ...good(), t: 'soon' }, NOW), null);
  assert.equal(sanitizeEvent({ ...good(), t: Date.UTC(2019, 0, 1) }, NOW), null);
  assert.equal(sanitizeEvent(null, NOW), null);
  assert.equal(sanitizeEvent([1, 2], NOW), null);
});

test('sanitize: a far-future reset is dropped so it cannot wipe the log', () => {
  const evil = { id: uuid(), t: 9e15, k: 'reset' };
  assert.equal(sanitizeEvent(evil, NOW), null);
  const clean = sanitizeEvents([good(), evil], NOW);
  assert.equal(clean.length, 1);
  const st = reduce(clean, [{ id: 3, tier: 'booklet', text: 'q', options: ['a', 'b', 'c'], correct: 0, similar: [] }]);
  assert.equal(st.counts.answers, 1);
});

test('sanitize: coerces types and caps values', () => {
  const c = sanitizeEvent({ ...good(), ok: 'yes', ms: 1e12, ch: 99, cf: 'maybe', sh: 1, m: 'x'.repeat(100) }, NOW);
  assert.equal(c.ok, true); assert.equal(c.ms, 3600000); assert.equal(c.ch, null); assert.equal(c.cf, null); assert.equal(c.sh, true); assert.equal(c.m, null);
});

test('sanitize: session events keep only known x keys; duplicates by id collapse', () => {
  const id = uuid();
  const s = { id, t: NOW - 5, k: 'session', s: 'sid', m: 'exam', n: 10, c: 9, w: [1, 'x', -2, 7], d: 60000, x: { passed: 1, timed: true, run: 12, endReason: 'done', evil: 'y' } };
  const list = sanitizeEvents([s, { ...s, c: 0 }], NOW);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].w, [1, 7]);
  assert.deepEqual(list[0].x, { passed: true, timed: true, run: 12, endReason: 'done' });
});
