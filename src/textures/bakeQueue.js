// Progressive texture baking. `bakeProgressive` bakes a small preview right away (so the
// first frame is cheap) and queues the full-resolution bake. After the app's first
// frame, `startBakeQueue(app)` upgrades queued textures one or two per frame in idle
// time: the focused body and its parent / satellites first, then bodies on screen
// (largest first), then the rest. A finished texture replaces the preview wherever the
// body's materials reference it, and the preview is freed.
//
// Option values passed as promises (e.g. Earth's land mask, which is rasterized in a
// worker) are baked as `null` in the preview; the full bake waits until they resolve.
// Upgrades only stay cheap if the shader programs were prepared before frames started
// (`precompileBakes` in src/textures.js); otherwise each one stalls on a GPU sync.
//
// `bakeTexture` from src/textures.js is unchanged and still bakes synchronously, so a
// feature can use either.

import { Vector3 } from 'three';
import { bakeTexture, disposeBakeMaterials } from '../textures.js';

export const PREVIEW_SIZE = 256;
const MAX_JOBS_PER_FRAME = 2;
const SECOND_JOB_BUDGET_MS = 4; // run a second job in the same frame only if the first was this cheap

const jobs = [];
const waiters = [];
let app = null;
let scheduled = false;

/**
 * Same arguments as `bakeTexture`, plus where the upgrade goes:
 *   target: a body (its group's materials are searched for the preview texture), or a
 *           function (fullTexture, previewTexture) => void.
 * Returns the preview texture (or the full one when `width` is already small).
 */
export function bakeProgressive(renderer, kind, width, seed = 0, opts = {}, target = null) {
  const deferred = Object.entries(opts).filter(([, v]) => typeof v?.then === 'function');
  const previewOpts = { ...opts };
  for (const [k] of deferred) previewOpts[k] = null;
  if (width <= PREVIEW_SIZE && !deferred.length) return bakeTexture(renderer, kind, width, seed, opts);

  const preview = bakeTexture(renderer, kind, Math.min(width, PREVIEW_SIZE), seed, previewOpts);
  const job = { renderer, kind, width, seed, opts: { ...opts }, target, preview, ready: !deferred.length, body: target?.group ? target : null };
  if (deferred.length) {
    job.wait = Promise.all(deferred.map(([k, p]) => Promise.resolve(p).then(
      (v) => { job.opts[k] = v; },
      () => { job.opts[k] = null; },
    ))).then(() => { job.ready = true; });
  }
  jobs.push(job);
  if (app) schedule();
  return preview;
}

/** Begin upgrading (call after the first frame). `app` needs camera, state, bodies. */
export function startBakeQueue(appHandle) {
  app = appHandle;
  schedule();
}

/** Resolves once every queued texture has been upgraded. */
export function whenBaked() {
  if (!jobs.length) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}

/** Number of textures still waiting for their full-resolution bake. */
export function pendingBakes() {
  return jobs.length;
}

const requestIdle = globalThis.requestIdleCallback
  ? (cb) => requestIdleCallback(cb, { timeout: 250 })
  : (cb) => setTimeout(() => cb({ timeRemaining: () => 8 }), 0);

function schedule() {
  if (scheduled) return;
  if (!jobs.length) {
    if (waiters.length) disposeBakeMaterials(); // queue drained: free the bake programs
    waiters.splice(0).forEach((r) => r());
    return;
  }
  scheduled = true;
  // One batch per frame: wait for the next frame, then for idle time after it.
  requestAnimationFrame(() => requestIdle(work));
}

function work(deadline) {
  scheduled = false;
  const ready = jobs.filter((j) => j.ready);
  if (!ready.length) {
    // Everything left is waiting on an input (e.g. Earth's land mask)
    Promise.race(jobs.map((j) => j.wait)).then(schedule);
    return;
  }
  ready.sort((a, b) => priority(a) - priority(b));
  for (let n = 0; n < Math.min(MAX_JOBS_PER_FRAME, ready.length); n++) {
    const t0 = performance.now();
    run(ready[n]);
    const spent = performance.now() - t0;
    if (spent > SECOND_JOB_BUDGET_MS || deadline.timeRemaining() < 6) break;
  }
  schedule();
}

function run(job) {
  jobs.splice(jobs.indexOf(job), 1);
  const { renderer, kind, width, seed, opts, target, preview } = job;
  const t0 = performance.now();
  const full = bakeTexture(renderer, kind, width, seed, opts);
  performance.measure(`bake ${kind} ${width}`, { start: t0 });
  if (typeof target === 'function') target(full, preview);
  else if (target?.group) replaceTexture(target.group, preview, full);
  (preview.renderTarget ?? preview).dispose();
}

/** Swap `from` for `to` in every material (uniforms and plain map slots) under `root`. */
export function replaceTexture(root, from, to) {
  root.traverse((obj) => {
    for (const m of [obj.material].flat()) {
      if (!m) continue;
      for (const k of Object.keys(m)) if (m[k] === from) m[k] = to;
      for (const [name, u] of Object.entries(m.uniforms || {})) {
        if (u.value !== from) continue;
        u.value = to;
        // planet materials keep the map's texel size for bump mapping
        if (name === 'map' && m.uniforms.texel?.value?.isVector2) m.uniforms.texel.value.set(1 / to.image.width, 1 / to.image.height);
      }
    }
  });
}

// Lower runs first.
const tmp = new Vector3();
function priority(job) {
  const b = job.body;
  if (!b || !app) return 3;
  const sel = app.state.selected;
  if (b.id === sel) return 0;
  if (b.parent === sel || app.bodies[sel]?.parent === b.id) return 1;
  if (!b.group.visible) return 5;
  const { camera } = app;
  tmp.copy(b.position).project(camera);
  if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) return 4;
  const px = (b.radius / Math.max(1e-9, camera.position.distanceTo(b.position))) * window.innerHeight;
  return 2 + 1 / (1 + px); // on screen: bigger discs first
}
