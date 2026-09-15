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
    assert.equal(e.cf, null); // confidence prompt removed (D-028): new events never carry cf
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

  test('confidence prompt is gone: cf is always null on new events, whatever settings or args say', () => {
    const s = new Session({ mode: MODES.practice, questions: Q, queue: [1], settings: { confidence: false } });
    assert.equal(s.answer(correctOf(s), { now: T0 + 10, confidence: 'sure' }).event.cf, null);
    const s2 = new Session({ mode: MODES.practice, questions: Q, queue: [1], settings: { confidence: true } });
    assert.equal(s2.answer(correctOf(s2), { now: T0 + 10, confidence: 'sure' }).event.cf, null);
    assert.equal(s2.confidenceOn, false);
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

  test('all PRESETS have consistent flags (shuffle everywhere except recall; only exam and hardexam are timed)', () => {
    for (const [mode, p] of Object.entries(PRESETS)) {
      assert.equal(p.shuffle, mode !== MODES.recall, `${mode}.shuffle`);
      assert.equal(!!p.timerMs, mode === MODES.exam || mode === MODES.hardexam, `${mode}.timerMs`);
      assert.equal(!!p.perQuestionMs, mode === MODES.speed, `${mode}.perQuestionMs`);
      assert.ok(['queue', 'zeroed', 'firstWrong'].includes(p.endRule), `${mode}.endRule`);
    }
  });
});

// ---------- Genie-style modes ----------
import { practiceSets } from '../../src/engine/selection.js';

