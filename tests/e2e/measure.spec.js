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

test('measure tool: pick two bodies, read the real distance, Escape clears', async ({ page }) => {
  await page.goto('./?quality=low#t=2025-01-16T02:38Z&paused=1');
  await waitForFullyLoaded(page);

  await page.keyboard.press('x');
  const panel = page.locator('#measure');
  await expect(panel).toBeVisible();
  await expect(page.locator('#measure-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.ms-main')).toHaveText('Pick two bodies');

  // first body by clicking its label (this must not fly the camera / open the info panel)
  await page.locator('.label', { hasText: 'Jupiter' }).click();
  await expect(panel.locator('#measure-a')).toHaveValue('jupiter');
  await expect(page.locator('#info')).not.toHaveClass(/open/);
  // second body from the list
  await panel.locator('#measure-b').selectOption('earth');
  await expect(panel.locator('.ms-main')).toContainText(/^[\d.]+ AU$/);
  const au = parseFloat(await panel.locator('.ms-main').textContent());
  expect(au).toBeGreaterThan(4.2); // Jupiter was ~4.3 AU from Earth in Jan 2025
  expect(au).toBeLessThan(6.5);
  await expect(panel.locator('.ms-sub')).toContainText('million km');
  await expect(panel.locator('.ms-sub')).toContainText('light time');
  await expect(page.locator('.measure-label')).toContainText('Jupiter ↔ Earth');

  await page.keyboard.press('Escape');
  await expect(panel.locator('.ms-main')).toHaveText('Pick two bodies');
  await expect(panel).toBeVisible(); // tool stays on after clearing
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('measure distance updates as time runs', async ({ page }) => {
  await page.goto('./?quality=low#t=2025-01-16T02:38Z&paused=1');
  await waitForFullyLoaded(page);
  await page.locator('#measure-btn').click();
  await page.locator('#measure-a').selectOption('earth');
  await page.locator('#measure-b').selectOption('moon');
  const before = await page.locator('.ms-main').textContent();
  expect(before).toMatch(/AU/);
  await page.locator('#t-date').fill('2025-01-23');
  await page.locator('#t-date').dispatchEvent('change');
  await expect(page.locator('.ms-sub')).not.toHaveText(/^$/);
  await expect.poll(async () => page.locator('.ms-main').textContent()).not.toBe(before);
});
