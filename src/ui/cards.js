import { h } from './dom.js';
import { RULES } from '../engine/constants.js';
import { twinSets } from '../engine/selection.js';

// «Κάρτες»: one page to read before the exam. Everything with an answer is computed from the
// answer key, so the cards can never disagree with the questions.

// Speed-limit questions of the booklet: [question id, engine class, road].
const SPEED = [
  [3, 'έως 125 cc', 'Επαρχιακό δίκτυο'], [7, 'έως 125 cc', 'Οδός ταχείας κυκλοφορίας'], [55, 'έως 125 cc', 'Αυτοκινητόδρομος'],
  [20, 'πάνω από 125 cc', 'Επαρχιακό δίκτυο'], [47, 'πάνω από 125 cc', 'Οδός ταχείας κυκλοφορίας'], [31, 'πάνω από 125 cc', 'Αυτοκινητόδρομος'],
];
const ROADS = ['Επαρχιακό δίκτυο', 'Οδός ταχείας κυκλοφορίας', 'Αυτοκινητόδρομος'];
const CLASSES = ['έως 125 cc', 'πάνω από 125 cc'];
const NUM_RE = /\d|km\/h|cm|\bm\b|cc\b|%|°/;

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hasWord = (s, re) => re.test(fold(s));
const ONLY = /(^|[^\p{L}])μονον?([^\p{L}]|$)/u;
const ANY = /οποι\p{L}*δηποτε/u;
const MAKER = /κατασκευαστ/u;

// How often a kind of option is the right one, across the booklet.
export function answerPatterns(questions) {
  const booklet = questions.filter((q) => q.tier === 'booklet');
  const longest = booklet.filter((q) => q.options.reduce((best, o, i) => (o.length > q.options[best].length ? i : best), 0) === q.correct).length;
  const rate = (re) => {
    let total = 0, right = 0;
    for (const q of booklet) q.options.forEach((o, i) => { if (hasWord(o, re)) { total++; if (i === q.correct) right++; } });
    return { total, right };
  };
  return { n: booklet.length, longest, only: rate(ONLY), any: rate(ANY), maker: rate(MAKER) };
}

const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

