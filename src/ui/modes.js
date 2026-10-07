import { MODES, RULES } from '../engine/constants.js';
import { buildQueue } from '../engine/session.js';

// Mode catalogue, grouped Genie-style. `setup: true` opens a parameters screen first.
export const SECTIONS = [
  { id: 'exam', title: 'Εξετάσεις', modes: [
    { id: MODES.exam, title: 'Προσομοίωση εξετάσεων', desc: `Όπως στις εξετάσεις: ${RULES.EXAM_QUESTIONS} ερωτήσεις, μία από κάθε ομάδα, σε ${RULES.EXAM_TIME_MS / 60000}′, το πολύ ${RULES.EXAM_MAX_WRONG} λάθος.`, setup: false },
    { id: MODES.hardexam, title: 'Σκληρή προσομοίωση', desc: `${RULES.EXAM_QUESTIONS} ερωτήσεις σε ${RULES.HARD_EXAM_TIME_MS / 60000}′, κανένα λάθος, χωρίς βοήθεια.`, setup: false, hard: true },
  ] },
  { id: 'review', title: 'Επανάληψη', modes: [
    { id: MODES.due, title: 'Σήμερα', desc: 'Καθημερινή εξάσκηση: ό,τι είναι για επανάληψη, τα λάθη σου, οι νέες.', setup: false },
    { id: MODES.wrong, title: 'Επανάληψη λαθών', desc: 'Μόνο τα λάθη σου· ό,τι χάνεις ξαναμπαίνει μέχρι να μη μείνει κανένα.', setup: false },
    { id: MODES.hardest, title: 'Οι πιο δύσκολες', desc: `Οι ${RULES.HARDEST_COUNT} ερωτήσεις με τη χειρότερη επίδοσή σου.`, setup: false, hard: true },
    { id: MODES.tomorrow, title: 'Αύριο εξετάσεις', desc: 'Μόνο αδύναμες + τα λάθη σου· ξανά και ξανά, μέχρι να μη μείνει καμία.', setup: false },
    { id: MODES.proof, title: 'Τελικός έλεγχος', desc: 'Όσες δεν έχεις απαντήσει σωστά τις τελευταίες 48 ώρες· ξανά μέχρι να μη μείνει καμία.', setup: false },
    { id: MODES.morning, title: 'Πρωί των εξετάσεων', desc: 'Όσες έχεις χάσει ποτέ, οι δίδυμες και οι αριθμοί· η τελευταία επανάληψη.', setup: false },
  ] },
  { id: 'practice', title: 'Εξάσκηση', modes: [
    { id: MODES.adaptive, title: 'Έξυπνο τεστ', desc: 'Προτεραιότητα στις νέες, τις αδύναμες και όσες είναι για επανάληψη.', setup: true },
    { id: MODES.practice, title: 'Ελεύθερη εξάσκηση', desc: 'Με τη σειρά / τυχαία / ανά κατηγορία / εύρος ID.', setup: true },
    { id: MODES.numbers, title: 'Αριθμοί & όρια', desc: 'Όρια ταχύτητας, αποστάσεις, διαστάσεις, ποσοστά — ό,τι έχει νούμερο.', setup: false },
    { id: MODES.marathon, title: 'Μαραθώνιος', desc: 'Όλες οι ερωτήσεις· ό,τι χάνεις ξαναμπαίνει μέχρι να τις περάσεις όλες.', setup: false, hard: true },
    { id: MODES.gauntlet139, title: 'Όλο το βιβλίο', desc: 'Όλες οι ερωτήσεις του βιβλίου, μία-μία.', setup: false },
    { id: MODES.gauntlet172, title: 'Όλο το βιβλίο + εκτός ύλης', desc: 'Βιβλίο + εκτός ύλης (όλα τα ID).', setup: false },
    { id: MODES.recall, title: 'Από μνήμης', desc: 'Κρυφές απαντήσεις· σκέψου, δες τη σωστή και βαθμολόγησε τίμια.', setup: true },
    { id: MODES.signs, title: 'Μόνο σήματα', desc: 'Ερωτήσεις με εικόνα.', setup: false },
  ] },
  { id: 'hard', title: 'Σκληρά τεστ', modes: [
    { id: MODES.hard, title: 'Δύσκολο τεστ', desc: 'Ερωτήσεις που μπερδεύεις, η μία μετά την άλλη· λάθος → επίπεδο 0.', setup: false, hard: true },
    { id: MODES.twins, title: 'Δίδυμες ερωτήσεις', desc: 'Ίδια ή σχεδόν ίδια ερώτηση, άλλη σωστή απάντηση· η μία μετά την άλλη.', setup: false, hard: true },
    { id: MODES.trap, title: 'Ερωτήσεις-παγίδες', desc: 'Ζευγάρια όμοιων ερωτήσεων, η μία μετά την άλλη.', setup: false, hard: true },
    { id: MODES.speed, title: 'Κόντρα στον χρόνο', desc: `${RULES.SPEED_ROUND_MS / 1000} δευτερόλεπτα για κάθε ερώτηση.`, setup: false, hard: true },
    { id: MODES.sudden, title: 'Μέχρι το πρώτο λάθος', desc: 'Ένα λάθος και τέλος. Κρατάει τα καλύτερα σερί σου.', setup: false, hard: true },
  ] },
];

export const MODE_LIST = SECTIONS.flatMap((s) => s.modes);

export function modeMeta(id) {
  if (id === MODES.goal) return { id, title: 'Προς τον στόχο', desc: 'Συνέχισε μέχρι να πιάσεις τον ημερήσιο στόχο.' };
  if (id === MODES.ptest) return { id, title: 'Τεστ εξάσκησης', desc: `${RULES.PTEST_SIZE} ερωτήσεις· περνάει μόνο με 100 %.` };
  return MODE_LIST.find((m) => m.id === id);
}

// Number of questions a mode would serve right now (for the home-screen badge).
export function previewCount(ctx, id) {
  try {
    const q = buildQueue(id, ctx.questions, ctx.progress.state, ctx.progress.settings, Date.now(), {}, Math.random);
    return q.length;
  } catch { return 0; }
}
