import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../../src/engine/constants.js';
import { dayKey } from '../../src/engine/time.js';
import { reduce, emptyQ, isSolid, isMastered, mastery, readiness, dueList, dueStreak, dueForPromotion, binNeedsToday, inBin } from '../../src/engine/reducer.js';
import { QUESTIONS, BOOKLET_IDS, T0, MIDNIGHT, H, D, ans, session, reset, promoteN, resetIds, mulberry32 } from './fixtures.js';

beforeEach(() => resetIds());

const q = (state, id) => state.q[id];

describe('reducer: level promotion', () => {
  test('first correct shuffled in-time answer promotes 0 → 1 without any gap', () => {
    const st = reduce([ans(1, T0, true)], QUESTIONS);
    assert.equal(q(st, 1).level, 1);
    assert.equal(q(st, 1).lastPromoT, T0);
    assert.deepEqual(q(st, 1).promoDays, [dayKey(T0)]);
  });

  test('promotion requires sh:true (unshuffled options never promote)', () => {
    const st = reduce([ans(1, T0, true, { sh: false })], QUESTIONS);
    assert.equal(q(st, 1).level, 0);
    assert.equal(q(st, 1).seen, 1);
    assert.equal(q(st, 1).correct, 1);
  });

  test('promotion requires rc:false (recall answers never promote)', () => {
    const st = reduce([ans(1, T0, true, { rc: true, sh: true })], QUESTIONS);
    assert.equal(q(st, 1).level, 0);
  });

  test('promotion requires ok:true (a wrong answer never promotes)', () => {
    const st = reduce([ans(1, T0, false)], QUESTIONS);
    assert.equal(q(st, 1).level, 0);
  });

  test('promotion requires ms <= PROMOTION_TIME_LIMIT_MS (15000 promotes, 15001 does not)', () => {
    assert.equal(RULES.PROMOTION_TIME_LIMIT_MS, 15000);
    const okSt = reduce([ans(1, T0, true, { ms: 15000 })], QUESTIONS);
    assert.equal(q(okSt, 1).level, 1);
    const slowSt = reduce([ans(1, T0, true, { ms: 15001 })], QUESTIONS);
    assert.equal(q(slowSt, 1).level, 0);
    assert.equal(q(slowSt, 1).correct, 1, 'still counts as a correct answer');
  });

  test('a per-question time limit (tl) below 15 s is the stricter bound', () => {
    const st = reduce([ans(1, T0, true, { ms: 5001, tl: 5000 })], QUESTIONS);
    assert.equal(q(st, 1).level, 0);
    const st2 = reduce([ans(1, T0, true, { ms: 5000, tl: 5000 })], QUESTIONS);
    assert.equal(q(st2, 1).level, 1);
  });

  test('a second correct answer 1 h after the first promotion does NOT promote', () => {
    const st = reduce([ans(1, T0, true), ans(1, T0 + H, true)], QUESTIONS);
    assert.equal(q(st, 1).level, 1);
    assert.equal(q(st, 1).lastPromoT, T0, 'lastPromoT unchanged by the blocked answer');
    assert.equal(q(st, 1).correct, 2);
  });

  test('a second correct answer 7h59m59s later does NOT promote; exactly 8 h later does', () => {
    const st = reduce([ans(1, T0, true), ans(1, T0 + 8 * H - 1000, true)], QUESTIONS);
    assert.equal(q(st, 1).level, 1);
    const st2 = reduce([ans(1, T0, true), ans(1, T0 + 8 * H, true)], QUESTIONS);
    assert.equal(q(st2, 1).level, 2);
    assert.equal(q(st2, 1).lastPromoT, T0 + 8 * H);
  });

  test('level 5 requires promotions on >= 3 distinct local days: 5 answers 8 h apart within 2 days stop at level 4', () => {
    // 00:00, 08:00, 16:00 (day 1), 00:00, 08:00 (day 2) → level 4 only.
    const evs = promoteN(1, MIDNIGHT, 5);
    const st = reduce(evs, QUESTIONS);
    assert.equal(new Set(evs.map((e) => dayKey(e.t))).size, 2, 'fixture spans exactly 2 calendar days');
    assert.equal(q(st, 1).level, 4);
    assert.equal(q(st, 1).promoDays.length, 2);
    assert.equal(q(st, 1).correct, 5);
  });

  test('level 5 is reached once a promotion lands on a third distinct day', () => {
    const evs = promoteN(1, MIDNIGHT, 5);
    evs.push(ans(1, MIDNIGHT + 2 * D, true)); // day 3, 00:00 (>= 8 h after the last promotion)
    const st = reduce(evs, QUESTIONS);
    assert.equal(q(st, 1).level, 5);
    assert.equal(q(st, 1).promoDays.length, 3);
  });

  test('level never exceeds MAX_LEVEL (5)', () => {
    const st = reduce(promoteN(1, MIDNIGHT, 12), QUESTIONS);
    assert.equal(q(st, 1).level, RULES.MAX_LEVEL);
  });
});

