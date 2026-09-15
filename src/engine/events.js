// Event validation for everything that enters the log from outside this device
// (gist pulls, imported JSON). Returns a clean copy or null. Keeps the reducer's input
// shape closed: known kinds, whitelisted keys, sane types and timestamps.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_T = Date.UTC(2020, 0, 1);
const KINDS = new Set(['answer', 'session', 'reset']);
const CONF = new Set(['sure', 'unsure']);

const int = (v) => (Number.isInteger(v) ? v : null);
const num = (v, max = 1e9) => (Number.isFinite(v) && v >= 0 ? Math.min(v, max) : null);
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);

export function sanitizeEvent(e, now = Date.now()) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (typeof e.id !== 'string' || !UUID_RE.test(e.id)) return null;
  if (!KINDS.has(e.k)) return null;
  const t = Number(e.t);
  if (!Number.isFinite(t) || t < MIN_T || t > now + 86400000) return null; // no far-future events (a future reset would wipe everything)
  const out = { id: e.id.toLowerCase(), t: Math.floor(t), k: e.k };
  if (e.k === 'answer') {
    const q = int(e.q); if (q === null || q < 0) return null;
    out.q = q;
    out.ch = e.ch === null || e.ch === undefined ? null : (int(e.ch) !== null && e.ch >= 0 && e.ch < 16 ? e.ch : null);
    out.ok = !!e.ok;
    out.ms = num(e.ms, 3600000) ?? 0;
    out.m = str(e.m, 32) || null;
    out.s = str(e.s, 64) || null;
    out.cf = CONF.has(e.cf) ? e.cf : null;
    out.sh = !!e.sh;
    out.tl = e.tl === null || e.tl === undefined ? null : num(e.tl, 3600000);
    out.hd = !!e.hd; out.rc = !!e.rc;
  } else if (e.k === 'session') {
    out.s = str(e.s, 64) || null;
    out.m = str(e.m, 32) || null;
    out.n = int(e.n) !== null && e.n >= 0 ? e.n : 0;
    out.c = int(e.c) !== null && e.c >= 0 ? e.c : 0;
    out.w = Array.isArray(e.w) ? e.w.filter((v) => Number.isInteger(v) && v >= 0).slice(0, 1000) : [];
    out.d = num(e.d, 86400000) ?? 0;
    const x = e.x && typeof e.x === 'object' && !Array.isArray(e.x) ? e.x : {};
    out.x = {};
    for (const k of ['completed', 'passed', 'timed', 'zeroed', 'goalReached']) if (k in x) out.x[k] = !!x[k];
    if ('run' in x && int(x.run) !== null && x.run >= 0) out.x.run = x.run;
    if ('set' in x && int(x.set) !== null && x.set >= -1 && x.set < 1000) out.x.set = x.set;
    if ('score' in x && int(x.score) !== null && x.score >= 0) out.x.score = x.score;
    if (typeof x.endReason === 'string' && x.endReason.length <= 16) out.x.endReason = x.endReason;
  }
  return out;
}

export function sanitizeEvents(list, now = Date.now()) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const e of list.slice(0, 500000)) {
    const c = sanitizeEvent(e, now);
    if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  return out;
}
