import { h, clear, append, fmtClock, fmtMs, LETTERS } from './dom.js';
import { MODES, RULES } from '../engine/constants.js';
import { modeMeta } from './modes.js';
import { startSession } from '../engine/session.js';
import { confusions, isMastered } from '../engine/reducer.js';
import { sfx, haptic, confetti, praise } from './fx.js';
import { RULES as R } from '../engine/constants.js';

export function renderSession(ctx) {
  const s = ctx.session;
  if (!s || s.ended) { if (s && s.ended) { location.hash = '#/summary'; return h('div'); } location.hash = '#/'; return h('div'); }
  if (s.isEmpty) { ctx.toast('Καμία ερώτηση.'); location.hash = '#/'; return h('div'); }
  const root = h('div', { class: 'session' });
  let confidence = null;
  let timer = null;
  let locked = false;
  let combo = 0, bestCombo = 0;
  const fxOn = { sound: ctx.progress.settings.sound !== false, haptics: ctx.progress.settings.haptics !== false };
  const masteredBefore = new Set(ctx.questions.filter((q) => isMastered(ctx.progress.state.q[q.id])).map((q) => q.id));
  ctx._sessionFx = { combo: () => bestCombo, masteredBefore };

  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  window.addEventListener('hashchange', function onLeave() { stop(); window.removeEventListener('hashchange', onLeave); if (!s.ended && location.hash !== '#/session') { s.abort(); finish({ navigate: false }); } });

  async function finish({ navigate = true } = {}) {
    stop();
    const plan = ctx.progress.plan();
    const ev = s.sessionEvent(Date.now(), { goalReached: plan.remaining === 0 && plan.target > 0 });
    ctx.lastSummary = s.summary();
    if (ev) await ctx.progress.append(ev);
    if (navigate && location.hash !== '#/summary') location.hash = '#/summary';
    if (ctx.progress.dirty) ctx.progress.syncNow('session-end');
  }

  function draw() {
    clear(root);
    const cur = s.current();
    if (!cur) { finish(); return; }
    s.show(Date.now());
    confidence = null; locked = false;
    const { q, order } = cur;
    const meta = modeMeta(s.mode);
    const comboEl = h('span', { class: `combo ${combo >= 10 ? 'c10' : combo >= 5 ? 'c5' : ''}`, id: 'combo' }, combo >= 2 ? `🔥 ${combo} στη σειρά` : '');
    const top = h('div', { class: 'session-top' },
      h('span', null, `${meta ? meta.title : s.mode} · ${s.position}/${s.mode === MODES.sudden ? '∞' : s.total}`),
      comboEl,
      h('span', { id: 'clock' }, ''),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => { if (confirm('Να σταματήσει το τεστ;')) { s.abort(); finish(); } } }, 'Τέλος'));
    const bar = h('div', { class: 'timerbar hidden' }, h('div'));
    const prog = s.mode === MODES.sudden ? null : h('div', { class: 'progress' }, h('div', { style: { width: `${((s.position - 1) / Math.max(1, s.total)) * 100}%` } }));
    const img = q.image ? h('img', { class: 'qimg', src: q.image, alt: 'εικόνα ερώτησης' }) : null;
    const card = h('div', { class: 'qcard' },
      h('div', { class: 'qid' }, h('span', null, `#${q.id} · ${q.category}`), q.tier === 'archive' ? h('span', { class: 'tag' }, 'εκτός ύλης') : null),
      h('div', { class: 'qtext' }, q.text), img);

    const optButtons = [];
    const optionsEl = h('div', { class: 'options' });

    if (s.preset.recall) {
      const reveal = h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: () => { s.reveal(); reveal.remove(); showRecallAnswer(); } }, 'Δείξε την απάντηση');
      card.append(h('p', { class: 'muted small' }, 'Σκέψου την απάντηση, μετά δες τη σωστή και βαθμολόγησε τίμια.'), reveal);
      function showRecallAnswer() {
        card.append(h('div', { class: 'feedback ok' }, h('div', { class: 'verdict' }, `Σωστή απάντηση: ${LETTERS[q.correct]}. ${q.options[q.correct]}`),
          h('div', { class: 'options', style: { marginTop: '8px' } }, q.options.map((o, i) => h('div', { class: `opt ${i === q.correct ? 'correct' : 'dim'}` }, h('span', { class: 'k' }, LETTERS[i] + '.'), h('span', null, o)))),
          q.explanation ? h('div', { class: 'explain' }, q.explanation) : null,
          h('div', { class: 'btn-row', style: { marginTop: '10px' } },
            h('button', { class: 'btn', type: 'button', onClick: () => submit(null, false) }, 'Δεν το ήξερα'),
            h('button', { class: 'btn btn-primary', type: 'button', onClick: () => submit(null, true) }, 'Το ήξερα'))));
      }
    } else {
      order.forEach((origIdx, displayIdx) => {
        const b = h('button', { class: 'opt', type: 'button', dataset: { orig: origIdx }, onClick: () => submit(origIdx) },
          h('span', { class: 'k' }, LETTERS[displayIdx] + '.'), h('span', null, q.options[origIdx]));
        optButtons.push(b); optionsEl.appendChild(b);
      });
      card.append(optionsEl);
    }
    root.append(top, prog, bar, card);

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

    async function submit(origIdx, selfGrade = null) {
      if (locked) return; locked = true; stop();
      const res = s.answer(origIdx, { now: Date.now(), confidence, selfGrade });
      if (!res) return;
      const levelBefore = (ctx.progress.state.q[q.id] || { level: 0 }).level;
      await ctx.progress.append(res.event); // state below must reflect this answer
      if (res.ok) { combo++; if (combo > bestCombo) bestCombo = combo; } else combo = 0;
      if (fxOn.sound) { if (res.ok) sfx.correct(combo); else sfx.wrong(); }
      if (fxOn.haptics) haptic(res.ok ? 12 : [40, 40, 40]);
      if (s.preset.feedback === 'end') { if (s.ended) finish(); else draw(); return; }
      card.classList.add(res.ok ? 'flash-ok' : 'flash-bad');
      comboEl.textContent = combo >= 2 ? `🔥 ${combo} στη σειρά` : ''; comboEl.className = `combo ${combo >= 10 ? 'c10' : combo >= 5 ? 'c5' : ''} bump`;
      // immediate feedback
      for (const b of optButtons) {
        const oi = Number(b.dataset.orig);
        b.disabled = true;
        if (oi === q.correct) b.classList.add('correct');
        else if (oi === origIdx) b.classList.add('wrong');
        else b.classList.add('dim');
      }
      const st = ctx.progress.state.q[q.id];
      const conf = confusions(st).slice(0, 2);
      const leveled = st && st.level > levelBefore;
      const mastered = st && isMastered(st) && !masteredBefore.has(q.id);
      if (leveled && fxOn.sound) sfx.levelUp();
      if (mastered) { masteredBefore.add(q.id); ctx.toast(`★ Η #${q.id} ΕΜΠΕΔΩΘΗΚΕ — ${ctx.questions.filter((x) => isMastered(ctx.progress.state.q[x.id])).length}/${ctx.questions.filter((x) => x.tier === 'booklet').length}`, 3000, 'gold'); if (fxOn.sound) sfx.fanfare(); }
      const fb = h('div', { class: `feedback ${res.ok ? 'ok' : 'bad'}` },
        h('div', { class: 'verdict' }, res.ok ? `Σωστό ✓ ${praise(res.ms, combo)}` : (origIdx === null ? 'Τέλος χρόνου ✗' : 'Λάθος ✗')),
        h('div', { class: 'small muted' }, `${fmtMs(res.ms)} · επίπεδο ${st ? st.level : 0}/5${st && st.bin ? ' · στα λάθη σου' : ''}${!res.ok && levelBefore > (st ? st.level : 0) ? ` · έπεσε από ${levelBefore}` : ''}`),
        leveled ? h('div', { class: 'levelup' }, `▲ Επίπεδο ${st.level}/5${st.level === 5 ? ' — κορυφή' : ''}`) : null,
        !res.ok ? h('div', { class: 'small' }, `Σωστή: ${LETTERS[order.indexOf(q.correct)]}. ${q.options[q.correct]}`) : null,
        q.explanation ? h('div', { class: 'explain' }, q.explanation) : null,
        conf.length && !res.ok ? h('div', { class: 'small warn' }, 'Την μπερδεύεις με ' + conf.map((c) => `${c.id}`).join(', ')) : null,
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
  if (sum.mode === MODES.exam || sum.mode === MODES.hardexam) verdict = h('div', { class: `verdict-big ${sum.passed ? 'ok' : 'bad'}` }, sum.passed ? 'ΠΕΡΑΣΕΣ' : 'ΚΟΠΗΚΕΣ');
  else if (sum.mode === MODES.ptest) verdict = h('div', { class: `verdict-big ${sum.passed ? 'ok' : 'bad'}` }, sum.passed ? 'ΠΕΡΑΣΕΣ 100 %' : `${sum.correct}/${sum.total}`);
  else if (sum.mode === MODES.sudden) verdict = h('div', { class: 'verdict-big' }, `${sum.run} στη σειρά`);
  const again = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => { ctx.session = startSession(sum.mode, { questions: ctx.questions, state: ctx.progress.state, settings: ctx.progress.settings, params: sum.params || {} }); if (ctx.session.isEmpty) { ctx.toast('Δεν έμεινε τίποτα άλλο για αυτό το τεστ.'); return; } ctx.navigate('#/session'); } }, 'Ξανά');
  const perfect = sum.answered > 0 && sum.wrong === 0 && sum.endReason !== 'abort';
  const plan = ctx.progress.plan();
  const goal = plan.target;
  const remaining = plan.remaining;
  const goalReached = remaining === 0;
  const continueBtn = remaining > 0 ? h('button', { class: 'btn btn-primary btn-block btn-hero', type: 'button', id: 'continue-goal', onClick: () => { const next = ctx.progress.plan(); ctx.session = startSession(MODES.goal, { questions: ctx.questions, state: ctx.progress.state, settings: ctx.progress.settings, params: next.automatic ? { plannedIds: next.queue } : { remaining: next.remaining } }); if (ctx.session.isEmpty) { ctx.toast('Δεν υπάρχουν άλλες ερωτήσεις τώρα.'); return; } ctx.navigate('#/session'); } }, `Συνέχισε (${remaining} ακόμα για τον στόχο) ▶`) : h('p', { class: 'ok', style: { textAlign: 'center', fontWeight: 700 } }, `Ημερήσιος στόχος ${goal} ✓`);
  const goalWasJustReached = goalReached && sum.mode === MODES.goal;
  const isRecord = sum.mode === MODES.sudden && sum.run > 0 && sum.run >= ctx.progress.state.sudden.best;
  const fx = ctx._sessionFx || { combo: () => 0, masteredBefore: new Set() };
  const masteredNow = ctx.questions.filter((q) => isMastered(ctx.progress.state.q[q.id])).length;
  const newlyMastered = ctx.questions.filter((q) => isMastered(ctx.progress.state.q[q.id]) && !fx.masteredBefore.has(q.id)).length;
  const bestCombo = fx.combo();
  const wrap = h('div', { class: 'celebrate' });
  if ((perfect && sum.answered >= 5) || isRecord || ((sum.mode === MODES.exam || sum.mode === MODES.hardexam || sum.mode === MODES.ptest) && sum.passed) || goalWasJustReached) { setTimeout(() => { confetti(wrap, 70); if (ctx.progress.settings.sound !== false) sfx.fanfare(); }, 120); }
  const headline = (sum.mode === MODES.exam || sum.mode === MODES.hardexam || sum.mode === MODES.ptest) ? null : goalWasJustReached ? h('div', { class: 'verdict-big gold' }, 'ΣΤΟΧΟΣ ✓') : perfect && sum.answered >= 5 ? h('div', { class: 'verdict-big gold' }, 'ΤΕΛΕΙΟ') : sum.wrong <= 1 && sum.answered >= 8 ? h('div', { class: 'verdict-big ok' }, 'ΣΧΕΔΟΝ ΤΕΛΕΙΟ') : null;
  const deltas = h('div', { class: 'delta' },
    newlyMastered ? h('span', { class: 'tag up' }, `★ +${newlyMastered} εμπεδωμένες (σύνολο ${masteredNow})`) : null,
    bestCombo >= 5 ? h('span', { class: 'tag up' }, `🔥 ${bestCombo} στη σειρά`) : null,
    isRecord ? h('span', { class: 'tag up' }, '🏆 νέο ρεκόρ') : null,
    sum.wrong ? h('span', { class: 'tag down' }, `${sum.wrong} λάθ${sum.wrong === 1 ? 'ος' : 'η'} → στα λάθη σου`) : null);
  append(wrap, [
    h('h1', null, meta ? meta.title : sum.mode),
    verdict, headline,
    h('div', { class: 'card' },
      h('div', { class: 'grid' },
        h('div', { class: 'stat' }, h('div', { class: 'v' }, `${sum.correct}/${sum.answered}`), h('div', { class: 'l' }, 'σωστές')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, sum.wrong), h('div', { class: 'l' }, 'λάθη')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtClock(sum.durationMs)), h('div', { class: 'l' }, 'χρόνος'))),
      sum.endReason === 'time' ? h('p', { class: 'bad' }, 'Έληξε ο χρόνος.') : null,
      sum.endReason === 'abort' ? h('p', { class: 'muted' }, 'Σταμάτησες το τεστ πριν τελειώσει.') : null,
      sum.completed && sum.mode === MODES.due ? h('p', { class: 'ok' }, 'Η σημερινή εξάσκηση ολοκληρώθηκε ✓') : null,
      sum.completed && (sum.mode === MODES.tomorrow || sum.mode === MODES.wrong || sum.mode === MODES.marathon) ? h('p', { class: 'ok' }, 'Τα καθάρισες όλα ✓') : null,
      sum.mode === MODES.ptest && !sum.passed && sum.endReason === 'done' ? h('p', { class: 'muted small' }, 'Το τεστ περνάει μόνο με 100 %. Ξαναδοκίμασέ το μέχρι να το καθαρίσεις.') : null,
      deltas),
    wrongs.length ? h('div', { class: 'card' }, h('h3', null, 'Λάθη'), h('div', { class: 'list' }, wrongs.map((id) => { const q = byId.get(id); return h('a', { class: 'qrow', href: `#/q/${id}` }, h('span', { class: 'id' }, `#${id}`), h('span', { class: 'txt' }, q ? q.text : '')); }))) : null,
    h('div', { style: { margin: '10px 0' } }, continueBtn),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/' }, 'Αρχική'), again),
  ]);
  return wrap;
}
