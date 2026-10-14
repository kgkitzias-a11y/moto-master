import { test, expect } from '@playwright/test';
import { gotoHome, fetchQuestions, answerKnown } from './helpers.js';

test('confirmed exam, transparent readiness and back-to-back simulations preserve progress', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-14T09:00:00Z'));
  const { byId } = await fetchQuestions(page);
  await gotoHome(page);
  await page.getByLabel('Ημερομηνία εξετάσεων', { exact: true }).fill('2026-10-19');
  await page.getByLabel('Ώρα εξετάσεων', { exact: true }).fill('11:30');
  await page.getByRole('checkbox', { name: 'Προσωρινή ημερομηνία' }).uncheck();
  await expect(page.locator('.exam-ticket')).toContainText('Επιβεβαιωμένες εξετάσεις');
  await expect(page.locator('.exam-ticket')).toContainText('11:30');
  await expect(page.locator('#practice-score')).toHaveText('0%');
  await page.locator('.score-explanation summary').click();
  await expect(page.locator('.score-explanation')).toContainText('25%: κάλυψη');
  await expect(page.locator('#practice-meter')).toContainText('Δεν είναι πιθανότητα επιτυχίας.');
  await page.locator('#quick-exam').click();
  for (let i = 0; i < 10; i++) {
    await expect(page.locator('.session-top')).toContainText(`ερώτηση ${i + 1}/10`);
    await answerKnown(page, byId, true, { feedback: false });
  }
  await expect(page).toHaveURL(/#\/summary$/);
  await expect(page.locator('#next-round')).toHaveText('Επόμενη προσομοίωση →');
  await page.locator('#next-round').click();
  await expect(page).toHaveURL(/#\/session$/);
  await expect(page.locator('.session-top')).toContainText('ερώτηση 1/10');
  await page.goto('/#/');
  await expect(page.locator('#observed-pass-rate')).toContainText('100% (1/1');
  await page.reload();
  await expect(page.getByLabel('Ώρα εξετάσεων', { exact: true })).toHaveValue('11:30');
  await expect(page.locator('#observed-pass-rate')).toContainText('100%');
  expect(errors).toEqual([]);
});

test('dashboard fits a small iPhone and desktop without horizontal overflow', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await gotoHome(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('#quick-exam')).toBeVisible();
    await expect(page.locator('#quick-next')).toBeInViewport();
    await expect(page.locator('.ptest')).toHaveCount(7);
  }
});
