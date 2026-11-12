// Builds Earth's land mask off the main thread (OffscreenCanvas) and returns it as an
// ImageBitmap. See src/earthMask.js.

import { buildLandMask } from './earthMaskRaster.js';

self.onmessage = async ({ data: { url, width } }) => {
  try {
    const topo = await (await fetch(url)).json();
    const pixels = buildLandMask(topo, width, (w, h) => new OffscreenCanvas(w, h));
    // A canvas-backed ImageBitmap uploads to WebGL without stalling the main thread
    // (a 4096-wide typed array takes ~100 ms to upload).
    const out = new OffscreenCanvas(width, width / 2);
    out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), width, width / 2), 0, 0);
    const bitmap = out.transferToImageBitmap();
    self.postMessage({ bitmap }, [bitmap]);
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
