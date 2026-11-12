// Interpolation of sampled trajectories (e.g. spacecraft vectors from JPL Horizons).
//
// A track is a list of knot times (days) and positions (AU). Between knots the
// position is a cubic Hermite curve whose tangents come from the neighbouring knots:
// a Catmull-Rom spline generalised to non-uniform knot spacing (three-point
// derivative), so knots can be dense around flybys and sparse in cruise.

/**
 * @param {ArrayLike<number>} t  knot times (strictly increasing)
 * @param {ArrayLike<number>} p  flat positions [x0, y0, z0, x1, …]
 */
export function createTrack(t, p) {
  const n = t.length;
  const T = Float64Array.from(t);
  const P = Float64Array.from(p);
  if (P.length !== n * 3) throw new Error('track: positions do not match times');
  const M = new Float64Array(n * 3); // tangents, AU per day
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < 3; c++) {
      if (n < 2) { M[k * 3 + c] = 0; continue; }
      if (n === 2) M[k * 3 + c] = (P[3 + c] - P[c]) / (T[1] - T[0]);
      else if (k === 0 || k === n - 1) {
        // end tangent of the parabola through the three end knots
        const [i0, i1, i2] = k === 0 ? [0, 1, 2] : [n - 1, n - 2, n - 3];
        const h0 = T[i1] - T[i0], h1 = T[i2] - T[i1];
        const d0 = (P[i1 * 3 + c] - P[i0 * 3 + c]) / h0, d1 = (P[i2 * 3 + c] - P[i1 * 3 + c]) / h1;
        M[k * 3 + c] = (d0 * (2 * h0 + h1) - d1 * h0) / (h0 + h1);
      } else {
        const h0 = T[k] - T[k - 1], h1 = T[k + 1] - T[k];
        const d0 = (P[k * 3 + c] - P[(k - 1) * 3 + c]) / h0;
        const d1 = (P[(k + 1) * 3 + c] - P[k * 3 + c]) / h1;
        M[k * 3 + c] = (h1 * d0 + h0 * d1) / (h0 + h1);
      }
    }
  }
  return { t: T, p: P, m: M, start: T[0], end: T[n - 1], last: 0 };
}

/** Index k of the segment [t_k, t_{k+1}] containing time (clamped). */
function segment(track, time) {
  const T = track.t;
  const n = T.length;
  let k = track.last;
  if (k < n - 1 && T[k] <= time && time <= T[k + 1]) return k;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (T[mid] <= time) lo = mid; else hi = mid;
  }
  track.last = lo;
  return lo;
}

/** Position at `time` (clamped to the track range), written into `out` {x,y,z}. */
export function trackPosition(track, time, out = { x: 0, y: 0, z: 0 }) {
  const { t: T, p: P, m: M } = track;
  if (T.length === 1) { out.x = P[0]; out.y = P[1]; out.z = P[2]; return out; }
  time = Math.min(track.end, Math.max(track.start, time));
  const k = segment(track, time);
  const h = T[k + 1] - T[k];
  const s = (time - T[k]) / h;
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const a = k * 3, b = a + 3;
  out.x = h00 * P[a] + h10 * h * M[a] + h01 * P[b] + h11 * h * M[b];
  out.y = h00 * P[a + 1] + h10 * h * M[a + 1] + h01 * P[b + 1] + h11 * h * M[b + 1];
  out.z = h00 * P[a + 2] + h10 * h * M[a + 2] + h01 * P[b + 2] + h11 * h * M[b + 2];
  return out;
}

/**
 * Choose a subset of densely sampled points as knots so the spline reproduces every
 * input point within `tol(i)` (AU). Knots are at most `maxStep` days apart.
 * Returns the chosen indices (sorted). Used by scripts/fetch-horizons.mjs.
 */
export function chooseKnots(t, p, { tol, maxStep = Infinity, keep = [] }) {
  const n = t.length;
  const set = new Set([0, n - 1, ...keep]);
  let last = t[0];
  for (let i = 1; i < n; i++) {
    if (t[i] - last >= maxStep - 1e-9) { set.add(i); last = t[i]; }
  }
  const out = { x: 0, y: 0, z: 0 };
  for (let iter = 0; iter < 60; iter++) {
    const idx = [...set].sort((a, b) => a - b);
    const track = createTrack(idx.map((i) => t[i]), idx.flatMap((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]));
    let added = 0;
    for (let s = 0; s < idx.length - 1; s++) {
      let worst = -1, worstErr = 0;
      for (let i = idx[s] + 1; i < idx[s + 1]; i++) {
        trackPosition(track, t[i], out);
        const err = Math.hypot(out.x - p[i * 3], out.y - p[i * 3 + 1], out.z - p[i * 3 + 2]);
        if (err > tol(i) && err - tol(i) > worstErr) { worstErr = err - tol(i); worst = i; }
      }
      if (worst >= 0) { set.add(worst); added++; }
    }
    if (!added) return idx;
  }
  return [...set].sort((a, b) => a - b);
}
