import { test, expect } from '@playwright/test';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
});
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

test('eclipse panel lists eclipses and jumps to one', async ({ page }) => {
  await page.goto('./#t=2026-01-01T00:00Z&paused=1');
  await expect(page.locator('#loader')).toHaveClass(/hidden/, { timeout: 30_000 });

  await page.locator('#eclipses-btn').click();
  const panel = page.locator('#eclipses');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.ecl')).toHaveCount(8);

  const solar = panel.locator('.ecl', { hasText: 'Aug 12, 2026' });
  await expect(solar).toContainText('Total solar');
  await solar.locator('.ecl-jump').click();

  await expect(panel).toBeHidden();
  await expect(page.locator('#date-main')).toHaveText('Aug 12, 2026');
  await expect(page.locator('#info-name')).toHaveText('Earth');
  await expect(page.locator('.timebar')).toHaveClass(/paused/);
  await expect(page.locator('#info-live')).toContainText('Total · 100% of Sun hidden');
  await expect(page).toHaveURL(/t=2026-08-12T17%3A4\dZ.*body=earth/, { timeout: 5_000 });
});

test('a totally eclipsed Moon reports no direct sunlight', async ({ page }) => {
  await page.goto('./#t=2025-03-14T06:59Z&body=moon&paused=1');
  await expect(page.locator('#loader')).toHaveClass(/hidden/, { timeout: 30_000 });
  await expect(page.locator('#info-live')).toContainText('Centre in Earth’s umbra');
  await expect(page.locator('#info-live')).toContainText(/Sun visible from Moon\s*0%/);
});
