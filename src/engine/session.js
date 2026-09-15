// One session engine; every mode is a preset. The UI only calls: current(), answer(), skip(),
// tick(now) and end(now). Every answer yields an append-only event.
import { RULES, MODES } from './constants.js';
import { shuffleOptions, shuffleArray, uuid } from './shuffle.js';
import * as sel from './selection.js';
import { dueList } from './reducer.js';

export const PRESETS = {
  [MODES.practice]:    { label: 'Ελεύθερη εξάσκηση', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.adaptive]:    { label: 'Έξυπνο τεστ', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.wrong]:       { label: 'Επανάληψη λαθών', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'zeroed', loop: true },
  [MODES.due]:         { label: 'Σήμερα', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.exam]:        { label: 'Προσομοίωση εξετάσεων', timerMs: RULES.EXAM_TIME_MS, perQuestionMs: null, shuffle: true, feedback: 'end', endRule: 'queue', loop: false, maxWrong: RULES.EXAM_MAX_WRONG },
  [MODES.hard]:        { label: 'Δύσκολο τεστ', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false, hard: true },
  [MODES.trap]:        { label: 'Ερωτήσεις-παγίδες', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.speed]:       { label: 'Κόντρα στον χρόνο', timerMs: null, perQuestionMs: RULES.SPEED_ROUND_MS, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.sudden]:      { label: 'Μέχρι το πρώτο λάθος', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'firstWrong', loop: true },
  [MODES.gauntlet139]: { label: 'Όλο το βιβλίο', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.gauntlet172]: { label: 'Όλο το βιβλίο + εκτός ύλης', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.tomorrow]:    { label: 'Αύριο εξετάσεις', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'zeroed', loop: true },
  [MODES.signs]:       { label: 'Μόνο σήματα', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.recall]:      { label: 'Από μνήμης', timerMs: null, perQuestionMs: null, shuffle: false, feedback: 'immediate', endRule: 'queue', loop: false, recall: true },
  [MODES.goal]:        { label: 'Προς τον στόχο', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.ptest]:       { label: 'Τεστ εξάσκησης', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.marathon]:    { label: 'Μαραθώνιος', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'zeroed', loop: true },
  [MODES.hardest]:     { label: 'Οι πιο δύσκολες', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.numbers]:     { label: 'Αριθμοί & όρια', timerMs: null, perQuestionMs: null, shuffle: true, feedback: 'immediate', endRule: 'queue', loop: false },
  [MODES.hardexam]:    { label: 'Σκληρή προσομοίωση', timerMs: RULES.HARD_EXAM_TIME_MS, perQuestionMs: null, shuffle: true, feedback: 'end', endRule: 'queue', loop: false, maxWrong: RULES.HARD_EXAM_MAX_WRONG },
};

// Builds the initial queue for a mode. `params` carries mode-specific choices.
export function buildQueue(mode, questions, state, settings, now, params = {}, rnd = Math.random) {
  const pool = sel.poolFor(questions, settings);
  const bookletPool = questions.filter((q) => q.tier === 'booklet');
  switch (mode) {
    case MODES.practice: {
      const p = params.policy || 'sequential';
      if (p === 'random') return sel.random(pool, params.count || 0, rnd);
      if (p === 'category') return sel.byCategory(pool, params.category, rnd);
      if (p === 'range') return sel.sequential(pool, { from: params.from, to: params.to });
      return sel.sequential(pool);
    }
    case MODES.adaptive: return sel.adaptive(pool, state, now, params.count || 20, rnd);
    case MODES.wrong: return sel.wrongBin(pool, state, rnd);
    case MODES.due: return sel.dueToday(pool, state, now, rnd);
    case MODES.exam: return sel.random(bookletPool, RULES.EXAM_QUESTIONS, rnd);
    case MODES.hard: return sel.hardClusters(pool, state, params.count || 24, rnd);
    case MODES.trap: return sel.trapPairs(pool, params.count || 10, rnd);
    case MODES.speed: return sel.random(pool, params.count || 20, rnd);
    case MODES.sudden: return sel.random(pool, 0, rnd);
    case MODES.gauntlet139: return sel.random(bookletPool, 0, rnd);
    case MODES.gauntlet172: return sel.random(questions, 0, rnd);
    case MODES.tomorrow: return sel.examTomorrow(pool, state, rnd);
    case MODES.signs: return sel.signs(pool, rnd);
    case MODES.recall: {
      const p = params.policy || 'random';
      return p === 'sequential' ? sel.sequential(pool) : sel.random(pool, params.count || 20, rnd);
    }
    case MODES.goal: return sel.towardGoal(pool, state, now, params.remaining || 20, rnd);
    case MODES.ptest: return sel.practiceTest(questions, params.set === undefined ? 0 : params.set, rnd);
    case MODES.marathon: return sel.random(pool, 0, rnd);
    case MODES.hardest: return sel.hardest(pool, state, params.count || RULES.HARDEST_COUNT, rnd);
    case MODES.numbers: return sel.numbers(pool, rnd);
    case MODES.hardexam: return sel.random(bookletPool, RULES.EXAM_QUESTIONS, rnd);
    default: throw new Error(`unknown mode ${mode}`);
  }
}

