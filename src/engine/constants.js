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
  EXAM_TIME_MS: 10 * 60 * 1000,            // official per-questionnaire timer (see DECISIONS)
  READY_MOCKS: 5,                          // 5 consecutive 10/10 timed mocks
  READY_MOCK_DAYS: 3,                      // … on ≥3 distinct days
  READY_SUDDEN_DEATH: 60,                  // one Sudden Death run ≥60
  SPEED_ROUND_MS: 5000,
  WEAK_LEVEL: 3,                           // level < 3 counts as weak
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
