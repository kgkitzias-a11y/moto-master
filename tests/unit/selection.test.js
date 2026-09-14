import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey } from '../../src/engine/time.js';
import { emptyState, emptyQ, reduce, isMastered } from '../../src/engine/reducer.js';
import { poolFor, weightOf, adaptive, dueToday, trapPairs, hardClusters, wrongBin, examTomorrow, signs, sequential, random } from '../../src/engine/selection.js';
import { QUESTIONS, BOOKLET_IDS, MIDNIGHT, T0, H, D, ans, promoteN, mulberry32 } from './fixtures.js';

const NOW = T0 + 20 * D;

function stateWith(entries) {
  const st = emptyState();
  for (const [id, over] of Object.entries(entries)) st.q[id] = Object.assign(emptyQ(), over);
  return st;
}
const masteredQ = () => ({ seen: 10, correct: 10, wrong: 0, level: 5, last: [true, true, true, true, true], ms: Array(10).fill(1000), lastPromoT: NOW - 3 * D });

describe('selection: pools and basic policies', () => {
  test('poolFor: booklet only by default; archive with the setting or explicit override', () => {
    assert.deepEqual(poolFor(QUESTIONS, {}).map((q) => q.id), BOOKLET_IDS);
    assert.deepEqual(poolFor(QUESTIONS, { includeArchive: true }).map((q) => q.id), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(poolFor(QUESTIONS, { includeArchive: true }, { includeArchive: false }).map((q) => q.id), BOOKLET_IDS);
  });
  test('sequential honours from/to; random(count) truncates; random(0) returns everything', () => {
    assert.deepEqual(sequential(QUESTIONS, { from: 2, to: 4 }), [2, 3, 4]);
    assert.equal(random(QUESTIONS, 2, mulberry32(1)).length, 2);
    assert.deepEqual([...random(QUESTIONS, 0, mulberry32(1))].sort(), [1, 2, 3, 4, 5, 6]);
  });
  test('wrongBin lists only bin questions; signs only image questions; examTomorrow lists weak/bin/unseen', () => {
    const st = reduce([ans(1, T0, false), ans(2, T0, true)], QUESTIONS);
    assert.deepEqual(wrongBin(QUESTIONS, st, mulberry32(1)), [1]);
    assert.deepEqual(signs(QUESTIONS, mulberry32(1)), [4]);
    const stMastered = reduce(promoteN(3, MIDNIGHT, 10, { ms: 1000 }), QUESTIONS);
    const tomorrow = examTomorrow(QUESTIONS, stMastered, mulberry32(1));
    assert.ok(isMastered(stMastered.q[3]));
    assert.ok(!tomorrow.includes(3), 'mastered question is not weak');
    assert.deepEqual([...tomorrow].sort(), [1, 2, 4, 5, 6], 'unseen questions are the weakest kind');
  });
});

describe('selection: adaptive weights', () => {
  test('unseen (6) is heavier than everything; mastered is 0.25 (nearly excluded); weak/bin/due add weight', () => {
    assert.equal(weightOf(QUESTIONS[0], undefined, NOW), 6);
    assert.equal(weightOf(QUESTIONS[0], Object.assign(emptyQ(), { seen: 0 }), NOW), 6);
    assert.equal(weightOf(QUESTIONS[0], Object.assign(emptyQ(), masteredQ()), NOW), 0.25);
    // level 5 but not solid → 1 + 0 = 1 (not due since level is max)
    const l5NotSolid = Object.assign(emptyQ(), masteredQ(), { ms: Array(10).fill(9000) });
    assert.equal(weightOf(QUESTIONS[0], l5NotSolid, NOW), 1);
    // level 2, seen 5/5 correct, promoted 1 h ago → 1 + 3 = 4
    const l2 = Object.assign(emptyQ(), { seen: 5, correct: 5, level: 2, lastPromoT: NOW - H });
    assert.equal(weightOf(QUESTIONS[0], l2, NOW), 4);
    // same but due (9 h ago) → 6; in bin → +3 → 9; accuracy < 0.8 → +2 → 11
    assert.equal(weightOf(QUESTIONS[0], { ...l2, lastPromoT: NOW - 9 * H }, NOW), 6);
    assert.equal(weightOf(QUESTIONS[0], { ...l2, lastPromoT: NOW - 9 * H, bin: { since: NOW - H, days: [] } }, NOW), 9);
    assert.equal(weightOf(QUESTIONS[0], { ...l2, lastPromoT: NOW - 9 * H, bin: { since: NOW - H, days: [] }, seen: 10, correct: 5 }, NOW), 11);
    assert.ok(weightOf(QUESTIONS[0], undefined, NOW) > weightOf(QUESTIONS[0], Object.assign(emptyQ(), masteredQ()), NOW));
  });

  test('sampling: with one unseen and one mastered question, mastered is drawn first < 8% of the time (expected 4%)', () => {
    const pool = QUESTIONS.slice(0, 2); // q1 mastered, q2 unseen
    const st = stateWith({ 1: masteredQ() });
    let masteredFirst = 0;
    const N = 2000;
    for (let seed = 1; seed <= N; seed++) if (adaptive(pool, st, NOW, 1, mulberry32(seed))[0] === 1) masteredFirst++;
    assert.ok(masteredFirst > 0, 'mastered is nearly excluded, not impossible');
    assert.ok(masteredFirst / N < 0.08, `mastered drawn first ${masteredFirst}/${N}`);
  });

  test('sampling without replacement: count caps the output, no duplicates, and all ids eventually appear', () => {
    const st = stateWith({ 1: masteredQ() });
    const out = adaptive(QUESTIONS, st, NOW, 4, mulberry32(3));
    assert.equal(out.length, 4);
    assert.equal(new Set(out).size, 4);
    const full = adaptive(QUESTIONS, st, NOW, 100, mulberry32(3));
    assert.deepEqual([...full].sort(), [1, 2, 3, 4, 5, 6]);
    assert.equal(full[5], 1, 'the mastered question comes last when everything else is unseen (weight 0.25 vs 6)');
  });

  test('unseen questions are drawn before mastered ones in the vast majority of full orderings', () => {
    const pool = QUESTIONS.slice(0, 4);
    const st = stateWith({ 1: masteredQ(), 2: masteredQ() });
    let masteredInTop2 = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const top2 = adaptive(pool, st, NOW, 2, mulberry32(seed));
      if (top2.includes(1) || top2.includes(2)) masteredInTop2++;
    }
    assert.ok(masteredInTop2 / 500 < 0.15, `mastered in top 2: ${masteredInTop2}/500`);
  });
});

