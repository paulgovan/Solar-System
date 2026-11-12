import { test, expect } from '@playwright/test';

// Fail any test that logs console errors or throws uncaught exceptions.
let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

async function waitForApp(page) {
  await expect(page.locator('#loader')).toHaveClass(/hidden/, { timeout: 30_000 });
}

test('renders the scene with planets and labels', async ({ page }) => {
  await page.goto('./');
  await waitForApp(page);
  await expect(page.locator('.label', { hasText: 'Jupiter' })).toBeVisible();
  expect(await page.locator('#body-list button').count()).toBeGreaterThanOrEqual(11);

  // Canvas is not blank: decode a screenshot and look for the bright Sun near the centre
  const png = (await page.screenshot()).toString('base64');
  const lit = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(img.width / 2 - 40, img.height / 2 - 40, 80, 80).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i] + d[i + 1] + d[i + 2]);
    return max;
  }, png);
  expect(lit).toBeGreaterThan(300);
});

test('selecting a body opens the info panel and updates the URL', async ({ page }) => {
  await page.goto('./');
  await waitForApp(page);
  await page.locator('#body-list button', { hasText: 'Saturn' }).click();
  await expect(page.locator('#info')).toHaveClass(/open/);
  await expect(page.locator('#info-name')).toHaveText('Saturn');
  await expect(page.locator('#info-live')).toContainText('AU');
  await expect(page).toHaveURL(/body=saturn/, { timeout: 5_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#info')).not.toHaveClass(/open/);
});

test('URL hash restores date, body, scale and pause state', async ({ page }) => {
  await page.goto('./#t=1969-07-20T20:17Z&body=moon&scale=true&paused=1');
  await waitForApp(page);
  await expect(page.locator('#date-main')).toHaveText('Jul 20, 1969');
  await expect(page.locator('#info-name')).toHaveText('Moon');
  await expect(page.locator('[data-scale="0"]')).toHaveClass(/active/);
  await expect(page.locator('.timebar')).toHaveClass(/paused/);
});

test('toggles hide and show bodies', async ({ page }) => {
  await page.goto('./');
  await waitForApp(page);
  const pluto = page.locator('[data-toggle="pluto"]');
  await expect(pluto).toHaveClass(/active/);
  await pluto.click();
  await expect(pluto).not.toHaveClass(/active/);
  await expect(page.locator('#body-list button', { hasText: 'Pluto' })).toHaveClass(/hidden-body/);
});