export class Session {
  constructor({ mode, questions, queue, settings = {}, now = Date.now(), rnd = Math.random, params = {} }) {
    this.id = uuid();
    this.mode = mode;
    this.preset = { ...PRESETS[mode], ...(params.presetOverride || {}) };
    this.params = params;
    this.settings = settings;
    this.rnd = rnd;
    this.byId = new Map(questions.map((q) => [q.id, q]));
    this.pool = queue.filter((id) => this.byId.has(id));
    this.queue = [...this.pool];
    this.idx = 0;
    this.startedAt = now;
    this.deadline = this.preset.timerMs ? now + this.preset.timerMs : null;
    this.results = [];          // { qid, ok, ch, ms, order }
    this.wrongs = [];
    this.correctCount = 0;
    this.pending = new Set(this.queue); // for 'zeroed' end rule: ids still owed a correct answer
    this.ended = false;
    this.endReason = null;
    this.cur = null;
    this.hard = !!this.preset.hard || !!settings.hardMode;
    this.confidenceOn = false; // confidence prompt removed (D-028); historical events keep their cf value
    this.timed = !!this.preset.timerMs;
    this._prepare(now);
  }

  get total() { return this.queue.length; }
  get position() { return Math.min(this.idx + 1, this.queue.length); }
  get remainingMs() { return this.deadline === null ? null : Math.max(0, this.deadline - (this._now || this.startedAt)); }
  get isEmpty() { return this.queue.length === 0; }

  _prepare(now) {
    this._now = now;
    if (this.idx >= this.queue.length) {
      if (this.preset.loop && this.pool.length && this.preset.endRule === 'firstWrong') {
        // Sudden death: reshuffle and continue.
        this.queue.push(...shuffleArray(this.pool, this.rnd));
      } else { this.cur = null; return; }
    }
    const q = this.byId.get(this.queue[this.idx]);
    const order = this.preset.shuffle ? shuffleOptions(q.options, this.rnd) : q.options.map((_, i) => i);
    this.cur = { q, order, shuffled: this.preset.shuffle, shownAt: now, deadline: this.preset.perQuestionMs ? now + this.preset.perQuestionMs : null, revealed: false };
  }

  current() { return this.ended ? null : this.cur; }

  // The UI calls this when the question is actually rendered, so the response clock and the
  // per-question deadline start at display time, not at the previous answer.
  show(now) {
    if (!this.cur || this.ended) return;
    this._now = now;
    this.cur.shownAt = now;
    this.cur.deadline = this.preset.perQuestionMs ? now + this.preset.perQuestionMs : null;
  }

  // Called by the UI clock. Returns 'timeout' if the per-question or session timer expired.
  tick(now) {
    this._now = now;
    if (this.ended || !this.cur) return null;
    if (this.deadline !== null && now >= this.deadline) { this._finish(now, 'time'); return 'session-timeout'; }
    if (this.cur.deadline !== null && now >= this.cur.deadline) return 'question-timeout';
    return null;
  }

  reveal() { if (this.cur) this.cur.revealed = true; }