describe('selection: dueToday ordering', () => {
  test('bin-needing-today first, then due-for-promotion, then unseen; not-due and satisfied-bin are excluded', () => {
    const today = NOW;
    const st = stateWith({
      1: { seen: 3, correct: 2, wrong: 1, level: 0, lastPromoT: null, bin: { since: today - 2 * D, days: [] } },            // bin needs today
      2: { seen: 2, correct: 2, level: 2, lastPromoT: today - 9 * H },                                                       // due
      3: { seen: 2, correct: 2, level: 2, lastPromoT: today - 1 * H },                                                       // not due → excluded
      4: { seen: 3, correct: 2, wrong: 1, level: 1, lastPromoT: today - 1 * H, bin: { since: today - 2 * D, days: [dayKey(today)] } }, // bin hit today, not due → excluded
      // 5, 6 unseen
    });
    const out = dueToday(QUESTIONS, st, today, mulberry32(1));
    assert.equal(out.length, 4);
    assert.equal(out[0], 1);
    assert.equal(out[1], 2);
    assert.deepEqual([...out.slice(2)].sort(), [5, 6]);
    assert.ok(!out.includes(3));
    assert.ok(!out.includes(4));
  });

  test('a bin question that already had its hit today but is due for promotion lands in the due tier (after bin tier)', () => {
    const st = reduce([
      ans(1, NOW - 2 * D, true), ans(1, NOW - 2 * D + H, false),                    // q1: bin needs today
      ans(2, NOW - 20 * H, false), ans(2, NOW - 10 * H, true), ans(2, NOW - 3 * H, true), // q2: bin hit today, due (promo 10h ago)
      ans(3, NOW - H, true),                                                          // q3: excluded
    ], QUESTIONS);
    const out = dueToday(QUESTIONS.slice(0, 4), st, NOW, mulberry32(2));
    assert.deepEqual(out, [1, 2, 4]);
  });

  test('within a tier the order is shuffled (seed-dependent), tiers never interleave', () => {
    const st = stateWith({
      1: { seen: 1, correct: 0, wrong: 1, level: 0, bin: { since: NOW - D, days: [] } },
      2: { seen: 1, correct: 0, wrong: 1, level: 0, bin: { since: NOW - D, days: [] } },
      3: { seen: 1, correct: 1, level: 1, lastPromoT: NOW - D },
      4: { seen: 1, correct: 1, level: 1, lastPromoT: NOW - D },
    });
    const orders = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const out = dueToday(QUESTIONS, st, NOW, mulberry32(seed));
      assert.deepEqual([...out.slice(0, 2)].sort(), [1, 2]);
      assert.deepEqual([...out.slice(2, 4)].sort(), [3, 4]);
      assert.deepEqual([...out.slice(4)].sort(), [5, 6]);
      orders.add(out.join(','));
    }
    assert.ok(orders.size > 1, 'shuffled within tiers');
  });
});

