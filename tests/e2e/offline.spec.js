// After one online visit the service worker must serve the whole app (shell + questions) offline.
import { test, expect } from '@playwright/test';
import { acceptDialogs, endSession, summaryScore } from './helpers.js';

test.use({ serviceWorkers: 'allow' });

// The app reloads itself once the SW first claims the page (controllerchange). Evaluate with a
// retry so an "execution context destroyed" during that reload does not fail the poll.
async function evalRetry(page, fn) {
  try { return await page.evaluate(fn); } catch (e) { if (/context|destroyed|navigation/i.test(String(e))) return undefined; throw e; }
}

test('app shell and questions load with the network offline', async ({ page, context }) => {
  acceptDialogs(page);
  await page.goto('/#/');
  await page.locator('.modes').first().waitFor();

  await expect.poll(() => evalRetry(page, () => navigator.serviceWorker.ready.then((r) => !!r.active)), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => evalRetry(page, () => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => evalRetry(page, () => caches.keys().then((k) => k.length)), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => evalRetry(page, async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const hit = await caches.match('./data/questions.json');
    return !!hit;
  }), { timeout: 30_000, message: 'data/questions.json must be cached by the service worker' }).toBe(true);
  // The shell itself must be cached too.
  expect(await page.evaluate(async () => !!(await caches.match('./index.html')) || !!(await caches.match('./')))).toBe(true);
  await page.locator('.modes').first().waitFor();

  await context.setOffline(true);
  try {
    await page.reload();
    await page.locator('.modes').first().waitFor({ timeout: 20_000 });
    await expect(page.locator('#view')).not.toContainText('Σφάλμα εκκίνησης');
    await expect(page.locator('.mode[data-mode="gauntlet139"] .n')).toHaveText('140 ερωτήσεις');
    await expect(page.locator('#view')).toContainText('0/140 ερωτήσεις που είδες');
    await expect(page.locator('#version-stamp')).toHaveText(/^Moto Master v\d/);
    // A session can start offline as well (questions are really loaded, not just counted).
    await page.locator('.mode[data-mode="exam"]').click();
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.qtext')).not.toBeEmpty();
    await expect.poll(() => page.locator('button.opt').count()).toBeGreaterThanOrEqual(2);
    await page.locator('button.opt').first().click();
    await endSession(page);
    expect((await summaryScore(page)).answered).toBe(1);
  } finally {
    await context.setOffline(false);
  }
  await page.goto('/#/');
  await page.locator('.modes').first().waitFor();
});
