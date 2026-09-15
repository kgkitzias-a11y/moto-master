// Selection policies: (questions, state, now, opts, rnd) → ordered array of question ids.
import { RULES } from './constants.js';
import { shuffleArray } from './shuffle.js';
import { dueForPromotion, inBin, binNeedsToday, isWeak, isMastered, confusions } from './reducer.js';

export function poolFor(questions, settings, { includeArchive = null } = {}) {
  const inc = includeArchive === null ? !!(settings && settings.includeArchive) : includeArchive;
  return questions.filter((q) => q.tier === 'booklet' || (inc && q.tier === 'archive'));
}

export function sequential(pool, { from = null, to = null } = {}) {
  return pool.filter((q) => (from === null || q.id >= from) && (to === null || q.id <= to)).map((q) => q.id);
}

export function random(pool, count, rnd = Math.random) {
  const ids = shuffleArray(pool.map((q) => q.id), rnd);
  return count ? ids.slice(0, count) : ids;
}

export function byCategory(pool, category, rnd = Math.random) {
  return shuffleArray(pool.filter((q) => q.category === category).map((q) => q.id), rnd);
}

export function weightOf(q, s, now) {
  if (!s || s.seen === 0) return 6;                         // unseen
  let w = 1 + (RULES.MAX_LEVEL - s.level);                  // weak → heavier
  if (inBin(s)) w += 3;
  if (dueForPromotion(s, now)) w += 2;
  const acc = s.correct / s.seen; if (acc < 0.8) w += 2;
  if (isMastered(s)) w = 0.25;
  return w;
}

// Weighted sampling without replacement.
export function adaptive(pool, state, now, count = 20, rnd = Math.random) {
  const items = pool.map((q) => ({ id: q.id, w: weightOf(q, state.q[q.id], now) }));
  const out = [];
  while (items.length && out.length < count) {
    const total = items.reduce((a, b) => a + b.w, 0);
    let r = rnd() * total;
    let i = 0;
    for (; i < items.length; i++) { r -= items[i].w; if (r <= 0) break; }
    if (i >= items.length) i = items.length - 1;
    out.push(items[i].id); items.splice(i, 1);
  }
  return out;
}

export function wrongBin(pool, state, rnd = Math.random) {
  return shuffleArray(pool.filter((q) => inBin(state.q[q.id])).map((q) => q.id), rnd);
}

// Due Today: bin items needing today's hit first, then due-for-promotion, then unseen.
export function dueToday(pool, state, now, rnd = Math.random) {
  const bin = [], due = [], unseen = [];
  for (const q of pool) {
    const s = state.q[q.id];
    if (!s || s.seen === 0) unseen.push(q.id);
    else if (binNeedsToday(s, now)) bin.push(q.id);
    else if (dueForPromotion(s, now)) due.push(q.id);
  }
  return [...shuffleArray(bin, rnd), ...shuffleArray(due, rnd), ...shuffleArray(unseen, rnd)];
}

export function weak(pool, state, rnd = Math.random) {
  return shuffleArray(pool.filter((q) => { const s = state.q[q.id]; return s && s.seen > 0 && isWeak(s); }).map((q) => q.id), rnd);
}

// Exam Tomorrow: weak + wrong bin (+ unseen, since an unseen question is the weakest kind).
export function examTomorrow(pool, state, rnd = Math.random) {
  return shuffleArray(pool.filter((q) => isWeak(state.q[q.id])).map((q) => q.id), rnd);
}

export function signs(pool, rnd = Math.random) {
  return shuffleArray(pool.filter((q) => !!q.image).map((q) => q.id), rnd);
}

// Hard mode: confusion clusters back-to-back. For every question with recorded confusions
// (or similar-cluster neighbours), emit [q, partner, q'…]. Falls back to weak + similar.
export function hardClusters(pool, state, count = 24, rnd = Math.random) {
  const ids = new Set(pool.map((q) => q.id));
  const byId = new Map(pool.map((q) => [q.id, q]));
  const seeds = pool.filter((q) => { const s = state.q[q.id]; return s && (Object.keys(s.confusedWith).length || s.wrong > 0); });
  const ordered = shuffleArray(seeds.length ? seeds : pool, rnd);
  const out = [];
  for (const q of ordered) {
    if (out.length >= count) break;
    const partners = confusions(state.q[q.id]).map((c) => c.id).filter((id) => ids.has(id));
    const sim = (q.similar || []).filter((id) => ids.has(id));
    const cluster = [q.id, ...partners.slice(0, 2), ...sim.slice(0, 1)].filter((v, i, a) => a.indexOf(v) === i);
    for (const id of cluster) if (byId.has(id) && out[out.length - 1] !== id) out.push(id);
  }
  return out.length ? out : random(pool, count, rnd);
}

