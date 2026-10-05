// GitHub Gist sync: progress log + shared study settings in one secret gist.
// The token is passed in by the caller (read from localStorage) and never logged.
import { sanitizeEvents } from '../engine/events.js';
import { mergePreferences, sanitizePreferences, samePreferences } from './preferences.js';

export const GIST_FILE = 'moto-master-progress.json';
export const SETTINGS_FILE = 'moto-master-settings.json';
const RAW_HOST = 'gist.githubusercontent.com';
export const GIST_DESC = 'Moto Master — πρόοδος (private, auto-managed)';
const API = 'https://api.github.com';

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export class SyncError extends Error {
  constructor(message, { status = 0, kind = 'network' } = {}) { super(message); this.status = status; this.kind = kind; }
}

async function api(token, path, { method = 'GET', body = null } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { method, headers: { ...headers(token), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch (e) {
    throw new SyncError('Δεν υπάρχει σύνδεση', { kind: 'network' });
  }
  if (res.status === 401) throw new SyncError('Μη έγκυρο token', { status: 401, kind: 'auth' });
  if (res.status === 403) throw new SyncError('Το token δεν έχει δικαίωμα gist', { status: 403, kind: 'auth' });
  if (res.status === 404) throw new SyncError('Το gist δεν βρέθηκε', { status: 404, kind: 'notfound' });
  if (!res.ok) throw new SyncError(`GitHub ${res.status}`, { status: res.status, kind: 'http' });
  return res;
}

// Canonical serialisation (sorted keys, no whitespace) so equal logs are byte-equal everywhere.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = canon(v[k]); return o; }
  return v;
}
export function encodeEvents(events) {
  return JSON.stringify({ v: 1, app: 'moto-master', events: canon(events) });
}
export function decodeEvents(text) {
  if (!text || !text.trim()) return [];
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.events)) return data.events;
  throw new SyncError('Μη αναγνωρίσιμο περιεχόμενο gist', { kind: 'format' });
}

// Returns the full file text, following raw_url when the API truncated it (>1 MB).
async function readGistFile(token, gist, name = GIST_FILE) {
  const f = gist.files && gist.files[name];
  if (!f) return '';
  if (!f.truncated && typeof f.content === 'string') return f.content;
  let u;
  try { u = new URL(f.raw_url); } catch { throw new SyncError('Μη έγκυρο raw_url', { kind: 'format' }); }
  if (u.protocol !== 'https:' || u.hostname !== RAW_HOST) throw new SyncError('Μη αναμενόμενος host raw_url', { kind: 'format' });
  let res;
  // The raw URL of a secret gist is unguessable and needs no auth: the token is deliberately NOT sent here.
  try { res = await fetch(u.href, { cache: 'no-store', redirect: 'error', credentials: 'omit' }); }
  catch { throw new SyncError('Δεν υπάρχει σύνδεση', { kind: 'network' }); }
  if (!res.ok) throw new SyncError(`raw ${res.status}`, { status: res.status, kind: 'http' });
  return res.text();
}

export async function getGist(token, gistId) {
  const res = await api(token, `/gists/${encodeURIComponent(gistId)}`);
  const gist = await res.json();
  const text = await readGistFile(token, gist);
  const settingsText = await readGistFile(token, gist, SETTINGS_FILE);
  let preferences = {};
  if (settingsText) {
    let data;
    try { data = JSON.parse(settingsText); } catch { throw new SyncError('Μη έγκυρες ρυθμίσεις συγχρονισμού', { kind: 'format' }); }
    if (data?.v !== 1 || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
      throw new SyncError('Μη αναγνωρίσιμες ρυθμίσεις συγχρονισμού', { kind: 'format' });
    }
    preferences = sanitizePreferences(data.settings);
  }
  return { gist, events: sanitizeEvents(decodeEvents(text)), preferences };
}

export async function findGist(token) {
  for (let page = 1; page <= 10; page++) {
    const res = await api(token, `/gists?per_page=100&page=${page}`);
    const list = await res.json();
    for (const g of list) if (g.files && g.files[GIST_FILE]) return g.id;
    if (list.length < 100) break;
  }
  return null;
}

export async function createGist(token, events) {
  const res = await api(token, '/gists', { method: 'POST', body: { description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: encodeEvents(events) } } } });
  const gist = await res.json();
  return gist.id;
}