describe('reducer: wrong answers, demotion and the bin', () => {
  test('wrong → level = max(0, level − 2) and the question enters the bin', () => {
    const evs = promoteN(1, MIDNIGHT, 3); // level 3
    evs.push(ans(1, MIDNIGHT + 3 * 8 * H, false));
    const st = reduce(evs, QUESTIONS);
    assert.equal(q(st, 1).level, 1);
    assert.ok(inBin(q(st, 1)));
    assert.equal(q(st, 1).bin.since, MIDNIGHT + 3 * 8 * H);
    assert.deepEqual(q(st, 1).bin.days, []);
    assert.equal(q(st, 1).wrong, 1);
  });

  test('wrong at level 1 floors at 0 (never negative)', () => {
    const st = reduce([ans(1, T0, true), ans(1, T0 + H, false)], QUESTIONS);
    assert.equal(q(st, 1).level, 0);
  });

  test('a plain wrong keeps promoDays (only hard/sure resets them)', () => {
    const evs = promoteN(1, MIDNIGHT, 4);
    evs.push(ans(1, MIDNIGHT + 4 * 8 * H, false));
    const st = reduce(evs, QUESTIONS);
    assert.equal(q(st, 1).level, 2);
    assert.equal(q(st, 1).promoDays.length, 2);
    assert.notEqual(q(st, 1).lastPromoT, null);
  });

  test('hd:true on a wrong answer → level 0 and promoDays/lastPromoT reset', () => {
    const evs = promoteN(1, MIDNIGHT, 4);
    evs.push(ans(1, MIDNIGHT + 4 * 8 * H, false, { hd: true }));
    const st = reduce(evs, QUESTIONS);
    assert.equal(q(st, 1).level, 0);
    assert.deepEqual(q(st, 1).promoDays, []);
    assert.equal(q(st, 1).lastPromoT, null);
    assert.ok(inBin(q(st, 1)));
  });

  test("cf:'sure' on a wrong answer → level 0 and promoDays reset", () => {
    const evs = promoteN(1, MIDNIGHT, 4);
    evs.push(ans(1, MIDNIGHT + 4 * 8 * H, false, { cf: 'sure' }));
    const st = reduce(evs, QUESTIONS);
    assert.equal(q(st, 1).level, 0);
    assert.deepEqual(q(st, 1).promoDays, []);
    assert.equal(q(st, 1).lastPromoT, null);
  });

  test("cf:'sure' on a CORRECT answer does not reset anything", () => {
    const evs = promoteN(1, MIDNIGHT, 2);
    evs.push(ans(1, MIDNIGHT + 2 * 8 * H, true, { cf: 'sure' }));
    const st = reduce(evs, QUESTIONS);
    assert.equal(q(st, 1).level, 3);
  });

  test('bin exit requires 3 correct shuffled answers on 3 distinct days', () => {
    const evs = [ans(1, T0, false), ans(1, T0 + 1 * D, true), ans(1, T0 + 2 * D, true)];
    const st = reduce(evs, QUESTIONS);
    assert.ok(inBin(q(st, 1)), 'still in bin after 2 days');
    assert.equal(q(st, 1).bin.days.length, 2);
    evs.push(ans(1, T0 + 3 * D, true));
    const st2 = reduce(evs, QUESTIONS);
    assert.equal(q(st2, 1).bin, null, 'exits after the 3rd distinct day');
  });

  test('3 correct answers on the SAME day do not exit the bin', () => {
    const evs = [ans(1, T0, false), ans(1, T0 + H, true), ans(1, T0 + 2 * H, true), ans(1, T0 + 3 * H, true)];
    const st = reduce(evs, QUESTIONS);
    assert.ok(inBin(q(st, 1)));
    assert.equal(q(st, 1).bin.days.length, 1);
  });

  test('a correct answer on the same local day as the wrong counts as bin day 1', () => {
    const st = reduce([ans(1, T0, false), ans(1, T0 + H, true)], QUESTIONS);
    assert.deepEqual(q(st, 1).bin.days, [dayKey(T0)]);
  });

  test('a new wrong restarts the bin day count', () => {
    const evs = [ans(1, T0, false), ans(1, T0 + 1 * D, true), ans(1, T0 + 2 * D, true), ans(1, T0 + 2 * D + H, false), ans(1, T0 + 3 * D, true)];
    const st = reduce(evs, QUESTIONS);
    assert.ok(inBin(q(st, 1)));
    assert.equal(q(st, 1).bin.since, T0 + 2 * D + H);
    assert.deepEqual(q(st, 1).bin.days, [dayKey(T0 + 3 * D)]);
  });

  test('unshuffled correct answers do not count toward bin exit', () => {
    const evs = [ans(1, T0, false), ans(1, T0 + 1 * D, true, { sh: false }), ans(1, T0 + 2 * D, true, { sh: false }), ans(1, T0 + 3 * D, true, { sh: false })];
    const st = reduce(evs, QUESTIONS);
    assert.ok(inBin(q(st, 1)));
    assert.deepEqual(q(st, 1).bin.days, []);
  });

  test('recall answers (rc:true) count for seen/correct but neither promote nor count toward bin exit', () => {
    const evs = [ans(1, T0, false), ans(1, T0 + 1 * D, true, { rc: true, ch: null }), ans(1, T0 + 2 * D, true, { rc: true, ch: null }), ans(1, T0 + 3 * D, true, { rc: true, ch: null })];
    const st = reduce(evs, QUESTIONS);
    const s = q(st, 1);
    assert.equal(s.seen, 4);
    assert.equal(s.correct, 3);
    assert.equal(s.level, 0);
    assert.ok(inBin(s));
    assert.deepEqual(s.bin.days, []);
  });

  test('timeouts (ch:null, ok:false) count as wrong: demote, enter bin, no wrongChoices entry', () => {
    const evs = promoteN(1, MIDNIGHT, 3);
    evs.push(ans(1, MIDNIGHT + 3 * 8 * H, false, { ch: null }));
    const st = reduce(evs, QUESTIONS);
    const s = q(st, 1);
    assert.equal(s.wrong, 1);
    assert.equal(s.seen, 4);
    assert.equal(s.level, 1);
    assert.ok(inBin(s));
    assert.deepEqual(s.wrongChoices, {});
    assert.deepEqual(s.confusedWith, {});
  });

  test('wrongChoices tallies the chosen wrong index', () => {
    const st = reduce([ans(1, T0, false, { ch: 2 }), ans(1, T0 + H, false, { ch: 2 }), ans(1, T0 + 2 * H, false, { ch: 1 })], QUESTIONS);
    assert.deepEqual(q(st, 1).wrongChoices, { 1: 1, 2: 2 });
  });
});

