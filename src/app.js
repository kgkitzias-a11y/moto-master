import { VERSION } from './version.js';
import { dayKey } from './engine/time.js';
import { Progress } from './store/progress.js';
import { decodePairing } from './sync/gist.js';
import { h, clear, fmtRel } from './ui/dom.js';
import { renderHome } from './ui/home.js';
import { renderSession, renderSummary } from './ui/session.js';
import { renderStats } from './ui/stats.js';
import { renderReview, renderQuestion } from './ui/review.js';
import { renderSettings } from './ui/settings.js';
import { renderCertification } from './ui/certification.js';
import { renderModeSetup } from './ui/setup.js';
import { renderSheet } from './ui/sheet.js';
import { renderCards } from './ui/cards.js';
import { applyTheme } from './ui/fx.js';

export const ctx = {
  questions: [], meta: null, progress: null, session: null, lastSummary: null, version: VERSION,
  toast, navigate, activeQuestions,
};

function toast(msg, ms = 2200, cls = '') {
  const el = h('div', { class: `toast ${cls}` }, msg);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function navigate(hash) { location.hash = hash; }

// Questions visible to the modes, honouring the archive toggle.
function activeQuestions() {
  const inc = ctx.progress.settings.includeArchive;
  return ctx.questions.filter((q) => q.tier === 'booklet' || (inc && q.tier === 'archive'));
}

async function loadQuestions() {
  const res = await fetch('./data/questions.json', { cache: 'no-cache' }).catch(() => fetch('./data/questions.json'));
  const data = await res.json();
  ctx.meta = data.meta || {};
  ctx.questions = data.questions;
}

function consumePairing() {
  const m = location.hash.match(/^#pair=(.+)$/);
  if (!m) return null;
  try {
    const p = decodePairing(decodeURIComponent(m[1]));
    history.replaceState(null, '', location.pathname + location.search);
    return p;
  } catch { history.replaceState(null, '', location.pathname + location.search); return null; }
}

const routes = {
  '': renderHome, '/': renderHome,
  '/stats': renderStats, '/review': renderReview, '/settings': renderSettings, '/certification': renderCertification,
  '/session': renderSession, '/summary': renderSummary, '/sheet': renderSheet, '/cards': renderCards,
};

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const view = document.getElementById('view');
  const app = document.getElementById('app');
  let node;
  const qm = hash.match(/^\/q\/(\d+)$/);
  const sm = hash.match(/^\/setup\/([a-z0-9]+)$/);
  if (qm) node = renderQuestion(ctx, Number(qm[1]));
  else if (sm) node = renderModeSetup(ctx, sm[1]);
  else if (Object.hasOwn(routes, hash)) node = routes[hash](ctx);
  else node = renderHome(ctx);
  clear(view).appendChild(node);
  app.classList.toggle('in-session', hash === '/session' && !!ctx.session && !ctx.session.ended);
  for (const a of document.querySelectorAll('#tabbar a')) {
    const tab = a.dataset.tab;
    a.classList.toggle('active', (tab === 'home' && (hash === '/' || hash === '')) || hash.startsWith('/' + tab) || (tab === 'review' && !!qm));
  }
  window.scrollTo(0, 0);
}

function renderSyncPill() {
  const pill = document.getElementById('sync-pill');
  const s = ctx.progress.sync;
  pill.className = 'pill';
  if (!ctx.progress.token) { pill.classList.add('pill-local'); pill.textContent = 'Μόνο τοπικά'; return; }
  if (s.status === 'syncing') { pill.classList.add('pill-syncing'); pill.textContent = 'Συγχρονισμός…'; }
  else if (s.status === 'error') { pill.classList.add('pill-error'); pill.textContent = 'Σφάλμα'; pill.title = s.error || ''; }
  else if (s.status === 'synced' || s.lastAt) { pill.classList.add(ctx.progress.dirty ? 'pill-local' : 'pill-synced'); pill.textContent = `Συγχρονίστηκε ${fmtRel(s.lastAt)}`; }
  else { pill.classList.add('pill-local'); pill.textContent = 'Μόνο τοπικά'; }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const banner = document.getElementById('update-banner');
  const btn = document.getElementById('update-btn');
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const track = (w) => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) banner.hidden = false; }); };
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    if (reg.waiting && navigator.serviceWorker.controller) banner.hidden = false;
    btn.addEventListener('click', () => { wantReload = true; (reg.waiting || reg.active)?.postMessage({ type: 'SKIP_WAITING' }); banner.hidden = true; });
    setInterval(() => reg.update().catch(() => {}), 6 * 60 * 60 * 1000);
  }).catch((e) => console.warn('SW registration failed', e));
  // Reload only when the user asked for the new version (never on the first-visit claim).
  let wantReload = false, refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!wantReload || refreshing) return; refreshing = true; location.reload(); });
}

async function main() {
  document.getElementById('version-stamp').textContent = `Moto Master v${VERSION}`;
  const pairing = consumePairing();
  await loadQuestions();
  ctx.progress = await new Progress(ctx.questions).init();
  applyTheme(ctx.progress.settings.theme);
  ctx.progress.addEventListener('settings', () => applyTheme(ctx.progress.settings.theme));
  if (pairing) {
    const existing = ctx.progress.token;
    const ok = !existing || existing === pairing.token || confirm('Υπάρχει ήδη token σε αυτή τη συσκευή. Να αντικατασταθεί από αυτό του νέου συνδέσμου;');
    if (ok) {
      ctx.progress.setToken(pairing.token);
      if (pairing.gistId) ctx.progress.updateSettings({ gistId: pairing.gistId });
      toast('Η συσκευή συνδέθηκε — συγχρονισμός…');
    }
  }
  ctx.progress.addEventListener('sync', renderSyncPill);
  ctx.progress.addEventListener('settings', renderSyncPill);
  ctx.progress.addEventListener('change', () => { if (!location.hash || location.hash === '#/' ) route(); });
  renderSyncPill();
  window.addEventListener('hashchange', route);
  route();
  registerSW();
  // Pull when returning to an already-open iPhone app, not only on a full reload.
  ctx.progress.syncNow('open');
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || ctx.progress.dirty) ctx.progress.syncNow(document.hidden ? 'hidden' : 'visible');
  });
  window.addEventListener('online', () => ctx.progress.syncNow('online'));
  setInterval(() => {
    if (!document.hidden && navigator.onLine && ctx.progress.token) ctx.progress.syncNow('refresh');
  }, 60000);
  // An installed app can stay open overnight. Refresh today's plan without
  // interrupting a test or replacing a date input while the user edits it.
  let displayedDay = dayKey(Date.now());
  const refreshDay = () => {
    const today = dayKey(Date.now());
    const home = !location.hash || location.hash === '#/' || location.hash === '#';
    if (home && today !== displayedDay && !document.hidden) { displayedDay = today; route(); }
  };
  document.addEventListener('visibilitychange', refreshDay);
  setInterval(refreshDay, 30000);
  setInterval(renderSyncPill, 30000);
}

main().catch((e) => {
  console.error(e);
  const view = document.getElementById('view');
  clear(view).appendChild(h('div', { class: 'card' }, h('h1', null, 'Σφάλμα εκκίνησης'), h('p', { class: 'mono' }, String(e && e.stack || e))));
});
