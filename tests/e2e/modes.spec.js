// Every mode in MODE_LIST is started and driven to completion or a valid end.
import { test, expect } from '@playwright/test';
import { MODE_LIST, SECTIONS, modeMeta } from '../../src/ui/modes.js';
import {
  acceptDialogs, gotoHome, gotoHash, clickMode, answerOne, clickNext, endSession, drive,
  makeOneWrongAnswer, startPracticeSequential, summaryScore, fetchQuestions, answerKnown,
} from './helpers.js';

// The app's "number/limit" matcher (selection.js NUM_RE).
const NUM_RE = /\d|km\/h|cm|\bm\b|cc\b|%|°/;

async function expectSummary(page, id) {
  await expect(page).toHaveURL(/#\/summary$/);
  await expect(page.locator('#view h1')).toHaveText(modeMeta(id).title);
  return summaryScore(page);
}

// One driver per mode id. The guard test below fails if MODE_LIST gains an id without a driver.
const drivers = {
  async practice(page) {
    await startPracticeSequential(page);
    await expect(page.locator('.session-top')).toContainText('Ελεύθερη εξάσκηση · 1/');
    await expect(page.locator('.qid')).toContainText('#1 ');
    const r = await drive(page, { max: 3, finishEarly: true });
    expect(r).toEqual({ answered: 3, ended: 'abort' });
    const s = await expectSummary(page, 'practice');
    expect(s.answered).toBe(3);
    await expect(page.locator('#view')).toContainText('Σταμάτησες το τεστ πριν τελειώσει.');
  },

  async adaptive(page) {
    await gotoHash(page, '#/setup/adaptive');
    await page.locator('input[type="number"]').fill('5');
    await page.getByRole('button', { name: 'Ξεκίνα' }).click();
    await expect(page.locator('.session-top')).toContainText('1/5');
    const r = await drive(page, { max: 5, finishEarly: false });
    expect(r).toEqual({ answered: 5, ended: 'done' });
    const s = await expectSummary(page, 'adaptive');
    expect(s.answered).toBe(5);
  },

  async due(page) {
    await clickMode(page, 'due');
    await expect(page).toHaveURL(/#\/session$/);
    const r = await drive(page, { max: 3 });
    expect(r.answered).toBe(3);
    const s = await expectSummary(page, 'due');
    expect(s.answered).toBe(3);
  },

  async exam(page) {
    await clickMode(page, 'exam');
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText('1/10');
    await expect(page.locator('#clock')).toHaveText(/^\d+:\d\d$/); // session timer visible
    for (let i = 0; i < 10; i++) {
      await expect(page.locator('.session-top')).toContainText(`${i + 1}/10`);
      await answerOne(page, { feedback: false }); // exam: feedback only at the end
      await expect(page.locator('.feedback')).toHaveCount(0);
    }
    const s = await expectSummary(page, 'exam');
    expect(s.answered).toBe(10);
    await expect(page.locator('.verdict-big')).toHaveText(/^(ΠΕΡΑΣΕΣ|ΚΟΠΗΚΕΣ)$/);
    const verdict = await page.locator('.verdict-big').innerText();
    expect(verdict).toBe(s.correct >= 9 ? 'ΠΕΡΑΣΕΣ' : 'ΚΟΠΗΚΕΣ');
  },

  async hard(page) {
    await clickMode(page, 'hard');
    await expect(page).toHaveURL(/#\/session$/);
    const r = await drive(page, { max: 3 });
    expect(r.answered).toBe(3);
    const s = await expectSummary(page, 'hard');
    expect(s.answered).toBe(3);
  },

  async twins(page) {
    await clickMode(page, 'twins');
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.qid .twin-tag')).toBeVisible();
    const verdict = await answerOne(page);
    expect(verdict).toMatch(/^(Σωστό|Λάθος)/);
    await expect(page.locator('.feedback .twin-note')).toContainText('Δίδυμη');
    await clickNext(page);
    await answerOne(page);
    await endSession(page);
    const s = await expectSummary(page, 'twins');
    expect(s.answered).toBe(2);
  },

  async proof(page) {
    await clickMode(page, 'proof');
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText('1/140');
    const r = await drive(page, { max: 3 });
    expect(r.answered).toBe(3);
    const s = await expectSummary(page, 'proof');
    expect(s.answered).toBe(3);
  },

  async morning(page) {
    await clickMode(page, 'morning');
    await expect(page).toHaveURL(/#\/session$/);
    const r = await drive(page, { max: 3 });
    expect(r.answered).toBe(3);
    const s = await expectSummary(page, 'morning');
    expect(s.answered).toBe(3);
  },

  async trap(page) {
    await clickMode(page, 'trap');
    await expect(page).toHaveURL(/#\/session$/);
    const r = await drive(page, { max: 3 });
    expect(r.answered).toBe(3);
    const s = await expectSummary(page, 'trap');
    expect(s.answered).toBe(3);
  },

  async speed(page) {
    await clickMode(page, 'speed');
    await expect(page).toHaveURL(/#\/session$/);
    await page.locator('button.opt').first().waitFor();
    await expect(page.locator('#clock')).toHaveText(/s$/);
    // Do not answer: after >5 s the per-question timer must fire a timeout verdict.
    await expect(page.locator('.feedback .verdict')).toHaveText(/Τέλος χρόνου/, { timeout: 15_000 });
    await expect(page.locator('.feedback')).toHaveClass(/bad/);
    // The session continues: next question can still be answered normally.
    await clickNext(page);
    const verdict = await answerOne(page);
    expect(verdict).toMatch(/^(Σωστό|Λάθος)/);
    await endSession(page);
    const s = await expectSummary(page, 'speed');
    expect(s.answered).toBe(2);
  },

  async sudden(page) {
    await clickMode(page, 'sudden');
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText('1/∞');
    let answered = 0, correct = 0, ended = false;
    for (let i = 0; i < 400 && !ended; i++) {
      const verdict = await answerOne(page);
      answered++;
      if (verdict.startsWith('Σωστό')) correct++;
      ended = await clickNext(page);
      if (verdict.startsWith('Λάθος')) expect(ended).toBe(true); // first wrong ends the run
    }
    expect(ended).toBe(true);
    const s = await expectSummary(page, 'sudden');
    expect(s.answered).toBe(answered);
    expect(s.correct).toBe(correct);
    await expect(page.locator('.verdict-big')).toHaveText(`${correct} στη σειρά`);
  },

  async gauntlet139(page) {
    await clickMode(page, 'gauntlet139');
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText('1/140');
    const r = await drive(page, { max: 5 });
    expect(r.answered).toBe(5);
    const s = await expectSummary(page, 'gauntlet139');
    expect(s.answered).toBe(5);
  },

  async gauntlet172(page) {
    const meta = (await (await page.request.get('/data/questions.json')).json()).meta;
    if (meta.archive > 0) {
      await gotoHash(page, '#/settings');
      const toggle = page.locator('label.toggle', { hasText: 'Ερωτήσεις εκτός ύλης' }).locator('input[type="checkbox"]');
      await toggle.check();
      await expect(toggle).toBeChecked();
    }
    await clickMode(page, 'gauntlet172');
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText(`1/${meta.booklet + meta.archive}`);
    const r = await drive(page, { max: 5 });
    expect(r.answered).toBe(5);
    const s = await expectSummary(page, 'gauntlet172');
    expect(s.answered).toBe(5);
  },

  async tomorrow(page) {
    await makeOneWrongAnswer(page);
    await gotoHome(page);
    await expect(page.locator('.mode[data-mode="tomorrow"]')).not.toHaveClass(/disabled/);
    await clickMode(page, 'tomorrow');
    await expect(page).toHaveURL(/#\/session$/);
    const r = await drive(page, { max: 3 });
    expect(r.answered).toBe(3);
    const s = await expectSummary(page, 'tomorrow');
    expect(s.answered).toBe(3);
  },

  async wrong(page) {
    // Precondition: the bin is empty on a fresh profile, so the card is disabled and toasts.
    await clickMode(page, 'wrong');
    await expect(page.locator('.toast')).toHaveText('Δεν έχεις λάθη αυτή τη στιγμή.');
    await expect(page).not.toHaveURL(/#\/session$/);
    await makeOneWrongAnswer(page);
    await gotoHome(page);
    const card = page.locator('.mode[data-mode="wrong"]');
    await expect(card).not.toHaveClass(/disabled/);
    await expect(card.locator('.n')).toHaveText(/^[1-9]\d* ερωτήσεις$/);
    await card.click();
    await expect(page).toHaveURL(/#\/session$/);
    // Zeroed end rule: a wrong answer re-queues the question; the session ends once every
    // binned question got a correct answer. Cap the loop and end early if the luck is bad.
    let answered = 0, done = false;
    for (let i = 0; i < 30 && !done; i++) {
      await answerOne(page); answered++;
      done = await clickNext(page);
    }
    if (!done) { await endSession(page); }
    const s = await expectSummary(page, 'wrong');
    expect(s.answered).toBe(answered);
    if (done) await expect(page.locator('#view')).toContainText('Τα καθάρισες όλα ✓');
  },

  async signs(page) {
    const meta = (await (await page.request.get('/data/questions.json')).json());
    const withImage = meta.questions.filter((q) => q.image).length;
    const card = page.locator('.mode[data-mode="signs"]');
    await clickMode(page, 'signs');
    if (withImage === 0) {
      await expect(card).toHaveClass(/disabled/);
      await expect(card.locator('.n')).toHaveText('0 ερωτήσεις');
      await expect(page.locator('.toast')).toHaveText('Το βιβλίο δεν έχει ερωτήσεις με εικόνα.');
      await expect(page).toHaveURL(/#\/$/);
    } else {
      await expect(page).toHaveURL(/#\/session$/);
      await expect(page.locator('img.qimg')).toBeVisible();
      const r = await drive(page, { max: Math.min(3, withImage) });
      const s = await expectSummary(page, 'signs');
      expect(s.answered).toBe(r.answered);
    }
  },

  async recall(page) {
    await gotoHash(page, '#/setup/recall');
    await page.locator('input[type="number"]').fill('1'); // random policy → count input
    await page.getByRole('button', { name: 'Ξεκίνα' }).click();
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText('Από μνήμης · 1/1');
    await expect(page.locator('button.opt')).toHaveCount(0); // options hidden until reveal
    await page.getByRole('button', { name: 'Δείξε την απάντηση' }).click();
    await expect(page.locator('.feedback .verdict')).toContainText('Σωστή απάντηση:');
    await expect(page.locator('.feedback .opt.correct')).toHaveCount(1);
    await page.getByRole('button', { name: 'Το ήξερα', exact: true }).click();
    await expect(page.locator('.feedback .verdict')).toContainText('Σωστό ✓');
    expect(await clickNext(page)).toBe(true);
    const s = await expectSummary(page, 'recall');
    expect(s).toEqual({ correct: 1, answered: 1 });
  },

  async hardexam(page) {
    const { byId } = await fetchQuestions(page);
    await clickMode(page, 'hardexam');
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText('Σκληρή προσομοίωση · ερώτηση 1/10');
    await expect(page.locator('#clock')).toHaveText(/^[45]:\d\d$/); // 5-minute session timer visible
    await expect(page.locator('.timerbar')).not.toHaveClass(/hidden/);
    // Run 1: the very first answer is wrong → zero tolerance → ΚΟΠΗΚΕΣ, but only at the end (no feedback in between).
    for (let i = 0; i < 10; i++) {
      await expect(page.locator('.session-top')).toContainText(`${i + 1}/10`);
      await answerKnown(page, byId, i !== 0, { feedback: false });
      await expect(page.locator('.feedback')).toHaveCount(0);
    }
    let s = await expectSummary(page, 'hardexam');
    expect(s).toEqual({ correct: 9, answered: 10 });
    await expect(page.locator('.verdict-big')).toHaveText('ΚΟΠΗΚΕΣ');
    await expect(page.locator('#view')).toContainText('1 λάθος');
    // Run 2: all ten right → ΠΕΡΑΣΕΣ.
    await page.getByRole('button', { name: 'Ξανά' }).click();
    await expect(page).toHaveURL(/#\/session$/);
    for (let i = 0; i < 10; i++) {
      await expect(page.locator('.session-top')).toContainText(`${i + 1}/10`);
      await answerKnown(page, byId, true, { feedback: false });
      await expect(page.locator('.feedback')).toHaveCount(0);
    }
    s = await expectSummary(page, 'hardexam');
    expect(s).toEqual({ correct: 10, answered: 10 });
    await expect(page.locator('.verdict-big')).toHaveText('ΠΕΡΑΣΕΣ');
    // Both runs are hard simulators on the readiness card (1 perfect out of 3 needed).
    await gotoHome(page);
    await expect(page.locator('.readiness li', { hasText: 'Σκληρές προσομοιώσεις' })).toContainText('(τώρα: 1)');
  },

  async hardest(page) {
    // Fresh profile: nothing is known yet → the card is disabled and explains why.
    const card = await clickMode(page, 'hardest');
    await expect(card).toHaveClass(/disabled/);
    await expect(card.locator('.n')).toHaveText('0 ερωτήσεις');
    await expect(page.locator('.toast')).toHaveText('Απάντησε πρώτα μερικές ερωτήσεις για να φανεί ποιες σε δυσκολεύουν.');
    await expect(page).not.toHaveURL(/#\/session$/);
    // A few practice answers including at least one wrong → the mode has material.
    await makeOneWrongAnswer(page);
    await gotoHome(page);
    await expect(card).not.toHaveClass(/disabled/);
    await expect(card.locator('.n')).toHaveText(/^[1-9]\d* ερωτήσεις$/);
    await card.click();
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText(/Οι πιο δύσκολες · 1\/[1-9]\d*/);
    let answered = 0, done = false;
    for (let i = 0; i < 3 && !done; i++) { await answerOne(page); answered++; done = await clickNext(page); }
    if (!done) await endSession(page);
    const s = await expectSummary(page, 'hardest');
    expect(s.answered).toBe(answered);
  },

  async numbers(page) {
    const card = await clickMode(page, 'numbers');
    await expect(card).not.toHaveClass(/disabled/);
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText(/Αριθμοί & όρια · 1\/[1-9]\d*/);
    await page.locator('button.opt').first().waitFor();
    const text = await page.locator('.qtext').innerText();
    const opts = await page.locator('button.opt').allInnerTexts();
    expect([text, ...opts].some((t) => NUM_RE.test(t))).toBe(true);
    const r = await drive(page, { max: 3 });
    expect(r.answered).toBe(3);
    const s = await expectSummary(page, 'numbers');
    expect(s.answered).toBe(3);
  },

  async marathon(page) {
    const { byId, meta } = await fetchQuestions(page);
    await clickMode(page, 'marathon');
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText(`Μαραθώνιος · 1/${meta.booklet}`);
    // A wrong answer is re-queued: the total grows by one and the session goes on.
    expect(await answerKnown(page, byId, false)).toMatch(/^Λάθος/);
    expect(await clickNext(page)).toBe(false);
    await expect(page.locator('.session-top')).toContainText(`2/${meta.booklet + 1}`);
    expect(await answerKnown(page, byId, true)).toMatch(/^Σωστό/);
    expect(await clickNext(page)).toBe(false);
    expect(await answerKnown(page, byId, true)).toMatch(/^Σωστό/);
    expect(await clickNext(page)).toBe(false);
    await expect(page).toHaveURL(/#\/session$/);
    await expect(page.locator('.session-top')).toContainText(`4/${meta.booklet + 1}`);
    await endSession(page);
    const s = await expectSummary(page, 'marathon');
    expect(s).toEqual({ correct: 2, answered: 3 });
    await expect(page.locator('#view')).toContainText('Σταμάτησες το τεστ πριν τελειώσει.');
    await expect(page.locator('#view')).not.toContainText('Τα καθάρισες όλα');
  },
};

test.describe('modes', () => {
  test('every MODE_LIST id has a driver', () => {
    const ids = MODE_LIST.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.keys(drivers).sort());
  });

  test('home shows one card per mode, grouped in the four sections, with the 5-gate readiness list', async ({ page }) => {
    await gotoHome(page);
    for (const m of MODE_LIST) {
      const card = page.locator(`.mode[data-mode="${m.id}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator('.t')).toHaveText(m.title);
    }
    await expect(page.locator('.mode')).toHaveCount(MODE_LIST.length);
    expect(SECTIONS.map((s) => s.title)).toEqual(['Εξετάσεις', 'Επανάληψη', 'Εξάσκηση', 'Σκληρά τεστ']);
    await expect(page.locator('.modes')).toHaveCount(SECTIONS.length);
    for (const [i, sec] of SECTIONS.entries()) {
      await expect(page.locator('#view h2', { hasText: new RegExp(`^${sec.title}$`) })).toHaveCount(1); // exact: «Τεστ εξάσκησης» also contains «εξάσκηση»
      const grid = page.locator('.modes').nth(i);
      await expect(grid.locator('.mode')).toHaveCount(sec.modes.length);
      for (const m of sec.modes) await expect(grid.locator(`.mode[data-mode="${m.id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('.readiness li')).toHaveCount(5);
    await expect(page.locator('.readiness li').nth(4)).toContainText('τέλειες «Σκληρές προσομοιώσεις» (τώρα: 0)');
    await expect(page.locator('.ptest')).toHaveCount(7);
  });

  for (const m of MODE_LIST) {
    test(`mode ${m.id} (${m.title})`, async ({ page }) => {
      acceptDialogs(page);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await drivers[m.id](page);
      expect(errors).toEqual([]);
    });
  }
});
