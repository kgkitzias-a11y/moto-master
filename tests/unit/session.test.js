import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, MODES, isPositional } from '../../src/engine/constants.js';
import { shuffleOptions, mulberry32 } from '../../src/engine/shuffle.js';
import { emptyState, reduce } from '../../src/engine/reducer.js';
import { PRESETS, Session, buildQueue, startSession } from '../../src/engine/session.js';
import { QUESTIONS, BOOKLET_IDS, genQuestions, T0, H, ans } from './fixtures.js';

const EVENT_FIELDS = ['id', 't', 'k', 'q', 'ch', 'ok', 'ms', 'm', 's', 'cf', 'sh', 'tl', 'hd', 'rc'];

describe('shuffleOptions', () => {
  test('positional options ("Όλα τα παραπάνω", "Και τα δύο") stay last; the rest are shuffled into every position', () => {
    const opts = ['A', 'B', 'C', 'Όλα τα παραπάνω'];
    const seenAt = [new Set(), new Set(), new Set(), new Set()]; // position → set of original indexes
    for (let seed = 1; seed <= 300; seed++) {
      const order = shuffleOptions(opts, mulberry32(seed));
      assert.equal(order.length, 4);
      assert.deepEqual([...order].sort(), [0, 1, 2, 3], 'is a permutation');
      assert.equal(order[3], 3, 'positional option is always last');
      order.forEach((orig, pos) => seenAt[pos].add(orig));
    }
    for (let pos = 0; pos < 3; pos++) assert.deepEqual([...seenAt[pos]].sort(), [0, 1, 2], `position ${pos} sees every movable option`);
    assert.deepEqual([...seenAt[3]], [3]);
  });

  test('"Και τα δύο" in the middle of the printed list still ends up last', () => {
    const opts = ['A', 'Και τα δύο', 'B'];
    for (let seed = 1; seed <= 50; seed++) {
      const order = shuffleOptions(opts, mulberry32(seed));
      assert.equal(order[2], 1);
      assert.deepEqual([...order.slice(0, 2)].sort(), [0, 2]);
    }
  });

  test('two positional options keep their printed relative order at the end', () => {
    const opts = ['A', 'Κανένα από τα παραπάνω', 'B', 'Όλα τα παραπάνω'];
    for (let seed = 1; seed <= 50; seed++) {
      const order = shuffleOptions(opts, mulberry32(seed));
      assert.deepEqual(order.slice(2), [1, 3]);
    }
  });

  test('isPositional matches the known phrases case-insensitively and ignores leading quotes', () => {
    assert.ok(isPositional('όλα τα παραπάνω'));
    assert.ok(isPositional('«Και οι δύο»'));
    assert.ok(!isPositional('Ναι, όλα τα παραπάνω'));
    assert.ok(!isPositional('A'));
  });

  test('no positional options → every index reaches every position', () => {
    const opts = ['A', 'B', 'C'];
    const seenAt = [new Set(), new Set(), new Set()];
    for (let seed = 1; seed <= 200; seed++) shuffleOptions(opts, mulberry32(seed)).forEach((o, p) => seenAt[p].add(o));
    seenAt.forEach((s) => assert.deepEqual([...s].sort(), [0, 1, 2]));
  });
});

