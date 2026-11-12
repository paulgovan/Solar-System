// Generates PWA icons from public/favicon.svg and public/og.png (1200x630) from the app.
//   npm run build && npx vite preview --port 4173 &   then   node scripts/make-assets.mjs [url]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/';
const svg = readFileSync('public/favicon.svg', 'utf8').replace(/<\/?svg[^>]*>/g, '');
const icon = (size, { pad = 0.1, bg = '#05060a', round = true } = {}) => `<body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${round ? 14 : 0}" fill="${bg}"/>
<g transform="translate(32 32) scale(${1 - pad * 2}) translate(-32 -32)">${svg}</g></svg></body>`;

const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist'] });
const shot = async (html, size, path, omitBackground = false) => {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(html);
  await p.screenshot({ path, omitBackground });
  await p.close();
};
await shot(icon(192), 192, 'public/icons/icon-192.png', true);
await shot(icon(512), 512, 'public/icons/icon-512.png', true);
await shot(icon(512, { pad: 0.2, round: false }), 512, 'public/icons/icon-maskable-512.png'); // safe zone
await shot(icon(180, { round: false, pad: 0.12 }), 180, 'public/icons/apple-touch-icon.png');

const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(`${url}#body=saturn&t=2026-06-21T12:00Z&paused=1`);
await p.waitForFunction(() => 'loaded' in document.documentElement.dataset, null, { timeout: 120_000, polling: 100 });
await p.addStyleTag({ content: '#info, #body-list, .toolbar, .timebar { display: none !important }' });
await p.waitForTimeout(3500); // let the fly-to finish
await p.screenshot({ path: 'public/og.png' });
await browser.close();
