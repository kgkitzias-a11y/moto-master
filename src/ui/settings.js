import { h, fmtDate } from './dom.js';
import { encodePairing, decodePairing } from '../sync/gist.js';
import { planControls } from './planner.js';

// Vendor scripts are loaded on demand (only this screen needs them).
const loaded = {};
function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { delete loaded[src]; reject(new Error('load failed: ' + src)); };
    document.head.appendChild(s);
  });
  return loaded[src];
}

function toggleRow(label, desc, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'toggle' }, h('span', null, h('div', null, label), h('div', { class: 'small muted' }, desc)), input);
}

export function renderSettings(ctx) {
  const p = ctx.progress;
  const s = p.settings;
  const hasToken = !!p.token;

  // ---- sync ----
  const tokenInput = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: hasToken ? '•••••••• (αποθηκευμένο)' : 'ghp_… ή github_pat_…' });
  const syncInfo = h('p', { class: 'small muted' });
  const refreshSyncInfo = () => {
    const st = p.sync;
    syncInfo.textContent = hasToken || p.token
      ? `Gist: ${s.gistId ? s.gistId : '— (θα δημιουργηθεί)'} · Τελευταίος συγχρονισμός: ${fmtDate(st.lastAt)}${st.error ? ' · Σφάλμα: ' + st.error : ''} · ${p.events.length} εγγραφές τοπικά`
      : 'Χωρίς token η πρόοδος μένει μόνο σε αυτή τη συσκευή.';
  };
  refreshSyncInfo();
  p.addEventListener('sync', refreshSyncInfo);

  const saveTokenBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: async () => {
    const t = tokenInput.value.trim();
    if (!t) { ctx.toast('Επικόλλησε πρώτα το token.'); return; }
    p.setToken(t); tokenInput.value = '';
    ctx.toast('Το token αποθηκεύτηκε — συγχρονισμός…');
    const r = await p.syncNow('token');
    ctx.toast(r ? `Συγχρονίστηκε (${r.total} εγγραφές)` : `Σφάλμα: ${p.sync.error || ''}`);
    ctx.navigate('#/settings'); route();
  } }, 'Αποθήκευση & συγχρονισμός');
  const syncNowBtn = h('button', { class: 'btn', type: 'button', disabled: !hasToken, onClick: async () => { const r = await p.syncNow('manual'); ctx.toast(r ? `Συγχρονίστηκε: ${r.pulled} ↓ ${r.pushed} ↑` : `Σφάλμα: ${p.sync.error || ''}`); } }, 'Συγχρονισμός τώρα');
  const forgetBtn = h('button', { class: 'btn btn-ghost', type: 'button', disabled: !hasToken, onClick: () => { if (confirm('Να αφαιρεθεί το token από αυτή τη συσκευή; Η πρόοδος μένει στη συσκευή.')) { p.setToken(''); route(); } } }, 'Αφαίρεση token');

  // ---- pairing ----
  const pairBox = h('div');
  const showPairing = async () => {
    if (!p.token) { ctx.toast('Αποθήκευσε πρώτα ένα token σε αυτή τη συσκευή.'); return; }
    try { await loadScript('./src/vendor/qrcode.js'); } catch (e) { ctx.toast('Η βιβλιοθήκη QR δεν φορτώθηκε.'); return; }
    const str = encodePairing({ token: p.token, gistId: s.gistId });
    const payload = `mm1:${str}`; // deliberately NOT a URL: camera apps must not open it in Safari or keep it in URL history
    pairBox.replaceChildren();
    try {
      const qr = window.qrcode(0, 'M'); qr.addData(payload); qr.make();
      const holder = h('div', { class: 'qr' }); holder.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      const svg = holder.querySelector('svg'); if (svg) { svg.setAttribute('width', '220'); svg.setAttribute('height', '220'); }
      pairBox.append(holder);
    } catch (e) { pairBox.append(h('p', { class: 'bad' }, 'Το QR δεν δημιουργήθηκε: ' + e.message)); }
    const ta = h('textarea', { readonly: true, value: str, onClick: (e) => e.target.select() });
    pairBox.append(
      h('p', { class: 'small muted' }, 'Στο iPhone: άνοιξε την ΕΓΚΑΤΕΣΤΗΜΕΝΗ εφαρμογή → Ρυθμίσεις → «Σάρωση QR», ή επικόλλησε το κείμενο στο πεδίο «Κωδικός σύνδεσης». Το QR περιέχει το token σου — μην το μοιραστείς.'),
      ta,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onClick: async () => { try { await navigator.clipboard.writeText(str); ctx.toast('Αντιγράφηκε'); } catch { ta.select(); ctx.toast('Επίλεξε το κείμενο και αντίγραψέ το'); } } }, 'Αντιγραφή κωδικού'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => pairBox.replaceChildren() }, 'Κλείσιμο')),
    );
  };

  const pairInput = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Επικόλλησε τον κωδικό σύνδεσης…' });
  const applyPairing = (str) => {
    try {
      const pr = decodePairing(str.trim().replace(/^.*#pair=/, '').replace(/^mm1:/, ''));
      p.setToken(pr.token); if (pr.gistId) p.updateSettings({ gistId: pr.gistId });
      ctx.toast('Η συσκευή συνδέθηκε — συγχρονισμός…'); p.syncNow('pair').then(() => route());
    } catch { ctx.toast('Ο κωδικός σύνδεσης δεν είναι σωστός.'); }
  };

  const scanBox = h('div');
  const startScan = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { ctx.toast('Η κάμερα δεν είναι διαθέσιμη εδώ.'); return; }
    try { await loadScript('./src/vendor/jsQR.js'); } catch (e) { ctx.toast('Η βιβλιοθήκη σάρωσης δεν φορτώθηκε.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
    catch { ctx.toast('Δεν δόθηκε πρόσβαση στην κάμερα.'); return; }
    const video = h('video', { class: 'scan', playsinline: true, muted: true, autoplay: true });
    video.setAttribute('playsinline', ''); video.srcObject = stream;
    const canvas = document.createElement('canvas'); const cx = canvas.getContext('2d', { willReadFrequently: true });
    let raf = 0; const stopScan = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); scanBox.replaceChildren(); };
    scanBox.replaceChildren(video, h('button', { class: 'btn btn-block', type: 'button', onClick: stopScan }, 'Ακύρωση'));
    const loop = () => {
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        cx.drawImage(video, 0, 0);
        const img = cx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) { stopScan(); applyPairing(code.data); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };

  // ---- backup ----
  const exportBtn = h('button', { class: 'btn', type: 'button', onClick: async () => {
    const json = p.exportJson();
    const name = `moto-master-progress-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Moto Master progress' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } }, 'Αντίγραφο ασφαλείας');
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onChange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await p.importJson(await f.text()); ctx.toast(`Επαναφορά: ${r.imported} νέες εγγραφές, ${r.skipped} υπήρχαν ήδη`); route(); }
    catch (err) { ctx.toast('Μη έγκυρο αρχείο: ' + err.message); }
    e.target.value = '';
  } });
  const importBtn = h('button', { class: 'btn', type: 'button', onClick: () => fileInput.click() }, 'Επαναφορά (συγχώνευση)');
  const resetBtn = h('button', { class: 'btn btn-danger', type: 'button', onClick: async () => {
    if (!confirm('Να διαγραφεί όλη η πρόοδος; Θα χαθούν επίπεδα, στατιστικά και ιστορικό (σε όλες τις συγχρονισμένες συσκευές).')) return;
    if (!confirm('Σίγουρα; Δεν αναιρείται.')) return;
    await p.reset(); ctx.toast('Η πρόοδος διαγράφηκε.'); route();
  } }, 'Διαγραφή προόδου');

  const cacheBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: async () => {
    if ('caches' in window) { for (const k of await caches.keys()) await caches.delete(k); }
    if (navigator.serviceWorker) { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); }
    location.reload();
  } }, 'Καθαρισμός cache & επαναφόρτωση');

  function route() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

  return h('div', null,
    h('h1', null, 'Ρυθμίσεις'),
    planControls(ctx),
    h('div', { class: 'card' },
      h('h3', null, 'Συγχρονισμός (GitHub Gist)'),
      h('p', { class: 'small muted' }, 'Χρειάζεται ένα GitHub token με ΜΟΝΟ το δικαίωμα gist (classic token, scope «gist»). Δες το README για τα ακριβή βήματα. Το token μένει μόνο σε αυτή τη συσκευή.'),
      h('label', null, 'GitHub token'), tokenInput,
      h('div', { class: 'btn-row', style: { marginTop: '8px' } }, saveTokenBtn, syncNowBtn),
      h('div', { style: { marginTop: '6px' } }, forgetBtn),
      syncInfo),
    h('div', { class: 'card' },
      h('h3', null, 'Σύνδεση συσκευής'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: showPairing }, 'Εμφάνιση QR σύνδεσης'), h('button', { class: 'btn', type: 'button', onClick: startScan }, 'Σάρωση QR')),
      pairBox, scanBox,
      h('label', null, 'Κωδικός σύνδεσης (χωρίς QR)'), pairInput,
      h('button', { class: 'btn btn-block', type: 'button', style: { marginTop: '8px' }, onClick: () => applyPairing(pairInput.value) }, 'Σύνδεση με κωδικό')),
    h('div', { class: 'card' },
      h('h3', null, 'Στόχος & κίνητρο'),
      h('label', { htmlFor: 'manual-goal' }, 'Χειροκίνητος στόχος (χωρίς μελλοντική ημερομηνία)'),
      h('input', { id: 'manual-goal', type: 'number', inputmode: 'numeric', min: 10, max: 400, step: 10, disabled: p.plan().automatic, value: s.dailyGoal || 40, onChange: (e) => p.updateSettings({ dailyGoal: Math.max(10, Math.min(400, Number(e.target.value) || 40)) }) }),
      h('p', { class: 'small muted' }, 'Με ημερομηνία εξετάσεων, ο στόχος υπολογίζεται αυτόματα στην αρχική. Η ημερομηνία και οι ρυθμίσεις αποθηκεύονται ξεχωριστά σε κάθε συσκευή.'),
      h('p', { class: 'small muted' }, 'Η μέρα μετράει στο σερί όταν πιάσεις τον στόχο απαντήσεων ή ολοκληρώσεις τη σημερινή εξάσκηση («Σήμερα»)· αλλιώς το σερί χάνεται τα μεσάνυχτα.'),
      h('label', null, 'Εμφάνιση'),
      h('select', { onChange: (e) => p.updateSettings({ theme: e.target.value }) },
        [['dark', 'Σκούρο (προτείνεται για συγκέντρωση)'], ['light', 'Ανοιχτό'], ['auto', 'Αυτόματο (συστήματος)']].map(([v, l]) => h('option', { value: v, selected: (s.theme || 'dark') === v }, l))),
      toggleRow('Ήχοι', 'Σύντομοι ήχοι για σωστό, λάθος και ανέβασμα επιπέδου (με το iPhone στο αθόρυβο δεν ακούγονται).', s.sound !== false, (v) => p.updateSettings({ sound: v })),
      toggleRow('Δόνηση', 'Δόνηση όπου υποστηρίζεται (Android).', s.haptics !== false, (v) => p.updateSettings({ haptics: v }))),
    h('div', { class: 'card' },
      h('h3', null, 'Προπόνηση'),
      toggleRow('Δύσκολο τεστ (παντού)', 'Κάθε λάθος → επίπεδο 0, σε όλα τα τεστ.', s.hardMode, (v) => p.updateSettings({ hardMode: v })),
      toggleRow('Ερωτήσεις εκτός ύλης', 'Προσθέτει τις ερωτήσεις που ανακτήθηκαν από άλλες πηγές (ID που λείπουν από το βιβλίο). Δεν μετράνε στην ετοιμότητα.', s.includeArchive, (v) => { p.updateSettings({ includeArchive: v }); route(); })),
    h('div', { class: 'card' },
      h('h3', null, 'Αντίγραφα ασφαλείας'),
      h('div', { class: 'btn-row' }, exportBtn, importBtn), fileInput,
      h('div', { style: { marginTop: '10px' } }, resetBtn)),
    h('div', { class: 'card' },
      h('h3', null, 'Εφαρμογή'),
      h('p', { class: 'small muted' }, `Έκδοση ${ctx.version} · ${ctx.questions.length} ερωτήσεις (${ctx.questions.filter((q) => q.tier === 'booklet').length} βιβλίο + ${ctx.questions.filter((q) => q.tier === 'archive').length} εκτός ύλης) · συσκευή ${s.deviceId}`),
      h('p', { class: 'small muted' }, ctx.meta && ctx.meta.exam ? `Μορφή εξέτασης: ${ctx.meta.exam}` : ''),
      cacheBtn),
  );
}
