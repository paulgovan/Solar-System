// Orbit providers: how each kind of body gets its position and orbit path.
//
// A provider is an object:
//   relative        true if positions are relative to body.parent (satellites)
//   position(body, jd, ctx) → {x, y, z} in AU, J2000 ecliptic
//                   (heliocentric, or parent-relative when `relative`)
//   path(body, jd, segments) → { points: [{x,y,z}…], startJD, refreshDays }   (optional)
//   phase(body, jd, path) → 0…1, where the body is along `points`           (optional)
//
// `ctx` is shared by all bodies in one frame: { jd, T, positions() } where
// positions() lazily returns computePositions(jd).
//
// Feature modules add new kinds with registerOrbitProvider().

import { centuriesTT } from './time.js';
import { elementsAt, orbitPath } from './planets.js';
import { solveKepler } from './kepler.js';
import { moonGeocentric } from './moon.js';
import { computePositions } from './positions.js';

const providers = {};

export function registerOrbitProvider(kind, provider) {
  providers[kind] = provider;
}

export function getOrbitProvider(kind) {
  const p = providers[kind];
  if (!p) throw new Error(`No orbit provider registered for kind "${kind}"`);
  return p;
}

/** Per-frame context shared by all providers. */
export function frameContext(jd) {
  let cache = null;
  return {
    jd,
    T: centuriesTT(jd),
    positions: () => (cache ??= computePositions(jd)),
  };
}

const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });
const SIDEREAL_MONTH = 27.321661;

registerOrbitProvider('fixed', {
  relative: false,
  position: () => ORIGIN,
});

// Major planets (and Pluto): JPL Keplerian elements.
registerOrbitProvider('planet', {
  relative: false,
  position: (body, jd, ctx) => ctx.positions()[body.id],
  path: (body, jd, segments) => ({
    points: orbitPath(body.id, centuriesTT(jd), segments),
    startJD: jd,
    refreshDays: 1826, // elements drift slowly; resample every ~5 years
  }),
  phase: (body, jd) => {
    const el = elementsAt(body.id, centuriesTT(jd));
    const E = solveKepler(el.M, el.e);
    return ((E / (2 * Math.PI)) % 1 + 1) % 1; // paths are sampled uniformly in E
  },
});

// Earth's Moon: geocentric lunar theory, path sampled over one sidereal month.
registerOrbitProvider('moon', {
  relative: true,
  position: (body, jd, ctx) => ctx.positions().moonGeo,
  path: (body, jd, segments) => {
    const points = [];
    for (let i = 0; i <= segments; i++) points.push(moonGeocentric(centuriesTT(jd + (i / segments) * SIDEREAL_MONTH)));
    return { points, startJD: jd, refreshDays: 2 };
  },
  phase: (body, jd, path) => (((jd - path.startJD) / SIDEREAL_MONTH) % 1 + 1) % 1,
});
