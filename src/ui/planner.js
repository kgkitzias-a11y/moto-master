import { h } from './dom.js';

export function planControls(ctx) {
  const p = ctx.progress, plan = p.plan();
  const update = (patch) => {
    p.updateSettings(patch);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  return h('section', { class: 'card study-plan', 'aria-label': 'Πλάνο εξετάσεων' },
    h('div', { class: 'row between' }, h('h3', null, 'Το πλάνο σου'),
      h('span', { class: 'tag' }, plan.automatic ? 'Αυτόματος στόχος' : 'Χειροκίνητος στόχος')),
    h('div', { class: 'plan-when' },
      h('div', null, h('label', { htmlFor: 'exam-date' }, 'Ημερομηνία εξετάσεων'),
        h('input', { type: 'date', id: 'exam-date', value: p.settings.examDate || '',
          onChange: (e) => update({ examDate: e.target.value || null }) })),
      h('div', null, h('label', { htmlFor: 'exam-time' }, 'Ώρα εξετάσεων'),
        h('input', { type: 'time', id: 'exam-time', step: 300, value: p.settings.examTime || '09:00',
          onChange: (e) => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) update({ examTime: e.target.value }); } }))),
    plan.days !== null ? h('p', { class: 'small muted', id: 'exam-when' }, new Intl.DateTimeFormat('el-GR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(p.settings.examDate + 'T12:00:00')), `, ${p.settings.examTime || '09:00'}`) : null,
    h('p', { class: 'small muted' }, 'Η ώρα μετρά για την πιθανότητα επιτυχίας: υπολογίζουμε πόσο θα θυμάσαι κάθε ερώτηση εκείνη την ώρα. Κάνε την τελευταία επανάληψη λίγο πριν.'),
    h('label', { class: 'plan-tentative' },
      h('input', { type: 'checkbox', checked: !!p.settings.examTentative,
        onChange: (e) => update({ examTentative: e.target.checked }) }),
      ' Προσωρινή ημερομηνία — περιμένω επιβεβαίωση'),
    plan.status === 'past' ? h('p', { class: 'bad small' }, 'Η ημερομηνία πέρασε. Άλλαξέ την για νέο αυτόματο πλάνο· μέχρι τότε ισχύει ο χειροκίνητος στόχος.') : null,
    plan.status === 'today' ? h('p', { class: 'small' }, 'Οι εξετάσεις είναι σήμερα. Δεν απομένουν άλλες μέρες μελέτης· δες τα κενά σου και κάνε επανάληψη.') : null,
    plan.automatic ? h('div', { class: 'plan-details' },
      h('p', null, h('strong', { id: 'plan-target' }, `${plan.target} ερωτήσεις σήμερα`),
        ` · ${plan.newTarget} νέες + ${plan.reviewTarget} για επανάληψη`),
      h('p', { class: 'small muted' }, `${plan.unseen} από ${plan.total} δεν τις έχεις δει ακόμη. `,
        plan.days > 0 ? `Μοιράζονται στις ${plan.studyDays} μέρες μέχρι την παραμονή των εξετάσεων, μαζί με τη σημερινή.` : 'Όσες απομένουν εμφανίζονται στον σημερινό στόχο.'),
      h('p', { class: 'small muted' }, 'Ο στόχος κρατά ξεχωριστά τις νέες ερωτήσεις και την επανάληψη από προηγούμενες μέρες. Κάθε ερώτηση μετρά μία φορά τη μέρα. Τα λάθη χρειάζονται επιπλέον εξάσκηση· η κάλυψη δεν σημαίνει ετοιμότητα.'),
      h('p', { class: 'small muted' }, 'Αν χάσεις μέρα ή αλλάξεις ημερομηνία, το πλάνο προσαρμόζεται.'))
      : h('p', { class: 'small muted' }, 'Βάλε την πιθανότερη ημερομηνία. Θα υπολογίσουμε πόσες νέες ερωτήσεις και επαναλήψεις χρειάζεσαι κάθε μέρα. Μπορείς να την αλλάξεις όποτε θέλεις.'),
  );
}
