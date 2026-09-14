import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeEvents, compact, encodePairing, decodePairing, encodeEvents, decodeEvents, sortForStorage, SyncError } from '../../src/sync/gist.js';
import { reduce } from '../../src/engine/reducer.js';
import { QUESTIONS, T0, H, ans, reset, resetIds } from './fixtures.js';

const ev = (id, t, extra = {}) => ({ id, t, k: 'answer', q: 1, ch: 0, ok: true, ms: 1000, ...extra });

describe('sync: mergeEvents', () => {
  test('union by id: onlyLocal / onlyRemote / merged are exact', () => {
    const a = ev('a', 1), b = ev('b', 2), c = ev('c', 3), d = ev('d', 4);
    const local = [a, b, c];
    const remote = [b, c, d];
    const { merged, onlyLocal, onlyRemote, remoteIds } = mergeEvents(local, remote);
    assert.deepEqual(onlyLocal.map((e) => e.id), ['a']);
    assert.deepEqual(onlyRemote.map((e) => e.id), ['d']);
    assert.deepEqual([...merged.map((e) => e.id)].sort(), ['a', 'b', 'c', 'd']);
    assert.equal(merged.length, 4, 'no duplicates');
    assert.deepEqual([...remoteIds].sort(), ['b', 'c', 'd']);
  });

  test('identical lists → nothing only-local or only-remote', () => {
    const list = [ev('a', 1), ev('b', 2)];
    const r = mergeEvents(list, [...list].reverse());
    assert.deepEqual(r.onlyLocal, []);
    assert.deepEqual(r.onlyRemote, []);
    assert.equal(r.merged.length, 2);
  });

  test('empty sides', () => {
    const list = [ev('a', 1)];
    assert.deepEqual(mergeEvents([], list).onlyRemote, list);
    assert.deepEqual(mergeEvents([], list).onlyLocal, []);
    assert.deepEqual(mergeEvents(list, []).onlyLocal, list);
    assert.deepEqual(mergeEvents([], []).merged, []);
  });

  test('entries without an id (or null) are ignored', () => {
    const r = mergeEvents([ev('a', 1), null, { t: 5 }], [undefined, ev('b', 2), { id: '' }]);
    assert.deepEqual([...r.merged.map((e) => e.id)].sort(), ['a', 'b']);
    assert.deepEqual(r.onlyLocal.map((e) => e.id), ['a']);
    assert.deepEqual(r.onlyRemote.map((e) => e.id), ['b']);
  });

  test('when both sides hold the same id, the remote copy is kept (no duplicate, one object)', () => {
    const r = mergeEvents([ev('a', 1, { ms: 1 })], [ev('a', 1, { ms: 2 })]);
    assert.equal(r.merged.length, 1);
    assert.equal(r.merged[0].ms, 2);
  });

  test('merge is commutative for the reducer: reduce(merge(L,R)) === reduce(merge(R,L))', () => {
    resetIds();
    const L = [ans(1, T0, true), ans(2, T0 + H, false), reset(T0 + 2 * H), ans(1, T0 + 3 * H, true)];
    const R = [L[0], L[2], ans(3, T0 + 4 * H, true), ans(1, T0 + 11 * H, true)];
    const s1 = JSON.stringify(reduce(mergeEvents(L, R).merged, QUESTIONS));
    const s2 = JSON.stringify(reduce(mergeEvents(R, L).merged, QUESTIONS));
    assert.equal(s1, s2);
  });
});

describe('sync: compact', () => {
  test('drops events at/before the latest reset but keeps the reset marker itself', () => {
    const evs = [ev('a', 10), ev('b', 20), { id: 'r1', t: 20, k: 'reset' }, ev('c', 21), ev('d', 30)];
    const out = compact(evs);
    assert.deepEqual(out.map((e) => e.id), ['r1', 'c', 'd']);
    assert.ok(out.some((e) => e.k === 'reset' && e.t === 20));
  });

  test('with several resets only the latest survives and earlier resets are dropped', () => {
    const evs = [{ id: 'r0', t: 5, k: 'reset' }, ev('a', 6), { id: 'r1', t: 20, k: 'reset' }, ev('b', 20), ev('c', 25), { id: 'r2', t: 15, k: 'reset' }];
    const out = compact(evs);
    assert.deepEqual(out.map((e) => e.id).sort(), ['c', 'r1']);
  });

  test('no reset → the same array is returned untouched', () => {
    const evs = [ev('a', 1), ev('b', 2)];
    assert.equal(compact(evs), evs);
  });

  test('compact is idempotent and does not change reducer output', () => {
    resetIds();
    const evs = [ans(1, T0, true), ans(2, T0 + H, true), reset(T0 + H), ans(1, T0 + 2 * H, true), ans(3, T0 + 3 * H, false)];
    const once = compact(evs);
    assert.equal(once.length, 3);
    assert.deepEqual(compact(once), once);
    assert.equal(JSON.stringify(reduce(once, QUESTIONS)), JSON.stringify(reduce(evs, QUESTIONS)));
  });

  test('sortForStorage orders by (t, id) and does not mutate its input', () => {
    const evs = [ev('b', 2), ev('z', 1), ev('a', 2)];
    const out = sortForStorage(evs);
    assert.deepEqual(out.map((e) => e.id), ['z', 'a', 'b']);
    assert.deepEqual(evs.map((e) => e.id), ['b', 'z', 'a']);
  });
});

