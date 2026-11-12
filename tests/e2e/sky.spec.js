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

// Under software GL the full-resolution texture bakes can starve frames for seconds: wait for them.
async function waitForFullyLoaded(page) {
  await expect(page.locator('#loader')).toHaveClass(/hidden/, { timeout: 30_000 });
  await page.waitForFunction(() => 'loaded' in document.documentElement.dataset, null, { timeout: 90_000 });
}

const LONDON = '{"name":"London","country":"United Kingdom","lat":51.51,"lon":-0.13,"tz":"Europe/London","kind":"city"}';
const seed = (page, json) => page.addInitScript((s) => { if (!localStorage.getItem('solar-system.observer.v1')) localStorage.setItem('solar-system.observer.v1', s); }, json);

test('choosing a city fills the Tonight table, and the choice persists', async ({ page }) => {
  await seed(page, LONDON);
  await page.goto('./?quality=low#t=2026-12-15T12:00Z&paused=1');
  await waitForFullyLoaded(page);

  await page.locator('#observer-btn').click();
  const panel = page.locator('#observer');
  await expect(panel).toBeVisible();
  await expect(panel.locator('#ob-city')).toHaveValue(/\d+/);
  await expect(panel.locator('#t-sunrise')).toHaveText('08:00'); // London, 15 Dec (JPL Horizons: 08:00)
  await expect(panel.locator('#t-sunset')).toHaveText('15:52');

  await panel.locator('#ob-city').selectOption({ label: 'Tokyo, Japan' });
  await expect(panel.locator('.ob-place')).toContainText('Asia/Tokyo');
  await expect(panel.locator('#t-sunrise')).toHaveText(/^06:4\d$/);
  await expect(panel.locator('#t-sunset')).toHaveText(/^16:[23]\d$/);
  await expect(panel.locator('#ob-table tbody tr')).toHaveCount(8);
  for (const [id, name] of [['moon', 'Moon'], ['jupiter', 'Jupiter']]) {
    const row = panel.locator(`#ob-table tr[data-id="${id}"]`);
    await expect(row).toContainText(name);
    await expect(row.locator('[data-c=mag]')).toHaveText(/^[−+]\d+\.\d$/);
    await expect(row.locator('[data-c=alt]')).toHaveText(/^[−+]\d+°$/);
    await expect(row.locator('[data-c=az]')).toHaveText(/^[NESW]+ \d+°$/);
  }

  // a row focuses the body in the orrery
  await panel.locator('#ob-table tr[data-id="jupiter"]').click();
  await expect(page.locator('#info-name')).toHaveText('Jupiter');

  // the observer persists across reloads
  await page.reload();
  await waitForFullyLoaded(page);
  await page.locator('#observer-btn').click();
  await expect(page.locator('#ob-city option:checked')).toHaveText('Tokyo, Japan');
});

test('manual coordinates set a custom observer', async ({ page }) => {
  await seed(page, LONDON);
  await page.goto('./?quality=low#t=2026-03-20T12:00Z&paused=1');
  await waitForFullyLoaded(page);
  await page.locator('#observer-btn').click();
  await page.locator('#ob-coords-btn').click();
  await page.locator('#ob-lat').fill('-33.9');
  await page.locator('#ob-lon').fill('18.4');
  await page.locator('#ob-coords button[type=submit]').click();
  await expect(page.locator('.ob-place')).toContainText('33.90° S, 18.40° E');
  await expect(page.locator('.ob-place')).toContainText('Africa/Johannesburg'); // nearest listed city: Cape Town
  await expect(page.locator('#ob-city option:checked')).toHaveText('Custom location');
  await expect(page.locator('#t-sunrise')).toHaveText(/^0[5-6]:\d\d$/); // equinox: ~06:25 local
});

test('ground view: canvas renders without errors, drag and wheel move the view, G leaves', async ({ page }) => {
  await seed(page, LONDON);
  await page.goto('./?quality=low#t=2026-12-15T22:30Z&paused=1');
  await waitForFullyLoaded(page);

  await page.locator('#observer-btn').click();
  await page.locator('#ob-ground').click();
  const app = page.locator('#app');
  await expect(app).toHaveClass(/ground-view/);
  const hud = page.locator('#skyview-hud');
  await expect(hud).toBeVisible();
  const read = hud.locator('.sv-read');
  await expect(read).toContainText('London');
  await expect(read).toContainText('Sun −57°');
  const canvas = page.locator('#scene');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box.width).toBeGreaterThan(300);

  const before = await read.textContent();
  expect(before).toMatch(/facing [NESW]+ \d+°/);
  await page.mouse.move(box.x + 640, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 840, box.y + 300, { steps: 6 });
  await page.mouse.up();
  await expect(read).not.toHaveText(before);
  expect(await read.textContent()).toContain('70° field');

  await page.mouse.wheel(0, -500);
  await expect(read).not.toContainText('70° field');
  await page.waitForTimeout(500);

  // the orrery's own controls and picking must stay out of the way
  await expect(page.locator('#body-list')).toBeHidden();

  await page.locator('#observer-btn').click(); // panel still reachable; close it again
  await page.keyboard.press('g');
  await expect(app).not.toHaveClass(/ground-view/);
  await expect(page.locator('#body-list')).toBeVisible();
  await expect(page.locator('#date-main')).toHaveText('Dec 15, 2026');
});

test('ground view deep link opens straight into the sky', async ({ page }) => {
  await seed(page, LONDON);
  await page.goto('./?quality=low#t=2026-06-21T20:00Z&paused=1&sky=1');
  await waitForFullyLoaded(page);
  await expect(page.locator('#app')).toHaveClass(/ground-view/, { timeout: 20_000 });
  await expect(page.locator('#skyview-hud .sv-read')).toContainText('Sun +');
});