// Trap session: similar pairs consecutively (q, then its closest similar).
export function trapPairs(pool, count = 10, rnd = Math.random) {
  const ids = new Set(pool.map((q) => q.id));
  const withSim = shuffleArray(pool.filter((q) => (q.similar || []).some((id) => ids.has(id))), rnd);
  const out = [];
  const used = new Set();
  for (const q of withSim) {
    if (out.length >= count * 2) break;
    if (used.has(q.id)) continue;
    const partner = (q.similar || []).find((id) => ids.has(id) && !used.has(id));
    if (partner === undefined) continue;
    out.push(q.id, partner); used.add(q.id); used.add(partner);
  }
  return out;
}

// ---------- Genie-style additions ----------
import { mulberry32 } from './shuffle.js';

// Fixed partition of the booklet into numbered practice tests (same on every device).
export function practiceSets(questions) {
  const booklet = questions.filter((q) => q.tier === 'booklet').map((q) => q.id).sort((a, b) => a - b);
  const ids = shuffleArray(booklet, mulberry32(RULES.PTEST_SEED));
  const sets = [];
  for (let i = 0; i < ids.length; i += RULES.PTEST_SIZE) sets.push(ids.slice(i, i + RULES.PTEST_SIZE));
  // Small remainder folds into the last set so no test is tiny.
  if (sets.length > 1 && sets[sets.length - 1].length < RULES.PTEST_SIZE / 2) sets[sets.length - 2].push(...sets.pop());
  const archive = questions.filter((q) => q.tier === 'archive').map((q) => q.id).sort((a, b) => a - b);
  return { sets, archive };
}

export function practiceTest(questions, set, rnd = Math.random) {
  const { sets, archive } = practiceSets(questions);
  const ids = set === 'archive' ? archive : (sets[set] || []);
  return shuffleArray(ids, rnd);
}

// Your personally hardest questions: lowest accuracy, then most wrongs, then most confusions;
// unseen questions do not qualify (nothing is known about them yet). Filled up with bin/weak.
export function hardest(pool, state, count = RULES.HARDEST_COUNT, rnd = Math.random) {
  const scored = pool.map((q) => { const s = state.q[q.id]; return s && s.seen ? { id: q.id, acc: s.correct / s.seen, wrong: s.wrong, conf: Object.keys(s.confusedWith).length, bin: inBin(s) ? 1 : 0 } : null; }).filter(Boolean);
  scored.sort((a, b) => (a.acc - b.acc) || (b.wrong - a.wrong) || (b.bin - a.bin) || (b.conf - a.conf));
  const hard = scored.filter((x) => x.acc < 1 || x.bin).slice(0, count).map((x) => x.id);
  if (hard.length >= count) return shuffleArray(hard, rnd);
  const rest = shuffleArray(pool.filter((q) => !hard.includes(q.id) && isWeak(state.q[q.id]) && state.q[q.id] && state.q[q.id].seen).map((q) => q.id), rnd);
  return [...shuffleArray(hard, rnd), ...rest].slice(0, count);
}

// Every question whose text or options contain a number/limit (speeds, distances, sizes, %, cc, times).
const NUM_RE = /\d|km\/h|cm|\bm\b|cc\b|%|°/;
export function numbers(pool, rnd = Math.random) {
  return shuffleArray(pool.filter((q) => NUM_RE.test(q.text) || q.options.some((o) => NUM_RE.test(o))).map((q) => q.id), rnd);
}

// Continue toward today's goal: the daily-drill order, cut to what is still missing (min 5).
export function towardGoal(pool, state, now, remaining, rnd = Math.random) {
  const order = dueToday(pool, state, now, rnd);
  const n = Math.max(5, remaining);
  if (order.length >= n) return order.slice(0, n);
  // Everything is on schedule: keep training on the rest of the pool, weakest first.
  const seen = new Set(order);
  const filler = adaptive(pool.filter((q) => !seen.has(q.id)), state, now, n - order.length, rnd);
  return [...order, ...filler];
}
