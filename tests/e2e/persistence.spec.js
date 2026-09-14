// Progress survives a reload (IndexedDB event log) and shows up on the per-question page.
import { test, expect } from '@playwright/test';
import { acceptDialogs, startPracticeSequential, drive, readSeenStat, gotoHash } from './helpers.js';

test('answers persist across reload and appear on the question page', async ({ page }) => {
  acceptDialogs(page);
  expect(await readSeenStat(page)).toBe('0/140');

  await startPracticeSequential(page);
  await expect(page.locator('.qid')).toContainText('#1 ');
  const r = await drive(page, { max: 3, finishEarly: true });
  expect(r.answered).toBe(3);

  const seen = await readSeenStat(page);
  expect(seen).toMatch(/^3\/\d+$/);
  await expect(page.locator('#view')).toContainText('Ημερολόγιο συνεδριών');
  await expect(page.locator('#view table tbody tr', { hasText: 'Εξάσκηση' })).toHaveCount(1);

  await page.reload();
  await page.locator('#view h1').waitFor();
  expect(await readSeenStat(page)).toBe(seen);
  await expect(page.locator('#view table tbody tr', { hasText: 'Εξάσκηση' })).toHaveCount(1);

  // Question 1 was the first sequential question: its stats card must show one answer.
  await gotoHash(page, '#/q/1');
  await expect(page.locator('.qid')).toContainText('#1 ');
  const card = page.locator('.card', { hasText: 'Στατιστικά' });
  await expect(card).not.toContainText('Δεν την έχεις απαντήσει ακόμα.');
  const answers = card.locator('.stat', { has: page.locator('.l', { hasText: 'σωστές / σύνολο' }) }).locator('.v');
  await expect(answers).toHaveText(/^[01]\/1$/);
  await expect(card.locator('svg.spark rect')).toHaveCount(1);

  // A question that was never shown still says so.
  await gotoHash(page, '#/q/172');
  await expect(page.locator('.card', { hasText: 'Στατιστικά' })).toContainText('Δεν την έχεις απαντήσει ακόμα.');
});
