// Shared synthetic fixtures + fake-clock helpers for the unit suite.
// Nothing here reads Date.now(); every timestamp is explicit.
import { mulberry32 } from '../../src/engine/shuffle.js';

export const H = 3600 * 1000;
export const D = 24 * H;
// Early February: no DST transition anywhere near, so local-day arithmetic (T0 + k*D)
// keeps the same wall-clock time and yields distinct local day keys.
export const T0 = new Date(2026, 1, 2, 9, 0, 0, 0).getTime();       // 2026-02-02 09:00 local
export const MIDNIGHT = new Date(2026, 1, 2, 0, 0, 0, 0).getTime();  // 2026-02-02 00:00 local

// Six questions: 1↔2 similar; 2 and 4 share the correct-option text "SHARED";
// 3 carries "SHARED" as a WRONG option and a positional last option; 5/6 are archive and similar.
export const QUESTIONS = [
  { id: 1, tier: 'booklet', text: 'Q1', options: ['A1', 'B1', 'C1'], correct: 0, image: null, category: 'Γενικά', explanation: '', similar: [2], sources: {} },
  { id: 2, tier: 'booklet', text: 'Q2', options: ['A2', 'SHARED', 'C2'], correct: 1, image: null, category: 'Γενικά', explanation: '', similar: [1], sources: {} },
  { id: 3, tier: 'booklet', text: 'Q3', options: ['A3', 'SHARED', 'C3', 'Όλα τα παραπάνω'], correct: 0, image: null, category: 'Πινακίδες', explanation: '', similar: [], sources: {} },
  { id: 4, tier: 'booklet', text: 'Q4', options: ['SHARED', 'B4', 'C4'], correct: 0, image: 'data/img/fake.png', category: 'Πινακίδες', explanation: '', similar: [], sources: {} },
  { id: 5, tier: 'archive', text: 'Q5', options: ['A5', 'B5', 'Και τα δύο'], correct: 2, image: null, category: 'Γενικά', explanation: '', similar: [6], sources: {} },
  { id: 6, tier: 'archive', text: 'Q6', options: ['A6', 'B6'], correct: 1, image: null, category: 'Γενικά', explanation: '', similar: [5], sources: {} },
];
export const BOOKLET_IDS = QUESTIONS.filter((q) => q.tier === 'booklet').map((q) => q.id);

// Larger synthetic set (for exam / gauntlet sessions).
export function genQuestions(nBooklet, nArchive = 0) {
  const out = [];
  for (let i = 1; i <= nBooklet + nArchive; i++) {
    out.push({ id: i, tier: i <= nBooklet ? 'booklet' : 'archive', text: `G${i}`, options: [`a${i}`, `b${i}`, `c${i}`], correct: i % 3, image: null, category: 'Γενικά', explanation: '', similar: [], sources: {} });
  }
  return out;
}

let seq = 0;
export function resetIds() { seq = 0; }
export function nextId() { return `ev${String(++seq).padStart(6, '0')}`; }

// Answer event with the full field set the Session engine emits. ch defaults to the correct
// index when ok, or a wrong index when !ok (so confusion tests can override explicitly).
export function ans(qid, t, ok, extra = {}, questions = QUESTIONS) {
  const q = questions.find((x) => x.id === qid);
  const ch = ok ? q.correct : (q.correct === 0 ? 1 : 0);
  return { id: nextId(), t, k: 'answer', q: qid, ch, ok, ms: 3000, m: 'practice', s: 'sess', cf: null, sh: true, tl: null, hd: false, rc: false, ...extra };
}

export function session(t, m, fields = {}) {
  return { id: nextId(), t, k: 'session', s: `s-${t}`, m, n: 0, c: 0, w: [], d: 1000, x: {}, ...fields };
}

export function reset(t) { return { id: nextId(), t, k: 'reset' }; }

// n correct, shuffled, in-time answers on qid, 8h apart starting at t.
export function promoteN(qid, t, n, extra = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ans(qid, t + i * 8 * H, true, extra));
  return out;
}

export { mulberry32 };
