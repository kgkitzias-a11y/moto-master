// Only study choices travel between devices. Tokens, device IDs and appearance
// never enter the cloud document. Explicit edits merge per field by (time, UUID).
import { calendarDay } from '../engine/planner.js';

export const SHARED_KEYS = ['examDate', 'examTime', 'examTentative', 'includeArchive', 'dailyGoal', 'hardMode'];
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // 'HH:MM', 24 h
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validPreference(key, value) {
  if (key === 'examDate') return value === null || calendarDay(value) !== null;
  if (key === 'examTime') return typeof value === 'string' && TIME_RE.test(value);
  if (key === 'dailyGoal') return Number.isInteger(value) && value >= 10 && value <= 400;
  return ['examTentative', 'includeArchive', 'hardMode'].includes(key) && typeof value === 'boolean';
}

export function sanitizePreferences(raw, now = Date.now()) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of SHARED_KEYS) {
    const x = Object.hasOwn(raw, key) ? raw[key] : null;
    if (!x || !validPreference(key, x.value)) continue;
    if (!Number.isInteger(x.t) || x.t < 0 || x.t > now + 86400000) continue;
    if (!(x.t === 0 && x.id === '') && !(x.t >= Date.UTC(2020, 0, 1) && typeof x.id === 'string' && UUID.test(x.id))) continue;
    out[key] = { value: x.value, t: x.t, id: x.id.toLowerCase() };
  }
  return out;
}

export function initialPreferences(settings) {
  const out = sanitizePreferences(settings.sharedPreferences);
  for (const key of SHARED_KEYS) if (!out[key] && validPreference(key, settings[key])) {
    out[key] = { value: settings[key], t: 0, id: '' };
  }
  return out;
}

export function mergePreferences(local, remote) {
  const a = sanitizePreferences(local), b = sanitizePreferences(remote), out = {};
  for (const key of SHARED_KEYS) {
    const l = a[key], r = b[key];
    // A newly paired device's unstamped defaults must not replace the cloud plan.
    if (!l) { if (r) out[key] = r; }
    else if (!r) out[key] = l;
    else out[key] = l.t > r.t || (l.t === r.t && l.id > r.id) ? l : r;
  }
  return out;
}

export function samePreferences(a, b) {
  return SHARED_KEYS.every((key) => a[key]?.value === b[key]?.value && a[key]?.t === b[key]?.t && a[key]?.id === b[key]?.id);
}