describe('reducer: confusion detection', () => {
  test("wrong choice whose text equals another question's correct option → confusedWith[other]++", () => {
    // Q3 option 1 is "SHARED" = correct text of Q2 and Q4.
    const st = reduce([ans(3, T0, false, { ch: 1 })], QUESTIONS);
    assert.deepEqual(q(st, 3).confusedWith, { 2: 1, 4: 1 });
  });

  test('wrong choice on a question with similar:[other] → confusedWith[other]++ (even if text differs)', () => {
    const st = reduce([ans(1, T0, false, { ch: 2 })], QUESTIONS);
    assert.deepEqual(q(st, 1).confusedWith, { 2: 1 });
  });

  test('confusion counts accumulate and never point at the question itself', () => {
    // Q2 wrong twice → similar [1] twice. Q4 wrong ch 1 → no text/similar hit.
    const st = reduce([ans(2, T0, false, { ch: 0 }), ans(2, T0 + H, false, { ch: 2 }), ans(4, T0 + 2 * H, false, { ch: 1 })], QUESTIONS);
    assert.deepEqual(q(st, 2).confusedWith, { 1: 2 });
    assert.deepEqual(q(st, 4).confusedWith, {});
    assert.ok(!(2 in q(st, 2).confusedWith));
  });

  test('a correct answer never records confusion', () => {
    const st = reduce([ans(3, T0, true)], QUESTIONS);
    assert.deepEqual(q(st, 3).confusedWith, {});
  });
});

describe('reducer: reset, sessions, streaks, due list', () => {
  test('events at/before the latest reset are ignored; later ones apply', () => {
    const evs = [ans(1, T0, true), ans(2, T0 + H, true), reset(T0 + H), ans(1, T0 + 2 * H, true)];
    const st = reduce(evs, QUESTIONS);
    assert.equal(st.resetAt, T0 + H);
    assert.equal(q(st, 2), undefined, 'answer exactly at the reset timestamp is dropped');
    assert.equal(q(st, 1).seen, 1);
    assert.equal(st.counts.answers, 1);
  });

  test('the LATEST reset wins when there are several', () => {
    const evs = [reset(T0), ans(1, T0 + H, true), reset(T0 + 2 * H), ans(1, T0 + 3 * H, true), ans(1, T0 + 4 * H, true)];
    const st = reduce(evs, QUESTIONS);
    assert.equal(st.resetAt, T0 + 2 * H);
    assert.equal(q(st, 1).seen, 2);
  });

  test('answers for unknown question ids are ignored', () => {
    const st = reduce([{ ...ans(1, T0, true), q: 999 }], QUESTIONS);
    assert.deepEqual(st.q, {});
    assert.equal(st.counts.answers, 0);
    assert.equal(st.counts.events, 1);
  });

  test('session events are routed: exam → mocks, gauntlets, sudden best, due days', () => {
    const evs = [
      session(T0, 'exam', { n: 10, c: 9, x: { timed: true, passed: true } }),
      session(T0 + H, 'gauntlet139', { n: 4, c: 4 }),
      session(T0 + 2 * H, 'gauntlet172', { n: 6, c: 6 }),
      session(T0 + 3 * H, 'sudden', { n: 7, c: 7, x: { run: 7 } }),
      session(T0 + 4 * H, 'sudden', { n: 3, c: 3, x: { run: 3 } }),
      session(T0 + 5 * H, 'sudden', { n: 5, c: 5 }), // no x.run → falls back to correct
      session(T0 + 6 * H, 'due', { n: 2, c: 2, x: { completed: true } }),
      session(T0 + 7 * H, 'due', { n: 2, c: 1, x: { completed: false } }),
    ];
    const st = reduce(evs, QUESTIONS);
    assert.equal(st.sessions.length, 8);
    assert.equal(st.mocks.length, 1);
    assert.equal(st.mocks[0].timed, true);
    assert.equal(st.mocks[0].passed, true);
    assert.equal(st.gauntlet139.length, 1);
    assert.equal(st.gauntlet172.length, 1);
    assert.equal(st.sudden.best, 7);
    assert.deepEqual(st.sudden.runs.map((r) => r.run), [7, 3, 5]);
    assert.deepEqual(st.dueDays, [dayKey(T0 + 6 * H)]);
  });

  test('dueStreak counts consecutive due days ending today', () => {
    const now = T0 + 5 * D;
    const evs = [0, 1, 2].map((k) => session(now - k * D, 'due', { x: { completed: true } }));
    const st = reduce(evs, QUESTIONS);
    assert.equal(dueStreak(st, now), 3);
  });

  test('dueStreak counts consecutive days ending yesterday when today is not done yet', () => {
    const now = T0 + 5 * D;
    const evs = [1, 2].map((k) => session(now - k * D, 'due', { x: { completed: true } }));
    const st = reduce(evs, QUESTIONS);
    assert.equal(dueStreak(st, now), 2);
  });

  test('dueStreak is 0 when the last due day was 2+ days ago, and a gap breaks the chain', () => {
    const now = T0 + 5 * D;
    const st = reduce([session(now - 2 * D, 'due', { x: { completed: true } })], QUESTIONS);
    assert.equal(dueStreak(st, now), 0);
    const st2 = reduce([0, 1, 3, 4].map((k) => session(now - k * D, 'due', { x: { completed: true } })), QUESTIONS);
    assert.equal(dueStreak(st2, now), 2);
  });

  test('dueList includes unseen + due-for-promotion + bin-needs-today, excludes the rest', () => {
    const now = T0 + 10 * D;
    const evs = [
      ...promoteN(1, MIDNIGHT, 7),                            // q1: level 5 (7th answer lands on day 3), not in bin → excluded
      ans(2, now - H, true),                                  // q2: level 1 promoted 1h ago → excluded
      ans(3, now - 9 * H, true),                              // q3: level 1 promoted 9h ago → due
      ans(4, now - 30 * H, true), ans(4, now - 20 * H, false), ans(4, now - H, true), // q4: -1h correct promoted (29h gap) and hit the bin today → excluded
      // q5 unseen → included; q6: in bin, no hit today → included
      ans(6, now - 2 * D, true), ans(6, now - 2 * D + H, false),
    ];
    const st = reduce(evs, QUESTIONS);
    assert.equal(q(st, 1).level, 5);
    assert.ok(!dueForPromotion(q(st, 2), now));
    assert.ok(dueForPromotion(q(st, 3), now));
    assert.ok(binNeedsToday(q(st, 6), now));
    assert.ok(!binNeedsToday(q(st, 4), now), 'q4 already had its bin hit today');
    assert.ok(!dueForPromotion(q(st, 4), now), 'q4 was promoted 1h ago');
    assert.deepEqual(dueList(st, QUESTIONS, now), [3, 5, 6]);
  });

  test('dueList: an in-bin question that already had its hit today but is due for promotion is still listed', () => {
    const now = T0 + 10 * D;
    // wrong at -20h (level 0), correct at -10h (promotes, lastPromoT = -10h), correct at -3h (7h gap → blocked; bin day = today)
    const evs = [ans(1, now - 20 * H, false), ans(1, now - 10 * H, true), ans(1, now - 3 * H, true)];
    const st = reduce(evs, QUESTIONS);
    assert.equal(q(st, 1).level, 1);
    assert.ok(inBin(q(st, 1)));
    assert.ok(dueForPromotion(q(st, 1), now));
    assert.ok(!binNeedsToday(q(st, 1), now));
    assert.ok(dueList(st, QUESTIONS, now).includes(1));
  });
});

