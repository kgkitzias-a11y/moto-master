// v1.6: official groups, exam wording, look-alikes, pass chance, final check, exam skip.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reduce, emptyState } from '../../src/engine/reducer.js';
import { examByGroups, twins, twinSets, proof, morning } from '../../src/engine/selection.js';
import { questionChance, atMostWrong, passChance, isProven, proofStatus, groupChances, P_UNSEEN, P_LAST_WRONG } from '../../src/engine/chance.js';
import { startSession, PRESETS } from '../../src/engine/session.js';
import { MODES, RULES } from '../../src/engine/constants.js';
import { genQuestions, T0, H, D, mulberry32, nextId } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8'));
const QS = DATA.questions;
const BOOKLET = QS.filter((q) => q.tier === 'booklet');
const byId = new Map(QS.map((q) => [q.id, q]));

// Answer event for the real dataset.
const ev = (q, t, ok, extra = {}) => ({ id: nextId(), t, k: 'answer', q, ch: ok ? byId.get(q).correct : (byId.get(q).correct + 1) % byId.get(q).options.length, ok, ms: 3000, m: 'practice', s: 's', cf: null, sh: true, tl: null, hd: false, rc: false, ...extra });

describe('v1.6 dataset', () => {
  test('every booklet question has an official group 1–10; group sizes match meta.official', () => {
    const sizes = {};
    for (const q of BOOKLET) {
      assert.ok(Number.isInteger(q.group) && q.group >= 1 && q.group <= 10, `Q${q.id} group ${q.group}`);
      sizes[q.group] = (sizes[q.group] || 0) + 1;
    }
    assert.deepEqual(Object.fromEntries(Object.entries(sizes).map(([g, n]) => [g, n])), DATA.meta.official.groups);
    assert.equal(DATA.meta.official.active, BOOKLET.length);
    for (const q of QS.filter((x) => x.tier !== 'booklet')) assert.equal(q.group, undefined, `archive Q${q.id} must not carry a group`);
  });

  test('exam wording is index-aligned: same option count, same answer index, booklet text untouched', () => {
    const withExam = QS.filter((q) => q.exam);
    assert.deepEqual(withExam.map((q) => q.id), DATA.meta.official.exam_wording);
    for (const q of withExam) {
      assert.equal(q.exam.options.length, q.options.length, `Q${q.id}`);
      assert.ok(q.exam.text, `Q${q.id} exam text`);
    }
    // The decisive rewordings found in the Ministry database.
    assert.equal(byId.get(77).options[2], 'Όλα τα παραπάνω.');
    assert.match(byId.get(77).exam.options[2], /^Αν θα ξεκινήσει το λεωφορείο και αν θα εμφανισθεί/);
    assert.equal(byId.get(145).exam.text, 'Ποιοι είναι οι κυριότεροι λόγοι ολισθήσεως:');
    assert.match(byId.get(44).exam.options[2], /σε περίπτωση πτώσεως/);
  });

  test('twins are symmetric and point at existing questions', () => {
    for (const q of QS) for (const t of q.twins || []) {
      assert.ok(byId.has(t), `Q${q.id} → missing twin ${t}`);
      assert.ok((byId.get(t).twins || []).includes(q.id), `twin ${q.id}↔${t} not symmetric`);
    }
  });

  test('reviewed explanations replaced the flagged ones', () => {
    assert.ok(!byId.get(102).explanation.includes('αντιτυφλώνετε'));
    assert.ok(!/δεν ισχύουν/.test(byId.get(3).explanation));
    assert.match(byId.get(129).explanation, /πρόσφυση των ελαστικών/);
  });

  test('the reducer ignores the new fields: same state with and without them', () => {
    const stripped = QS.map(({ group, exam, twins: tw, ...rest }) => ({ ...rest, explanation: '' }));
    const rnd = mulberry32(7);
    const events = [];
    for (let i = 0; i < 400; i++) {
      const q = BOOKLET[Math.floor(rnd() * BOOKLET.length)].id;
      events.push(ev(q, T0 + i * 37 * 60 * 1000, rnd() < 0.8));
    }
    assert.deepEqual(reduce(events, QS), reduce(events, stripped));
  });
});

