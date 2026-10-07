// Progress-safety check before any dataset change: replays a real event log through an OLD and the
// CURRENT data/questions.json and compares everything derived from it.
// Usage: node tools/replay_check.mjs <moto-master-progress.json> <old questions.json> [YYYY-MM-DD]
//   old questions.json: e.g. git show HEAD~1:data/questions.json > work/old_questions.json
// The progress file is private: keep it in the git-ignored work/ folder and delete it afterwards.
import fs from 'node:fs';
import { reduce, readiness, mastery, dueList, weakList, categoryStats } from '../src/engine/reducer.js';
import { studyPlan } from '../src/engine/planner.js';
import { sanitizeEvents } from '../src/engine/events.js';

const [, , progPath, oldPath, examDate] = process.argv;
if (!progPath || !oldPath) { console.error('usage: node tools/replay_check.mjs <progress.json> <old questions.json> [YYYY-MM-DD]'); process.exit(1); }
const events = sanitizeEvents(JSON.parse(fs.readFileSync(progPath, 'utf8')).events, Date.now());
const oldQ = JSON.parse(fs.readFileSync(oldPath, 'utf8')).questions;
const newQ = JSON.parse(fs.readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8')).questions;
const now = Date.now();
const settings = { examDate: examDate || null, includeArchive: false, dailyGoal: 50 };

const views = (qs) => {
  const st = reduce(events, qs);
  const plan = studyPlan(qs, events, settings, now);
  delete plan.queue;
  return { state: st, readiness: readiness(st, qs), mastery: mastery(st, qs), due: dueList(st, qs, now), weak: weakList(st, qs), cats: categoryStats(st, qs), plan };
};
const a = views(oldQ), b = views(newQ);
let ok = true;
for (const k of Object.keys(a)) {
  const same = JSON.stringify(a[k]) === JSON.stringify(b[k]);
  ok &&= same;
  console.log(`${same ? 'SAME' : 'DIFF'}  ${k}`);
}
const ids = (qs) => qs.map((q) => `${q.id}:${q.tier}:${q.options.length}:${q.correct}`).join(',');
const sameKeys = ids(oldQ) === ids(newQ);
ok &&= sameKeys;
console.log(`${sameKeys ? 'SAME' : 'DIFF'}  question ids / tiers / option counts / answer keys`);
const answered = new Set(events.filter((e) => e.k === 'answer').map((e) => e.q));
const unknown = [...answered].filter((id) => !newQ.some((q) => q.id === id));
const badChoice = events.filter((e) => e.k === 'answer' && Number.isInteger(e.ch) && newQ.some((q) => q.id === e.q) && e.ch >= newQ.find((q) => q.id === e.q).options.length);
console.log(`events ${events.length}; unknown question ids ${unknown.length}; answers pointing at a missing option ${badChoice.length}`);
console.log(ok && !unknown.length && !badChoice.length ? 'RESULT: progress maps 1:1' : 'RESULT: MISMATCH — do not deploy');
process.exit(ok && !unknown.length && !badChoice.length ? 0 : 2);
