import { h } from './dom.js';
import { practiceScore, PRACTICE_SCORE } from '../engine/practice-score.js';
import { readinessNumbers } from '../engine/chance.js';
import { fmtChance, fmtMoment } from './final.js';

export function practiceMeter(ctx) {
  const p = ctx.progress, metrics = practiceScore(p.state, ctx.questions);
  const forecast = readinessNumbers(p.state, ctx.questions, p.settings);
  const percent = Math.floor(metrics.score * 100);
  return h('section', { class: 'card practice-meter', id: 'practice-meter', 'aria-label': 'Δείκτης προετοιμασίας' },
    h('div', { class: 'eyebrow' }, 'Η ΠΡΟΟΔΟΣ ΣΟΥ'),
    h('div', { class: 'row between' }, h('h2', null, 'Δείκτης προετοιμασίας'), h('b', { class: 'meter-number', id: 'practice-score' }, `${percent}%`)),
    h('div', { class: 'readiness-track', role: 'progressbar', 'aria-label': 'Δείκτης προετοιμασίας', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent }, h('div', { style: { width: `${percent}%` } })),
    h('p', { class: 'small muted' }, 'Κάλυψη, πρόσφατες απαντήσεις, διόρθωση λαθών και προσομοιώσεις. Δεν είναι πιθανότητα επιτυχίας.'),
    h('div', { class: 'meter-facts' },
      h('div', null, h('b', null, `${metrics.seen}/${metrics.total}`), h('span', null, 'ερωτήσεις που είδες')),
      h('div', null, h('b', null, metrics.exams.total ? `${metrics.exams.passed}/${metrics.exams.total}` : '—'), h('span', null, 'περασμένες προσομοιώσεις · 7 μέρες'))),
    h('p', { class: 'small', id: 'observed-pass-rate' }, metrics.exams.total ? `Ποσοστό επιτυχίας σε προσομοιώσεις: ${Math.round(metrics.exams.rate * 100)}% (${metrics.exams.passed}/${metrics.exams.total} στις τελευταίες 7 μέρες).` : 'Κάνε μία πλήρη προσομοίωση για να μετρήσουμε το ποσοστό επιτυχίας σου.'),
    h('details', { class: 'score-explanation' }, h('summary', null, 'Πώς βγαίνει ο δείκτης'),
      h('p', { class: 'small' }, 'Δικό μας διαφανές μοντέλο, εμπνευσμένο από τη ροή του DMV Genie. Η ακριβής φόρμουλα του Genie δεν έχει επαληθευτεί.'),
      h('ul', { class: 'small' },
        h('li', null, `25%: κάλυψη των ${metrics.total} ερωτήσεων του βιβλίου.`),
        h('li', null, '25%: σωστές ανά ερώτηση στις τελευταίες 7 μέρες. Μετρούν έως 3 γύροι, με απόσταση μίας ώρας· ένα λάθος κρατά τον γύρο λανθασμένο.'),
        h('li', null, '25%: ερωτήσεις με πρόσφατη σωστή απάντηση· αν υπήρξε λάθος, θέλουν 2 σωστές στη σειρά.'),
        h('li', null, `25%: περασμένες προσομοιώσεις / σύνολο, επί min(1, σύνολο/${PRACTICE_SCORE.examEvidence}). Τελευταίες ${PRACTICE_SCORE.examLimit} στις 7 μέρες· η λήξη χρόνου μετρά, η διακοπή όχι.`)),
      h('p', { class: 'small muted' }, 'Οι ερωτήσεις εκτός ύλης και η αυτοαξιολόγηση «Από μνήμης» δεν μετράνε. Ακόμη και 100% στον δείκτη δεν εγγυάται επιτυχία.')),
    h('a', { class: 'forecast-link', href: '#/certification' }, h('span', null, 'Εκτίμηση μοντέλου για τις εξετάσεις', h('small', null, `${fmtMoment(forecast.at)} · χωρίς άλλο διάβασμα`)), h('b', null, fmtChance(forecast.chance)), h('span', { 'aria-hidden': 'true' }, '›')));
}
