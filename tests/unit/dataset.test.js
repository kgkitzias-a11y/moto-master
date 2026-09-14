import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8'));
const { meta, questions } = data;

test('dataset: top-level shape {meta, questions[]}', () => {
  assert.ok(meta && typeof meta === 'object');
  assert.ok(Array.isArray(questions) && questions.length > 0);
});

test('dataset: booklet count equals meta.booklet and is >= 139', () => {
  const booklet = questions.filter((q) => q.tier === 'booklet').length;
  assert.equal(booklet, meta.booklet);
  assert.ok(booklet >= 139, `booklet count ${booklet} < 139`);
});

test('dataset: archive count equals meta.archive', () => {
  const archive = questions.filter((q) => q.tier === 'archive').length;
  assert.equal(archive, meta.archive);
});

test('dataset: every question has >= 2 options and an integer `correct` within range', () => {
  for (const q of questions) {
    assert.ok(Array.isArray(q.options) && q.options.length >= 2, `q${q.id} has ${q.options && q.options.length} options`);
    assert.ok(Number.isInteger(q.correct), `q${q.id} correct is not an integer`);
    assert.ok(q.correct >= 0 && q.correct < q.options.length, `q${q.id} correct ${q.correct} out of range`);
  }
});

test('dataset: no duplicate ids and ids are positive integers', () => {
  const seen = new Set();
  for (const q of questions) {
    assert.ok(Number.isInteger(q.id) && q.id > 0, `bad id ${q.id}`);
    assert.ok(!seen.has(q.id), `duplicate id ${q.id}`);
    seen.add(q.id);
  }
});

test('dataset: every non-null image exists as a file relative to repo root', () => {
  let checked = 0;
  for (const q of questions) {
    if (q.image === null || q.image === undefined) continue;
    assert.equal(typeof q.image, 'string', `q${q.id} image must be a string path or null`);
    assert.ok(fs.existsSync(path.join(ROOT, q.image)), `q${q.id} image missing: ${q.image}`);
    checked++;
  }
  assert.ok(checked >= 0);
});

test('dataset: every id in `similar` exists and never self-references', () => {
  const ids = new Set(questions.map((q) => q.id));
  for (const q of questions) {
    assert.ok(Array.isArray(q.similar), `q${q.id} similar not an array`);
    for (const s of q.similar) {
      assert.ok(ids.has(s), `q${q.id} similar → unknown id ${s}`);
      assert.notEqual(s, q.id, `q${q.id} similar references itself`);
    }
  }
});

test('dataset: tier is booklet|archive', () => {
  for (const q of questions) assert.ok(q.tier === 'booklet' || q.tier === 'archive', `q${q.id} tier=${q.tier}`);
});

test('dataset: category and text are non-empty strings', () => {
  for (const q of questions) {
    assert.ok(typeof q.category === 'string' && q.category.trim().length > 0, `q${q.id} empty category`);
    assert.ok(typeof q.text === 'string' && q.text.trim().length > 0, `q${q.id} empty text`);
  }
});

test('dataset: options are non-empty distinct strings', () => {
  for (const q of questions) {
    const trimmed = q.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
    for (const [i, o] of trimmed.entries()) assert.ok(o.length > 0, `q${q.id} option ${i} empty/non-string`);
    assert.equal(new Set(trimmed).size, trimmed.length, `q${q.id} has duplicate options`);
  }
});