describe('v1.6 selection', () => {
  test('examByGroups: one question from each of the 10 groups, all booklet', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ids = examByGroups(BOOKLET, 10, mulberry32(seed));
      assert.equal(ids.length, 10);
      assert.deepEqual([...new Set(ids.map((id) => byId.get(id).group))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  test('examByGroups: data without groups falls back to random questions', () => {
    const qs = genQuestions(30);
    const ids = examByGroups(qs, 10, mulberry32(1));
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, 10);
  });

  test('twins: every look-alike set is served back to back', () => {
    const order = twins(BOOKLET, mulberry32(3));
    const sets = twinSets(BOOKLET);
    assert.equal(order.length, sets.reduce((a, s) => a + s.length, 0));
    for (const set of sets) {
      const pos = set.map((id) => order.indexOf(id)).sort((a, b) => a - b);
      assert.equal(pos[pos.length - 1] - pos[0], set.length - 1, `set ${set} not contiguous`);
    }
    assert.ok(sets.some((s) => s.includes(169) && s.includes(170)));
    assert.ok(!order.includes(130), 'εκτός ύλης twins only with the archive pool');
  });

  test('proof: recent correct answers are done; a question ever missed needs two in a row', () => {
    const now = T0 + 2 * D;
    const events = [ev(1, now - 3 * H, true), ev(2, now - 5 * H, false), ev(2, now - 2 * H, true), ev(3, now - 3 * D, true)];
    const st = reduce(events, QS);
    const left = new Set(proof(BOOKLET, st, now, mulberry32(1)));
    assert.ok(!left.has(1));
    assert.ok(left.has(2), 'missed once, then only one correct');
    assert.ok(left.has(3), 'older than 48 h');
    const st2 = reduce([...events, ev(2, now - H, true)], QS);
    assert.ok(!new Set(proof(BOOKLET, st2, now, mulberry32(1))).has(2));
    assert.equal(proofStatus(st2, QS, now).done, 2);
  });

  test('morning: questions ever missed come first, then look-alikes and numbers', () => {
    const st = reduce([ev(12, T0, false), ev(12, T0 + H, true)], QS);
    const ids = morning(BOOKLET, st, mulberry32(2));
    assert.equal(ids[0], 12);
    assert.ok(ids.includes(169) && ids.includes(31));
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('v1.6 pass chance', () => {
  test('questionChance: unseen, last wrong, and longer correct streaks', () => {
    const now = T0 + D;
    assert.equal(questionChance(undefined, now), P_UNSEEN);
    const one = reduce([ev(5, T0, true)], QS).q[5];
    const lastWrong = reduce([ev(5, T0, true), ev(5, T0 + H, false)], QS).q[5];
    const three = reduce([ev(5, T0, true), ev(5, T0 + H, true), ev(5, T0 + 2 * H, true)], QS).q[5];
    const spaced = reduce([ev(5, T0 - D, true), ev(5, T0 + H, true), ev(5, T0 + 2 * H, true)], QS).q[5];
    assert.equal(questionChance(lastWrong, now), P_LAST_WRONG);
    assert.ok(questionChance(one, now) < questionChance(three, now));
    assert.ok(questionChance(three, now) < questionChance(spaced, now), 'a streak over two days counts more');
    assert.ok(questionChance(three, T0 + 10 * D) < questionChance(three, now), 'not seen for days costs');
    const recall = reduce([ev(5, T0, true, { m: 'recall', rc: true, sh: false })], QS).q[5];
    assert.equal(questionChance(recall, now), P_UNSEEN, 'self-graded answers do not count');
  });

  test('atMostWrong is the Poisson binomial tail', () => {
    assert.equal(atMostWrong(new Array(10).fill(1)), 1);
    assert.equal(atMostWrong([0.5, 0.5], 1), 0.75);
    assert.ok(Math.abs(atMostWrong(new Array(10).fill(0.9), 1) - (0.9 ** 10 + 10 * 0.1 * 0.9 ** 9)) < 1e-12);
  });

  test('passChance: nothing studied is far below target; every question solid on two days is above it', () => {
    const now = T0 + 2 * D + 6 * H;
    assert.ok(passChance(emptyState(), QS, now) < 0.01);
    const events = [];
    for (const q of BOOKLET) for (const t of [T0, T0 + D, T0 + 2 * D, T0 + 2 * D + H, T0 + 2 * D + 2 * H]) events.push(ev(q.id, t, true));
    const st = reduce(events, QS);
    assert.ok(passChance(st, QS, now) >= RULES.PASS_TARGET);
    assert.equal(groupChances(st, QS, now).length, 10);
  });
});

describe('v1.6 exam sessions', () => {
  const mk = (mode, seed = 1) => startSession(mode, { questions: QS, state: emptyState(), settings: {}, now: T0, rnd: mulberry32(seed) });

  test('exam presets: official 15′ timer, exam wording, skip allowed; practice modes: no skip', () => {
    assert.equal(PRESETS[MODES.exam].timerMs, 15 * 60 * 1000);
    assert.ok(PRESETS[MODES.exam].examWording && PRESETS[MODES.exam].skip);
    assert.ok(PRESETS[MODES.hardexam].examWording && PRESETS[MODES.hardexam].skip);
    const s = mk(MODES.goal);
    assert.equal(s.skip(T0), false);
  });

  test('exam simulations always show the exam wording', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = mk(MODES.exam, seed);
      while (s.current()) {
        const { q, view } = s.current();
        if (q.exam) { assert.equal(view.exam, true); assert.equal(view.text, q.exam.text); }
        s.answer(q.correct, { now: T0 + 1000 });
      }
    }
  });

  test('practice modes mix both wordings; the chosen index means the same in both', () => {
    let exam = 0, book = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = startSession(MODES.practice, { questions: QS, state: emptyState(), settings: {}, now: T0, rnd: mulberry32(seed), params: { policy: 'range', from: 77, to: 77 } });
      const { q, view } = s.current();
      if (view.exam) exam++; else book++;
      const res = s.answer(q.correct, { now: T0 + 1000 });
      assert.equal(res.ok, true);
      assert.equal(res.event.ch, 2);
    }
    assert.ok(exam > 10 && book > 10, `exam ${exam} / book ${book}`);
  });

  test('skip sends the question to the back and it comes back last; no event for a skip', () => {
    const s = mk(MODES.exam, 5);
    const first = s.current().q.id;
    assert.equal(s.skip(T0 + 100), true);
    assert.notEqual(s.current().q.id, first);
    const seen = [];
    while (s.current()) { seen.push(s.current().q.id); s.answer(s.current().q.correct, { now: T0 + 2000 }); }
    assert.equal(seen.length, 10);
    assert.equal(seen[9], first);
    const sum = s.summary();
    assert.equal(sum.skipped, 1);
    assert.equal(sum.passed, true);
    assert.equal(s.sessionEvent(T0 + 3000).n, 10);
  });

  test('the last unanswered question cannot be skipped', () => {
    const s = mk(MODES.exam, 6);
    for (let i = 0; i < 9; i++) s.answer(s.current().q.correct, { now: T0 + 1000 });
    assert.equal(s.skip(T0 + 2000), false);
  });

  test('summary sheet («Πρακτικό»): every question, the answer given, unanswered ones on time-out', () => {
    const s = mk(MODES.exam, 9);
    const q1 = s.current().q;
    s.answer((q1.correct + 1) % q1.options.length, { now: T0 + 1000 });
    s.answer(s.current().q.correct, { now: T0 + 2000 });
    s.tick(T0 + RULES.EXAM_TIME_MS + 1);
    const sum = s.summary();
    assert.equal(sum.passed, false);
    assert.equal(sum.sheet.length, 10);
    assert.equal(sum.sheet[0].ok, false);
    assert.equal(sum.sheet[0].correct, (q1.exam || q1).options[q1.correct]);
    assert.equal(sum.sheet[1].ok, true);
    assert.equal(sum.sheet.filter((r) => !r.answered).length, 8);
  });

  test('new modes build queues from the real dataset', () => {
    assert.ok(mk(MODES.twins).total > 10);
    assert.equal(mk(MODES.proof).total, BOOKLET.length);
    assert.ok(mk(MODES.morning).total > 10);
    assert.equal(PRESETS[MODES.proof].endRule, 'zeroed');
  });
});

describe('v1.6 isProven edge cases', () => {
  test('a slow correct answer (over 15″) does not count', () => {
    const now = T0 + H;
    const st = reduce([ev(8, T0, true, { ms: 16000 })], QS);
    assert.equal(isProven(st.q[8], now), false);
  });
});
