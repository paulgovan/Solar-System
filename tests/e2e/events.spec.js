import { test, expect as baseExpect } from '@playwright/test';

// Software GL renders a frame every second or so and the date readout updates per frame,
// so assertions on the result of a jump get a generous timeout.
const expect = baseExpect.configure({ timeout: 30_000 });

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

test('events drawer: jump to Apollo 11 landing', async ({ page }) => {
  await page.goto('./?quality=low#t=2026-11-12T00:00Z&paused=1');
  await waitForFullyLoaded(page);

  await page.locator('#events-btn').click();
  const drawer = page.locator('#events');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.ev[data-moment]')).not.toHaveCount(0);

  await drawer.locator('.ev-jump[data-moment="apollo11-landing"]').click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('#date-main')).toHaveText('Jul 20, 1969');
  await expect(page.locator('#date-sub')).toContainText('20:17 UTC');
  await expect(page.locator('#info-name')).toHaveText('Moon');
  await expect(page.locator('.timebar')).toHaveClass(/paused/);
  await expect(page).toHaveURL(/t=1969-07-20T20%3A17Z.*body=moon/, { timeout: 5_000 });
});

test('events drawer: a spacecraft flyby turns the Spacecraft toggle on and focuses the craft', async ({ page }) => {
  await page.goto('./?quality=low#t=2026-11-12T00:00Z&paused=1');
  await waitForFullyLoaded(page);
  await page.locator('[data-toggle="spacecraft"]').click(); // off
  await expect(page.locator('[data-toggle="spacecraft"]')).not.toHaveClass(/active/);

  await page.locator('#events-btn').click();
  await page.locator('#events .ev-jump[data-moment="voyager2-neptune"]').click();
  await expect(page.locator('#date-main')).toHaveText('Aug 25, 1989');
  await expect(page.locator('[data-toggle="spacecraft"]')).toHaveClass(/active/);
  await expect(page.locator('#info-name')).toHaveText('Voyager 2');
});

test('events drawer: computed sky events and eclipses jump to the right time', async ({ page }) => {
  await page.goto('./?quality=low#t=2026-11-12T00:00Z&paused=1');
  await waitForFullyLoaded(page);
  await page.locator('#events-btn').click();
  await page.locator('#events .ev-tab[data-tab="sky"]').click();

  await page.locator('#events [data-filter="opposition"]').click();
  const mars = page.locator('#events .ev', { hasText: 'Mars at opposition' });
  await expect(mars).toContainText('Feb 19, 2027');
  await mars.locator('.ev-jump').click();
  await expect(page.locator('#date-main')).toHaveText('Feb 19, 2027');
  await expect(page.locator('#info-name')).toHaveText('Mars');

  // eclipses reuse the eclipse finder's camera: a total solar eclipse focuses Earth
  await page.locator('#events-btn').click();
  await page.locator('#events .ev-tab[data-tab="sky"]').click();
  await page.locator('#events [data-filter="eclipse"]').click();
  const solar = page.locator('#events .ev', { hasText: 'solar eclipse' }).first();
  await expect(solar).toBeVisible();
  await solar.locator('.ev-jump').click();
  await expect(page.locator('#info-name')).toHaveText('Earth');
});

test('events drawer opens with V, closes with Escape, and the eclipse panel replaces it', async ({ page }) => {
  await page.goto('./?quality=low#paused=1');
  await expect(page.locator('#loader')).toHaveClass(/hidden/, { timeout: 30_000 });
  await page.keyboard.press('v');
  await expect(page.locator('#events')).toBeVisible();
  await page.locator('#eclipses-btn').click();
  await expect(page.locator('#eclipses')).toBeVisible();
  await expect(page.locator('#events')).toBeHidden();
  await page.keyboard.press('v');
  await expect(page.locator('#events')).toBeVisible();
  await expect(page.locator('#eclipses')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#events')).toBeHidden();
});
