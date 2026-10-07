import { test, expect } from '@playwright/test';
import { acceptDialogs, saveToken, syncNow, startPracticeSequential, drive, readSeenStat, makeFakeGithub, gotoHash, gotoHome } from './helpers.js';

test('paired devices share the study plan, pull on reconnection, and preserve preferences through reset', async ({ browser }) => {
  const gh = makeFakeGithub();
  const ctxA = await browser.newContext({ serviceWorkers: 'block' });
  const ctxB = await browser.newContext({ serviceWorkers: 'block' });
  await ctxA.route('https://api.github.com/**', gh.handler);
  await ctxB.route('https://api.github.com/**', gh.handler);
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  acceptDialogs(A); acceptDialogs(B);
  const examDate = (page) => page.getByLabel('Ημερομηνία εξετάσεων', { exact: true });
  const archive = (page) => page.getByRole('checkbox', { name: 'Ερωτήσεις εκτός ύλης' });
  try {
    await gotoHash(A, '#/settings');
    await examDate(A).fill('2030-06-01');
    await A.getByLabel('Ώρα εξετάσεων', { exact: true }).fill('13:30');
    await A.getByRole('checkbox', { name: 'Προσωρινή ημερομηνία' }).check();
    await archive(A).check();
    await A.getByRole('combobox').selectOption('light');
    await saveToken(A, 'ghp_TESTONLY');
    await saveToken(B, 'ghp_TESTONLY');
    await expect(examDate(B)).toHaveValue('2030-06-01');
    await expect(B.getByLabel('Ώρα εξετάσεων', { exact: true })).toHaveValue('13:30');
    await expect(archive(B)).toBeChecked();
    await expect(B.getByRole('checkbox', { name: 'Προσωρινή ημερομηνία' })).toBeChecked();
    await expect(B.getByRole('combobox')).toHaveValue('dark');
    await gotoHome(A);
    await examDate(B).fill('2030-06-03');
    await syncNow(B);
    // An idle device must pull even when it has no unsaved answers.
    await A.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(examDate(A)).toHaveValue('2030-06-03');

    // Independent offline study choices merge per field, rather than overwriting a whole settings object.
    await gotoHash(A, '#/settings');
    await ctxA.setOffline(true);
    await archive(A).uncheck();
    await B.getByRole('checkbox', { name: 'Δύσκολο τεστ (παντού)' }).check();
    await syncNow(B);
    await ctxA.setOffline(false);
    await syncNow(A); await syncNow(B);
    await expect(archive(B)).not.toBeChecked();
    await expect(A.getByRole('checkbox', { name: 'Δύσκολο τεστ (παντού)' })).toBeChecked();
    await expect(A.getByRole('combobox')).toHaveValue('light');

    await startPracticeSequential(A);
    await drive(A, { max: 2, finishEarly: true });
    await syncNow(A); await syncNow(B);
    expect(await readSeenStat(B)).toBe('2/140');
    await gotoHash(A, '#/settings');
    await A.getByRole('button', { name: 'Διαγραφή προόδου', exact: true }).click();
    await syncNow(A); await syncNow(B);
    expect(await readSeenStat(B)).toBe('0/140');
    await gotoHome(B);
    await expect(examDate(B)).toHaveValue('2030-06-03');
    await expect(B.getByRole('checkbox', { name: 'Προσωρινή ημερομηνία' })).toBeChecked();
    expect(gh.created).toBe(1);
    const cloud = [...gh.gists.values()][0].files['moto-master-settings.json'].content;
    expect(cloud).not.toMatch(/token|deviceId|theme|gistId/);
    expect(JSON.parse(cloud).settings.examDate.value).toBe('2030-06-03');
    expect(JSON.parse(cloud).settings.examTime.value).toBe('13:30');
  } finally { await ctxA.close(); await ctxB.close(); }
});