export async function updateGist(token, gistId, events, preferences = undefined) {
  const files = { [GIST_FILE]: { content: encodeEvents(events) } };
  if (preferences !== undefined) files[SETTINGS_FILE] = { content: JSON.stringify({ v: 1, settings: canon(sanitizePreferences(preferences)) }) };
  const res = await api(token, `/gists/${encodeURIComponent(gistId)}`, { method: 'PATCH', body: { files } });
  return res.json();
}

export async function deleteGist(token, gistId) {
  await api(token, `/gists/${encodeURIComponent(gistId)}`, { method: 'DELETE' });
}

export async function findOrCreateGist(token) {
  const found = await findGist(token);
  if (found) return { id: found, created: false };
  const id = await createGist(token, []);
  return { id, created: true };
}

// Union merge of two event lists by id. Returns { merged, onlyLocal, onlyRemote }.
export function mergeEvents(local, remote) {
  const byId = new Map();
  for (const e of remote) if (e && e.id) byId.set(e.id, e);
  const remoteIds = new Set(byId.keys());
  const onlyLocal = [];
  for (const e of local) if (e && e.id && !byId.has(e.id)) { byId.set(e.id, e); onlyLocal.push(e); }
  const localIds = new Set(local.filter((e) => e && e.id).map((e) => e.id));
  const onlyRemote = remote.filter((e) => e && e.id && !localIds.has(e.id));
  return { merged: [...byId.values()], onlyLocal, onlyRemote, remoteIds };
}

// Drops everything at or before the latest reset (keeps the reset marker itself).
export function compact(events) {
  let resetAt = null, resetId = null;
  for (const e of events) if (e.k === 'reset' && (resetAt === null || e.t > resetAt)) { resetAt = e.t; resetId = e.id; }
  if (resetAt === null) return events;
  return events.filter((e) => e.t > resetAt || e.id === resetId);
}

/**
 * Full sync round. `io` = { loadLocal(), addLocal(events), removeLocal(ids)?, getGistId(), setGistId(id) }.
 * Returns { pushed, pulled, gistId, total }.
 */
export async function syncOnce(token, io) {
  if (!token) throw new SyncError('Χωρίς token', { kind: 'auth' });
  let gistId = io.getGistId();
  let remote = [];
  let remotePreferences = {};
  if (gistId) {
    try { ({ events: remote, preferences: remotePreferences } = await getGist(token, gistId)); }
    catch (e) { if (e.kind === 'notfound') { gistId = null; } else throw e; }
  }
  if (!gistId) {
    const r = await findOrCreateGist(token);
    gistId = r.id; io.setGistId(gistId);
    if (!r.created) ({ events: remote, preferences: remotePreferences } = await getGist(token, gistId));
  }
  const local = await io.loadLocal();
  const { merged, onlyLocal, onlyRemote } = mergeEvents(local, remote);
  const compacted = compact(merged);
  const keep = new Set(compacted.map((e) => e.id));
  // Pull what the remote has and we lack (only events that survive compaction).
  const pull = onlyRemote.filter((e) => keep.has(e.id));
  if (pull.length) await io.addLocal(pull);
  // Prune our own pre-reset events so they are never re-pushed.
  const stale = local.filter((e) => e && e.id && !keep.has(e.id)).map((e) => e.id);
  if (stale.length && io.removeLocal) await io.removeLocal(stale);
  const push = onlyLocal.filter((e) => keep.has(e.id));
  const remoteStale = remote.some((e) => !keep.has(e.id));
  const localPreferences = io.getPreferences?.();
  const preferences = localPreferences === undefined ? undefined : mergePreferences(localPreferences, remotePreferences);
  const settingsChanged = preferences !== undefined && !samePreferences(localPreferences, preferences);
  const settingsPush = preferences !== undefined && !samePreferences(remotePreferences, preferences);
  if (preferences !== undefined) io.setPreferences?.(preferences);
  let pushed = 0;
  if (push.length || remoteStale || settingsPush) {
    await updateGist(token, gistId, sortForStorage(compacted), preferences);
    pushed = push.length;
  }
  return { pushed, pulled: pull.length, gistId, total: compacted.length, settingsChanged };
}

export function sortForStorage(events) {
  return [...events].sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Pairing payload: { token, gistId } → base64url string (and back).
export function encodePairing({ token, gistId }) {
  const json = JSON.stringify({ t: token, g: gistId || null });
  const bytes = new TextEncoder().encode(json);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePairing(str) {
  const s = String(str).trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  if (!obj || typeof obj.t !== 'string' || !obj.t) throw new Error('bad pairing');
  return { token: obj.t, gistId: obj.g || null };
}