describe('reducer: isSolid / isMastered / mastery', () => {
  function solidQ(over = {}) {
    const s = emptyQ();
    Object.assign(s, { seen: 10, correct: 10, wrong: 0, level: 5, last: [true, true, true, true, true], ms: Array(10).fill(6000) }, over);
    return s;
  }
  test('a canonical solid state is solid', () => assert.ok(isSolid(solidQ())));
  test('isSolid boundary: seen 9 → false, seen 10 → true', () => {
    assert.ok(!isSolid(solidQ({ seen: 9, correct: 9, ms: Array(9).fill(1000) })));
    assert.ok(isSolid(solidQ({ seen: 10, correct: 10 })));
  });
  test('isSolid boundary: accuracy 0.9 → true, 0.85 → false', () => {
    assert.ok(isSolid(solidQ({ seen: 20, correct: 18, wrong: 2, ms: Array(20).fill(1000) })));
    assert.ok(!isSolid(solidQ({ seen: 20, correct: 17, wrong: 3, ms: Array(20).fill(1000) })));
  });
  test('isSolid boundary: last 5 must all be correct', () => {
    assert.ok(!isSolid(solidQ({ seen: 20, correct: 19, wrong: 1, last: [true, true, true, true, false] })));
    assert.ok(!isSolid(solidQ({ seen: 20, correct: 19, wrong: 1, last: [false, true, true, true, true] })));
    assert.ok(!isSolid(solidQ({ last: [true, true, true, true] })), 'fewer than 5 recorded answers');
  });
  test('isSolid boundary: median ms 6000 → true, 6001 → false', () => {
    assert.ok(isSolid(solidQ({ ms: Array(10).fill(6000) })));
    assert.ok(!isSolid(solidQ({ ms: Array(10).fill(6001) })));
    // even count: median = mean of the two middle values → 6000 passes, 6001 fails
    assert.ok(isSolid(solidQ({ ms: [1, 1, 1, 1, 5000, 7000, 9999, 9999, 9999, 9999] })));
    assert.ok(!isSolid(solidQ({ ms: [1, 1, 1, 1, 5000, 7002, 9999, 9999, 9999, 9999] })));
  });
  test('isSolid(undefined) is false', () => assert.ok(!isSolid(undefined)));
  test('isMastered = level 5 && solid', () => {
    assert.ok(isMastered(solidQ()));
    assert.ok(!isMastered(solidQ({ level: 4 })));
    assert.ok(!isMastered(solidQ({ ms: Array(10).fill(7000) })));
    assert.ok(!isMastered(undefined));
  });
  test('isSolid derives from real events (10 correct, fast) and fails with a slow median', () => {
    const fast = reduce(promoteN(1, MIDNIGHT, 10, { ms: 2000 }), QUESTIONS);
    assert.ok(isSolid(q(fast, 1)));
    assert.ok(isMastered(q(fast, 1)));
    const slow = reduce(promoteN(1, MIDNIGHT, 10, { ms: 7000 }), QUESTIONS);
    assert.ok(!isSolid(q(slow, 1)));
    assert.equal(q(slow, 1).level, 5);
    assert.ok(!isMastered(q(slow, 1)));
  });
  test('mastery() only counts tier booklet', () => {
    const evs = [...promoteN(1, MIDNIGHT, 10), ...promoteN(5, MIDNIGHT, 10), ...promoteN(6, MIDNIGHT, 10)];
    const st = reduce(evs, QUESTIONS);
    assert.ok(isMastered(q(st, 5)) && isMastered(q(st, 6)), 'archive questions are mastered individually');
    const m = mastery(st, QUESTIONS);
    assert.equal(m.total, BOOKLET_IDS.length);
    assert.equal(m.done, 1);
    assert.equal(m.pct, 25);
  });
});