describe('buildQueue: pools per mode', () => {
  const Q = genQuestions(20, 5);
  const bookletIds = Q.filter((q) => q.tier === 'booklet').map((q) => q.id);
  const allIds = Q.map((q) => q.id);
  const now = T0;

  test('every mode in PRESETS builds a queue drawn from the correct pool (booklet unless archive is included; gauntlet172 = everything)', () => {
    const st = emptyState();
    for (const mode of Object.keys(PRESETS)) {
      const q = buildQueue(mode, Q, st, {}, now, {}, mulberry32(7));
      assert.ok(Array.isArray(q), `${mode}: array`);
      const allowed = mode === MODES.gauntlet172 ? allIds : bookletIds;
      for (const id of q) assert.ok(allowed.includes(id), `${mode}: id ${id} outside its pool`);
    }
  });

  test('includeArchive setting widens pool-based modes but never exam/gauntlet139', () => {
    const st = emptyState();
    const withArchive = buildQueue(MODES.practice, Q, st, { includeArchive: true }, now, {}, mulberry32(1));
    assert.deepEqual(withArchive, allIds);
    const exam = buildQueue(MODES.exam, Q, st, { includeArchive: true }, now, {}, mulberry32(1));
    for (const id of exam) assert.ok(bookletIds.includes(id));
    const g139 = buildQueue(MODES.gauntlet139, Q, st, { includeArchive: true }, now, {}, mulberry32(1));
    assert.deepEqual([...g139].sort((a, b) => a - b), bookletIds);
  });

  test('exam: exactly 10 distinct booklet ids', () => {
    const q = buildQueue(MODES.exam, Q, emptyState(), {}, now, {}, mulberry32(3));
    assert.equal(q.length, RULES.EXAM_QUESTIONS);
    assert.equal(new Set(q).size, 10);
    for (const id of q) assert.ok(bookletIds.includes(id));
  });

  test('gauntlet139: all booklet ids exactly once (shuffled)', () => {
    const q = buildQueue(MODES.gauntlet139, Q, emptyState(), {}, now, {}, mulberry32(5));
    assert.equal(q.length, bookletIds.length);
    assert.deepEqual([...q].sort((a, b) => a - b), bookletIds);
    assert.notDeepEqual(q, bookletIds, 'order is shuffled');
  });

  test('gauntlet172: all questions including archive exactly once', () => {
    const q = buildQueue(MODES.gauntlet172, Q, emptyState(), {}, now, {}, mulberry32(5));
    assert.equal(q.length, allIds.length);
    assert.deepEqual([...q].sort((a, b) => a - b), allIds);
  });

  test('gauntlet172 on the real dataset shape (fixture) includes archive questions', () => {
    const q = buildQueue(MODES.gauntlet172, QUESTIONS, emptyState(), {}, now, {}, mulberry32(9));
    assert.deepEqual([...q].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  });

  test('practice policies: sequential, range, category, random(count)', () => {
    const st = emptyState();
    assert.deepEqual(buildQueue(MODES.practice, Q, st, {}, now, {}, mulberry32(1)), bookletIds);
    assert.deepEqual(buildQueue(MODES.practice, Q, st, {}, now, { policy: 'range', from: 3, to: 5 }, mulberry32(1)), [3, 4, 5]);
    const cat = buildQueue(MODES.practice, Q, st, {}, now, { policy: 'category', category: 'Γενικά' }, mulberry32(1));
    assert.deepEqual([...cat].sort((a, b) => a - b), bookletIds);
    assert.equal(buildQueue(MODES.practice, Q, st, {}, now, { policy: 'random', count: 4 }, mulberry32(1)).length, 4);
  });

  test('wrong mode: only bin questions; tomorrow: weak + bin + unseen', () => {
    const st = reduce([ans(1, T0, false, {}, Q), ans(2, T0, true, {}, Q)], Q);
    assert.deepEqual(buildQueue(MODES.wrong, Q, st, {}, now, {}, mulberry32(1)), [1]);
    const tomorrow = buildQueue(MODES.tomorrow, Q, st, {}, now, {}, mulberry32(1));
    assert.ok(tomorrow.includes(1), 'bin question');
    assert.ok(tomorrow.includes(2), 'level 1 < WEAK_LEVEL');
    assert.ok(tomorrow.includes(3), 'unseen');
  });

  test('signs mode: only questions with an image', () => {
    assert.deepEqual(buildQueue(MODES.signs, QUESTIONS, emptyState(), {}, now, {}, mulberry32(1)), [4]);
  });

  test('unknown mode throws', () => {
    assert.throws(() => buildQueue('nope', Q, emptyState(), {}, now));
  });
});

describe('Session engine', () => {
  const Q = genQuestions(12);
  const byId = new Map(Q.map((q) => [q.id, q]));
  const correctOf = (s) => s.current().q.correct;
  const wrongOf = (s) => (s.current().q.correct + 1) % s.current().q.options.length;

  test('answer events carry exactly {id,t,k,q,ch,ok,ms,m,s,cf,sh,tl,hd,rc} with the right values', () => {
    const s = new Session({ mode: MODES.practice, questions: Q, queue: [1, 2], settings: {}, now: T0, rnd: mulberry32(1) });
    const cur = s.current();
    assert.equal(cur.shownAt, T0);
    const r = s.answer(cur.q.correct, { now: T0 + 2500, confidence: 'unsure' });
    assert.deepEqual(Object.keys(r.event).sort(), [...EVENT_FIELDS].sort());
    const e = r.event;
    assert.equal(e.k, 'answer');
    assert.equal(e.q, 1);
    assert.equal(e.ch, cur.q.correct);
    assert.equal(e.ok, true);
    assert.equal(e.ms, 2500);
    assert.equal(e.m, 'practice');
    assert.equal(e.s, s.id);
    assert.equal(e.cf, 'unsure');
    assert.equal(e.sh, true);
    assert.equal(e.tl, null);
    assert.equal(e.hd, false);
    assert.equal(e.rc, false);
    assert.equal(e.t, T0 + 2500);
    assert.equal(typeof e.id, 'string');
    assert.ok(e.id.length >= 32);
  });

  test('a wrong answer yields ok:false and ch = the chosen original index; answer(null) is a timeout (ok:false, ch:null)', () => {
    const s = new Session({ mode: MODES.practice, questions: Q, queue: [1, 2], now: T0, rnd: mulberry32(1) });
    const w = wrongOf(s);
    const r1 = s.answer(w, { now: T0 + 1000 });
    assert.equal(r1.ok, false); assert.equal(r1.event.ch, w); assert.equal(r1.event.ok, false);
    const r2 = s.answer(null, { now: T0 + 2000 });
    assert.equal(r2.event.ch, null); assert.equal(r2.event.ok, false);
    assert.ok(s.ended);
    assert.equal(s.endReason, 'done');
    assert.deepEqual(s.summary().wrongs, [1, 2]);
  });

  test('current().order is a permutation of the option indexes and shuffled flag is true for shuffling presets', () => {
    const s = new Session({ mode: MODES.practice, questions: QUESTIONS, queue: [3], now: T0, rnd: mulberry32(2) });
    const cur = s.current();
    assert.deepEqual([...cur.order].sort(), [0, 1, 2, 3]);
    assert.equal(cur.order[3], 3, 'positional option kept last');
    assert.equal(cur.shuffled, true);
  });

  test('settings.hardMode → hd:true on every event; the hard preset also sets it', () => {
    const s = new Session({ mode: MODES.practice, questions: Q, queue: [1], settings: { hardMode: true }, now: T0, rnd: mulberry32(1) });
    assert.equal(s.answer(correctOf(s), { now: T0 + 10 }).event.hd, true);
    const h = new Session({ mode: MODES.hard, questions: Q, queue: [1], settings: {}, now: T0, rnd: mulberry32(1) });
    assert.equal(h.answer(correctOf(h), { now: T0 + 10 }).event.hd, true);
    const p = new Session({ mode: MODES.practice, questions: Q, queue: [1], settings: {}, now: T0, rnd: mulberry32(1) });
    assert.equal(p.answer(correctOf(p), { now: T0 + 10 }).event.hd, false);
  });

  test('settings.confidence === false → cf:null even when a confidence is passed', () => {
    const s = new Session({ mode: MODES.practice, questions: Q, queue: [1], settings: { confidence: false }, now: T0, rnd: mulberry32(1) });
    assert.equal(s.answer(correctOf(s), { now: T0 + 10, confidence: 'sure' }).event.cf, null);
    const s2 = new Session({ mode: MODES.practice, questions: Q, queue: [1], settings: {}, now: T0, rnd: mulberry32(1) });
    assert.equal(s2.answer(correctOf(s2), { now: T0 + 10, confidence: 'sure' }).event.cf, 'sure');
  });

  test('recall mode: answer(null, {selfGrade:true}) → ok:true, rc:true, sh:false, ch:null, cf:null', () => {
    const s = new Session({ mode: MODES.recall, questions: Q, queue: [1, 2], settings: {}, now: T0, rnd: mulberry32(1) });
    assert.equal(s.current().shuffled, false);
    assert.deepEqual(s.current().order, [0, 1, 2], 'recall shows printed order');
    const r = s.answer(null, { now: T0 + 500, selfGrade: true, confidence: 'sure' });
    assert.equal(r.ok, true);
    assert.equal(r.event.ok, true);
    assert.equal(r.event.rc, true);
    assert.equal(r.event.sh, false);
    assert.equal(r.event.ch, null);
    assert.equal(r.event.cf, null);
    const r2 = s.answer(null, { now: T0 + 900, selfGrade: false });
    assert.equal(r2.event.ok, false);
    assert.equal(r2.event.rc, true);
    assert.ok(s.ended);
    assert.deepEqual(s.summary().wrongs, [2]);
  });

  test('queue ids not in the question set are dropped; empty queue → isEmpty and current() null', () => {
    const s = new Session({ mode: MODES.practice, questions: Q, queue: [1, 999, 2], now: T0, rnd: mulberry32(1) });
    assert.equal(s.total, 2);
    const e = new Session({ mode: MODES.practice, questions: Q, queue: [999], now: T0, rnd: mulberry32(1) });
    assert.ok(e.isEmpty);
    assert.equal(e.current(), null);
    assert.equal(e.sessionEvent(T0), null);
  });

  describe('speed', () => {
    test('perQuestionMs is 5000; tick() past the per-question deadline returns question-timeout and does not end the session', () => {
      assert.equal(PRESETS[MODES.speed].perQuestionMs, 5000);
      const s = new Session({ mode: MODES.speed, questions: Q, queue: [1, 2], now: T0, rnd: mulberry32(1) });
      assert.equal(s.current().deadline, T0 + 5000);
      assert.equal(s.tick(T0 + 4999), null);
      assert.equal(s.tick(T0 + 5000), 'question-timeout');
      assert.ok(!s.ended);
      const r = s.answer(null, { now: T0 + 5000 });
      assert.equal(r.event.ok, false);
      assert.equal(r.event.tl, 5000);
      assert.equal(s.current().q.id, 2);
      assert.equal(s.current().deadline, T0 + 10000, 'next question gets its own 5 s window');
      assert.equal(s.tick(T0 + 12000), 'question-timeout');
    });
  });

  describe('exam', () => {
    const mk = (seed = 1) => startSession(MODES.exam, { questions: Q, state: emptyState(), settings: {}, now: T0, rnd: mulberry32(seed) });

    test('preset: feedback end, 10-minute session timer, maxWrong 1, timed', () => {
      assert.equal(PRESETS[MODES.exam].feedback, 'end');
      assert.equal(PRESETS[MODES.exam].timerMs, 10 * 60 * 1000);
      assert.equal(PRESETS[MODES.exam].maxWrong, 1);
      const s = mk();
      assert.equal(s.total, 10);
      assert.equal(s.timed, true);
      assert.equal(s.deadline, T0 + RULES.EXAM_TIME_MS);
      assert.equal(s.remainingMs, RULES.EXAM_TIME_MS);
    });

    test('tick past 10 minutes returns session-timeout, ends the session, passed=false', () => {
      const s = mk();
      s.answer(correctOf(s), { now: T0 + 1000 });
      assert.equal(s.tick(T0 + RULES.EXAM_TIME_MS - 1), null);
      assert.equal(s.tick(T0 + RULES.EXAM_TIME_MS), 'session-timeout');
      assert.ok(s.ended);
      assert.equal(s.endReason, 'time');
      assert.equal(s.current(), null);
      assert.equal(s.summary().passed, false);
      assert.equal(s.tick(T0 + RULES.EXAM_TIME_MS + 1), null, 'no further ticks after end');
    });

    test('summary().passed is true with 0 or 1 wrong, false with 2 wrong (session runs to the end — feedback is deferred)', () => {
      for (const wrongCount of [0, 1, 2]) {
        const s = mk(wrongCount + 1);
        let t = T0;
        let i = 0;
        while (!s.ended) {
          t += 3000;
          const ch = i < wrongCount ? wrongOf(s) : correctOf(s);
          s.answer(ch, { now: t });
          i++;
        }
        assert.equal(i, 10, `answered all 10 questions with ${wrongCount} wrong`);
        assert.equal(s.endReason, 'done');
        const sum = s.summary();
        assert.equal(sum.wrong, wrongCount);
        assert.equal(sum.passed, wrongCount <= 1, `passed with ${wrongCount} wrong`);
        assert.equal(sum.completed, true);
        assert.equal(sum.correct, 10 - wrongCount);
      }
    });

    test('sessionEvent(): x.timed === true, x.passed, n === 10, c/w consistent', () => {
      const s = mk(4);
      let t = T0;
      let first = true;
      let wrongId = null;
      while (!s.ended) {
        t += 2000;
        if (first) { wrongId = s.current().q.id; s.answer(wrongOf(s), { now: t }); first = false; } else s.answer(correctOf(s), { now: t });
      }
      const ev = s.sessionEvent(t);
      assert.equal(ev.k, 'session');
      assert.equal(ev.m, 'exam');
      assert.equal(ev.s, s.id);
      assert.equal(ev.n, 10);
      assert.equal(ev.c, 9);
      assert.deepEqual(ev.w, [wrongId]);
      assert.equal(ev.x.timed, true);
      assert.equal(ev.x.passed, true);
      assert.equal(ev.x.completed, true);
      assert.equal(ev.d, t - T0);
      assert.equal(ev.t, t);
      // and the reducer routes it as a timed mock
      const st = reduce([ev], Q);
      assert.equal(st.mocks.length, 1);
      assert.equal(st.mocks[0].timed, true);
      assert.equal(st.mocks[0].total, 10);
    });

    test('an aborted exam is neither completed nor passed', () => {
      const s = mk(2);
      s.answer(correctOf(s), { now: T0 + 1000 });
      s.abort(T0 + 2000);
      assert.equal(s.endReason, 'abort');
      const sum = s.summary();
      assert.equal(sum.completed, false);
      assert.equal(sum.passed, false);
      assert.equal(sum.answered, 1);
      assert.equal(s.sessionEvent(T0 + 2000).n, 10, 'n stays the exam size');
    });
  });

  describe('sudden death', () => {
    test('loops/reshuffles beyond the pool without ending until a wrong answer; run = correct streak', () => {
      const pool = [1, 2, 3, 4];
      const s = new Session({ mode: MODES.sudden, questions: Q, queue: pool, now: T0, rnd: mulberry32(11) });
      const served = [];
      let t = T0;
      for (let i = 0; i < 3 * pool.length; i++) {
        assert.ok(!s.ended, `not ended after ${i} correct answers`);
        served.push(s.current().q.id);
        t += 1000;
        s.answer(correctOf(s), { now: t });
      }
      assert.ok(!s.ended, 'still running after 3 full passes');
      assert.ok(s.current() !== null);
      for (let k = 0; k < 3; k++) assert.deepEqual([...served.slice(k * 4, k * 4 + 4)].sort(), pool, `pass ${k + 1} is a full permutation of the pool`);
      assert.ok(s.queue.length > pool.length, 'queue grew via reshuffle');
      t += 1000;
      const r = s.answer(wrongOf(s), { now: t });
      assert.equal(r.ok, false);
      assert.ok(s.ended);
      assert.equal(s.endReason, 'wrong');
      const sum = s.summary();
      assert.equal(sum.run, 12);
      assert.equal(sum.correct, 12);
      assert.equal(sum.wrong, 1);
      const ev = s.sessionEvent(t);
      assert.equal(ev.x.run, 12);
      assert.equal(ev.n, 13, 'n = answered count for non-exam modes');
      const st = reduce([ev], Q);
      assert.equal(st.sudden.best, 12);
    });

    test('a wrong on the very first question ends with run 0', () => {
      const s = new Session({ mode: MODES.sudden, questions: Q, queue: [1, 2], now: T0, rnd: mulberry32(1) });
      s.answer(wrongOf(s), { now: T0 + 100 });
      assert.ok(s.ended);
      assert.equal(s.summary().run, 0);
      assert.equal(s.sessionEvent(T0 + 100).x.run, 0);
    });
  });

  for (const mode of [MODES.wrong, MODES.tomorrow]) {
    describe(mode, () => {
      test('a wrong answer re-queues the id; the session ends only when pending is zero', () => {
        const s = new Session({ mode, questions: Q, queue: [1, 2, 3], now: T0, rnd: mulberry32(3) });
        assert.equal(PRESETS[mode].endRule, 'zeroed');
        assert.equal(s.pending.size, 3);
        let t = T0;
        // q1 wrong → requeued at the end
        assert.equal(s.current().q.id, 1);
        s.answer(wrongOf(s), { now: (t += 1000) });
        assert.deepEqual(s.queue, [1, 2, 3, 1]);
        assert.equal(s.pending.size, 3);
        assert.ok(!s.ended);
        // q2 ok, q3 wrong, then q1 ok
        s.answer(correctOf(s), { now: (t += 1000) });
        assert.equal(s.pending.size, 2);
        s.answer(wrongOf(s), { now: (t += 1000) });
        assert.deepEqual(s.queue, [1, 2, 3, 1, 3]);
        assert.equal(s.current().q.id, 1);
        s.answer(correctOf(s), { now: (t += 1000) });
        assert.equal(s.pending.size, 1);
        assert.ok(!s.ended, 'original queue length reached but q3 is still owed');
        assert.equal(s.current().q.id, 3);
        // q3 wrong again → still not ended
        s.answer(wrongOf(s), { now: (t += 1000) });
        assert.ok(!s.ended);
        assert.equal(s.pending.size, 1);
        assert.equal(s.current().q.id, 3);
        s.answer(correctOf(s), { now: (t += 1000) });
        assert.equal(s.pending.size, 0);
        assert.ok(s.ended);
        assert.equal(s.endReason, 'done');
        const sum = s.summary();
        assert.equal(sum.completed, true);
        assert.equal(sum.answered, 6);
        assert.equal(sum.correct, 3);
        assert.deepEqual(sum.wrongs, [1, 3, 3]);
        const ev = s.sessionEvent(t);
        assert.deepEqual(ev.w, [1, 3], 'session event de-duplicates wrong ids');
        assert.equal(ev.n, 6);
      });

      test('aborting with pending ids → completed false', () => {
        const s = new Session({ mode, questions: Q, queue: [1, 2], now: T0, rnd: mulberry32(3) });
        s.answer(wrongOf(s), { now: T0 + 1 });
        s.abort(T0 + 2);
        assert.equal(s.summary().completed, false);
        assert.equal(s.pending.size, 2);
      });
    });
  }

  test('gauntlet139 and due sessions: sessionEvent n/x are what the readiness and streak rules consume', () => {
    const G = genQuestions(6, 2);
    const g = startSession(MODES.gauntlet139, { questions: G, state: emptyState(), settings: {}, now: T0, rnd: mulberry32(1) });
    assert.equal(g.total, 6);
    let t = T0;
    while (!g.ended) g.answer(g.current().q.correct, { now: (t += 1000) });
    const ev = g.sessionEvent(t);
    assert.equal(ev.n, 6);
    assert.deepEqual(ev.w, []);
    assert.equal(ev.x.completed, true);
    assert.equal(ev.x.timed, undefined);
    const d = new Session({ mode: MODES.due, questions: G, queue: [1, 2], now: T0, rnd: mulberry32(1) });
    d.answer(d.current().q.correct, { now: T0 + 1 });
    d.answer(d.current().q.correct, { now: T0 + 2 });
    const dev = d.sessionEvent(T0 + 2);
    assert.equal(dev.x.completed, true);
    assert.equal(dev.x.zeroed, true);
    const st = reduce([ev, dev], G);
    assert.equal(st.gauntlet139.length, 1);
    assert.equal(st.dueDays.length, 1);
  });

  test('all PRESETS have consistent flags (shuffle everywhere except recall; only exam is timed)', () => {
    for (const [mode, p] of Object.entries(PRESETS)) {
      assert.equal(p.shuffle, mode !== MODES.recall, `${mode}.shuffle`);
      assert.equal(!!p.timerMs, mode === MODES.exam, `${mode}.timerMs`);
      assert.equal(!!p.perQuestionMs, mode === MODES.speed, `${mode}.perQuestionMs`);
      assert.ok(['queue', 'zeroed', 'firstWrong'].includes(p.endRule), `${mode}.endRule`);
    }
  });
});
