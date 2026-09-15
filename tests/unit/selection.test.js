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

// ---------- Genie-style additions ----------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../../src/engine/constants.js';
import { practiceSets, practiceTest, hardest, numbers, towardGoal } from '../../src/engine/selection.js';
import { genQuestions } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8')).questions;
const sortNum = (a) => [...a].sort((x, y) => x - y);

describe('selection: practiceSets / practiceTest', () => {
  test('deterministic: identical output on two calls and independent of the input order', () => {
    const Q = genQuestions(45, 3);
    const a = practiceSets(Q);
    const b = practiceSets(Q);
    const c = practiceSets([...Q].reverse());
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
    assert.deepEqual(practiceSets(REAL), practiceSets([...REAL].reverse()));
  });

  test('covers every booklet id exactly once; archive ids are kept separate', () => {
    const Q = genQuestions(45, 3);
    const { sets, archive } = practiceSets(Q);
    const flat = sets.flat();
    assert.equal(flat.length, 45);
    assert.deepEqual(sortNum(flat), Q.filter((q) => q.tier === 'booklet').map((q) => q.id));
    assert.deepEqual(archive, [46, 47, 48]);
    for (const id of archive) assert.ok(!flat.includes(id), `archive id ${id} leaked into a set`);
    const real = practiceSets(REAL);
    assert.deepEqual(sortNum(real.sets.flat()), sortNum(REAL.filter((q) => q.tier === 'booklet').map((q) => q.id)));
    assert.deepEqual(sortNum(real.archive), sortNum(REAL.filter((q) => q.tier === 'archive').map((q) => q.id)));
  });

  test('sets are PTEST_SIZE long; a small remainder (< half a set) folds into the previous set', () => {
    const half = RULES.PTEST_SIZE / 2;
    // 45 = 20 + 20 + 5 -> the 5 fold into set 2 (20 + 25)
    const folded = practiceSets(genQuestions(45)).sets;
    assert.deepEqual(folded.map((s) => s.length), [RULES.PTEST_SIZE, RULES.PTEST_SIZE + 5]);
    // 50 = 20 + 20 + 10 -> 10 is not < half, so it stays its own set
    const kept = practiceSets(genQuestions(50)).sets;
    assert.deepEqual(kept.map((s) => s.length), [RULES.PTEST_SIZE, RULES.PTEST_SIZE, half]);
    // every set is PTEST_SIZE except the last, which is either a short tail (>= half) or a folded one (< 1.5 x PTEST_SIZE)
    for (const n of [7, 20, 21, 39, 40, 41, 140]) {
      const sets = practiceSets(genQuestions(n)).sets;
      assert.equal(sets.flat().length, n, `n=${n} coverage`);
      sets.forEach((s, i) => {
        if (i < sets.length - 1) assert.equal(s.length, RULES.PTEST_SIZE, `n=${n} set ${i}`);
        else assert.ok(s.length <= RULES.PTEST_SIZE + half - 1, `n=${n} last set ${s.length}`);
      });
      if (sets.length > 1) assert.ok(sets[sets.length - 1].length >= half, `n=${n} last set is not tiny`);
    }
    // real booklet (140): 7 sets of 20
    const real = practiceSets(REAL).sets;
    assert.equal(real.length, 7);
    real.forEach((s) => assert.equal(s.length, RULES.PTEST_SIZE));
    const seen = new Map();
    for (const s of real) for (const id of s) seen.set(id, (seen.get(id) || 0) + 1);
    for (const [, n] of seen) assert.equal(n, 1);
  });

  test("practiceTest(questions, 'archive') returns the archive ids; practiceTest(questions, i) is a permutation of sets[i]", () => {
    const Q = genQuestions(45, 3);
    const { sets, archive } = practiceSets(Q);
    assert.deepEqual(sortNum(practiceTest(Q, 'archive', mulberry32(1))), archive);
    for (let i = 0; i < sets.length; i++) {
      const t = practiceTest(Q, i, mulberry32(i + 1));
      assert.equal(t.length, sets[i].length);
      assert.deepEqual(sortNum(t), sortNum(sets[i]));
    }
    // the order is shuffled per call (seed-dependent) but the membership is fixed
    const orders = new Set();
    for (let seed = 1; seed <= 10; seed++) orders.add(practiceTest(Q, 0, mulberry32(seed)).join(','));
    assert.ok(orders.size > 1);
    assert.deepEqual(practiceTest(Q, 99, mulberry32(1)), [], 'unknown set -> empty');
  });
});

