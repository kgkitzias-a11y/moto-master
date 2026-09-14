import { h, clear, fmtClock, fmtMs, LETTERS } from './dom.js';
import { MODES, RULES } from '../engine/constants.js';
import { modeMeta } from './modes.js';
import { startSession } from '../engine/session.js';
import { confusions } from '../engine/reducer.js';

export function renderSession(ctx) {
  const s = ctx.session;
  if (!s || s.ended) { if (s && s.ended) { location.hash = '#/summary'; return h('div'); } location.hash = '#/'; return h('div'); }
  if (s.isEmpty) { ctx.toast('Καμία ερώτηση.'); location.hash = '#/'; return h('div'); }
  const root = h('div', { class: 'session' });
  let confidence = null;
  let timer = null;
  let locked = false;

  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  window.addEventListener('hashchange', function onLeave() { stop(); window.removeEventListener('hashchange', onLeave); if (!s.ended && location.hash !== '#/session') { s.abort(); finish(); } });

  async function finish() {
    stop();
    const ev = s.sessionEvent(Date.now());
    ctx.lastSummary = s.summary();
    if (ev) await ctx.progress.append(ev);
    if (location.hash !== '#/summary') location.hash = '#/summary';
    if (ctx.progress.dirty) ctx.progress.syncNow('session-end');
  }

  function draw() {
    clear(root);
    const cur = s.current();
    if (!cur) { finish(); return; }
    confidence = null; locked = false;
    const { q, order } = cur;
    const meta = modeMeta(s.mode);
    const top = h('div', { class: 'session-top' },
      h('span', null, `${meta ? meta.title : s.mode} · ${s.position}/${s.mode === MODES.sudden ? '∞' : s.total}`),
      h('span', { id: 'clock' }, ''),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => { if (confirm('Να τερματιστεί η συνεδρία;')) { s.abort(); finish(); } } }, 'Τέλος'));
    const bar = h('div', { class: 'timerbar hidden' }, h('div'));
    const img = q.image ? h('img', { class: 'qimg', src: q.image, alt: 'εικόνα ερώτησης' }) : null;
    const card = h('div', { class: 'qcard' },
      h('div', { class: 'qid' }, h('span', null, `#${q.id} · ${q.category}`), q.tier === 'archive' ? h('span', { class: 'tag' }, 'αρχείο') : null),
      h('div', { class: 'qtext' }, q.text), img);

    const optButtons = [];
    const optionsEl = h('div', { class: 'options' });
    const confEl = s.confidenceOn ? h('div', { class: 'conf' },
      h('button', { class: 'btn', type: 'button', dataset: { conf: 'sure' }, onClick: (e) => pickConf('sure', e.currentTarget) }, 'Σίγουρος'),
      h('button', { class: 'btn', type: 'button', dataset: { conf: 'unsure' }, onClick: (e) => pickConf('unsure', e.currentTarget) }, 'Όχι σίγουρος')) : null;
    function pickConf(v, btn) { confidence = v; for (const b of confEl.children) b.classList.toggle('sel', b === btn); for (const b of optButtons) b.disabled = false; }

    if (s.preset.recall) {
      const reveal = h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: () => { s.reveal(); reveal.remove(); showRecallAnswer(); } }, 'Αποκάλυψη απάντησης');
      card.append(h('p', { class: 'muted small' }, 'Σκέψου την απάντηση, μετά αποκάλυψέ την και βαθμολόγησε τίμια.'), reveal);
      function showRecallAnswer() {
        card.append(h('div', { class: 'feedback ok' }, h('div', { class: 'verdict' }, `Σωστή απάντηση: ${LETTERS[q.correct]}. ${q.options[q.correct]}`),
          h('div', { class: 'options', style: { marginTop: '8px' } }, q.options.map((o, i) => h('div', { class: `opt ${i === q.correct ? 'correct' : 'dim'}` }, h('span', { class: 'k' }, LETTERS[i] + '.'), h('span', null, o)))),
          q.explanation ? h('div', { class: 'explain' }, q.explanation) : null,
          h('div', { class: 'btn-row', style: { marginTop: '10px' } },
            h('button', { class: 'btn', type: 'button', onClick: () => submit(null, false) }, 'Το είχα λάθος'),
            h('button', { class: 'btn btn-primary', type: 'button', onClick: () => submit(null, true) }, 'Το ήξερα'))));
      }
    } else {
      order.forEach((origIdx, displayIdx) => {
        const b = h('button', { class: 'opt', type: 'button', disabled: s.confidenceOn, dataset: { orig: origIdx }, onClick: () => submit(origIdx) },
          h('span', { class: 'k' }, LETTERS[displayIdx] + '.'), h('span', null, q.options[origIdx]));
        optButtons.push(b); optionsEl.appendChild(b);
      });
      card.append(confEl, optionsEl);
    }
    root.append(top, bar, card);

    // timers
    const clock = top.querySelector('#clock');
    const perQ = cur.deadline !== null;
    if (perQ || s.deadline !== null) bar.classList.remove('hidden');
    const tick = () => {
      const now = Date.now();
      const r = s.tick(now);
      if (s.deadline !== null) { const rem = s.deadline - now; clock.textContent = fmtClock(rem); bar.firstChild.style.width = `${Math.max(0, rem / s.preset.timerMs * 100)}%`; bar.classList.toggle('hot', rem < 60000); }
      else if (perQ) { const rem = cur.deadline - now; clock.textContent = `${Math.max(0, rem / 1000).toFixed(1)} s`; bar.firstChild.style.width = `${Math.max(0, rem / s.preset.perQuestionMs * 100)}%`; bar.classList.toggle('hot', rem < 2000); }
      else clock.textContent = `${Math.floor((now - cur.shownAt) / 1000)} s`;
      if (r === 'question-timeout') submit(null);
      else if (r === 'session-timeout') finish();
    };
    stop(); timer = setInterval(tick, 200); tick();

    function submit(origIdx, selfGrade = null) {
      if (locked) return; locked = true; stop();
      const res = s.answer(origIdx, { now: Date.now(), confidence, selfGrade });
      if (!res) return;
      ctx.progress.append(res.event);
      if (s.preset.feedback === 'end') { if (s.ended) finish(); else draw(); return; }
      // immediate feedback
      for (const b of optButtons) {
        const oi = Number(b.dataset.orig);
        b.disabled = true;
        if (oi === q.correct) b.classList.add('correct');
        else if (oi === origIdx) b.classList.add('wrong');
        else b.classList.add('dim');
      }
      if (confEl) confEl.remove();
      const st = ctx.progress.state.q[q.id];
      const conf = confusions(st).slice(0, 2);
      const fb = h('div', { class: `feedback ${res.ok ? 'ok' : 'bad'}` },
        h('div', { class: 'verdict' }, res.ok ? 'Σωστό ✓' : (origIdx === null ? 'Τέλος χρόνου ✗' : 'Λάθος ✗')),
        h('div', { class: 'small muted' }, `${fmtMs(res.ms)} · επίπεδο ${st ? st.level : 0}/5${st && st.bin ? ' · στο κουτί λαθών' : ''}`),
        !res.ok ? h('div', { class: 'small' }, `Σωστή: ${LETTERS[q.correct]}. ${q.options[q.correct]}`) : null,
        q.explanation ? h('div', { class: 'explain' }, q.explanation) : null,
        conf.length && !res.ok ? h('div', { class: 'small warn' }, 'Μπερδεύεται με ' + conf.map((c) => `Q${c.id}`).join(', ')) : null,
        h('div', { class: 'session-actions' }, h('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'next-btn', onClick: () => { if (s.ended) finish(); else draw(); } }, s.ended ? 'Αποτελέσματα' : 'Επόμενη')),
      );
      if (s.preset.recall) { card.querySelectorAll('.feedback').forEach((x) => x.remove()); }
      card.append(fb);
      fb.querySelector('#next-btn').focus();
    }

    root._submit = submit;
  }

  // keyboard shortcuts (PC)
  root.tabIndex = -1;
  root.addEventListener('keydown', (e) => {
    const cur = s.current(); if (!cur) return;
    if (e.key >= '1' && e.key <= '5') { const b = root.querySelectorAll('.opt')[Number(e.key) - 1]; if (b && !b.disabled) b.click(); }
    else if (e.key === 'Enter') { const n = root.querySelector('#next-btn'); if (n) n.click(); }
    else if (e.key.toLowerCase() === 's' && s.confidenceOn) root.querySelector('[data-conf="sure"]')?.click();
    else if (e.key.toLowerCase() === 'u' && s.confidenceOn) root.querySelector('[data-conf="unsure"]')?.click();
  });
  draw();
  setTimeout(() => root.focus(), 0);
  return root;
}

