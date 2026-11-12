// Load-time measurement for the production build.
//
//   npm run build && npx vite preview --port 4173 --strictPort   (in another shell)
//   node scripts/measure-load.mjs [url] [runs]        (PROFILES=desktop,mobile to pick)
//
// Reports, per profile (desktop / mobile / mobile with 4× CPU throttle / mobile with a
// software GPU), the median of
// `runs` cold and warm loads (no service worker):
//   firstFrame  navigation start → first frame presented (first rAF callback after the
//               app's first render; works on builds with and without app marks)
//   loaded      → `app:loaded` performance mark (all textures at full resolution), or
//               firstFrame for builds without the mark
//   blocking    total main-thread long-task time beyond 50 ms per task, up to `loaded`
//   longest     the longest single main-thread task
// Uses the local Google Chrome with its real GPU (not SwiftShader) so GPU bakes count;
// CPU throttling does not slow the GPU.

import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://localhost:4173/';
const runs = Number(process.argv[3] || 5);

const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  },
  'mobile 4x CPU': { inherit: 'mobile', cpu: 4 },
  // SwiftShader stands in for a weak (phone-class or older integrated) GPU
  'mobile soft GPU': { inherit: 'mobile', gpu: 'swiftshader', runs: 3 },
};
const SOFT_GPU = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const only = process.env.PROFILES?.split(',');

// Runs before any page script: timestamps the first frame and `app:loaded`, each after
// a 1-pixel readPixels so queued GPU work (shader compiles, bakes) is included, and
// collects long tasks.
// waitForFunction must poll on a timer: its default rAF polling would trip the probe.
const probe = () => {
  const pr = window.__probe = { longTasks: [], frames: [], loaded: null };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) pr.longTasks.push([e.startTime, e.duration]);
  }).observe({ type: 'longtask', buffered: true });
  const gpuSync = () => {
    const gl = document.getElementById('scene')?.getContext('webgl2');
    if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return performance.now();
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (pr.frames.length < 1) pr.frames.push(gpuSync());
    cb(t);
  });
  const mark = performance.mark.bind(performance);
  performance.mark = (name, ...rest) => {
    const r = mark(name, ...rest);
    if (name === 'app:loaded') pr.loaded = gpuSync();
    return r;
  };
};

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function load(browser, ctxOpts, cpu) {
  const ctx = await browser.newContext({ ...ctxOpts, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  if (cpu) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  await page.addInitScript(probe);
  await page.goto(url);
  await page.waitForFunction(() => window.__probe.frames.length >= 1, null, { timeout: 120_000, polling: 50 });
  // `app:loaded` exists on instrumented builds; give it time to arrive
  await page.waitForFunction(() => performance.getEntriesByName('app:loaded').length
    || !performance.getEntriesByName('app:first-frame').length, null, { timeout: 120_000, polling: 50 }).catch(() => {});
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const pr = window.__probe;
    // frames[0]: the callback scheduled by the app's first frame ran, after a GPU sync
    const firstFrame = pr.frames[0];
    const loaded = pr.loaded ?? firstFrame;
    const until = Math.max(loaded, firstFrame);
    const tasks = pr.longTasks.filter(([s]) => s <= until);
    return {
      firstFrame, loaded,
      blocking: tasks.reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
      longest: Math.max(0, ...tasks.map(([, d]) => d)),
    };
  });
  await ctx.close();
  return r;
}

// Cold = fresh browser profile (empty HTTP and GPU shader caches), as on a first visit.
// Warm = a second visit in the same browser (shader binaries cached by Chrome).
const results = {};
for (const [name, p0] of Object.entries(profiles)) {
  const p = p0.inherit ? { ...profiles[p0.inherit], ...p0 } : p0;
  if (only && !only.includes(name)) continue;
  const { inherit, cpu, gpu, runs: n = runs, ...ctxOpts } = p;
  const cold = [], warm = [];
  for (let i = 0; i < n; i++) {
    const browser = await chromium.launch({ channel: 'chrome', args: gpu ? SOFT_GPU : ['--ignore-gpu-blocklist'] });
    cold.push(await load(browser, ctxOpts, cpu));
    warm.push(await load(browser, ctxOpts, cpu));
    await browser.close();
  }
  for (const [kind, rows] of [['cold', cold], ['warm', warm]]) {
    results[`${name} (${kind})`] = Object.fromEntries(['firstFrame', 'loaded', 'blocking', 'longest']
      .map((k) => [k, Math.round(median(rows.map((r) => r[k])))]));
  }
}
console.table(results);
