// Bright Star Catalogue decoding and star colours. Pure functions (no Three.js, no DOM)
// so they can be unit-tested. The file format is documented in scripts/build-stars.mjs.

const HEADER = 16;

/**
 * Decode stars.bin into typed arrays (brightest star first).
 * ra/dec: J2000 degrees; vmag: V magnitude; bv: B−V colour index;
 * pmra (RA·cos Dec) / pmdec: proper motion in milliarcseconds per year.
 */
export function decodeStars(buffer) {
  const view = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'BSC5') throw new Error('stars.bin: bad header');
  const version = view.getUint32(4, true);
  if (version !== 1) throw new Error(`stars.bin: unsupported version ${version}`);
  const count = view.getUint32(8, true);
  const rec = view.getUint32(12, true);
  if (view.byteLength < HEADER + count * rec) throw new Error('stars.bin: truncated');

  const ra = new Float64Array(count), dec = new Float64Array(count);
  const vmag = new Float32Array(count), bv = new Float32Array(count);
  const pmra = new Float32Array(count), pmdec = new Float32Array(count);
  for (let i = 0, o = HEADER; i < count; i++, o += rec) {
    ra[i] = view.getUint32(o, true) * 1e-7;
    dec[i] = view.getInt32(o + 4, true) * 1e-7;
    vmag[i] = view.getInt16(o + 8, true) / 100;
    bv[i] = view.getInt16(o + 10, true) / 1000;
    pmra[i] = view.getInt16(o + 12, true);
    pmdec[i] = view.getInt16(o + 14, true);
  }
  return { count, ra, dec, vmag, bv, pmra, pmdec };
}

/** Effective temperature (K) from B−V (Ballesteros 2012, black-body fit). */
export function bvToTemperature(bv) {
  const b = Math.min(2.0, Math.max(-0.4, bv));
  return 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
}

/**
 * Linear-sRGB colour of a black body at temperature T (K), brightest channel = 1.
 * Planckian locus chromaticity after Kim et al. (2002), valid 1667–25000 K.
 */
export function temperatureToRGB(T) {
  const t = Math.min(25000, Math.max(1667, T));
  const x = t <= 4000
    ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
    : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  const y = t <= 2222
    ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
    : t <= 4000
      ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
      : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  const X = x / y, Y = 1, Z = (1 - x - y) / y;
  const r = Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const g = Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const b = Math.max(0, 0.0557 * X - 0.204 * Y + 1.057 * Z);
  const m = Math.max(r, g, b);
  return [r / m, g / m, b / m];
}

/** Star colour from B−V, softened towards white (the eye sees star colours as pale). */
export function bvToRGB(bv, saturation = 0.8) {
  const c = temperatureToRGB(bvToTemperature(bv));
  return c.map((v) => 1 - saturation + saturation * v);
}