describe('sync: pairing payload', () => {
  test('encodePairing → decodePairing round-trips token + gistId', () => {
    const p = { token: 'ghp_abcDEF1234567890_-xyz', gistId: 'deadbeef0123' };
    const s = encodePairing(p);
    assert.deepEqual(decodePairing(s), p);
  });

  test('output is base64url with no padding (no +, /, =)', () => {
    // Craft inputs whose standard base64 would contain '+', '/' and '=' padding.
    for (const token of ['a', 'ab', 'abc', '~~~~???>>>', 'ÿÿÿ', 'τόκεν-με-ελληνικά', 'ûÿþ']) {
      const s = encodePairing({ token, gistId: 'g' });
      assert.match(s, /^[A-Za-z0-9_-]+$/, `token ${JSON.stringify(token)} → ${s}`);
      assert.equal(decodePairing(s).token, token);
    }
    const std = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ t: '~~~~???>>>', g: 'g' }))));
    assert.ok(/[+/]/.test(std), 'fixture really exercises the +/ characters');
  });

  test('gistId null/undefined/empty round-trips to null', () => {
    assert.equal(decodePairing(encodePairing({ token: 'tok' })).gistId, null);
    assert.equal(decodePairing(encodePairing({ token: 'tok', gistId: null })).gistId, null);
    assert.equal(decodePairing(encodePairing({ token: 'tok', gistId: '' })).gistId, null);
  });

  test('decodePairing tolerates surrounding whitespace and standard base64 with padding', () => {
    const s = encodePairing({ token: 'tok', gistId: 'g1' });
    assert.deepEqual(decodePairing(`  ${s}\n`), { token: 'tok', gistId: 'g1' });
    const std = btoa(JSON.stringify({ t: 'tok', g: 'g1' }));
    assert.deepEqual(decodePairing(std), { token: 'tok', gistId: 'g1' });
  });

  test('decodePairing rejects payloads without a token or that are not JSON', () => {
    const noToken = btoa(JSON.stringify({ g: 'g1' })).replace(/=+$/, '');
    assert.throws(() => decodePairing(noToken), /bad pairing/);
    const emptyToken = btoa(JSON.stringify({ t: '', g: 'g1' })).replace(/=+$/, '');
    assert.throws(() => decodePairing(emptyToken), /bad pairing/);
    assert.throws(() => decodePairing(btoa('not json')));
    assert.throws(() => decodePairing(btoa('42')), /bad pairing/);
  });
});

describe('sync: events envelope', () => {
  test('encodeEvents produces {v:1, app, events} and decodeEvents reads it back', () => {
    const evs = [ev('a', 1), ev('b', 2)];
    const text = encodeEvents(evs);
    const parsed = JSON.parse(text);
    assert.equal(parsed.v, 1);
    assert.equal(parsed.app, 'moto-master');
    assert.deepEqual(decodeEvents(text), evs);
  });

  test('decodeEvents accepts a bare array', () => {
    const evs = [ev('a', 1)];
    assert.deepEqual(decodeEvents(JSON.stringify(evs)), evs);
    assert.deepEqual(decodeEvents('[]'), []);
  });

  test('decodeEvents accepts {v, events} without the app field', () => {
    assert.deepEqual(decodeEvents(JSON.stringify({ v: 1, events: [ev('x', 9)] })), [ev('x', 9)]);
  });

  test('decodeEvents treats empty / whitespace text as no events', () => {
    assert.deepEqual(decodeEvents(''), []);
    assert.deepEqual(decodeEvents('   \n'), []);
    assert.deepEqual(decodeEvents(null), []);
    assert.deepEqual(decodeEvents(undefined), []);
  });

  test('decodeEvents rejects garbage: non-JSON throws, JSON without an events array throws a format SyncError', () => {
    assert.throws(() => decodeEvents('not json at all'), SyntaxError);
    assert.throws(() => decodeEvents('{"v":1}'), (e) => e instanceof SyncError && e.kind === 'format');
    assert.throws(() => decodeEvents('{"events":"nope"}'), (e) => e instanceof SyncError && e.kind === 'format');
    assert.throws(() => decodeEvents('42'), SyncError);
    assert.throws(() => decodeEvents('"str"'), SyncError);
    assert.throws(() => decodeEvents('null'), SyncError);
  });
});
