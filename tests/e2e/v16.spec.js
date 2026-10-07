// v1.6: final stretch, real-exam screen (hidden ids, skip, «Πρακτικό»), cards, exam wording.
import { test, expect } from '@playwright/test';
import { acceptDialogs, gotoHome, gotoHash, clickMode, fetchQuestions, answerKnown } from './helpers.js';

test('final stretch follows the exam date: daily steps, the eve and the exam day', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-07T09:00:00Z'));
  await gotoHome(page);
  const card = page.locator('#final-stretch');
  await expect(card).toBeVisible();
  // Top of the screen: final stretch first, then the Genie-style program, then the daily plan.
  const order = await page.locator('#view > div > *').evaluateAll((els) => els.slice(0, 3).map((e) => e.id || e.className));
  expect(order[0]).toBe('final-stretch');
  expect(order[1]).toBe('program');
  expect(order[2]).toContain('hero');
  await expect(card.locator('#grind-btn')).toHaveText('Επιπλέον γύρος ▶');
  await expect(page.locator('#program-next')).toHaveText('Επόμενο: Τεστ 1 ▶');
  await expect(page.locator('#program [data-stage]')).toHaveCount(6);
  await expect(card.locator('#pass-chance .v')).toHaveText(/%$/);
  await expect(card.locator('#proof-count .v')).toHaveText('0/140');
  await expect(card.locator('[data-step]')).toHaveCount(3);
  await expect(card.locator('[data-step="twins"]')).toBeVisible();

  await page.getByLabel('Ημερομηνία εξετάσεων', { exact: true }).fill('2026-10-08');
  await expect(card).toContainText('Αύριο εξετάσεις — παραμονή');
  await expect(card.locator('[data-step="proof"]')).toContainText('0/140');
  await expect(card.locator('[data-step="exams"]')).toContainText('0/3');

  await page.getByLabel('Ημερομηνία εξετάσεων', { exact: true }).fill('2026-10-07');
  await expect(card).toContainText('Σήμερα εξετάσεις');
  await expect(card.locator('[data-step="morning"] button')).toHaveText('Ξεκίνα');
  await card.locator('[data-step="morning"] button').click();
  await expect(page).toHaveURL(/#\/session$/);
  await expect(page.locator('.session-top')).toContainText('Πρωί των εξετάσεων');
  expect(errors).toEqual([]);
});

test('exam simulation looks like the real exam: no ids, skip returns the question last, printed sheet', async ({ page }) => {
  acceptDialogs(page);
  const { byId } = await fetchQuestions(page);
  await clickMode(page, 'exam');
  await expect(page.locator('#clock')).toHaveText(/^1[45]:\d\d$/); // official 15′
  await expect(page.locator('.qid')).toBeHidden();
  const firstText = await page.locator('.qtext').innerText();
  await page.locator('#skip-btn').click();
  await expect(page.locator('.qtext')).not.toHaveText(firstText);
  await expect(page.locator('.session-top')).toContainText('ερώτηση 1/10');
  for (let i = 0; i < 9; i++) {
    await expect(page.locator('.session-top')).toContainText(`ερώτηση ${i + 1}/10`); // wait for the next screen
    await answerKnown(page, byId, true, { feedback: false });
  }
  await expect(page.locator('.session-top')).toContainText('ερώτηση 10/10');
  await expect(page.locator('.qtext')).toHaveText(firstText); // the skipped one comes back last
  await expect(page.locator('#skip-btn')).toHaveCount(0);     // nothing left to skip to
  await answerKnown(page, byId, true, { feedback: false });
  await expect(page).toHaveURL(/#\/summary$/);
  await expect(page.locator('.verdict-big')).toHaveText('ΠΕΡΑΣΕΣ');
  await expect(page.locator('.exam-sheet li')).toHaveCount(10);
  await expect(page.locator('#view')).toContainText('Παραλείψεις: 1');
});

test('cards: speed table from the answer key, look-alikes, exam-day rules, reworded questions', async ({ page }) => {
  await gotoHome(page);
  await page.locator('#cards-link').click();
  await expect(page).toHaveURL(/#\/cards$/);
  const rows = page.locator('.speed-table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('70 km/h');
  await expect(rows.nth(0)).toContainText('90 km/h');
  await expect(rows.nth(1)).toContainText('80 km/h');
  await expect(rows.nth(1)).toContainText('110 km/h');
  await expect(rows.nth(2)).toContainText('130 km/h');
  await expect(page.locator('#c-twins .twin-set').first()).toBeVisible();
  await expect(page.locator('#c-examday')).toContainText('15 λεπτά');
  await expect(page.locator('#c-examday')).toContainText('Αν θα ξεκινήσει το λεωφορείο και αν θα εμφανισθεί');
  await expect(page.locator('#c-unknown')).toContainText('%');
});

test('question page shows the exam wording and the look-alikes', async ({ page }) => {
  await gotoHash(page, '#/q/145');
  await expect(page.locator('#exam-wording')).toContainText('Ποιοι είναι οι κυριότεροι λόγοι ολισθήσεως');
  await expect(page.locator('#view')).toContainText('Ομάδα εξετάσεων 6');
  await gotoHash(page, '#/q/169');
  await expect(page.locator('#view')).toContainText('Δίδυμες ερωτήσεις');
  await expect(page.locator('#view a.qrow[href="#/q/170"]').first()).toBeVisible();
});

test('readiness page shows the pass chance per group and the final check', async ({ page }) => {
  await gotoHash(page, '#/certification');
  await expect(page.locator('#chance-card tbody tr')).toHaveCount(10);
  await expect(page.locator('#proof-card')).toContainText('0/140');
  await gotoHash(page, '#/stats');
  await expect(page.locator('#group-table tbody tr')).toHaveCount(10);
});