export function renderSummary(ctx) {
  const sum = ctx.lastSummary;
  if (!sum) { location.hash = '#/'; return h('div'); }
  const meta = modeMeta(sum.mode);
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  const wrongs = [...new Set(sum.wrongs)];
  let verdict = null;
  if (sum.mode === MODES.exam) verdict = h('div', { class: `verdict-big ${sum.passed ? 'ok' : 'bad'}` }, sum.passed ? 'ΠΕΡΑΣΕΣ' : 'ΚΟΠΗΚΕΣ');
  else if (sum.mode === MODES.sudden) verdict = h('div', { class: 'verdict-big' }, `Σερί: ${sum.run}`);
  const again = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => { ctx.session = startSession(sum.mode, { questions: ctx.questions, state: ctx.progress.state, settings: ctx.progress.settings }); if (ctx.session.isEmpty) { ctx.toast('Τίποτα άλλο για αυτή τη λειτουργία.'); return; } ctx.navigate('#/session'); } }, 'Ξανά');
  return h('div', null,
    h('h1', null, meta ? meta.title : sum.mode),
    verdict,
    h('div', { class: 'card' },
      h('div', { class: 'grid' },
        h('div', { class: 'stat' }, h('div', { class: 'v' }, `${sum.correct}/${sum.answered}`), h('div', { class: 'l' }, 'σωστές')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, sum.wrong), h('div', { class: 'l' }, 'λάθη')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtClock(sum.durationMs)), h('div', { class: 'l' }, 'χρόνος'))),
      sum.endReason === 'time' ? h('p', { class: 'bad' }, 'Έληξε ο χρόνος.') : null,
      sum.endReason === 'abort' ? h('p', { class: 'muted' }, 'Η συνεδρία τερματίστηκε νωρίς.') : null,
      sum.completed && sum.mode === MODES.due ? h('p', { class: 'ok' }, 'Το σημερινό drill ολοκληρώθηκε ✓') : null,
      sum.completed && (sum.mode === MODES.tomorrow || sum.mode === MODES.wrong) ? h('p', { class: 'ok' }, 'Μηδενίστηκε ✓') : null),
    wrongs.length ? h('div', { class: 'card' }, h('h3', null, 'Λάθη'), h('div', { class: 'list' }, wrongs.map((id) => { const q = byId.get(id); return h('a', { class: 'qrow', href: `#/q/${id}` }, h('span', { class: 'id' }, `#${id}`), h('span', { class: 'txt' }, q ? q.text : '')); }))) : null,
    h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/' }, 'Αρχική'), again),
  );
}
