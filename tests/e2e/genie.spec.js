// Genie-style surfaces: numbered practice tests, "continue toward the daily goal", the cheat sheet.
import { test, expect } from '@playwright/test';
import {
  acceptDialogs, gotoHome, gotoHash, answerOne, clickNext, drive, startPracticeSequential, summaryScore,
  fetchQuestions, answerKnown,
} from './helpers.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('genie', () => {
  test('practice tests: 7 fixed sets of 20; a set is played to the end, its best score and the 100 % pass show on the card', async ({ page }) => {
    acceptDialogs(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const { meta, byId } = await fetchQuestions(page);
    expect(meta.booklet).toBe(140);

    await gotoHome(page);
    await expect(page.locator('.ptest')).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      const c = page.locator(`.ptest[data-set="${i}"]`);
      await expect(c.locator('.t')).toHaveText(`Τεστ ${i + 1}`);
      await expect(c.locator('.b')).toHaveText('καλύτερο —');
      await expect(c.locator('.c')).toHaveText('20 ερ.');
      await expect(c).not.toHaveClass(/passed/);
    }
    await expect(page.locator('#view')).toContainText('0/7 με 100 %');
    await expect(page.locator('.ptest[data-set="archive"]')).toHaveCount(0); // archive test only with the setting on

    // Run 1: first answer wrong, the rest right → 19/20, not passed, hint shown.
    await page.locator('.ptest[data-set="0"]').click();
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText('Τεστ εξάσκησης · 1/20');
    const seen = [];
    for (let i = 0; i < 20; i++) {
      await expect(page.locator('.session-top')).toContainText(`${i + 1}/20`);
      seen.push(await page.locator('.qid span').first().innerText());
      const v = await answerKnown(page, byId, i !== 0);
      expect(v).toMatch(i === 0 ? /^Λάθος/ : /^Σωστό/);
      expect(await clickNext(page)).toBe(i === 19);
    }
    expect(new Set(seen).size).toBe(20);
    await expect(page.locator('#view h1')).toHaveText('Τεστ εξάσκησης');
    expect(await summaryScore(page)).toEqual({ correct: 19, answered: 20 });
    await expect(page.locator('.verdict-big')).toHaveText('19/20');
    await expect(page.locator('.verdict-big')).toHaveClass(/bad/);
    await expect(page.locator('#view')).toContainText('Το τεστ περνάει μόνο με 100 %');
    await expect(page.locator('#continue-goal')).toBeVisible(); // 20 < the default goal of 40

    await gotoHome(page);
    const c0 = page.locator('.ptest[data-set="0"]');
    await expect(c0.locator('.b')).toHaveText('καλύτερο 19/20');
    await expect(c0).not.toHaveClass(/passed/);
    await expect(page.locator('.ptest[data-set="1"] .b')).toHaveText('καλύτερο —');
    await expect(page.locator('#view')).toContainText('0/7 με 100 %');

    // Run 2 (same set, same 20 ids): everything right → ΠΕΡΑΣΕΣ 100 % and the card turns green.
    await c0.click();
    await expect(page.locator('.session-top')).toContainText('Τεστ εξάσκησης · 1/20');
    const seen2 = [];
    for (let i = 0; i < 20; i++) {
      await expect(page.locator('.session-top')).toContainText(`${i + 1}/20`);
      seen2.push(await page.locator('.qid span').first().innerText());
      expect(await answerKnown(page, byId, true)).toMatch(/^Σωστό/);
      expect(await clickNext(page)).toBe(i === 19);
    }
    expect([...seen2].sort()).toEqual([...seen].sort()); // the set is fixed
    expect(await summaryScore(page)).toEqual({ correct: 20, answered: 20 });
    await expect(page.locator('.verdict-big')).toHaveText('ΠΕΡΑΣΕΣ 100 %');
    await expect(page.locator('.verdict-big')).toHaveClass(/ok/);
    await expect(page.locator('#view')).not.toContainText('Το τεστ περνάει μόνο με 100 %');
    await expect(page.locator('#view')).toContainText('Ημερήσιος στόχος 40 ✓'); // 40 answers today

    await gotoHome(page);
    await expect(c0).toHaveClass(/passed/);
    await expect(c0.locator('.b')).toHaveText('✓ 100 %');
    await expect(page.locator('#view')).toContainText('1/7 με 100 %');
    // A later worse run must not un-pass the set: answer one wrong and stop.
    await c0.click();
    expect(await answerKnown(page, byId, false)).toMatch(/^Λάθος/);
    await page.getByRole('button', { name: 'Τέλος', exact: true }).click();
    await page.waitForURL(/#\/summary$/);
    await gotoHome(page);
    await expect(c0).toHaveClass(/passed/);
    await expect(c0.locator('.b')).toHaveText('✓ 100 %');
    expect(errors).toEqual([]);
  });

  test('goal: the summary offers to continue toward the daily goal; reaching it marks the day and the streak', async ({ page }) => {
    acceptDialogs(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await gotoHash(page, '#/settings');
    const goalInput = page.locator('input[type="number"][step="10"]');
    await expect(goalInput).toHaveValue('40');
    await goalInput.fill('10');
    await goalInput.dispatchEvent('change');
    await gotoHome(page);
    await expect(page.locator('#view')).toContainText('0/10 απαντήσεις σήμερα');
    await expect(page.locator('#view')).toContainText('10 ακόμα');
    await expect(page.locator('.kpi', { hasText: 'μέρες σερί' }).locator('.v')).toHaveText('0🔥');

    await startPracticeSequential(page);
    const r = await drive(page, { max: 3, finishEarly: true });
    expect(r).toEqual({ answered: 3, ended: 'abort' });
    await expect(page.locator('#view h1')).toHaveText('Ελεύθερη εξάσκηση');
    const cont = page.locator('#continue-goal');
    await expect(cont).toBeVisible();
    await expect(cont).toHaveText('Συνέχισε (7 ακόμα για τον στόχο) ▶');
    await expect(page.locator('#view')).not.toContainText('Ημερήσιος στόχος');

    await cont.click();
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText('Προς τον στόχο · 1/7');
    for (let i = 0; i < 7; i++) {
      await expect(page.locator('.session-top')).toContainText(`${i + 1}/7`);
      await answerOne(page);
      expect(await clickNext(page)).toBe(i === 6);
    }
    await expect(page).toHaveURL(/#\/summary$/);
    await expect(page.locator('#view h1')).toHaveText('Προς τον στόχο');
    expect((await summaryScore(page)).answered).toBe(7);
    await expect(page.locator('#continue-goal')).toHaveCount(0);
    await expect(page.locator('#view')).toContainText('Ημερήσιος στόχος 10 ✓');
    await expect(page.locator('.verdict-big')).toHaveText('ΣΤΟΧΟΣ ✓');

    await gotoHome(page);
    await expect(page.locator('#view')).toContainText('10/10 απαντήσεις σήμερα');
    await expect(page.locator('#view')).toContainText('στόχος ✓');
    await expect(page.locator('.goalbar')).toHaveClass(/done/);
    await expect(page.locator('#hero-btn')).not.toContainText('Συνέχισε');
    await expect(page.locator('.hero .title')).not.toHaveText('Συνέχισε προς τον στόχο');
    await expect(page.locator('.kpi', { hasText: 'μέρες σερί' }).locator('.v')).toHaveText('1🔥');
    // The goal day survives a reload (it lives in the event log).
    await page.reload();
    await gotoHome(page);
    await expect(page.locator('.kpi', { hasText: 'μέρες σερί' }).locator('.v')).toHaveText('1🔥');
    expect(errors).toEqual([]);
  });

  test('sheet: category headings, #1 with its green answer line, and a filter that narrows the list', async ({ page }) => {
    const { questions } = await fetchQuestions(page);
    const booklet = questions.filter((q) => q.tier === 'booklet');
    const cats = [...new Set(booklet.map((q) => q.category))];
    const q1 = booklet.find((q) => q.id === 1);
    const LETTERS = ['α', 'β', 'γ', 'δ', 'ε', 'στ', 'ζ'];

    await gotoHash(page, '#/sheet');
    await expect(page.locator('#view h1')).toHaveText('Σκονάκι');
    await expect(page.locator('#view')).toContainText(`${booklet.length} ερωτήσεις με τη σωστή απάντηση`);
    await expect(page.locator('.sheet h2')).toHaveCount(cats.length);
    for (const c of cats) {
      const n = booklet.filter((q) => q.category === c).length;
      await expect(page.locator('.sheet h2', { hasText: new RegExp(`^${escapeRe(c)} \\(${n}\\)$`) })).toHaveCount(1);
    }
    await expect(page.locator('.sheet .qa')).toHaveCount(booklet.length);
    await expect(page.locator('.sheet .qa .tag')).toHaveCount(0); // no archive rows without the setting

    const row = page.locator('.sheet .qa', { has: page.locator('.id', { hasText: /^#1$/ }) });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.q')).toContainText(q1.text);
    await expect(row.locator('.a')).toHaveText(`${LETTERS[q1.correct]}. ${q1.options[q1.correct]}`);
    const rgb = (await row.locator('.a').evaluate((el) => getComputedStyle(el).color)).match(/\d+/g).map(Number);
    expect(rgb[1]).toBeGreaterThan(rgb[0]); // green dominates
    expect(rgb[1]).toBeGreaterThan(rgb[2]);
    // the wrong options are not printed
    for (const [i, o] of q1.options.entries()) if (i !== q1.correct) await expect(row).not.toContainText(o);

    // Filter by a phrase of #1: the list narrows to the matching rows only, headings follow.
    const needle = q1.text.split(/\s+/).slice(1, 4).join(' ').toLowerCase();
    const f = (q) => q.text.toLowerCase().includes(needle) || q.options[q.correct].toLowerCase().includes(needle);
    const expected = booklet.filter(f);
    expect(expected.length).toBeGreaterThanOrEqual(1);
    expect(expected.length).toBeLessThan(booklet.length);
    const search = page.locator('input[type="search"]');
    await search.fill(needle);
    await expect(page.locator('.sheet .qa')).toHaveCount(expected.length);
    await expect(row).toHaveCount(1);
    await expect(page.locator('.sheet h2')).toHaveCount(new Set(expected.map((q) => q.category)).size);
    // an exact id also matches
    await search.fill('1');
    await expect(row).toHaveCount(1);
    // nothing matches → empty list, no headings
    await search.fill('ζζζζζζ');
    await expect(page.locator('.sheet .qa')).toHaveCount(0);
    await expect(page.locator('.sheet h2')).toHaveCount(0);
    await search.fill('');
    await expect(page.locator('.sheet .qa')).toHaveCount(booklet.length);
  });
});
