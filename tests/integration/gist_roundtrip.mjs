// Real GitHub Gist round trip. TEST-ONLY: reads the token from the MM_TEST_TOKEN env var
// (e.g. `MM_TEST_TOKEN=$(gh auth token) node tests/integration/gist_roundtrip.mjs`).
// Creates a private gist through the app's own sync module, syncs two simulated devices,
// verifies convergence, then deletes the gist. The token never touches the repo or app code.
import assert from 'node:assert/strict';
import { syncOnce, getGist, deleteGist, findGist, GIST_FILE } from '../../src/sync/gist.js';
import { reduce } from '../../src/engine/reducer.js';
import { uuid } from '../../src/engine/shuffle.js';

const token = process.env.MM_TEST_TOKEN;
if (!token) { console.error('MM_TEST_TOKEN not set'); process.exit(2); }

// Use a unique file name? No — the app looks for GIST_FILE; to avoid touching a real user gist we
// first check none exists, and we delete ours at the end.
const pre = await findGist(token);
if (pre) { console.error(`A gist with ${GIST_FILE} already exists (${pre}); refusing to run the test against it.`); process.exit(3); }

function device(name) {
  const store = new Map();
  let gistId = null;
  return {
    name,
    io: {
      loadLocal: async () => [...store.values()],
      addLocal: async (evs) => { for (const e of evs) if (!store.has(e.id)) store.set(e.id, e); },
      getGistId: () => gistId,
      setGistId: (id) => { gistId = id; },
    },
    add(e) { store.set(e.id, e); },
    events() { return [...store.values()]; },
    get gistId() { return gistId; },
  };
}
const questions = [1, 2, 3, 4].map((id) => ({ id, tier: 'booklet', text: `q${id}`, options: ['a', 'b', 'c'], correct: 0, similar: [] }));
const t0 = Date.parse('2026-01-05T10:00:00Z');
const ans = (q, ok, t) => ({ id: uuid(), t, k: 'answer', q, ch: ok ? 0 : 1, ok, ms: 1200, m: 'practice', s: 'sid', cf: null, sh: true, tl: null, hd: false, rc: false });

const A = device('A'), B = device('B');
let created = null;
try {
  A.add(ans(1, true, t0)); A.add(ans(2, false, t0 + 1000));
  const r1 = await syncOnce(token, A.io);
  created = r1.gistId; console.log('A sync #1', r1);
  assert.equal(r1.pushed, 2);

  B.add(ans(3, true, t0 + 2000)); B.add(ans(4, true, t0 + 3000));
  const r2 = await syncOnce(token, B.io); console.log('B sync #1', r2);
  assert.equal(r2.gistId, created, 'B found the same gist');
  assert.equal(r2.pulled, 2); assert.equal(r2.pushed, 2);

  const r3 = await syncOnce(token, A.io); console.log('A sync #2', r3);
  assert.equal(r3.pulled, 2); assert.equal(r3.pushed, 0);

  const sa = JSON.stringify(reduce(A.events(), questions));
  const sb = JSON.stringify(reduce(B.events(), questions));
  assert.equal(sa, sb, 'both devices derive identical state');
  const { gist, events } = await getGist(token, created);
  assert.equal(events.length, 4, 'gist holds the union');
  assert.equal(gist.public, false, 'gist is secret');
  assert.ok(!JSON.stringify(events).includes(token), 'token never inside the payload');
  console.log('OK: real gist round trip converged (4 events, secret gist).');
} finally {
  if (created) { await deleteGist(token, created); console.log('deleted test gist', created); }
}
