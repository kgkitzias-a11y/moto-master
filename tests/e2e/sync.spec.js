// Two-device convergence through a mocked GitHub Gist API shared by both browser contexts.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { acceptDialogs, saveToken, syncNow, startPracticeRange, drive, readSeenStat, exportJson, makeFakeGithub, GIST_FILE, gotoHash } from './helpers.js';

const TOKEN = 'ghp_TESTTOKEN_A';

test('two devices converge on the same merged state via one gist', async ({ browser }, testInfo) => {
  const gh = makeFakeGithub();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await ctxA.route('https://api.github.com/**', gh.handler);
  await ctxB.route('https://api.github.com/**', gh.handler);
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  acceptDialogs(A); acceptDialogs(B);

  try {
    // ---- device A: token → find-or-create → gist created ----
    await gotoHash(A, '#/');
    await expect(A.locator('#sync-pill')).toHaveText('Τοπικά μόνο');
    await saveToken(A, TOKEN);
    expect(gh.created).toBe(1);
    expect(gh.gists.size).toBe(1);
    const gistId = [...gh.gists.keys()][0];
    await expect(A.locator('#view')).toContainText(`Gist: ${gistId}`);
    expect(await A.evaluate(() => localStorage.getItem('mm.gh.token'))).toBe(TOKEN);
    expect(JSON.parse(await A.evaluate(() => localStorage.getItem('mm.settings'))).gistId).toBe(gistId);

    // A answers 4 questions (IDs 1–10 range, sequential).
    await startPracticeRange(A, 1, 10);
    await expect(A.locator('.qid')).toContainText('#1 ');
    expect((await drive(A, { max: 4, finishEarly: true })).answered).toBe(4);
    expect(await readSeenStat(A)).toMatch(/^4\//);

    // ---- device B: same token → must FIND A's gist, never create a second one ----
    await gotoHash(B, '#/');
    await saveToken(B, TOKEN);
    expect(gh.created).toBe(1);
    await expect(B.locator('#view')).toContainText(`Gist: ${gistId}`);

    // B answers 4 different questions (IDs 20–40 range).
    await startPracticeRange(B, 20, 40);
    await expect(B.locator('.qid')).toContainText(/#2\d /);
    expect((await drive(B, { max: 4, finishEarly: true })).answered).toBe(4);

    // ---- alternate manual syncs, twice each ----
    await syncNow(A); await syncNow(B); await syncNow(A); await syncNow(B);

    // Derived state converged.
    expect(await readSeenStat(A)).toBe('8/140');
    expect(await readSeenStat(B)).toBe('8/140');
    await expect(A.locator('#view table tbody tr', { hasText: 'Εξάσκηση' })).toHaveCount(2);
    await expect(B.locator('#view table tbody tr', { hasText: 'Εξάσκηση' })).toHaveCount(2);

    // Exports are byte-equal (both sorted by (t, id)).
    const fileA = path.join(testInfo.outputDir, 'export-a.json');
    const fileB = path.join(testInfo.outputDir, 'export-b.json');
    await exportJson(A, fileA); await exportJson(B, fileB);
    const bufA = fs.readFileSync(fileA), bufB = fs.readFileSync(fileB);
    expect(bufA.length).toBeGreaterThan(0);
    expect(bufB.equals(bufA)).toBe(true);
    const merged = JSON.parse(bufA.toString('utf8'));
    expect(merged.events.filter((e) => e.k === 'answer')).toHaveLength(8);
    expect(merged.events.filter((e) => e.k === 'session')).toHaveLength(2);

    // The gist itself holds the same merged log.
    const remote = JSON.parse(gh.gists.get(gistId).files[GIST_FILE].content);
    expect(remote.events.map((e) => e.id).sort()).toEqual(merged.events.map((e) => e.id).sort());

    // ---- fake-store invariants ----
    expect(gh.created).toBe(1);
    expect(gh.requests.filter((r) => r.method === 'POST' && new URL(r.url).pathname === '/gists')).toHaveLength(1);
    expect(gh.requests.length).toBeGreaterThan(6);
    for (const r of gh.requests) {
      expect(new URL(r.url).origin).toBe('https://api.github.com');
      expect(r.url).not.toContain(TOKEN);
      expect(r.body).not.toContain(TOKEN);
      expect(r.headers['authorization']).toBe(`Bearer ${TOKEN}`);
      expect(r.headers['accept']).toBe('application/vnd.github+json');
    }
    // No request escaped to the real network under a different host.
    const hosts = new Set(gh.requests.map((r) => new URL(r.url).host));
    expect([...hosts]).toEqual(['api.github.com']);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
