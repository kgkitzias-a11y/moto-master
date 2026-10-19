import { h } from './dom.js';
import { passChance } from '../engine/chance.js';

// One presentation of the existing model, evaluated now. No new score or stored state.
export function renderPassEstimate(ctx) {
  const state = ctx.progress.state;
  const bank = ctx.questions.filter(q => q.tier === 'booklet');
  const seen = bank.filter(q => state.q[q.id]?.history.some(a => a.m !== 'recall')).length;
  const chance = seen ? passChance(state, ctx.questions, Date.now()) : null;
  const value = Number.isFinite(chance)
    ? `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(Math.min(99.9, Math.max(0, chance * 100)))}%`
    : '—';
  return h('section', { class: 'card pass-estimate', id: 'pass-estimate', 'aria-labelledby': 'pass-estimate-title' },
    h('div', { class: 'eyebrow' }, 'MOTO MASTER / ΕΚΤΙΜΗΣΗ'),
    h('h1', { id: 'pass-estimate-title' }, 'Πιθανότητα επιτυχίας'),
    h('div', { class: 'pass-estimate-value', id: 'pass-estimate-value', role: 'status', 'aria-label': `Εκτιμώμενη πιθανότητα επιτυχίας: ${value}` }, value),
    h('p', { class: 'pass-estimate-caption' }, seen ? 'Αν έδινες τώρα · εκτίμηση βάσει εξάσκησης, όχι εγγύηση.' : 'Απάντησε στην πρώτη ερώτηση για να εμφανιστεί εκτίμηση.'),
    h('details', { class: 'pass-estimate-details' }, h('summary', null, 'Πώς υπολογίζεται;'),
      h('p', null, 'Το μοντέλο Moto Master χρησιμοποιεί το αποθηκευμένο ιστορικό: σωστές απαντήσεις, λάθη, απόσταση μεταξύ επαναλήψεων και χρόνο από την τελευταία εξάσκηση. Οι ερωτήσεις που δεν έχεις δει υπολογίζονται σαν τυχαία επιλογή απάντησης.'),
      h('p', null, 'Υπολογίζει μία μέση πιθανότητα σωστής απάντησης για καθεμία από τις 10 ομάδες εξετάσεων. Έπειτα αθροίζει την πιθανότητα για 9 ή 10 σωστές, με μία ερώτηση ανά ομάδα, θεωρώντας τις απαντήσεις ανεξάρτητες.'),
      h('p', null, 'Οι παράμετροι είναι προσεγγιστικές και δεν έχουν επικυρωθεί με πραγματικά αποτελέσματα εξετάσεων. Δεν είναι ο επαληθευμένος αλγόριθμος του DMV Genie. Η ακρίβεια στο Mega τεστ είναι ξεχωριστό, μετρημένο αποτέλεσμα.')));
}
