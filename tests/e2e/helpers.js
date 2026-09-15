// Shared driving helpers for the Moto Master e2e suite.
import { expect } from '@playwright/test';

export const GIST_FILE = 'moto-master-progress.json';

export function acceptDialogs(page) {
  page.on('dialog', (d) => d.accept());
}

export async function gotoHome(page) {
  await page.goto('/#/');
  await page.locator('.modes').waitFor();
}

export async function gotoHash(page, hash) {
  await page.goto('/' + hash);
}

// Opens the home screen and clicks a mode card. Returns the card locator.
export async function clickMode(page, id) {
  await gotoHome(page);
  const card = page.locator(`.mode[data-mode="${id}"]`);
  await card.waitFor();
  await card.click();
  return card;
}

export async function pickConfidence(page) { return; // confidence prompt removed (D-028)
  /*
  const sure = page.locator('[data-conf="sure"]');
  if (await sure.count()) await sure.first().click();
  */
}

// Answers the current question by clicking the first option (assertions are about flow, not
// correctness). With immediate feedback it returns the verdict text.
export async function answerOne(page, { feedback = true } = {}) {
  await page.locator('button.opt').first().waitFor();
  await pickConfidence(page);
  await page.locator('button.opt').first().click();
  if (!feedback) return null;
  const fb = page.locator('.feedback');
  await fb.waitFor();
  return (await fb.locator('.verdict').innerText()).trim();
}