describe('selection: hardest', () => {
  const Q = genQuestions(30);
  const imperfect = (seen, correct, extra = {}) => ({ seen, correct, wrong: seen - correct, level: 0, ...extra });

  test('returns [] on a fresh state (nothing is known yet)', () => {
    assert.deepEqual(hardest(Q, emptyState(), 20, mulberry32(1)), []);
  });

  test('never returns unseen questions when >= count seen-and-imperfect questions exist', () => {
    const entries = {};
    for (let id = 1; id <= 10; id++) entries[id] = imperfect(4, 2);
    const st = stateWith(entries);
    for (let seed = 1; seed <= 20; seed++) {
      const out = hardest(Q, st, 5, mulberry32(seed));
      assert.equal(out.length, 5);
      assert.equal(new Set(out).size, 5);
      for (const id of out) assert.ok(id >= 1 && id <= 10, `unseen id ${id} returned`);
    }
    assert.deepEqual(sortNum(hardest(Q, st, 10, mulberry32(3))), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('the lowest accuracies are taken first (the count cut keeps the worst)', () => {
    const st = stateWith({
      1: imperfect(10, 8), // 0.8
      2: imperfect(10, 2), // 0.2
      3: imperfect(10, 5), // 0.5
      4: imperfect(10, 6), // 0.6
      5: imperfect(10, 4), // 0.4
    });
    assert.deepEqual(sortNum(hardest(Q, st, 3, mulberry32(1))), [2, 3, 5]);
    assert.deepEqual(sortNum(hardest(Q, st, 1, mulberry32(1))), [2]);
    assert.deepEqual(sortNum(hardest(Q, st, 5, mulberry32(1))), [1, 2, 3, 4, 5]);
  });

  test('100 %-accuracy questions are excluded unless they sit in the bin', () => {
    const st = stateWith({
      1: imperfect(3, 3, { level: 2 }),                                     // perfect, not in bin -> excluded
      2: imperfect(3, 3, { level: 1, bin: { since: NOW - D, days: [] } }),  // perfect but binned -> qualifies
      3: imperfect(3, 1),                                                   // imperfect -> qualifies
    });
    for (let seed = 1; seed <= 10; seed++) {
      const out = hardest(Q, st, 2, mulberry32(seed));
      assert.deepEqual(sortNum(out), [2, 3]);
    }
  });

  test('falls back to weak seen questions when fewer than count qualify - still never unseen', () => {
    const st = stateWith({
      1: imperfect(4, 2),                    // hard
      2: imperfect(4, 3),                    // hard
      3: imperfect(2, 2, { level: 1 }),      // perfect, weak (level < 3) -> filler
      4: imperfect(2, 2, { level: 2 }),      // perfect, weak -> filler
      5: imperfect(2, 2, { level: 1 }),      // perfect, weak -> filler
      6: { seen: 12, correct: 12, wrong: 0, level: 5, lastPromoT: NOW - 3 * D }, // strong -> never
      // 7..30 unseen
    });
    for (let seed = 1; seed <= 10; seed++) {
      const out = hardest(Q, st, 4, mulberry32(seed));
      assert.equal(out.length, 4);
      assert.equal(new Set(out).size, 4);
      assert.ok(out.includes(1) && out.includes(2), 'the imperfect ones are always in');
      for (const id of out) assert.ok([1, 2, 3, 4, 5].includes(id), `unexpected id ${id}`);
    }
    const all = hardest(Q, st, 20, mulberry32(1));
    assert.deepEqual(sortNum(all), [1, 2, 3, 4, 5], 'capped by what is known: no unseen, no strong');
  });

  test('a real-event state: only answered questions come back, wrong ones first', () => {
    const st = reduce([ans(1, T0, false, {}, Q), ans(2, T0 + H, true, {}, Q), ans(3, T0 + 2 * H, true, {}, Q), ans(3, T0 + 3 * H, false, {}, Q)], Q);
    const out = hardest(Q, st, 20, mulberry32(2));
    assert.deepEqual(sortNum(out), [1, 2, 3]);
    const top2 = hardest(Q, st, 2, mulberry32(2));
    assert.deepEqual(sortNum(top2), [1, 3], 'q2 (100 %, no bin) only enters via the weak fallback');
  });
});

describe('selection: numbers', () => {
  const NUM_RE = /\d|km\/h|cm|\bm\b|cc\b|%|°/;
  const mk = (id, text, options) => ({ id, tier: 'booklet', text, options, correct: 0, image: null, category: 'Γενικά', explanation: '', similar: [], sources: {} });

  test('returns exactly the questions whose text or an option matches a digit / km/h / cm / m / cc / % / degree', () => {
    const Q = [
      mk(1, 'Το όριο ταχύτητας είναι 50 km/h;', ['Ναι', 'Όχι']),
      mk(2, 'Πόση απόσταση κρατάτε;', ['Τουλάχιστον 2 m', 'Όσο θέλω']),
      mk(3, 'Φοράτε κράνος;', ['Πάντα', 'Ποτέ']),
      mk(4, 'Ο κινητήρας είναι 125 cc', ['Ναι', 'Όχι']),
      mk(5, 'Το ελαστικό πρέπει να έχει πέλμα', ['1,6 mm', 'Όσο θέλει']),
      mk(6, 'Η κλίση είναι δέκα τοις εκατό', ['Ναι', 'Όχι']),
      mk(7, 'Η κλίση είναι', ['10 %', 'μηδέν']),
      mk(8, 'Η θερμοκρασία πέφτει κάτω από μηδέν', ['0 °C', 'κρύο']),
      mk(9, 'Χωρίς νούμερο', ['Και τα δύο', 'Κανένα']),
    ];
    const out = numbers(Q, mulberry32(1));
    assert.deepEqual(sortNum(out), [1, 2, 4, 5, 7, 8]);
    for (const q of Q) {
      const matches = NUM_RE.test(q.text) || q.options.some((o) => NUM_RE.test(o));
      assert.equal(out.includes(q.id), matches, `q${q.id}`);
    }
    assert.deepEqual(numbers([mk(1, 'A', ['B'])], mulberry32(1)), []);
  });

  test('shuffles (seed-dependent order) without changing membership', () => {
    const Q = genQuestions(30).map((q) => ({ ...q, text: `${q.text} ${q.id} km/h` }));
    const a = numbers(Q, mulberry32(1)), b = numbers(Q, mulberry32(2));
    assert.deepEqual(sortNum(a), sortNum(b));
    assert.equal(a.length, 30);
    assert.notDeepEqual(a, b);
  });

  test('real data: >= 15 booklet questions carry a number/limit and every returned question matches', () => {
    const pool = REAL.filter((q) => q.tier === 'booklet');
    const out = numbers(pool, mulberry32(1));
    assert.ok(out.length >= 15, `only ${out.length} number questions`);
    assert.equal(new Set(out).size, out.length);
    const byId = new Map(pool.map((q) => [q.id, q]));
    for (const id of out) {
      const q = byId.get(id);
      assert.ok(q, `id ${id} outside the pool`);
      assert.ok(NUM_RE.test(q.text) || q.options.some((o) => NUM_RE.test(o)), `#${id} has no number`);
    }
    const expected = pool.filter((q) => NUM_RE.test(q.text) || q.options.some((o) => NUM_RE.test(o))).map((q) => q.id);
    assert.deepEqual(sortNum(out), sortNum(expected));
  });
});

describe('selection: towardGoal', () => {
  const Q = genQuestions(30);

  test('length = max(5, remaining) when the pool is big enough', () => {
    const st = emptyState();
    assert.equal(towardGoal(Q, st, NOW, 7, mulberry32(1)).length, 7);
    assert.equal(towardGoal(Q, st, NOW, 20, mulberry32(1)).length, 20);
    assert.equal(towardGoal(Q, st, NOW, 2, mulberry32(1)).length, 5);
    assert.equal(towardGoal(Q, st, NOW, 0, mulberry32(1)).length, 5);
    assert.equal(towardGoal(Q, st, NOW, 30, mulberry32(1)).length, 30);
  });

  test('starts with the dueToday order (same seed -> same prefix)', () => {
    const st = stateWith({
      1: { seen: 1, correct: 0, wrong: 1, level: 0, bin: { since: NOW - D, days: [] } },   // bin needs today -> first
      2: { seen: 2, correct: 2, level: 2, lastPromoT: NOW - 9 * H },                        // due
    });
    for (let seed = 1; seed <= 10; seed++) {
      const due = dueToday(Q, st, NOW, mulberry32(seed));
      const out = towardGoal(Q, st, NOW, 7, mulberry32(seed));
      assert.deepEqual(out, due.slice(0, 7));
      assert.equal(out[0], 1);
      assert.equal(out[1], 2);
    }
  });

  test('fills with adaptive picks when the due list is shorter than remaining; never duplicates', () => {
    const Q12 = genQuestions(12);
    const entries = {};
    for (let id = 4; id <= 12; id++) entries[id] = { seen: 2, correct: 2, level: 2, lastPromoT: NOW - H }; // promoted 1 h ago -> not due
    const st = stateWith(entries); // 1..3 unseen -> due
    assert.deepEqual(sortNum(dueToday(Q12, st, NOW, mulberry32(1))), [1, 2, 3]);
    for (let seed = 1; seed <= 10; seed++) {
      const out = towardGoal(Q12, st, NOW, 10, mulberry32(seed));
      assert.equal(out.length, 10);
      assert.equal(new Set(out).size, 10, 'no duplicates');
      assert.deepEqual(sortNum(out.slice(0, 3)), [1, 2, 3], 'due questions come first');
      for (const id of out.slice(3)) assert.ok(id >= 4 && id <= 12, `filler ${id} comes from the rest of the pool`);
    }
    // more remaining than the pool: everything, once
    const all = towardGoal(Q12, st, NOW, 50, mulberry32(1));
    assert.deepEqual(sortNum(all), Q12.map((q) => q.id));
  });

  test('never duplicates ids across the due and filler parts (random states)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = mulberry32(100 + seed);
      const evs = [];
      let t = T0;
      for (let i = 0; i < 60; i++) { t += Math.floor(rnd() * 6 * H); evs.push(ans(1 + Math.floor(rnd() * 30), t, rnd() < 0.7, {}, Q)); }
      const st = reduce(evs, Q);
      const out = towardGoal(Q, st, t + H, 12, mulberry32(seed));
      assert.equal(out.length, 12);
      assert.equal(new Set(out).size, out.length, `seed ${seed} duplicates`);
    }
  });
});
