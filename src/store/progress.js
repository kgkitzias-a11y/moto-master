// Progress store: in-memory event log + derived state + sync orchestration.
import { loadEvents, addEvents, deleteEvents, clearEvents, loadSettings, saveSettings, loadToken, saveToken } from './db.js';
import { sanitizeEvents } from '../engine/events.js';
import { reduce } from '../engine/reducer.js';
import { uuid } from '../engine/shuffle.js';
import { studyPlan } from '../engine/planner.js';
import { SHARED_KEYS, initialPreferences, mergePreferences, validPreference } from '../sync/preferences.js';
import { syncOnce, SyncError, decodeEvents, encodeEvents, sortForStorage } from '../sync/gist.js';
import { loadMegaPlans, saveMegaPlans, pendingMegaAnswer, stageMegaAnswer, clearPendingMega } from './mega.js';
import { activePlan, createMegaPlan, megaState } from '../engine/mega.js';

export class Progress extends EventTarget {
  constructor(questions) {
    super();
    this.questions = questions;
    this.events = [];
    this.state = null;
    this.settings = loadSettings();
    if (!this.settings.deviceId) { this.settings.deviceId = uuid().slice(0, 8); saveSettings(this.settings); }
    this.settings.sharedPreferences = initialPreferences(this.settings);
    saveSettings(this.settings);
    this.dirty = false;
    this._seq = 0; // bumped on every local append; lets a sync know if new events arrived meanwhile
    this.sync = { status: 'local', lastAt: this.settings.lastSyncAt, error: null, inFlight: null };
    this._timer = null;
    this.megaPlans = loadMegaPlans();
  }

  async init() {
    this.events = await loadEvents();
    const pending=sanitizeEvents([pendingMegaAnswer()]);
    if(pending.length && !this.events.some(e=>e.id===pending[0].id)) { await addEvents(pending);this.events.push(...pending);this.dirty=true; }
    clearPendingMega();
    this._recompute();
    return this;
  }

  _recompute() {
    this.state = reduce(this.events, this.questions);
    this.dispatchEvent(new Event('change'));
  }

  get token() { return loadToken(); }
  mega() { return megaState(activePlan(this.megaPlans,this.state.resetAt),this.events,this.questions); }
  startMega() {
    const current=this.mega(); if(current && !current.done)return current;
    const plan=createMegaPlan(this.questions,this.state);
    this.megaPlans=saveMegaPlans([...this.megaPlans,plan]);
    this.dirty=true;this._seq++;this._scheduleSync();this._recompute();
    return this.mega();
  }
  async answerMega(event) {
    stageMegaAnswer(event);
    await this.append(event);
    clearPendingMega();
  }
  plan(now = Date.now()) { return studyPlan(this.questions, this.events, this.settings, now); }
  setToken(t) { saveToken(t ? t.trim() : ''); this.dispatchEvent(new Event('sync')); }

  updateSettings(patch) {
    let sharedChanged = false;
    const sharedPreferences = { ...this.settings.sharedPreferences };
    for (const key of SHARED_KEYS) if (Object.hasOwn(patch, key) && validPreference(key, patch[key]) && patch[key] !== this.settings[key]) {
      sharedPreferences[key] = { value: patch[key], t: Date.now(), id: uuid() };
      sharedChanged = true;
    }
    this.settings = { ...this.settings, ...patch };
    this.settings.sharedPreferences = sharedPreferences;
    saveSettings(this.settings);
    if (sharedChanged) { this.dirty = true; this._seq++; this._scheduleSync(); }
    this.dispatchEvent(new Event('settings'));
  }

  _applyPreferences(incoming) {
    const sharedPreferences = mergePreferences(this.settings.sharedPreferences, incoming);
    this.settings = { ...this.settings, sharedPreferences };
    for (const key of SHARED_KEYS) if (sharedPreferences[key]) this.settings[key] = sharedPreferences[key].value;
    saveSettings(this.settings);
    this.dispatchEvent(new Event('settings'));
  }

  // Append new events (already unique ids). Persist first, then recompute.
  async append(events) {
    const list = (Array.isArray(events) ? events : [events]).filter(Boolean);
    if (!list.length) return;
    await addEvents(list);
    this.events.push(...list);
    this.dirty = true; this._seq++;
    this._recompute();
    this._scheduleSync();
  }

  async reset() {
    const e = { id: uuid(), t: Date.now(), k: 'reset' };
    await this.append(e);
  }

  // ---- export / import ----
  exportJson() {
    const data=JSON.parse(encodeEvents(sortForStorage(this.events)));
    if(this.megaPlans.length)data.megaPlans=this.megaPlans;
    return JSON.stringify(data);
  }
  async importJson(text) {
    const incoming = sanitizeEvents(decodeEvents(text));
    const plans=JSON.parse(text).megaPlans;
    if(Array.isArray(plans)) { this.megaPlans=saveMegaPlans(plans);this.dirty=true;this._seq++;this._scheduleSync(); }
    const have = new Set(this.events.map((e) => e.id));
    const fresh = incoming.filter((e) => !have.has(e.id));
    if (fresh.length) {
      await addEvents(fresh);
      this.events.push(...fresh);
      this.dirty = true; this._seq++;
      this._recompute();
      this._scheduleSync();
    }
    return { imported: fresh.length, skipped: incoming.length - fresh.length };
  }

  // ---- sync ----
  _setSync(patch) {
    Object.assign(this.sync, patch);
    this.dispatchEvent(new Event('sync'));
  }

  _scheduleSync() {
    if (!this.token) return;
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; if (this.dirty) this.syncNow('timer'); }, 60000);
  }

  async syncNow(reason = 'manual') {
    const token = this.token;
    if (!token) { this._setSync({ status: 'local', error: null }); return null; }
    if (this.sync.inFlight) return this.sync.inFlight;
    this._setSync({ status: 'syncing', error: null });
    const io = {
      loadLocal: async () => loadEvents(),
      addLocal: async (evs) => { await addEvents(evs); this.events.push(...evs); },
      removeLocal: async (ids) => { await deleteEvents(ids); const drop = new Set(ids); this.events = this.events.filter((e) => !drop.has(e.id)); },
      getGistId: () => this.settings.gistId,
      setGistId: (id) => this.updateSettings({ gistId: id }),
      getPreferences: () => this.settings.sharedPreferences,
      setPreferences: (prefs) => this._applyPreferences(prefs),
      getMegaPlans: () => this.megaPlans,
      setMegaPlans: (plans) => { this.megaPlans=saveMegaPlans(plans); },
    };
    const seqAtStart = this._seq;
    const run = (async () => {
      try {
        const r = await syncOnce(token, io);
        this.dirty = this._seq !== seqAtStart; // events appended during the round are still unsynced
        const now = Date.now();
        this.updateSettings({ lastSyncAt: now });
        this._setSync({ status: 'synced', lastAt: now, error: null, last: r });
        if (r.pulled || r.total !== this.events.length || r.settingsChanged || r.plansChanged) this._recompute();
        return r;
      } catch (e) {
        const msg = e instanceof SyncError ? e.message : (e && e.message) || 'Σφάλμα';
        this._setSync({ status: 'error', error: msg });
        return null;
      } finally {
        this.sync.inFlight = null;
        if (this.dirty) this._scheduleSync();
      }
    })();
    this.sync.inFlight = run;
    return run;
  }

  async wipeLocal() {
    await clearEvents();
    this.events = [];
    this.dirty = false;
    this._recompute();
  }
}