// Clicks the next button. Returns true when the session ended (summary reached).
export async function clickNext(page) {
  const nb = page.locator('#next-btn');
  const label = (await nb.innerText()).trim();
  await nb.click();
  if (label.includes('Αποτελέσματα')) { await page.waitForURL(/#\/summary$/); return true; }
  return false;
}

// Presses the session's end button (confirm dialog auto-accepted) and waits for the summary.
export async function endSession(page) {
  await page.getByRole('button', { name: 'Τέλος', exact: true }).click();
  await page.waitForURL(/#\/summary$/);
  await page.locator('#view h1').waitFor();
}

// Answers up to `max` questions with immediate feedback; ends early when asked.
// Returns { answered, ended: 'done' | 'abort' | 'open' }.
export async function drive(page, { max = 3, finishEarly = true } = {}) {
  let answered = 0;
  while (answered < max) {
    await answerOne(page);
    answered++;
    if (await clickNext(page)) return { answered, ended: 'done' };
  }
  if (finishEarly) { await endSession(page); return { answered, ended: 'abort' }; }
  return { answered, ended: 'open' };
}

// Practice by ID range; answers until a wrong verdict is produced (so the wrong bin / weak pool
// are non-empty), then ends the session. Returns the number answered.
export async function makeOneWrongAnswer(page, { from = 1, to = 60 } = {}) {
  await startPracticeRange(page, from, to);
  for (let i = 0; i < 40; i++) {
    const verdict = await answerOne(page);
    if (verdict.startsWith('Λάθος')) { await endSession(page); return i + 1; }
    if (await clickNext(page)) throw new Error('practice queue exhausted before a wrong answer was produced');
  }
  throw new Error('no wrong answer produced in 40 attempts');
}

export async function startPracticeSequential(page) {
  await gotoHash(page, '#/setup/practice');
  await page.getByRole('button', { name: 'Με τη σειρά' }).click();
  await page.getByRole('button', { name: 'Ξεκίνα' }).click();
  await page.locator('button.opt').first().waitFor();
}

export async function startPracticeRange(page, from, to) {
  await gotoHash(page, '#/setup/practice');
  await page.getByRole('button', { name: 'Εύρος ID' }).click();
  const nums = page.locator('input[type="number"]');
  await expect(nums).toHaveCount(2);
  await nums.nth(0).fill(String(from));
  await nums.nth(1).fill(String(to));
  await page.getByRole('button', { name: 'Ξεκίνα' }).click();
  await page.locator('button.opt').first().waitFor();
}

// Reads the "ερωτήσεις που είδες" stat value (e.g. "3/140") from #/stats.
export async function readSeenStat(page) {
  await gotoHash(page, '#/stats');
  const stat = page.locator('.stat', { has: page.locator('.l', { hasText: 'ερωτήσεις που είδες' }) });
  await stat.waitFor();
  return (await stat.locator('.v').innerText()).trim();
}

export async function summaryScore(page) {
  const stat = page.locator('.stat', { has: page.locator('.l', { hasText: 'σωστές' }) }).first();
  await stat.waitFor();
  const v = (await stat.locator('.v').innerText()).trim();
  const m = v.match(/^(\d+)\/(\d+)$/);
  if (!m) throw new Error('unexpected summary score ' + v);
  return { correct: Number(m[1]), answered: Number(m[2]) };
}

// ---- settings ----
export async function saveToken(page, token) {
  await gotoHash(page, '#/settings');
  const input = page.locator('input[type="password"]');
  await input.fill(token);
  await page.getByRole('button', { name: 'Αποθήκευση & συγχρονισμός' }).click();
  await expect(page.locator('#sync-pill')).toHaveText(/^Συγχρονίστηκε/);
}

export async function syncNow(page) {
  await gotoHash(page, '#/settings');
  const btn = page.getByRole('button', { name: 'Συγχρονισμός τώρα' });
  await expect(btn).toBeEnabled();
  const before = await page.locator('.toast', { hasText: 'Συγχρονίστηκε:' }).count();
  await btn.click();
  await expect(page.locator('#sync-pill')).toHaveText(/^Συγχρονίστηκε/);
  await expect.poll(() => page.locator('.toast', { hasText: 'Συγχρονίστηκε:' }).count(), { timeout: 10_000 }).toBeGreaterThan(before);
}

// Triggers the JSON export and saves the download to `savePath` (navigator.share is absent in
// headless chromium, so the anchor-download path runs).
export async function exportJson(page, savePath) {
  await gotoHash(page, '#/settings');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Αντίγραφο ασφαλείας' }).click(),
  ]);
  await dl.saveAs(savePath);
  return savePath;
}

// ---- fake GitHub Gist API shared by several contexts ----
export function makeFakeGithub() {
  const gists = new Map();
  const requests = [];
  let created = 0;
  const shape = (g) => ({
    id: g.id, description: g.description, public: g.public, html_url: `https://gist.github.com/${g.id}`,
    files: Object.fromEntries(Object.entries(g.files).map(([name, f]) => [name, {
      filename: name, type: 'application/json', language: 'JSON', size: f.content.length, truncated: false,
      content: f.content, raw_url: `https://gist.githubusercontent.com/raw/${g.id}/${name}`,
    }])),
  });
  const handler = async (route, request) => {
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postData() || '';
    const headers = request.headers();
    requests.push({ url: request.url(), method, body, headers });
    const json = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    const auth = headers['authorization'] || '';
    if (!/^Bearer \S+$/.test(auth)) return json(401, { message: 'Bad credentials' });
    if (url.pathname === '/gists' && method === 'GET') {
      return json(200, [...gists.values()].map(shape));
    }
    if (url.pathname === '/gists' && method === 'POST') {
      const b = JSON.parse(body);
      created++;
      const id = `fake${created}0123456789abcdef`;
      const g = { id, description: b.description || '', public: !!b.public, files: {} };
      for (const [name, f] of Object.entries(b.files || {})) g.files[name] = { content: String(f.content) };
      gists.set(id, g);
      return json(201, shape(g));
    }
    const m = url.pathname.match(/^\/gists\/([^/]+)$/);
    if (m) {
      const g = gists.get(m[1]);
      if (!g) return json(404, { message: 'Not Found' });
      if (method === 'GET') return json(200, shape(g));
      if (method === 'PATCH') {
        const b = JSON.parse(body);
        for (const [name, f] of Object.entries(b.files || {})) {
          if (f === null) delete g.files[name]; else g.files[name] = { content: String(f.content) };
        }
        return json(200, shape(g));
      }
      if (method === 'DELETE') { gists.delete(m[1]); return route.fulfill({ status: 204, body: '' }); }
    }
    return json(404, { message: 'Not Found' });
  };
  return { handler, gists, requests, get created() { return created; } };
}
