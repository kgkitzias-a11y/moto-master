// Append-only event log in IndexedDB (falls back to localStorage when IDB is unavailable,
// e.g. some private-browsing modes). Settings live in localStorage.
const DB_NAME = 'moto-master';
const DB_VERSION = 1;
const STORE = 'events';
const LS_FALLBACK_KEY = 'mm.events.fallback';

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { resolve(null); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('t', 't');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { console.warn('IndexedDB unavailable, using localStorage'); resolve(null); };
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function lsRead() {
  try { return JSON.parse(localStorage.getItem(LS_FALLBACK_KEY) || '[]'); } catch { return []; }
}
function lsWrite(events) {
  try { localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(events)); } catch (e) { console.warn('localStorage write failed', e); }
}

export async function loadEvents() {
  const db = await openDb();
  if (!db) return lsRead();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Inserts events by id; existing ids are left untouched (union semantics). Returns number added.
export async function addEvents(events) {
  if (!events || !events.length) return 0;
  const db = await openDb();
  if (!db) {
    const cur = lsRead(); const have = new Set(cur.map((e) => e.id)); let n = 0;
    for (const e of events) if (!have.has(e.id)) { cur.push(e); have.add(e.id); n++; }
    lsWrite(cur); return n;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    let added = 0;
    for (const e of events) {
      const req = os.add(e);
      req.onsuccess = () => { added++; };
      req.onerror = (ev) => { ev.preventDefault(); ev.stopPropagation(); }; // duplicate id → ignore
    }
    tx.oncomplete = () => resolve(added);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteEvents(ids) {
  if (!ids || !ids.length) return;
  const db = await openDb();
  if (!db) { const drop = new Set(ids); lsWrite(lsRead().filter((e) => !drop.has(e.id))); return; }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    for (const id of ids) os.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearEvents() {
  const db = await openDb();
  if (!db) { lsWrite([]); return; }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- settings (local storage; Progress syncs whitelisted study choices only) ----
const SETTINGS_KEY = 'mm.settings';
export const DEFAULT_SETTINGS = Object.freeze({
  hardMode: false,
  confidence: true,
  includeArchive: false,
  gistId: null,
  lastSyncAt: null,
  deviceId: null,
  seenVersion: null,
  examDate: null,        // 'YYYY-MM-DD' → automatic daily study plan
  examTime: '09:00',     // 'HH:MM' → the moment the pass chance is computed for
  examTentative: false,
  dailyGoal: 40,         // answers per day (goal-gradient bar)
  sound: true,           // feedback ticks
  haptics: true,         // vibrate on Android
  theme: 'dark',         // 'dark' | 'light' | 'auto'
});
export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) {
  const copy = { ...s };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(copy)); } catch (e) { console.warn('settings save failed', e); }
}

// The GitHub token is kept separately so it is never accidentally exported with settings.
const TOKEN_KEY = 'mm.gh.token';
export function loadToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
export function saveToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {} }
