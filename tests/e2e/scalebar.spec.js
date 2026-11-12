import { test, expect as baseExpect } from '@playwright/test';

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

test('compressed scale shows a "not to scale" note; true scale shows a distance bar', async ({ page }) => {
  await page.goto('./?quality=low#t=2026-01-01T00:00Z&paused=1');
  await waitForFullyLoaded(page);
  await expect(page.locator('.sb-note')).toBeVisible();
  await expect(page.locator('.sb-note')).toHaveText('Distances and sizes are not to scale');
  await expect(page.locator('.sb-bar')).toBeHidden();

  await page.locator('[data-scale="0"]').click();
  await expect(page.locator('.sb-bar')).toBeVisible();
  await expect(page.locator('.sb-note')).toBeHidden();
  // overview of the whole system: a bar of some AU
  await expect(page.locator('.sb-label')).toHaveText(/\bAU$|light-/);
  const w = await page.locator('.sb-line').evaluate((e) => e.getBoundingClientRect().width);
  expect(w).toBeGreaterThan(50);
  expect(w).toBeLessThanOrEqual(150);

  await page.locator('[data-scale="1"]').click();
  await expect(page.locator('.sb-note')).toBeVisible();
});

test('true-scale bar follows the zoom: kilometres at Earth, AU in the overview', async ({ page }) => {
  await page.goto('./?quality=low#t=2026-01-01T00:00Z&body=earth&scale=true&paused=1');
  await waitForFullyLoaded(page);
  await expect(page.locator('.sb-bar')).toBeVisible();
  await expect(page.locator('.sb-label')).toHaveText(/ km$/);
  await page.locator('#body-list button', { hasText: 'Neptune' }).click();
  await expect(page.locator('.sb-label')).toHaveText(/ km$/); // Neptune is small: still kilometres, but a different bar
  await page.keyboard.press('Escape'); // overview of the Sun
  await expect(page.locator('.sb-label')).toHaveText(/ AU$|light-/);
});
