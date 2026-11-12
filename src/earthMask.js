// Real coastlines for Earth: Natural Earth 1:50m land polygons (public domain,
// via the world-atlas package), rasterized into an equirectangular mask
// (channels documented in src/earthMaskRaster.js).
//
// The mask is built in a Web Worker with OffscreenCanvas so it never blocks startup;
// browsers without OffscreenCanvas 2D fall back to the main thread, in idle time.

import * as THREE from 'three';
import landUrl from 'world-atlas/land-50m.json?url';

// `image` is an ImageBitmap (worker) or RGBA bytes (main-thread fallback); either way
// row 0 is the south edge, so no flip on upload.
function toTexture(image, width) {
  const tex = image instanceof Uint8Array
    ? new THREE.DataTexture(image, width, width / 2, THREE.RGBAFormat)
    : new THREE.Texture(image);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function inWorker(url, width) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./earthMask.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.bitmap);
    };
    worker.onerror = (e) => { worker.terminate(); e.preventDefault?.(); reject(e.error || new Error('mask worker failed')); };
    worker.postMessage({ url, width });
  });
}

async function onMainThread(url, width) {
  const [{ buildLandMask }, topo] = await Promise.all([
    import('./earthMaskRaster.js'),
    fetch(url).then((r) => r.json()),
  ]);
  await new Promise((r) => (globalThis.requestIdleCallback ? requestIdleCallback(r, { timeout: 1000 }) : setTimeout(r, 50)));
  return buildLandMask(topo, width, (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }));
}

const offscreen2d = () => {
  try { return typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('2d'); } catch { return false; }
};

/**
 * Start building the mask. Resolves to a texture, or null if the coastline data could
 * not be loaded (Earth then stays procedural).
 */
export async function loadEarthMask(width = 2048) {
  const url = new URL(landUrl, location.href).href;
  try {
    let image;
    if (typeof Worker !== 'undefined' && offscreen2d()) {
      image = await inWorker(url, width).catch((err) => {
        console.warn('Land-mask worker failed; building on the main thread.', err);
        return onMainThread(url, width);
      });
    } else {
      image = await onMainThread(url, width);
    }
    return toTexture(image, width);
  } catch (err) {
    console.warn('Could not load coastline data; using procedural Earth.', err);
    return null;
  }
}
