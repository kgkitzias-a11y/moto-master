import { test, expect } from '@playwright/test';
import { acceptDialogs, answerOne, clickNext, endSession, gotoHome, gotoHash } from './helpers.js';

test('exam-date goal persists, resumes an exact short batch, and reset clears today without clearing settings', async ({ page }) => {
  acceptDialogs(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  await gotoHome(page);
  // Far enough away to exercise a daily quota smaller than the old five-question minimum.
  await page.getByLabel('Ημερομηνία εξετάσεων', { exact: true }).fill('2026-11-09');
  await page.getByText('Προσωρινή ημερομηνία — περιμένω επιβεβαίωση').click();
  await expect(page.locator('#plan-target')).toHaveText('4 ερωτήσεις σήμερα');
  await expect(page.locator('.hero')).toContainText('0/4 ερωτήσεις του πλάνου');
  await page.locator('#hero-btn').click();
  await expect(page.locator('.session-top')).toContainText('1/4');
  await answerOne(page); await clickNext(page);
  await endSession(page);
  await expect(page.locator('#continue-goal')).toHaveText('Συνέχισε (3 ακόμα για τον στόχο) ▶');
  await page.locator('#continue-goal').click();
  await expect(page.locator('.session-top')).toContainText('1/3');
  for (let i = 0; i < 3; i++) { await answerOne(page); await clickNext(page); }
  await expect(page.locator('#view')).toContainText('Ημερήσιος στόχος 4 ✓');
  await gotoHome(page);
  await expect(page.locator('.goalbar')).toHaveClass(/done/);
  await page.reload();
  await expect(page.getByLabel('Ημερομηνία εξετάσεων', { exact: true })).toHaveValue('2026-11-09');
  await expect(page.locator('.hero')).toContainText('4/4 ερωτήσεις του πλάνου');
  await page.getByLabel('Ημερομηνία εξετάσεων', { exact: true }).fill('2026-10-09');
  await expect(page.locator('#plan-target')).toHaveText('35 ερωτήσεις σήμερα');
  await expect(page.locator('.hero')).toContainText('31 ακόμα');

  await gotoHash(page, '#/settings');
  await page.getByRole('button', { name: 'Διαγραφή προόδου', exact: true }).click();
  await gotoHome(page);
  await expect(page.locator('.hero')).toContainText('0/35 ερωτήσεις του πλάνου');
  await expect(page.locator('.hero')).toContainText('0 απαντήσεις σήμερα');
  await expect(page.getByLabel('Ημερομηνία εξετάσεων', { exact: true })).toHaveValue('2026-10-09');
  await expect(page.getByRole('checkbox', { name: 'Προσωρινή ημερομηνία' })).toBeChecked();
  await expect(page.locator('#view')).toContainText('0/140');
  expect(errors).toEqual([]);
});

test('date unset and expired states explain fallback; archive changes the automatic target', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  await gotoHash(page, '#/settings');
  await page.getByLabel('Ημερομηνία εξετάσεων', { exact: true }).fill('2026-10-09');
  await expect(page.locator('#manual-goal')).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Ερωτήσεις εκτός ύλης' }).check();
  await expect(page.locator('#plan-target')).toHaveText('40 ερωτήσεις σήμερα');
  await page.getByLabel('Ημερομηνία εξετάσεων', { exact: true }).fill('2026-10-04');
  await expect(page.locator('.study-plan')).toContainText('Η ημερομηνία πέρασε.');
  await expect(page.locator('#manual-goal')).toBeEnabled();
  await page.getByLabel('Ημερομηνία εξετάσεων', { exact: true }).fill('');
  await expect(page.locator('.study-plan')).toContainText('Βάλε την πιθανότερη ημερομηνία.');
});
