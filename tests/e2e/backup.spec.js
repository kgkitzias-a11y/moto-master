// Export → import round trip into a fresh profile; re-export must be byte-identical.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { acceptDialogs, startPracticeSequential, drive, readSeenStat, exportJson, gotoHash } from './helpers.js';

test('export/import round trip reproduces identical state and bytes', async ({ page, browser }, testInfo) => {
  acceptDialogs(page);
  await startPracticeSequential(page);
  const r = await drive(page, { max: 4, finishEarly: true });
  expect(r.answered).toBe(4);
  const seenA = await readSeenStat(page);
  expect(seenA).toMatch(/^4\//);

  const fileA = path.join(testInfo.outputDir, 'export-a.json');
  await exportJson(page, fileA);
  const textA = fs.readFileSync(fileA, 'utf8');
  const dataA = JSON.parse(textA);
  expect(dataA.v).toBe(1);
  expect(dataA.app).toBe('moto-master');
  expect(dataA.events.filter((e) => e.k === 'answer')).toHaveLength(4);
  expect(dataA.events.filter((e) => e.k === 'session')).toHaveLength(1);
  // Sorted by (t, id) and free of the device token/settings.
  for (let i = 1; i < dataA.events.length; i++) {
    const a = dataA.events[i - 1], b = dataA.events[i];
    expect(a.t < b.t || (a.t === b.t && a.id < b.id)).toBe(true);
  }
  expect(textA).not.toContain('mm.gh.token');
  expect(textA).not.toContain('deviceId');

  // Fresh context = fresh IndexedDB/localStorage.
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  acceptDialogs(pageB);
  try {
    expect(await readSeenStat(pageB)).toBe('0/140');
    await gotoHash(pageB, '#/settings');
    await pageB.locator('input[type="file"]').setInputFiles(fileA);
    await expect(pageB.locator('.toast')).toHaveText('Επαναφορά: 5 νέες εγγραφές, 0 υπήρχαν ήδη');
    await pageB.reload();
    expect(await readSeenStat(pageB)).toBe(seenA);
    await expect(pageB.locator('#view table tbody tr', { hasText: 'Ελεύθερη εξάσκηση' })).toHaveCount(1);

    // Importing the same file again is a no-op (union by id).
    await gotoHash(pageB, '#/settings');
    await pageB.locator('input[type="file"]').setInputFiles(fileA);
    await expect(pageB.locator('.toast').last()).toHaveText('Επαναφορά: 0 νέες εγγραφές, 5 υπήρχαν ήδη');

    const fileB = path.join(testInfo.outputDir, 'export-b.json');
    await exportJson(pageB, fileB);
    const bufA = fs.readFileSync(fileA), bufB = fs.readFileSync(fileB);
    expect(bufB.equals(bufA)).toBe(true);
  } finally {
    await ctxB.close();
  }
});
