import { test, expect as baseExpect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const expect = baseExpect.configure({ timeout: 30_000 }); // software GL is slow

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

async function waitForFullyLoaded(page) {
  await expect(page.locator('#loader')).toHaveClass(/hidden/, { timeout: 30_000 });
  await page.waitForFunction(() => 'loaded' in document.documentElement.dataset, null, { timeout: 90_000 });
}

/** Decode a PNG in the page: size and the brightest pixel in a region. */
async function inspectPng(page, path) {
  const b64 = (await readFile(path)).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const bright = (x, y, w, h) => {
      const d = g.getImageData(x, y, w, h).data;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i] + d[i + 1] + d[i + 2]);
      return max;
    };
    return {
      width: img.width, height: img.height,
      centre: bright(img.width / 2 - 40, img.height / 2 - 40, 80, 80),
      // credit text sits at the bottom right
      creditArea: bright(img.width - Math.round(img.width * 0.3), img.height - Math.round(img.height * 0.06), Math.round(img.width * 0.29), Math.round(img.height * 0.05)),
    };
  }, b64);
}

test('screenshot button saves a PNG named by date and body and copies the link', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./?quality=low#t=2025-01-16T02:38Z&body=mars&paused=1');
  await waitForFullyLoaded(page);

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.locator('#screenshot-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('solar-system_2025-01-16_0238UTC_mars.png');
  const path = await download.path();

  await expect(page.locator('#toast')).toHaveText('Screenshot saved · Link copied');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const u = new URL(link);
  expect(u.pathname).toBe('/');
  const p = new URLSearchParams(u.hash.slice(1));
  expect(p.get('t')).toBe('2025-01-16T02:38Z');
  expect(p.get('body')).toBe('mars');
  expect(p.get('paused')).toBe('1');

  // the image is at device resolution, not blank, and carries the credit line
  const png = await inspectPng(page, path);
  expect(png.width).toBeGreaterThanOrEqual(1280);
  expect(png.height / png.width).toBeCloseTo(800 / 1280, 2);
  expect(png.centre, 'the focused planet is drawn').toBeGreaterThan(100);
  expect(png.creditArea, 'credit text is drawn').toBeGreaterThan(300);
  await ctx.close();
});

test('screenshot works at phone size and with the K key', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./?quality=low#t=2026-01-01T00:00Z&body=earth&paused=1');
  await waitForFullyLoaded(page);
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.keyboard.press('k');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('solar-system_2026-01-01_0000UTC_earth.png');
  const png = await inspectPng(page, await download.path());
  expect(png.width).toBeGreaterThanOrEqual(375);
  expect(png.height / png.width).toBeCloseTo(812 / 375, 2);
  expect(png.centre).toBeGreaterThan(100);
  await expect(page.locator('#toast')).toContainText('Screenshot saved');
  await ctx.close();
});