  // choiceIdx: index in ORIGINAL option order (UI maps display → original via cur.order), or null for timeout.
  // For recall mode pass { selfGrade: true|false }.
  answer(choiceIdx, { now = Date.now(), confidence = null, selfGrade = null } = {}) {
    if (this.ended || !this.cur) return null;
    const { q, order, shuffled, shownAt } = this.cur;
    const ms = Math.max(0, now - shownAt);
    let ok;
    if (this.preset.recall) ok = !!selfGrade;
    else ok = choiceIdx !== null && choiceIdx === q.correct;
    const event = {
      id: uuid(), t: now, k: 'answer', q: q.id, ch: this.preset.recall ? null : choiceIdx, ok, ms,
      m: this.mode, s: this.id, cf: this.confidenceOn ? confidence : null,
      sh: shuffled, tl: this.preset.perQuestionMs || null, hd: this.hard, rc: !!this.preset.recall,
    };
    this.results.push({ qid: q.id, ok, ch: choiceIdx, ms, order, correct: q.correct });
    if (ok) { this.correctCount++; this.pending.delete(q.id); }
    else {
      this.wrongs.push(q.id);
      if (this.preset.loop && this.preset.endRule === 'zeroed') { this.pending.add(q.id); this.queue.push(q.id); }
    }
    const result = { ok, correct: q.correct, chosen: choiceIdx, event, q, ms };
    this.idx++;
    // End rules
    if (this.preset.endRule === 'firstWrong' && !ok) this._finish(now, 'wrong');
    else if (this.preset.maxWrong !== undefined && this.wrongs.length > this.preset.maxWrong && this.preset.feedback !== 'end') this._finish(now, 'failed');
    else if (this.idx >= this.queue.length && !(this.preset.loop && this.preset.endRule === 'firstWrong')) this._finish(now, 'done');
    else this._prepare(now);
    return result;
  }

  // Ends the session early (user abort). Progress already recorded stays.
  abort(now = Date.now()) { if (!this.ended) this._finish(now, 'abort'); }

  _finish(now, reason) {
    this.ended = true; this.endReason = reason; this.cur = null; this.endedAt = now;
  }

  // Summary + the session event (null if nothing was answered).
  summary() {
    const answered = this.results.length;
    const wrong = this.wrongs.length;
    const completed = this.endReason === 'done' || (this.preset.endRule === 'zeroed' && this.pending.size === 0 && answered > 0);
    let passed = null;
    if (this.mode === MODES.exam) passed = this.endReason !== 'time' && answered === this.queue.length && wrong <= RULES.EXAM_MAX_WRONG;
    else if (this.mode === MODES.hardexam) passed = this.endReason !== 'time' && answered === this.queue.length && wrong <= RULES.HARD_EXAM_MAX_WRONG;
    else if (this.mode === MODES.ptest) passed = this.endReason === 'done' && answered > 0 && (this.correctCount / answered) >= RULES.PTEST_PASS;
    let run = null;
    if (this.mode === MODES.sudden) run = this.correctCount;
    return { mode: this.mode, params: this.params, sid: this.id, answered, total: this.queue.length, correct: this.correctCount, wrong, wrongs: [...this.wrongs], durationMs: (this.endedAt || this._now || this.startedAt) - this.startedAt, completed, passed, run, endReason: this.endReason, timed: this.timed };
  }

  sessionEvent(now = Date.now(), extra = {}) {
    const s = this.summary();
    if (s.answered === 0) return null;
    const x = { completed: s.completed, endReason: s.endReason };
    if (extra.goalReached) x.goalReached = true; // the day's answer goal was hit during this session
    if (s.passed !== null) x.passed = s.passed;
    if (this.mode === MODES.exam || this.mode === MODES.hardexam) x.timed = this.timed;
    if (this.mode === MODES.ptest) { x.set = this.params.set === 'archive' ? -1 : (this.params.set || 0); x.score = s.correct; }
    if (s.run !== null) x.run = s.run;
    if (this.mode === MODES.due) x.zeroed = s.completed;
    return { id: uuid(), t: now, k: 'session', s: this.id, m: this.mode, n: [MODES.exam, MODES.hardexam, MODES.ptest].includes(this.mode) || this.mode.startsWith('gauntlet') ? this.pool.length : s.answered, c: s.correct, w: [...new Set(s.wrongs)], d: s.durationMs, x };
  }
}

// Convenience: build + start.
export function startSession(mode, { questions, state, settings, now = Date.now(), params = {}, rnd = Math.random }) {
  const queue = buildQueue(mode, questions, state, settings, now, params, rnd);
  return new Session({ mode, questions, queue, settings, now, rnd, params });
}

export { dueList };