describe('selection: trapPairs', () => {
  test('returns consecutive similar pairs; each pair is (q, one of q.similar); no id used twice', () => {
    const pool = poolFor(QUESTIONS, { includeArchive: true });
    const byId = new Map(pool.map((q) => [q.id, q]));
    for (let seed = 1; seed <= 20; seed++) {
      const out = trapPairs(pool, 10, mulberry32(seed));
      assert.equal(out.length, 4, 'two pairs: {1,2} and {5,6}');
      assert.equal(new Set(out).size, 4);
      for (let i = 0; i < out.length; i += 2) assert.ok(byId.get(out[i]).similar.includes(out[i + 1]), `${out[i]} → ${out[i + 1]} similar`);
    }
  });
  test('partners outside the pool are ignored (booklet-only pool yields only the 1↔2 pair)', () => {
    const out = trapPairs(poolFor(QUESTIONS, {}), 10, mulberry32(1));
    assert.deepEqual([...out].sort(), [1, 2]);
  });
  test('count limits the number of pairs', () => {
    const out = trapPairs(poolFor(QUESTIONS, { includeArchive: true }), 1, mulberry32(1));
    assert.equal(out.length, 2);
  });
  test('no similar links → empty', () => {
    const noSim = QUESTIONS.map((q) => ({ ...q, similar: [] }));
    assert.deepEqual(trapPairs(noSim, 10, mulberry32(1)), []);
  });
});

describe('selection: hardClusters', () => {
  test('a question with recorded confusions is placed right before its confused partner(s)', () => {
    const st = reduce([ans(3, T0, false, { ch: 1 })], QUESTIONS); // q3 confusedWith {2,4}
    assert.deepEqual(Object.keys(st.q[3].confusedWith), ['2', '4']);
    const out = hardClusters(QUESTIONS, st, 24, mulberry32(1));
    assert.equal(out[0], 3);
    assert.deepEqual([...out.slice(1, 3)].sort(), [2, 4]);
    assert.equal(out.length, 3, 'only questions with confusions/wrongs seed clusters');
  });

  test('a wrong question without text confusion is followed by its similar neighbour', () => {
    const st = reduce([ans(1, T0, false, { ch: 2 })], QUESTIONS); // q1 similar [2] → confusedWith {2}
    const out = hardClusters(QUESTIONS, st, 24, mulberry32(1));
    assert.deepEqual(out, [1, 2]);
  });

  test('clusters from several seeds keep each seed immediately before its partner', () => {
    const st = reduce([ans(3, T0, false, { ch: 1 }), ans(1, T0 + H, false, { ch: 1 })], QUESTIONS);
    for (let seed = 1; seed <= 10; seed++) {
      const out = hardClusters(QUESTIONS, st, 24, mulberry32(seed));
      const i3 = out.indexOf(3), i1 = out.indexOf(1);
      assert.ok([2, 4].includes(out[i3 + 1]), 'q3 followed by a confused partner');
      assert.equal(out[i1 + 1], 2, 'q1 followed by q2');
    }
  });

  test('count caps the seeds; falls back to a random pool order when nothing is recorded', () => {
    const st = reduce([ans(3, T0, false, { ch: 1 }), ans(1, T0 + H, false, { ch: 1 })], QUESTIONS);
    const capped = hardClusters(QUESTIONS, st, 1, mulberry32(1));
    assert.ok(capped.length <= 3);
    // No recorded confusions/wrongs → every pool question seeds a cluster with its similar neighbour
    // (note: this path may repeat ids, e.g. [1,2,2,1,…]; only coverage is asserted here).
    const fallback = hardClusters(QUESTIONS, emptyState(), 24, mulberry32(1));
    assert.deepEqual([...new Set(fallback)].sort(), [1, 2, 3, 4, 5, 6]);
    // No similar links either → plain random order of the pool, each id once
    const noSim = QUESTIONS.map((q) => ({ ...q, similar: [] }));
    assert.deepEqual([...hardClusters(noSim, emptyState(), 24, mulberry32(1))].sort(), [1, 2, 3, 4, 5, 6]);
  });

  test('partners outside the pool are skipped', () => {
    const st = reduce([ans(5, T0, false, { ch: 0 })], QUESTIONS); // q5 similar [6]
    const out = hardClusters(poolFor(QUESTIONS, { includeArchive: true }), st, 24, mulberry32(1));
    assert.deepEqual(out, [5, 6]);
    const bookletOnly = hardClusters(poolFor(QUESTIONS, {}), st, 24, mulberry32(1));
    assert.ok(!bookletOnly.includes(5) && !bookletOnly.includes(6));
  });
});
