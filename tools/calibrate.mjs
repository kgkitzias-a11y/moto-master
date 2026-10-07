// Calibration + feasibility check of the deployed pass-chance model (src/engine/chance.js).
// Usage: node tools/calibrate.mjs <moto-master-progress.json> [YYYY-MM-DD exam date]
// The progress file is private: download it into the git-ignored work/ folder, delete it afterwards,
// never commit it. (gh api gists/<id> --jq '.files["moto-master-progress.json"].content' > work/p.json)
//
// 1. Calibration: for every real booklet answer, the model's chance from the history BEFORE that
//    answer vs. what actually happened, in probability bins. A strict model predicts ≤ actual.
// 2. The owner's numbers: pass chance at the exam moment (no more study), now, weakest question.
// 3. Feasibility: simulated "every question right" plans before the exam date.
import fs from 'node:fs';
import { reduce } from '../src/engine/reducer.js';
import { sanitizeEvents } from '../src/engine/events.js';
import { questionChance, readinessNumbers, passChance, weakestChance, examMoment } from '../src/engine/chance.js';
import { RULES } from '../src/engine/constants.js';

const [, , progressPath, examDate] = process.argv;
if (!progressPath) { console.error('usage: node tools/calibrate.mjs <progress.json> [YYYY-MM-DD]'); process.exit(1); }
const questions = JSON.parse(fs.readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8')).questions;
const booklet = questions.filter((q) => q.tier === 'booklet');
const events = sanitizeEvents(JSON.parse(fs.readFileSync(progressPath, 'utf8')).events, Date.now());
const st = reduce(events, questions);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// 1. Calibration
const rows = [];
for (const q of booklet) {
  const s = st.q[q.id];
  if (!s) continue;
  const hist = s.history.filter((h) => h.m !== 'recall');
  for (let j = 1; j < hist.length; j++) rows.push({ p: questionChance({ history: hist.slice(0, j) }, hist[j].t, q), ok: hist[j].ok });
}
console.log(`Calibration on ${rows.length} repeat answers (first sights excluded):`);
for (const [lo, hi] of [[0, 0.5], [0.5, 0.8], [0.8, 0.9], [0.9, 0.95], [0.95, 0.98], [0.98, 1.01]]) {
  const b = rows.filter((r) => r.p >= lo && r.p < hi);
  if (!b.length) continue;
  const pred = b.reduce((a, r) => a + r.p, 0) / b.length, act = b.filter((r) => r.ok).length / b.length;
  console.log(`  ${pct(lo).padStart(6)}–${pct(Math.min(hi, 1)).padEnd(6)} n=${String(b.length).padStart(3)}  predicted ${pct(pred)}  actual ${pct(act)}  ${act + 1e-9 >= pred ? 'cautious ✓' : 'OVERCONFIDENT ✗'}`);
}

// 2. Owner's numbers
const settings = examDate ? { examDate } : {};
const n = readinessNumbers(st, questions, settings, Date.now());
console.log(`\nExam moment ${new Date(n.at).toString().slice(0, 21)}: pass chance ${pct(n.chance)} without more study · now ${pct(n.nowChance)} · weakest question ${pct(n.weakest)} · ready ${n.ready}`);

// 3. Feasibility (only with an exam date): every booklet question answered right at these times.
if (examDate) {
  const exam = examMoment(settings, 0);
  const dayAt = (k, h) => { const d = new Date(exam); d.setDate(d.getDate() - k); d.setHours(h, 0, 0, 0); return d.getTime(); };
  const ev = (q, t, ok) => ({ id: `${q}-${t}`, t, k: 'answer', q, ch: 0, ok, ms: 3000, m: 'goal', s: 's', cf: null, sh: true, tl: null, hd: false, rc: false });
  const plans = {
    'right once a day, last 5 evenings': [[5, 20, true], [4, 20, true], [3, 20, true], [2, 20, true], [1, 20, true]],
    '…plus a review at 07:00 on exam day': [[5, 20, true], [4, 20, true], [3, 20, true], [2, 20, true], [1, 20, true], [0, 7, true]],
    '…but every question missed once on day −4': [[5, 20, true], [4, 20, false], [3, 20, true], [2, 20, true], [1, 20, true], [0, 7, true]],
  };
  console.log('\nFeasibility (simulated):');
  for (const [name, plan] of Object.entries(plans)) {
    const sim = reduce(booklet.flatMap((q) => plan.map(([k, h, ok]) => ev(q.id, dayAt(k, h), ok))), questions);
    const c = passChance(sim, questions, exam), w = weakestChance(sim, questions, exam);
    console.log(`  ${name.padEnd(44)} ${pct(c)}  weakest ${pct(w)}  ${c >= RULES.PASS_TARGET && w >= RULES.PASS_FLOOR ? 'READY' : 'not ready'}`);
  }
}
