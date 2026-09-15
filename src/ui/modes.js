import { MODES, RULES } from '../engine/constants.js';
import { buildQueue } from '../engine/session.js';

// Mode catalogue shown on the home screen. `setup: true` opens a parameters screen first.
export const MODE_LIST = [
  { id: MODES.due, title: 'Σήμερα', desc: 'Καθημερινή εξάσκηση: ό,τι είναι για επανάληψη, τα λάθη σου, οι νέες.', setup: false },
  { id: MODES.adaptive, title: 'Έξυπνο τεστ', desc: 'Προτεραιότητα στις νέες, τις αδύναμες και όσες είναι για επανάληψη.', setup: true },
  { id: MODES.wrong, title: 'Επανάληψη λαθών', desc: 'Μόνο τα λάθη σου· ό,τι χάνεις ξαναμπαίνει μέχρι να μη μείνει κανένα.', setup: false },
  { id: MODES.exam, title: 'Προσομοίωση εξετάσεων', desc: `${RULES.EXAM_QUESTIONS} ερωτήσεις σε ${RULES.EXAM_TIME_MS / 60000}′, το πολύ ${RULES.EXAM_MAX_WRONG} λάθος.`, setup: false },
  { id: MODES.practice, title: 'Ελεύθερη εξάσκηση', desc: 'Με τη σειρά / τυχαία / ανά κατηγορία / εύρος ID.', setup: true },
  { id: MODES.hard, title: 'Δύσκολο τεστ', desc: 'Ερωτήσεις που μπερδεύεις, η μία μετά την άλλη· λάθος → επίπεδο 0.', setup: false },
  { id: MODES.trap, title: 'Ερωτήσεις-παγίδες', desc: 'Ζευγάρια όμοιων ερωτήσεων, η μία μετά την άλλη.', setup: false },
  { id: MODES.speed, title: 'Κόντρα στον χρόνο', desc: `${RULES.SPEED_ROUND_MS / 1000} δευτερόλεπτα για κάθε ερώτηση.`, setup: false },
  { id: MODES.sudden, title: 'Μέχρι το πρώτο λάθος', desc: 'Ένα λάθος και τέλος. Κρατάει τα καλύτερα σερί σου.', setup: false },
  { id: MODES.gauntlet139, title: 'Όλο το βιβλίο', desc: 'Όλες οι ερωτήσεις του βιβλίου, μία-μία.', setup: false },
  { id: MODES.gauntlet172, title: 'Όλο το βιβλίο + εκτός ύλης', desc: 'Βιβλίο + εκτός ύλης (όλα τα ID).', setup: false },
  { id: MODES.tomorrow, title: 'Αύριο εξετάσεις', desc: 'Μόνο αδύναμες + τα λάθη σου· ξανά και ξανά, μέχρι να μη μείνει καμία.', setup: false },
  { id: MODES.signs, title: 'Μόνο σήματα', desc: 'Ερωτήσεις με εικόνα.', setup: false },
  { id: MODES.recall, title: 'Από μνήμης', desc: 'Κρυφές απαντήσεις· σκέψου, δες τη σωστή και βαθμολόγησε τίμια.', setup: true },
];

export function modeMeta(id) { return MODE_LIST.find((m) => m.id === id); }

// Number of questions a mode would serve right now (for the home-screen badge).
export function previewCount(ctx, id) {
  try {
    const q = buildQueue(id, ctx.questions, ctx.progress.state, ctx.progress.settings, Date.now(), {}, Math.random);
    return q.length;
  } catch { return 0; }
}