describe('reducer: readiness', () => {
  const mock = (t, correct, over = {}) => session(t, 'exam', { n: 10, c: correct, w: correct === 10 ? [] : [1], x: { timed: true, passed: correct >= 9, completed: true }, ...over });
  const hardMock = (t, correct, over = {}) => session(t, 'hardexam', { n: 10, c: correct, w: correct === 10 ? [] : [1], x: { timed: true, passed: correct === 10, completed: true }, ...over });
  const NOW = T0 + 30 * D;
  function allMastered() {
    return BOOKLET_IDS.flatMap((id) => promoteN(id, MIDNIGHT, 10, { ms: 2000 }));
  }
  // The 5th gate: RULES.READY_HARD_EXAMS perfect timed hard simulators (3).
  function hardPass(n = RULES.READY_HARD_EXAMS) {
    return Array.from({ length: n }, (_, i) => hardMock(NOW - D + 2 * H + i * H, 10));
  }
  function fullPass() {
    return [
      ...allMastered(),
      mock(NOW - 4 * D, 10), mock(NOW - 4 * D + H, 10), mock(NOW - 3 * D, 10), mock(NOW - 2 * D, 10), mock(NOW - 2 * D + H, 10),
      session(NOW - D, 'gauntlet139', { n: BOOKLET_IDS.length, c: BOOKLET_IDS.length, w: [], x: { completed: true } }),
      session(NOW - D + H, 'sudden', { n: 60, c: 60, x: { run: 60 } }),
      ...hardPass(),
    ];
  }

  test('all five gates pass → ready', () => {
    const r = readiness(reduce(fullPass(), QUESTIONS), QUESTIONS);
    assert.ok(r.masteryOk); assert.ok(r.mocksOk); assert.ok(r.gauntletOk); assert.ok(r.suddenOk); assert.ok(r.hardOk);
    assert.ok(r.ready);
    assert.equal(r.consecutivePerfect, 5);
    assert.equal(r.mockDays, 3);
    assert.equal(r.hardPerfect, 3);
    assert.equal(r.hardNeeded, RULES.READY_HARD_EXAMS);
  });

  test('empty state → not ready and every gate false', () => {
    const r = readiness(reduce([], QUESTIONS), QUESTIONS);
    assert.ok(!r.ready && !r.masteryOk && !r.mocksOk && !r.gauntletOk && !r.suddenOk && !r.hardOk);
    assert.equal(r.hardPerfect, 0);
  });

  test('hard-exam gate: the other four gates satisfied but only 2 perfect hard exams → ready false, hardOk false; with 3 → ready', () => {
    const base = fullPass().filter((e) => e.m !== 'hardexam');
    const two = readiness(reduce([...base, ...hardPass(2)], QUESTIONS), QUESTIONS);
    assert.ok(two.masteryOk && two.mocksOk && two.gauntletOk && two.suddenOk, 'the other four gates hold');
    assert.equal(two.hardPerfect, 2);
    assert.ok(!two.hardOk);
    assert.ok(!two.ready);
    const three = readiness(reduce([...base, ...hardPass(3)], QUESTIONS), QUESTIONS);
    assert.equal(three.hardPerfect, 3);
    assert.ok(three.hardOk);
    assert.ok(three.ready);
    const none = readiness(reduce(base, QUESTIONS), QUESTIONS);
    assert.ok(!none.ready && !none.hardOk);
    assert.equal(none.hardPerfect, 0);
  });

  test('hard-exam gate: only timed, 10-question, 10/10 runs count; failed runs in between do not reset the count', () => {
    const base = fullPass().filter((e) => e.m !== 'hardexam');
    const untimed = hardPass(3).map((e) => ({ ...e, x: { ...e.x, timed: false } }));
    assert.ok(!readiness(reduce([...base, ...untimed], QUESTIONS), QUESTIONS).hardOk, 'untimed');
    const short = hardPass(3).map((e) => ({ ...e, n: 9, c: 9 }));
    assert.ok(!readiness(reduce([...base, ...short], QUESTIONS), QUESTIONS).hardOk, 'total !== 10');
    const mixed = [...base, hardMock(NOW - D + 2 * H, 10), hardMock(NOW - D + 3 * H, 9), hardMock(NOW - D + 4 * H, 10), hardMock(NOW - D + 5 * H, 8), hardMock(NOW - D + 6 * H, 10)];
    const r = readiness(reduce(mixed, QUESTIONS), QUESTIONS);
    assert.equal(r.hardPerfect, 3, 'perfect hard exams are counted, not required to be consecutive');
    assert.ok(r.hardOk && r.ready);
    // ordinary mocks never satisfy the hard gate and vice versa
    const asExam = hardPass(3).map((e) => ({ ...e, m: 'exam' }));
    assert.ok(!readiness(reduce([...base, ...asExam], QUESTIONS), QUESTIONS).hardOk);
  });

  test('mastery gate: one booklet question not mastered → masteryOk false', () => {
    const evs = fullPass().filter((e) => !(e.k === 'answer' && e.q === 4));
    const r = readiness(reduce(evs, QUESTIONS), QUESTIONS);
    assert.ok(!r.masteryOk); assert.ok(!r.ready);
    assert.ok(r.mocksOk && r.gauntletOk && r.suddenOk);
  });

  test('mocks gate: 5 perfect timed mocks on only 2 distinct days → not ok', () => {
    const evs = [...allMastered(), mock(NOW - 2 * D, 10), mock(NOW - 2 * D + H, 10), mock(NOW - 2 * D + 2 * H, 10), mock(NOW - D, 10), mock(NOW - D + H, 10)];
    const r = readiness(reduce(evs, QUESTIONS), QUESTIONS);
    assert.equal(r.consecutivePerfect, 5);
    assert.equal(r.mockDays, 2);
    assert.ok(!r.mocksOk);
  });

  test('mocks gate: only 4 perfect mocks → not ok', () => {
    const evs = [mock(NOW - 4 * D, 10), mock(NOW - 3 * D, 10), mock(NOW - 2 * D, 10), mock(NOW - D, 10)];
    const r = readiness(reduce(evs, QUESTIONS), QUESTIONS);
    assert.ok(!r.mocksOk);
    assert.equal(r.consecutivePerfect, 4);
  });

  test('mocks gate: a failed mock AFTER 5 perfect ones breaks the streak', () => {
    const evs = [...fullPass(), mock(NOW - H, 8)];
    const r = readiness(reduce(evs, QUESTIONS), QUESTIONS);
    assert.ok(!r.mocksOk); assert.ok(!r.ready);
    assert.equal(r.consecutivePerfect, 0);
  });

  test('mocks gate: a failed mock BEFORE 5 perfect ones does not matter', () => {
    const evs = [mock(NOW - 10 * D, 5), ...fullPass()];
    const r = readiness(reduce(evs, QUESTIONS), QUESTIONS);
    assert.ok(r.mocksOk); assert.ok(r.ready);
  });

  test('mocks gate: untimed mocks are ignored (even if perfect)', () => {
    const evs = fullPass().map((e) => (e.m === 'exam' ? { ...e, x: { ...e.x, timed: false } } : e));
    const r = readiness(reduce(evs, QUESTIONS), QUESTIONS);
    assert.ok(!r.mocksOk);
    assert.equal(r.consecutivePerfect, 0);
  });

  test('mocks gate: an untimed failed mock in between does not break a timed streak', () => {
    const evs = [...fullPass(), session(NOW - H, 'exam', { n: 10, c: 3, w: [1, 2, 3, 4, 5, 6, 7], x: { timed: false, passed: false } })];
    const r = readiness(reduce(evs, QUESTIONS), QUESTIONS);
    assert.ok(r.mocksOk);
  });

  test('mocks gate: only mocks with total === 10 count', () => {
    const evs = fullPass().map((e) => (e.m === 'exam' ? { ...e, n: 9, c: 9 } : e));
    const r = readiness(reduce(evs, QUESTIONS), QUESTIONS);
    assert.ok(!r.mocksOk);
  });

  test('gauntlet gate requires total === booklet count, zero wrongs and x.completed', () => {
    const base = allMastered();
    const g = (over) => session(NOW - D, 'gauntlet139', { n: BOOKLET_IDS.length, c: BOOKLET_IDS.length, w: [], x: { completed: true }, ...over });
    assert.ok(readiness(reduce([...base, g({})], QUESTIONS), QUESTIONS).gauntletOk);
    assert.ok(!readiness(reduce([...base, g({ n: BOOKLET_IDS.length - 1 })], QUESTIONS), QUESTIONS).gauntletOk, 'short total');
    assert.ok(!readiness(reduce([...base, g({ w: [1], c: BOOKLET_IDS.length - 1 })], QUESTIONS), QUESTIONS).gauntletOk, 'one wrong');
    assert.ok(!readiness(reduce([...base, g({ x: { completed: false } })], QUESTIONS), QUESTIONS).gauntletOk, 'not completed');
    assert.ok(!readiness(reduce([...base, g({ x: {} })], QUESTIONS), QUESTIONS).gauntletOk, 'no completed flag');
    assert.ok(!readiness(reduce([...base, { ...g({}), m: 'gauntlet172' }], QUESTIONS), QUESTIONS).gauntletOk, 'gauntlet172 does not satisfy the 139 gate');
  });

  test('sudden gate: best >= 60 (59 fails, 60 passes, best is the max over runs)', () => {
    const r59 = readiness(reduce([session(NOW, 'sudden', { x: { run: 59 } })], QUESTIONS), QUESTIONS);
    assert.ok(!r59.suddenOk); assert.equal(r59.suddenBest, 59);
    const r60 = readiness(reduce([session(NOW, 'sudden', { x: { run: 12 } }), session(NOW + H, 'sudden', { x: { run: 60 } }), session(NOW + 2 * H, 'sudden', { x: { run: 2 } })], QUESTIONS), QUESTIONS);
    assert.ok(r60.suddenOk); assert.equal(r60.suddenBest, 60);
  });
});

