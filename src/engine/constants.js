// Tunable rules of the mastery model. Every number here is a DECISION (see DECISIONS.md).
export const RULES = Object.freeze({
  MAX_LEVEL: 5,
  PROMOTION_GAP_MS: 8 * 60 * 60 * 1000,   // ≥8 h after the last promotion
  LEVEL5_MIN_DAYS: 3,                      // promotions to reach 5 must span ≥3 distinct local days
  DEMOTION_STEP: 2,                        // wrong → level − 2 (min 0)
  BIN_EXIT_DAYS: 3,                        // wrong bin exits after 3 correct on 3 separate days
  PROMOTION_TIME_LIMIT_MS: 15000,          // "within the time limit" for a promotion
  SOLID_MIN_SEEN: 10,
  SOLID_MIN_ACCURACY: 0.9,
  SOLID_LAST_N: 5,
  SOLID_MEDIAN_MS: 6000,
  EXAM_QUESTIONS: 10,
  EXAM_MAX_WRONG: 1,
  EXAM_TIME_MS: 15 * 60 * 1000,            // official: 15′ for Ερωτηματολόγιο 2 (ΥΑ 50984/7947/2013 άρθ. 22, D-032)
  EXAM_GROUPS: 10,                         // the exam draws one question from each official group 1–10 (ExerBase.mdb)
  READY_MOCKS: 5,                          // 5 consecutive 10/10 timed mocks
  READY_MOCK_DAYS: 3,                      // … on ≥3 distinct days
  READY_SUDDEN_DEATH: 60,                  // one Sudden Death run ≥60
  SPEED_ROUND_MS: 5000,
  WEAK_LEVEL: 3,                           // level < 3 counts as weak
  PTEST_SIZE: 20,                          // numbered practice tests (Genie-style), booklet split into sets of 20
  PTEST_PASS: 1.0,                         // a practice test counts as passed only at 100 %
  PTEST_SEED: 20260915,                    // fixed seed → the same sets on every device
  HARD_EXAM_TIME_MS: 5 * 60 * 1000,        // hard simulator: 10 questions, 5 min, 0 wrong
  HARD_EXAM_MAX_WRONG: 0,
  READY_HARD_EXAMS: 3,                     // readiness also needs 3 perfect hard simulators
  HARDEST_COUNT: 20,
  PROOF_WINDOW_MS: 48 * 60 * 60 * 1000,    // «Τελικός έλεγχος»: last answer correct within 48 h
  PASS_TARGET: 0.995,                      // pass-chance target shown next to the readiness gate
});

export const MODES = Object.freeze({
  practice: 'practice',
  adaptive: 'adaptive',
  wrong: 'wrong',
  due: 'due',
  exam: 'exam',
  hard: 'hard',
  trap: 'trap',
  speed: 'speed',
  sudden: 'sudden',
  gauntlet139: 'gauntlet139',
  gauntlet172: 'gauntlet172',
  tomorrow: 'tomorrow',
  signs: 'signs',
  recall: 'recall',
  goal: 'goal',          // continue toward today's answer goal
  ptest: 'ptest',        // numbered practice test (params.set)
  marathon: 'marathon',  // every question, misses re-queued until all cleared
  hardest: 'hardest',    // your personally hardest questions
  numbers: 'numbers',    // every question with a number/limit in it
  hardexam: 'hardexam',  // 10 questions, 5 min, zero mistakes, no feedback
  twins: 'twins',        // look-alike questions back to back
  proof: 'proof',        // «Τελικός έλεγχος»: every question correct within the last 48 h
  morning: 'morning',    // exam-morning review: ever-missed + look-alikes + numbers
});

// Options that must stay in their printed (last) position when shuffling.
export const POSITIONAL_PATTERNS = [
  /^όλα τα παραπάνω/i, /^όλα τα ανωτέρω/i, /^και τα δύο/i, /^και οι δύο/i, /^και τα τρία/i,
  /^κανένα από τα παραπάνω/i, /^τίποτα από τα παραπάνω/i, /^όλες οι παραπάνω/i, /^όλα τα προηγούμενα/i,
];
export function isPositional(text) {
  const t = String(text).trim().replace(/^[«"']+/, '');
  return POSITIONAL_PATTERNS.some((re) => re.test(t));
}
