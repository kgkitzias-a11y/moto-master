import { MODES, RULES } from '../engine/constants.js';
import { buildQueue } from '../engine/session.js';

// Mode catalogue shown on the home screen. `setup: true` opens a parameters screen first.
export const MODE_LIST = [
  { id: MODES.due, title: 'Σήμερα', desc: 'Καθημερινό drill: ό,τι είναι ώριμο για προαγωγή, το κουτί λαθών, οι αδιάβαστες.', setup: false },
  { id: MODES.adaptive, title: 'Προσαρμοστική αδυναμία', desc: 'Ζυγίζει αδιάβαστες + αδύναμες + ώριμες για προαγωγή.', setup: true },
  { id: MODES.wrong, title: 'Ανακύκλωση λαθών', desc: 'Μόνο το κουτί λαθών· ξαναμπαίνει ό,τι χάνεις μέχρι να μηδενιστεί.', setup: false },
  { id: MODES.exam, title: 'Πραγματικές εξετάσεις', desc: `${RULES.EXAM_QUESTIONS} ερωτήσεις, χρονόμετρο ${RULES.EXAM_TIME_MS / 60000}′, το πολύ ${RULES.EXAM_MAX_WRONG} λάθος.`, setup: false },
  { id: MODES.practice, title: 'Εξάσκηση', desc: 'Σειριακά / τυχαία / ανά κατηγορία / εύρος ID.', setup: true },
  { id: MODES.hard, title: 'Hard Mode', desc: 'Συνεχόμενες συστάδες σύγχυσης· λάθος → επίπεδο 0.', setup: false },
  { id: MODES.trap, title: 'Παγίδες', desc: 'Όμοια ζευγάρια ερωτήσεων συνεχόμενα.', setup: false },
  { id: MODES.speed, title: 'Speed Round', desc: `${RULES.SPEED_ROUND_MS / 1000} δευτερόλεπτα ανά ερώτηση.`, setup: false },
  { id: MODES.sudden, title: 'Sudden Death', desc: 'Ένα λάθος και τελείωσε. Πίνακας καλύτερων σερί.', setup: false },
  { id: MODES.gauntlet139, title: 'Gauntlet βιβλίου', desc: 'Όλες οι ερωτήσεις του βιβλίου, μία-μία.', setup: false },
  { id: MODES.gauntlet172, title: 'Gauntlet 172', desc: 'Βιβλίο + αρχείο (όλα τα ID).', setup: false },
  { id: MODES.tomorrow, title: 'Αύριο εξετάσεις', desc: 'Μόνο αδύναμες + κουτί λαθών· επαναλαμβάνει μέχρι να μηδενιστούν.', setup: false },
  { id: MODES.signs, title: 'Μόνο πινακίδες', desc: 'Ερωτήσεις με εικόνα.', setup: false },
  { id: MODES.recall, title: 'Ανάκληση', desc: 'Κρυφές επιλογές· αποκάλυψη· ειλικρινής αυτοβαθμολόγηση.', setup: true },
];

export function modeMeta(id) { return MODE_LIST.find((m) => m.id === id); }

// Number of questions a mode would serve right now (for the home-screen badge).
export function previewCount(ctx, id) {
  try {
    const q = buildQueue(id, ctx.questions, ctx.progress.state, ctx.progress.settings, Date.now(), {}, Math.random);
    return q.length;
  } catch { return 0; }
}