describe('reducer: determinism', () => {
  test('~300 seeded random events reduce to identical state in any order (original, reversed, 5 shuffles)', () => {
    const rnd = mulberry32(20260914);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const evs = [];
    let t = T0;
    for (let i = 0; i < 300; i++) {
      t += 60 * 1000 + Math.floor(rnd() * 5 * H); // strictly increasing; avg gap keeps promotions/bins active
      const id = `r${String(i).padStart(4, '0')}`;
      if (i === 100) { evs.push({ id, t, k: 'reset' }); continue; }
      if (rnd() < 0.85) {
        const qq = pick(QUESTIONS);
        const ok = rnd() < 0.7;
        const ch = ok ? qq.correct : (rnd() < 0.15 ? null : pick(qq.options.map((_, k) => k).filter((k) => k !== qq.correct)));
        evs.push({ id, t, k: 'answer', q: qq.id, ch, ok, ms: Math.floor(rnd() * 20000), m: pick(['practice', 'exam', 'speed', 'recall', 'hard']), s: `s${i % 7}`,
          cf: pick([null, 'sure', 'unsure']), sh: rnd() < 0.8, tl: rnd() < 0.2 ? 5000 : null, hd: rnd() < 0.2, rc: rnd() < 0.1 });
      } else {
        const m = pick(['exam', 'gauntlet139', 'gauntlet172', 'sudden', 'due', 'practice', 'ptest', 'hardexam', 'goal', 'marathon']);
        const c = Math.floor(rnd() * 11);
        const x = { timed: rnd() < 0.5, completed: rnd() < 0.5, run: Math.floor(rnd() * 70) };
        if (m === 'ptest') { x.set = pick([-1, 0, 1, 2]); x.score = c; x.passed = c === 10; }
        if (m === 'hardexam') x.passed = c === 10;
        if (m === 'goal' || rnd() < 0.2) x.goalReached = rnd() < 0.6;
        evs.push({ id, t, k: 'session', s: `s${i}`, m, n: 10, c, w: [], d: 1000, x });
      }
    }
    // A few events share a timestamp to exercise the (t, id) tie-break.
    evs[5].t = evs[6].t; evs[200].t = evs[201].t;
    const canon = JSON.stringify(reduce(evs, QUESTIONS));
    assert.ok(canon.length > 2000, 'state is non-trivial');
    assert.equal(JSON.stringify(reduce([...evs].reverse(), QUESTIONS)), canon, 'reversed order');
    for (let k = 0; k < 5; k++) {
      const sh = [...evs];
      for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
      assert.equal(JSON.stringify(reduce(sh, QUESTIONS)), canon, `shuffle #${k + 1}`);
    }
  });
});

