// Shared loader for the real-sky data (Bright Star Catalogue + constellation figures) and a
// "which constellation is this point in?" lookup based on the figures. Pure data: no WebGL.

import { decodeStars } from './starCatalog.js';
import starsUrl from '../data/stars.bin?url';
import figuresUrl from '../data/constellations.json?url';

const DEG = Math.PI / 180;
let promise = null;

/** Fetch (once) the decoded star catalogue and the constellation figures. */
export function loadSkyData() {
  promise ||= Promise.all([
    fetch(starsUrl).then((r) => { if (!r.ok) throw new Error(`stars.bin: HTTP ${r.status}`); return r.arrayBuffer(); }),
    fetch(figuresUrl).then((r) => { if (!r.ok) throw new Error(`constellations.json: HTTP ${r.status}`); return r.json(); }),
  ]).then(([buf, figures]) => ({ cat: decodeStars(buf), figures }));
  return promise;
}

const unit = (raDeg, decDeg) => {
  const a = raDeg * DEG, d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Builds a lookup `(raDeg, decDeg) → {name, id, distance}` returning the constellation whose
 * stick figure passes nearest to the point (J2000 coordinates). This is an approximation: it
 * names the closest figure, not the IAU region the point lies in.
 */
export function createConstellationLookup({ cat, figures }) {
  const segs = []; // {a, b, n, fig}
  for (const f of figures) {
    for (const path of f.lines) {
      for (let k = 1; k < path.length; k++) {
        const a = unit(cat.ra[path[k - 1]], cat.dec[path[k - 1]]);
        const b = unit(cat.ra[path[k]], cat.dec[path[k]]);
        const n = cross(a, b);
        const len = Math.hypot(...n);
        if (len < 1e-9) continue;
        segs.push({ a, b, n: n.map((c) => c / len), fig: f });
      }
    }
  }
  return (raDeg, decDeg) => {
    const p = unit(raDeg, decDeg);
    let best = null, bd = Infinity;
    for (const s of segs) {
      // is the foot of the perpendicular between a and b?
      const inside = dot(cross(s.a, p), s.n) >= 0 && dot(cross(p, s.b), s.n) >= 0;
      let d;
      if (inside) d = Math.asin(Math.min(1, Math.abs(dot(p, s.n))));
      else d = Math.min(Math.acos(Math.min(1, dot(p, s.a))), Math.acos(Math.min(1, dot(p, s.b))));
      if (d < bd) { bd = d; best = s.fig; }
    }
    return best ? { id: best.id, name: best.name, distance: bd / DEG } : null;
  };
}
