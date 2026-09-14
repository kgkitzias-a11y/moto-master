import { h } from './dom.js';
import { MODES } from '../engine/constants.js';
import { startSession } from '../engine/session.js';
import { modeMeta } from './modes.js';

export function renderModeSetup(ctx, mode) {
  const meta = modeMeta(mode);
  if (!meta) return h('div', { class: 'card' }, 'Άγνωστη λειτουργία.');
  const active = ctx.activeQuestions();
  const categories = [...new Set(active.map((q) => q.category))].sort((a, b) => a.localeCompare(b, 'el'));
  const ids = active.map((q) => q.id);
  const minId = Math.min(...ids), maxId = Math.max(...ids);

  const params = { policy: mode === MODES.practice ? 'sequential' : 'random', count: 20, category: categories[0], from: minId, to: maxId };
  const start = () => {
    const p = { ...params, from: Number(params.from), to: Number(params.to), count: Number(params.count) || 20 };
    ctx.session = startSession(mode, { questions: ctx.questions, state: ctx.progress.state, settings: ctx.progress.settings, params: p });
    if (ctx.session.isEmpty) { ctx.toast('Καμία ερώτηση με αυτά τα κριτήρια.'); return; }
    ctx.navigate('#/session');
  };

  const body = [];
  if (mode === MODES.practice || mode === MODES.recall) {
    const policies = mode === MODES.practice
      ? [['sequential', 'Σειριακά'], ['random', 'Τυχαία'], ['category', 'Ανά κατηγορία'], ['range', 'Εύρος ID']]
      : [['random', 'Τυχαία'], ['sequential', 'Σειριακά']];
    const extra = h('div');
    const renderExtra = () => {
      extra.replaceChildren();
      if (params.policy === 'category') extra.append(h('label', null, 'Κατηγορία'), h('select', { onChange: (e) => { params.category = e.target.value; } }, categories.map((c) => h('option', { value: c, selected: c === params.category }, c))));
      if (params.policy === 'range') extra.append(h('label', null, 'Από ID'), h('input', { type: 'number', inputmode: 'numeric', value: params.from, min: minId, max: maxId, onInput: (e) => { params.from = e.target.value; } }), h('label', null, 'Έως ID'), h('input', { type: 'number', inputmode: 'numeric', value: params.to, min: minId, max: maxId, onInput: (e) => { params.to = e.target.value; } }));
      if (params.policy === 'random') extra.append(h('label', null, 'Πλήθος ερωτήσεων'), h('input', { type: 'number', inputmode: 'numeric', value: params.count, min: 1, max: active.length, onInput: (e) => { params.count = e.target.value; } }));
    };
    const chips = h('div', { class: 'chips' }, policies.map(([v, l]) => h('button', { type: 'button', class: `chip ${params.policy === v ? 'on' : ''}`, onClick: (e) => { params.policy = v; for (const c of chips.children) c.classList.toggle('on', c === e.currentTarget); renderExtra(); } }, l)));
    renderExtra();
    body.push(h('label', null, 'Επιλογή'), chips, extra);
  } else if (mode === MODES.adaptive) {
    body.push(h('label', null, 'Πλήθος ερωτήσεων'), h('input', { type: 'number', inputmode: 'numeric', value: params.count, min: 5, max: active.length, onInput: (e) => { params.count = e.target.value; } }));
  }

  return h('div', null,
    h('h1', null, meta.title), h('p', { class: 'muted' }, meta.desc),
    h('div', { class: 'card' }, body),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/' }, 'Πίσω'), h('button', { class: 'btn btn-primary', type: 'button', onClick: start }, 'Έναρξη')),
  );
}