// ---------- Genie-style additions: practice tests, hard simulators, goal days ----------
import { sanitizeEvent } from '../../src/engine/events.js';
import { uuid } from '../../src/engine/shuffle.js';

describe('reducer: practice tests (ptests) and hard simulators (hardMocks)', () => {
  const ptest = (t, set, score, over = {}) => session(t, 'ptest', { n: 20, c: score, w: score === 20 ? [] : [1], x: { completed: true, endReason: 'done', set, score, passed: score === 20 }, ...over });
  const hardMock = (t, correct, over = {}) => session(t, 'hardexam', { n: 10, c: correct, w: correct === 10 ? [] : [1], x: { timed: true, passed: correct === 10, completed: true }, ...over });

  test('ptest sessions update state.ptests[set]: best = max correct, attempts count, passed sticks once any run passed', () => {
    const evs = [ptest(T0, 0, 15), ptest(T0 + H, 0, 18), ptest(T0 + 2 * H, 0, 12), ptest(T0 + 3 * H, 1, 20), ptest(T0 + 4 * H, 1, 17)];
    const st = reduce(evs, QUESTIONS);
    assert.deepEqual(Object.keys(st.ptests).sort(), ['0', '1']);
    assert.equal(st.ptests[0].best, 18);
    assert.equal(st.ptests[0].attempts, 3);
    assert.equal(st.ptests[0].passed, false);
    assert.equal(st.ptests[0].last, T0 + 2 * H);
    assert.equal(st.ptests[0].total, 20);
    assert.equal(st.ptests[1].best, 20);
    assert.equal(st.ptests[1].attempts, 2);
    assert.equal(st.ptests[1].passed, true, 'a later 17/20 does not un-pass the set');
    assert.equal(st.sessions.length, 5, 'every ptest also lands in the generic session list');
    assert.equal(st.mocks.length, 0);
    assert.equal(st.hardMocks.length, 0);
  });

  test('ptest: the archive test is keyed -1; a missing x.set falls back to 0; best never decreases', () => {
    const st = reduce([ptest(T0, -1, 9, { n: 19 }), ptest(T0 + H, -1, 19, { n: 19 }), session(T0 + 2 * H, 'ptest', { n: 20, c: 7, x: {} })], QUESTIONS);
    assert.equal(st.ptests[-1].best, 19);
    assert.equal(st.ptests[-1].attempts, 2);
    assert.equal(st.ptests[-1].total, 19);
    assert.equal(st.ptests[-1].passed, false, 'passed comes from x.passed, not from the score');
    assert.equal(st.ptests[0].best, 7);
    assert.equal(st.ptests[0].attempts, 1);
    assert.equal(st.ptests[0].passed, false);
  });

  test('hardexam sessions land in state.hardMocks with passed/timed (never in mocks)', () => {
    const evs = [hardMock(T0, 10), hardMock(T0 + H, 9), hardMock(T0 + 2 * H, 10, { x: { timed: false, passed: true } })];
    const st = reduce(evs, QUESTIONS);
    assert.equal(st.hardMocks.length, 3);
    assert.equal(st.mocks.length, 0);
    assert.deepEqual(st.hardMocks.map((m) => m.passed), [true, false, true]);
    assert.deepEqual(st.hardMocks.map((m) => m.timed), [true, true, false]);
    assert.deepEqual(st.hardMocks.map((m) => m.correct), [10, 9, 10]);
    assert.deepEqual(st.hardMocks.map((m) => m.total), [10, 10, 10]);
    assert.equal(st.hardMocks[1].wrongs.length, 1);
    assert.equal(st.hardMocks[0].mode, 'hardexam');
    const r = readiness(st, QUESTIONS);
    assert.equal(r.hardPerfect, 1, 'only timed 10/10 runs count');
    assert.ok(!r.hardOk);
    // missing x → not passed, not timed
    const bare = reduce([session(T0, 'hardexam', { n: 10, c: 10 })], QUESTIONS);
    assert.equal(bare.hardMocks[0].passed, false);
    assert.equal(bare.hardMocks[0].timed, false);
  });

  test('emptyState carries ptests {} and hardMocks []', () => {
    const st = reduce([], QUESTIONS);
    assert.deepEqual(st.ptests, {});
    assert.deepEqual(st.hardMocks, []);
  });
});

