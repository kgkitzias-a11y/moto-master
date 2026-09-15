// Installability surface: manifest, icons, service-worker registration, meta tags, footer.
import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('manifest is served with the required fields and its icons resolve', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const m = await res.json();
  expect(m.name).toBe('Moto Master');
  expect(m.short_name).toBeTruthy();
  expect(m.start_url).toBe('./');
  expect(m.scope).toBe('./');
  expect(m.display).toBe('standalone');
  expect(m.lang).toBe('el');
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  const sizes = m.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of m.icons) {
    const r = await page.request.get('/' + icon.src.replace(/^\.\//, ''));
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type'], icon.src).toBe('image/png');
    const buf = await r.body();
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); // PNG magic
  }
});

test('index.html carries the PWA/robots meta tags and links the manifest', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  expect(html).toMatch(/<html[^>]*\slang="el"/);
  expect(html).toMatch(/<meta\s+name="robots"\s+content="noindex[^"]*"/);
  expect(html).toMatch(/<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"/);
  expect(html).toMatch(/<meta\s+name="mobile-web-app-capable"\s+content="yes"/);
  expect(html).toMatch(/<meta\s+name="theme-color"\s+content="#[0-9a-fA-F]{6}"/);
  expect(html).toMatch(/<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest"/);
  expect(html).toMatch(/<link\s+rel="apple-touch-icon"[^>]*href="\.\/icons\/apple-touch-icon-180\.png"/);
  const touch = await page.request.get('/icons/apple-touch-icon-180.png');
  expect(touch.status()).toBe(200);
});

test('service worker registers and the footer shows the version', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('.modes').first().waitFor();
  await expect(page.locator('#version-stamp')).toHaveText(/^Moto Master v\d+\.\d+\.\d+$/);
  await expect(page.locator('footer')).toContainText('Moto Master v');

  const swRes = await page.request.get('/sw.js');
  expect(swRes.status()).toBe(200);
  expect(swRes.headers()['content-type']).toContain('javascript');

  // ready resolves with an active registration scoped to the app root. Retry across the
  // self-reload the app performs when the SW first claims the page.
  await expect.poll(async () => {
    try {
      return await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return { active: !!reg.active, scope: reg.scope, url: reg.active && reg.active.scriptURL };
      });
    } catch { return null; }
  }, { timeout: 30_000 }).toMatchObject({ active: true, scope: 'http://127.0.0.1:8123/', url: 'http://127.0.0.1:8123/sw.js' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false), { timeout: 30_000 }).toBe(true);
  await page.locator('.modes').first().waitFor();
  await expect(page.locator('#version-stamp')).toHaveText(/^Moto Master v/);
});