export function renderCards(ctx) {
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  const booklet = ctx.questions.filter((q) => q.tier === 'booklet');
  const pool = ctx.activeQuestions();
  const answer = (q) => q.options[q.correct];

  const speedCell = (cls, road) => {
    const row = SPEED.find((s) => s[1] === cls && s[2] === road);
    const q = row && byId.get(row[0]);
    return h('td', null, q ? h('a', { href: `#/q/${q.id}` }, answer(q).replace(/\.$/, '')) : '—');
  };
  // Roads as rows, engine classes as columns: fits a phone screen.
  const speed = h('table', { class: 'speed-table' },
    h('thead', null, h('tr', null, h('th', null, ''), CLASSES.map((c) => h('th', null, c)))),
    h('tbody', null, ROADS.map((r) => h('tr', null, h('th', { scope: 'row' }, r), CLASSES.map((c) => speedCell(c, r))))));

  const numbers = booklet.filter((q) => NUM_RE.test(q.text) || NUM_RE.test(answer(q)));
  const sets = twinSets(pool);
  const pat = answerPatterns(ctx.questions);
  const reworded = booklet.filter((q) => q.exam);

  const qa = (q) => h('div', { class: 'qa' }, h('div', { class: 'q' }, h('a', { class: 'id', href: `#/q/${q.id}` }, `#${q.id}`), q.text, q.tier === 'archive' ? h('span', { class: 'tag' }, 'εκτός ύλης') : null), h('div', { class: 'a' }, `✓ ${answer(q)}`));
  const times = (n) => `${n} ${n === 1 ? 'φορά' : 'φορές'}`;

  return h('div', { class: 'cards-page' },
    h('h1', null, 'Κάρτες'),
    h('p', { class: 'small muted' }, 'Για διάβασμα πριν τις εξετάσεις. Όλες οι απαντήσεις βγαίνουν από το κλειδί του βιβλίου.'),
    h('nav', { class: 'chips' }, [['#c-speed', 'Όρια ταχύτητας'], ['#c-twins', 'Δίδυμες'], ['#c-unknown', 'Άγνωστη ερώτηση'], ['#c-examday', 'Ημέρα εξετάσεων'], ['#c-numbers', 'Όλοι οι αριθμοί']]
      .map(([href, label]) => h('button', { type: 'button', class: 'chip', onClick: () => document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' }) }, label))),

    h('section', { class: 'card', id: 'c-speed' }, h('h2', null, 'Όρια ταχύτητας'),
      speed,
      h('p', { class: 'small muted' }, CLASSES.map((c) => `${c[0].toUpperCase()}${c.slice(1)}: ${ROADS.map((r) => { const row = SPEED.find((s) => s[1] === c && s[2] === r); const q = row && byId.get(row[0]); return q ? answer(q).replace(/ ?km\/h\.?$/, '') : '—'; }).join(' / ')} km/h`).join(' · '),
        ' (επαρχιακό / οδός ταχείας / αυτοκινητόδρομος). Πάτα μια τιμή για να δεις την ερώτηση.')),

    h('section', { class: 'card', id: 'c-twins' }, h('h2', null, 'Δίδυμες ερωτήσεις'),
      h('p', { class: 'small muted' }, 'Ίδια ή σχεδόν ίδια διατύπωση, άλλη σωστή απάντηση. Στις εξετάσεις διάβασε όλες τις επιλογές: η σωστή είναι αυτή που υπάρχει στη δική σου εκδοχή.'),
      sets.map((set) => h('div', { class: 'twin-set' }, set.map((id) => qa(byId.get(id)))))),

    h('section', { class: 'card', id: 'c-unknown' }, h('h2', null, 'Αν δεις ερώτηση που δεν ξέρεις'),
      h('ul', { class: 'tips' },
        h('li', null, 'Διάβασε την ερώτηση ως το τέλος και όλες τις επιλογές. Στις εξετάσεις οι επιλογές έχουν άλλη σειρά από το βιβλίο· απάντα από το κείμενο, όχι από το γράμμα.'),
        h('li', null, `Η μεγαλύτερη και πληρέστερη επιλογή είναι η σωστή στο ${pct(pat.longest, pat.n)} % των ερωτήσεων του βιβλίου (στην τύχη: περίπου 33 %).`),
        h('li', null, `Επιλογές με «μόνο»: σωστές μόνο ${times(pat.only.right)} στις ${pat.only.total} (${pct(pat.only.right, pat.only.total)} %).`),
        h('li', null, `Επιλογές με «οποιοσδήποτε / οποιοδήποτε»: σωστές ${times(pat.any.right)} στις ${pat.any.total}.`),
        h('li', null, `Επιλογές που παραπέμπουν στον κατασκευαστή: σωστές ${times(pat.maker.right)} στις ${pat.maker.total} (${pct(pat.maker.right, pat.maker.total)} %).`),
        h('li', null, 'Αν δεν είσαι σίγουρος, πάτα «Παράλειψη». Η ερώτηση ξαναέρχεται στο τέλος, αφού απαντήσεις τις άλλες.'))),

    h('section', { class: 'card', id: 'c-examday' }, h('h2', null, 'Την ημέρα των εξετάσεων'),
      h('ul', { class: 'tips' },
        h('li', null, 'Έχε μαζί σου την αστυνομική ταυτότητα ή το διαβατήριό σου και ό,τι άλλο σου ζητήσει η σχολή σου.'),
        h('li', null, `${RULES.EXAM_QUESTIONS} ερωτήσεις, μία από κάθε ομάδα του επίσημου ερωτηματολογίου (10 ομάδες). ${RULES.EXAM_TIME_MS / 60000} λεπτά. Περνάς με το πολύ ${RULES.EXAM_MAX_WRONG} λάθος.`),
        h('li', null, 'Μία ερώτηση σε κάθε οθόνη. Μόλις πατήσεις μια απάντηση, περνάς αμέσως στην επόμενη, χωρίς κουμπί επιβεβαίωσης: διάβασε όλες τις επιλογές πριν πατήσεις.'),
        h('li', null, 'Μπορείς να παραλείψεις μια ερώτηση· μετά την τελευταία, το σύστημα σε γυρίζει στις αναπάντητες. Θεώρησε ότι μια απάντηση που έδωσες δεν αλλάζει.'),
        h('li', null, 'Οθόνη αφής ή ποντίκι. Αν θέλεις, ζήτα ακουστικά για να ακούς τις ερωτήσεις στα ελληνικά.'),
        h('li', null, 'Στο τέλος παίρνεις τυπωμένο πρακτικό με τις ερωτήσεις, τις απαντήσεις σου και το αποτέλεσμα. Αν κοπείς, ξαναδίνεις μετά από 7 μέρες.')),
      reworded.length ? h('div', null,
        h('h3', null, 'Διατυπωμένες αλλιώς από το βιβλίο'),
        h('p', { class: 'small muted' }, 'Έτσι εμφανίζονται στον υπολογιστή των εξετάσεων (επίσημη βάση του Υπουργείου). Η σωστή απάντηση είναι η ίδια.'),
        reworded.map((q) => h('div', { class: 'qa' },
          h('div', { class: 'q' }, h('a', { class: 'id', href: `#/q/${q.id}` }, `#${q.id}`), q.exam.text || q.text),
          h('div', { class: 'a' }, `✓ ${q.exam.options[q.correct]}`),
          q.exam.options[q.correct] !== answer(q) ? h('div', { class: 'small muted' }, `Στο βιβλίο: ${answer(q)}`) : null))) : null),

    h('section', { class: 'card', id: 'c-numbers' }, h('h2', null, `Όλες οι ερωτήσεις με αριθμούς (${numbers.length})`),
      numbers.map(qa)),

    h('div', { class: 'btn-row', style: { marginTop: '12px' } }, h('a', { class: 'btn', href: '#/' }, 'Αρχική'), h('a', { class: 'btn', href: '#/sheet' }, 'Σκονάκι')),
  );
}