describe('reducer: goal days (x.goalReached) and the streak', () => {
  test('a session with x.goalReached adds its day to dueDays (any mode), once per day', () => {
    const evs = [
      session(T0, 'goal', { n: 7, c: 6, x: { completed: true, goalReached: true } }),
      session(T0 + H, 'practice', { n: 3, c: 3, x: { completed: false, goalReached: true } }), // same day → no duplicate
      session(T0 + D, 'practice', { n: 3, c: 3, x: { completed: true } }),                    // no flag → no day
      session(T0 + 2 * D, 'exam', { n: 10, c: 10, x: { timed: true, passed: true, goalReached: true } }),
      session(T0 + 3 * D, 'goal', { n: 5, c: 5, x: { completed: true, goalReached: false } }), // explicit false → no day
    ];
    const st = reduce(evs, QUESTIONS);
    assert.deepEqual(st.dueDays, [dayKey(T0), dayKey(T0 + 2 * D)]);
    assert.equal(st.mocks.length, 1, 'the exam is still filed as a mock');
  });

  test('dueStreak counts goal days like completed daily drills (mixed chain)', () => {
    const now = T0 + 5 * D;
    const evs = [
      session(now, 'goal', { x: { completed: true, goalReached: true } }),
      session(now - D, 'due', { x: { completed: true } }),
      session(now - 2 * D, 'adaptive', { x: { completed: true, goalReached: true } }),
    ];
    const st = reduce(evs, QUESTIONS);
    assert.equal(st.dueDays.length, 3);
    assert.equal(dueStreak(st, now), 3);
    // the goal day alone gives a streak of 1
    const one = reduce([session(now, 'goal', { x: { completed: false, goalReached: true } })], QUESTIONS);
    assert.equal(dueStreak(one, now), 1);
    // a goal day yesterday + nothing today → 1 (counted from yesterday)
    const y = reduce([session(now - D, 'practice', { x: { goalReached: true } })], QUESTIONS);
    assert.equal(dueStreak(y, now), 1);
  });
});

describe('reducer: sanitizeEvent keeps the new session x keys', () => {
  const NOW_S = Date.UTC(2026, 8, 14, 12);
  test('x.set / x.score / x.goalReached survive; unknown x keys are dropped', () => {
    const e = { id: uuid(), t: NOW_S - 5, k: 'session', s: 'sid', m: 'ptest', n: 20, c: 19, w: [3], d: 60000,
      x: { completed: true, endReason: 'done', set: 2, score: 19, passed: false, goalReached: true, evil: 'y', foo: 1, hint: 'x' } };
    const c = sanitizeEvent(e, NOW_S);
    assert.deepEqual(c.x, { completed: true, passed: false, goalReached: true, set: 2, score: 19, endReason: 'done' });
    assert.equal('evil' in c.x, false);
    // archive set (-1) is kept; out-of-range/non-integer set and negative score are dropped; booleans are coerced
    const a = sanitizeEvent({ ...e, x: { set: -1, score: 4, goalReached: 1 } }, NOW_S);
    assert.deepEqual(a.x, { goalReached: true, set: -1, score: 4 });
    const bad = sanitizeEvent({ ...e, x: { set: -2, score: -1, goalReached: 0 } }, NOW_S);
    assert.deepEqual(bad.x, { goalReached: false });
    const nonInt = sanitizeEvent({ ...e, x: { set: 1.5, score: '19', goalReached: 'yes' } }, NOW_S);
    assert.deepEqual(nonInt.x, { goalReached: true });
    const huge = sanitizeEvent({ ...e, x: { set: 1000 } }, NOW_S);
    assert.deepEqual(huge.x, {});
    // the sanitized copy still reduces to a ptest record
    const st = reduce([c], QUESTIONS);
    assert.equal(st.ptests[2].best, 19);
    assert.equal(st.ptests[2].passed, false);
    assert.deepEqual(st.dueDays, [dayKey(c.t)]);
  });
});
