// QR/URL pairing: device A shows the pairing string, device B consumes it from #pair=.
import { test, expect } from '@playwright/test';
import { acceptDialogs, saveToken, makeFakeGithub, gotoHash } from './helpers.js';

const TOKEN = 'ghp_TESTTOKEN_PAIR';

test('pairing string from A configures B and strips the hash', async ({ browser }) => {
  const gh = makeFakeGithub();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await ctxA.route('https://api.github.com/**', gh.handler);
  await ctxB.route('https://api.github.com/**', gh.handler);
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  acceptDialogs(A); acceptDialogs(B);
  try {
    await gotoHash(A, '#/');
    await saveToken(A, TOKEN);
    const gistId = [...gh.gists.keys()][0];
    expect(gistId).toBeTruthy();

    await gotoHash(A, '#/settings');
    await A.getByRole('button', { name: 'Εμφάνιση QR σύζευξης' }).click();
    await expect(A.locator('.qr svg')).toBeVisible();
    const ta = A.locator('textarea');
    await expect(ta).toBeVisible();
    const str = (await ta.inputValue()).trim();
    expect(str).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(str).not.toContain(TOKEN); // encoded, not plain
    const decoded = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    expect(decoded).toEqual({ t: TOKEN, g: gistId });

    // Device B: fresh storage, opens the pairing URL.
    expect(await B.evaluate(() => localStorage.getItem('mm.gh.token')).catch(() => null)).toBeFalsy();
    await B.goto(`/#pair=${str}`);
    await B.locator('.modes').waitFor();
    expect(B.url()).not.toContain('#pair');
    expect(B.url()).not.toContain(str);
    expect(await B.evaluate(() => location.hash)).toBe('');
    expect(await B.evaluate(() => localStorage.getItem('mm.gh.token'))).toBe(TOKEN);
    expect(JSON.parse(await B.evaluate(() => localStorage.getItem('mm.settings'))).gistId).toBe(gistId);
    await expect(B.locator('.toast')).toHaveText('Η σύζευξη ολοκληρώθηκε — συγχρονισμός…');
    await expect(B.locator('#sync-pill')).not.toHaveText('Μόνο τοπικά');
    await expect(B.locator('#sync-pill')).toHaveText(/^Συγχρονίστηκε/);
    await expect(B.locator('#sync-pill')).toHaveClass(/pill-synced/);

    // B reused A's gist and the token only ever travelled in the Authorization header.
    expect(gh.created).toBe(1);
    const fromB = gh.requests.filter((r) => r.headers['authorization'] === `Bearer ${TOKEN}`);
    expect(fromB.length).toBeGreaterThan(2);
    for (const r of gh.requests) { expect(r.url).not.toContain(TOKEN); expect(r.body).not.toContain(TOKEN); }

    // Reloading B keeps the pairing (token is in localStorage, hash is gone).
    await B.reload();
    await B.locator('.modes').waitFor();
    expect(B.url()).not.toContain('pair');
    await expect(B.locator('#sync-pill')).toHaveText(/^Συγχρονίστηκε/);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