describe('Session engine: Genie-style modes', () => {
  const Q = genQuestions(12);
  const correctOf = (s) => s.current().q.correct;
  const wrongOf = (s) => (s.current().q.correct + 1) % s.current().q.options.length;
  // Drives a session to its natural end: the first `wrongCount` answers wrong, the rest right.
  const play = (s, wrongCount, t0 = T0) => {
    let t = t0, i = 0;
    while (!s.ended) { t += 2000; s.answer(i < wrongCount ? wrongOf(s) : correctOf(s), { now: t }); i++; }
    return { answered: i, t };
  };

  describe('hardexam', () => {
    const mk = (seed = 1) => startSession(MODES.hardexam, { questions: Q, state: emptyState(), settings: {}, now: T0, rnd: mulberry32(seed) });

    test('preset: 5-minute session timer, maxWrong 0, feedback at the end, 10 booklet questions', () => {
      assert.equal(PRESETS[MODES.hardexam].timerMs, 5 * 60 * 1000);
      assert.equal(PRESETS[MODES.hardexam].timerMs, RULES.HARD_EXAM_TIME_MS);
      assert.equal(PRESETS[MODES.hardexam].maxWrong, 0);
      assert.equal(PRESETS[MODES.hardexam].feedback, 'end');
      const s = mk();
      assert.equal(s.total, RULES.EXAM_QUESTIONS);
      assert.equal(s.timed, true);
      assert.equal(s.deadline, T0 + RULES.HARD_EXAM_TIME_MS);
      assert.equal(new Set(s.queue).size, 10);
    });

    test('summary().passed is true only with 0 wrong and all 10 answered; 1 wrong -> false (the session still runs to the end)', () => {
      const ok = mk(1);
      const r0 = play(ok, 0);
      assert.equal(r0.answered, 10);
      assert.equal(ok.endReason, 'done');
      assert.equal(ok.summary().passed, true);
      assert.equal(ok.summary().completed, true);
      const bad = mk(2);
      const r1 = play(bad, 1);
      assert.equal(r1.answered, 10, 'no early failure: feedback is deferred to the end');
      assert.equal(bad.endReason, 'done');
      assert.equal(bad.summary().wrong, 1);
      assert.equal(bad.summary().passed, false);
      // partial: 9 correct then abort -> not passed
      const part = mk(3);
      let t = T0;
      for (let i = 0; i < 9; i++) part.answer(correctOf(part), { now: (t += 1000) });
      part.abort(t + 1);
      assert.equal(part.summary().wrong, 0);
      assert.equal(part.summary().passed, false, 'all 10 must be answered');
    });

    test('tick past 5 minutes -> session-timeout, passed false', () => {
      const s = mk(4);
      s.answer(correctOf(s), { now: T0 + 1000 });
      assert.equal(s.tick(T0 + RULES.HARD_EXAM_TIME_MS - 1), null);
      assert.equal(s.tick(T0 + RULES.HARD_EXAM_TIME_MS), 'session-timeout');
      assert.ok(s.ended);
      assert.equal(s.endReason, 'time');
      assert.equal(s.summary().passed, false);
    });

    test('sessionEvent(): x.timed true, x.passed, n === 10; the reducer files it under hardMocks', () => {
      const s = mk(5);
      const { t } = play(s, 0);
      const ev = s.sessionEvent(t);
      assert.equal(ev.m, 'hardexam');
      assert.equal(ev.n, 10);
      assert.equal(ev.c, 10);
      assert.deepEqual(ev.w, []);
      assert.equal(ev.x.timed, true);
      assert.equal(ev.x.passed, true);
      assert.equal(ev.x.completed, true);
      assert.equal(ev.x.goalReached, undefined);
      const st = reduce([ev], Q);
      assert.equal(st.hardMocks.length, 1);
      assert.equal(st.mocks.length, 0, 'not an ordinary mock');
      assert.equal(st.hardMocks[0].passed, true);
      assert.equal(st.hardMocks[0].timed, true);
      assert.equal(st.hardMocks[0].total, 10);
      const f = mk(6);
      const r = play(f, 1);
      const fev = f.sessionEvent(r.t);
      assert.equal(fev.n, 10);
      assert.equal(fev.c, 9);
      assert.equal(fev.x.passed, false);
      assert.equal(fev.x.timed, true);
    });
  });

  describe('ptest (numbered practice test)', () => {
    const Q40 = genQuestions(40, 5);
    const { sets, archive } = practiceSets(Q40);
    const mk = (set, seed = 1) => startSession(MODES.ptest, { questions: Q40, state: emptyState(), settings: {}, now: T0, params: { set }, rnd: mulberry32(seed) });

    test('preset: untimed, immediate feedback; the queue is the fixed set', () => {
      assert.equal(PRESETS[MODES.ptest].timerMs, null);
      assert.equal(PRESETS[MODES.ptest].feedback, 'immediate');
      assert.equal(PRESETS[MODES.ptest].endRule, 'queue');
      assert.equal(sets.length, 2);
      const s = mk(1);
      assert.equal(s.total, sets[1].length);
      assert.deepEqual([...s.queue].sort((a, b) => a - b), [...sets[1]].sort((a, b) => a - b));
      // default set is 0 when params.set is missing
      const d = startSession(MODES.ptest, { questions: Q40, state: emptyState(), settings: {}, now: T0, rnd: mulberry32(1) });
      assert.deepEqual([...d.queue].sort((a, b) => a - b), [...sets[0]].sort((a, b) => a - b));
    });

    test('passed only at 100 %: 20/20 -> true, 19/20 -> false, abort -> false', () => {
      const full = mk(0, 1);
      const r = play(full, 0);
      assert.equal(r.answered, 20);
      assert.equal(full.summary().passed, true);
      assert.equal(full.summary().correct, 20);
      const almost = mk(0, 2);
      const r2 = play(almost, 1);
      assert.equal(r2.answered, 20);
      assert.equal(almost.summary().correct, 19);
      assert.equal(almost.summary().passed, false);
      const ab = mk(0, 3);
      let t = T0;
      for (let i = 0; i < 5; i++) ab.answer(correctOf(ab), { now: (t += 1000) });
      ab.abort(t + 1);
      assert.equal(ab.summary().passed, false, '5/5 but not finished');
    });

    test('sessionEvent(): x.set === params.set (-1 for archive), x.score === correct, n === set size, x.passed', () => {
      const s = mk(1, 4);
      const { t } = play(s, 2);
      const ev = s.sessionEvent(t);
      assert.equal(ev.m, 'ptest');
      assert.equal(ev.x.set, 1);
      assert.equal(ev.x.score, 18);
      assert.equal(ev.c, 18);
      assert.equal(ev.n, sets[1].length);
      assert.equal(ev.x.passed, false);
      assert.equal(ev.x.timed, undefined);
      const a = mk('archive', 5);
      assert.equal(a.total, archive.length);
      assert.deepEqual([...a.queue].sort((x, y) => x - y), archive);
      const ra = play(a, 0);
      const aev = a.sessionEvent(ra.t);
      assert.equal(aev.x.set, -1);
      assert.equal(aev.x.score, archive.length);
      assert.equal(aev.n, archive.length);
      assert.equal(aev.x.passed, true);
      // an aborted test keeps n = set size (like exams) and score = what was correct so far
      const ab = mk(0, 6);
      ab.answer(correctOf(ab), { now: T0 + 1000 });
      ab.abort(T0 + 2000);
      const abev = ab.sessionEvent(T0 + 2000);
      assert.equal(abev.n, sets[0].length);
      assert.equal(abev.x.score, 1);
      assert.equal(abev.x.set, 0);
    });
  });

  describe('marathon', () => {
    test('a wrong answer re-queues the id; the session ends only when pending is zero', () => {
      assert.equal(PRESETS[MODES.marathon].endRule, 'zeroed');
      assert.equal(PRESETS[MODES.marathon].loop, true);
      const s = new Session({ mode: MODES.marathon, questions: Q, queue: [1, 2, 3], now: T0, rnd: mulberry32(3) });
      assert.equal(s.pending.size, 3);
      let t = T0;
      assert.equal(s.current().q.id, 1);
      s.answer(wrongOf(s), { now: (t += 1000) });
      assert.deepEqual(s.queue, [1, 2, 3, 1]);
      assert.equal(s.total, 4);
      assert.ok(!s.ended);
      s.answer(correctOf(s), { now: (t += 1000) });   // q2 ok
      s.answer(wrongOf(s), { now: (t += 1000) });     // q3 wrong -> requeued
      assert.deepEqual(s.queue, [1, 2, 3, 1, 3]);
      assert.equal(s.current().q.id, 1);
      s.answer(correctOf(s), { now: (t += 1000) });   // q1 ok
      assert.ok(!s.ended, 'q3 still owed');
      assert.equal(s.pending.size, 1);
      assert.equal(s.current().q.id, 3);
      s.answer(wrongOf(s), { now: (t += 1000) });     // q3 wrong again
      assert.ok(!s.ended);
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
      assert.equal(sum.passed, null);
      const ev = s.sessionEvent(t);
      assert.deepEqual(ev.w, [1, 3]);
      assert.equal(ev.n, 6, 'n = answered count');
      assert.equal(ev.x.completed, true);
    });

    test('buildQueue(marathon) is the whole pool once (archive only when included); aborting with pending -> completed false', () => {
      const G = genQuestions(6, 2);
      assert.deepEqual([...buildQueue(MODES.marathon, G, emptyState(), {}, T0, {}, mulberry32(1))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
      assert.deepEqual([...buildQueue(MODES.marathon, G, emptyState(), { includeArchive: true }, T0, {}, mulberry32(1))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
      const s = new Session({ mode: MODES.marathon, questions: Q, queue: [1, 2], now: T0, rnd: mulberry32(3) });
      s.answer(wrongOf(s), { now: T0 + 1 });
      s.abort(T0 + 2);
      assert.equal(s.summary().completed, false);
      assert.equal(s.pending.size, 2);
    });
  });

  describe('goal (continue toward the daily goal)', () => {
    test('buildQueue(goal, ..., {remaining: 7}) returns 7 distinct ids; default remaining is 20; min 5', () => {
      const G = genQuestions(30);
      const q7 = buildQueue(MODES.goal, G, emptyState(), {}, T0, { remaining: 7 }, mulberry32(1));
      assert.equal(q7.length, 7);
      assert.equal(new Set(q7).size, 7);
      assert.equal(buildQueue(MODES.goal, G, emptyState(), {}, T0, {}, mulberry32(1)).length, 20);
      assert.equal(buildQueue(MODES.goal, G, emptyState(), {}, T0, { remaining: 2 }, mulberry32(1)).length, 5);
      const s = startSession(MODES.goal, { questions: G, state: emptyState(), settings: {}, now: T0, params: { remaining: 7 }, rnd: mulberry32(2) });
      assert.equal(s.total, 7);
      assert.equal(PRESETS[MODES.goal].feedback, 'immediate');
      assert.equal(PRESETS[MODES.goal].timerMs, null);
    });

    test('sessionEvent(now, {goalReached: true}) sets x.goalReached true; absent otherwise (any mode)', () => {
      const G = genQuestions(30);
      const s = startSession(MODES.goal, { questions: G, state: emptyState(), settings: {}, now: T0, params: { remaining: 7 }, rnd: mulberry32(2) });
      const { t } = play(s, 1);
      const reached = s.sessionEvent(t, { goalReached: true });
      assert.equal(reached.x.goalReached, true);
      assert.equal(reached.m, 'goal');
      assert.equal(reached.n, 7);
      assert.equal(reached.c, 6);
      const not = s.sessionEvent(t, { goalReached: false });
      assert.equal('goalReached' in not.x, false);
      const plain = s.sessionEvent(t);
      assert.equal('goalReached' in plain.x, false);
      // the flag is honoured on every mode, e.g. a practice session that crossed the goal
      const p = new Session({ mode: MODES.practice, questions: Q, queue: [1], now: T0, rnd: mulberry32(1) });
      p.answer(p.current().q.correct, { now: T0 + 500 });
      assert.equal(p.sessionEvent(T0 + 500, { goalReached: true }).x.goalReached, true);
      assert.equal('goalReached' in p.sessionEvent(T0 + 500).x, false);
      // and the reducer turns it into a streak day
      const st = reduce([reached], G);
      assert.equal(st.dueDays.length, 1);
    });
  });
});
