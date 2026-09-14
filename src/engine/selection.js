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
