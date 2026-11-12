// Major moons: the Galilean satellites (Meeus ch. 44), Saturn's seven round moons,
// Uranus' five, Triton, Charon, Phobos and Deimos (JPL mean elements refined
// against Horizons), with procedural surfaces, synchronous rotation, shadows on
// their planets (and planets' shadows on them), and orbit lines that fade in
// as you approach each planet.

import { registerBodies } from '../bodies.js';
import { registerRotationModel } from '../ephemeris/rotation.js';
import { getOrbitProvider, registerOrbitProvider } from '../ephemeris/providers.js';
import { J2000, OBLIQUITY_J2000, centuriesTT } from '../ephemeris/index.js';
import { GALILEAN, galileanPositions } from '../ephemeris/galilean.js';
import { satellitePosition, satellitePeriod, plutoBarycentricOffset } from '../ephemeris/satellites.js';
import { MOON_SURFACES } from '../textures/moons.js';
import { state } from '../state.js';

// ---------------------------------------------------------------------------
// Bodies. Physical data: NASA/JPL planetary satellite physical parameters.
// ---------------------------------------------------------------------------
const sat = (o) => ({ type: 'Moon', labelPriority: 3, listed: false, textureSize: 512, bump: 0.01, ...o });
const g = (o) => sat({ orbit: { kind: 'galilean' }, parent: 'jupiter', ...o });
const m = (o) => sat({ orbit: { kind: 'satellite' }, ...o });

export const MOONS = [
  g({
    id: 'io', name: 'Io', color: '#e6cf5c', radiusKm: 1821.6, periodDays: 1.769, dayHours: 42.46, gravity: 1.80, meanTempC: -143,
    listed: true, textureSize: 1024, bump: 0.004,
    description: 'The most volcanically active world known. Tidal flexing by Jupiter, Europa and Ganymede drives hundreds of volcanoes that paint its surface in sulfur yellows, reds and blacks.',
  }),
  g({
    id: 'europa', name: 'Europa', color: '#d8c6a5', radiusKm: 1560.8, periodDays: 3.551, dayHours: 85.23, gravity: 1.31, meanTempC: -160,
    listed: true, textureSize: 1024, bump: 0.003,
    description: 'A smooth shell of water ice laced with reddish cracks, floating on a global salty ocean — one of the most promising places to look for life beyond Earth.',
  }),
  g({
    id: 'ganymede', name: 'Ganymede', color: '#b0a290', radiusKm: 2634.1, periodDays: 7.155, dayHours: 171.71, gravity: 1.43, meanTempC: -163,
    listed: true, textureSize: 1024,
    description: 'The largest moon in the solar system — bigger than Mercury — and the only one with its own magnetic field. Dark ancient terrain is cut by bright grooved bands.',
  }),
  g({
    id: 'callisto', name: 'Callisto', color: '#8c7b69', radiusKm: 2410.3, periodDays: 16.689, dayHours: 400.54, gravity: 1.24, meanTempC: -139,
    listed: true, textureSize: 1024,
    description: 'The most heavily cratered body known: a 4-billion-year-old surface with the vast multi-ring impact basin Valhalla.',
  }),

  m({ id: 'mimas', parent: 'saturn', name: 'Mimas', color: '#c9c7c2', radiusKm: 198.2, periodDays: 0.942, dayHours: 22.62, gravity: 0.064, meanTempC: -209,
    description: 'A small icy moon dominated by Herschel, a crater a third of its own width, which gives it a striking resemblance to a certain space station.' }),
  m({ id: 'enceladus', parent: 'saturn', name: 'Enceladus', color: '#f2f5f7', radiusKm: 252.1, periodDays: 1.370, dayHours: 32.89, gravity: 0.113, meanTempC: -198,
    description: 'The most reflective body in the solar system. Geysers from the “tiger stripes” at its south pole spray ocean water into space, feeding Saturn’s E ring.' }),
  m({ id: 'tethys', parent: 'saturn', name: 'Tethys', color: '#dcdcd8', radiusKm: 531.1, periodDays: 1.888, dayHours: 45.31, gravity: 0.146, meanTempC: -187,
    description: 'Almost pure water ice, marked by the giant crater Odysseus and the 2,000 km canyon Ithaca Chasma.' }),
  m({ id: 'dione', parent: 'saturn', name: 'Dione', color: '#cfcfcc', radiusKm: 561.4, periodDays: 2.737, dayHours: 65.69, gravity: 0.232, meanTempC: -186,
    description: 'An icy moon whose trailing hemisphere is streaked with bright “wispy” ice cliffs hundreds of metres high.' }),
  m({ id: 'rhea', parent: 'saturn', name: 'Rhea', color: '#d2d0cb', radiusKm: 763.8, periodDays: 4.518, dayHours: 108.42, gravity: 0.264, meanTempC: -197,
    description: 'Saturn’s second-largest moon: a heavily cratered ball of ice and rock.' }),
  m({ id: 'titan', parent: 'saturn', name: 'Titan', color: '#e2a650', radiusKm: 2574.7, periodDays: 15.945, dayHours: 382.69, gravity: 1.35, meanTempC: -179,
    listed: true, textureSize: 1024, bump: 0, softTerminator: 0.2, atmosphere: [1.0, 0.62, 0.25], atmosphereStrength: 1.0, atmosphereShell: 1.08,
    description: 'The only moon with a thick atmosphere — denser than Earth’s. Under its orange haze lie methane rain, rivers and the hydrocarbon seas Kraken and Ligeia Mare.' }),
  m({ id: 'iapetus', parent: 'saturn', name: 'Iapetus', color: '#a39a8c', radiusKm: 734.5, periodDays: 79.331, dayHours: 1903.94, gravity: 0.223, meanTempC: -163,
    description: 'A two-toned moon: its leading hemisphere is as dark as coal, its trailing side as bright as snow. An equatorial ridge up to 20 km high wraps around it.' }),

  m({ id: 'miranda', parent: 'uranus', name: 'Miranda', color: '#b9b9b8', radiusKm: 235.8, periodDays: 1.413, dayHours: 33.92, gravity: 0.079, meanTempC: -213,
    description: 'A jumble of old cratered plains and young grooved “coronae”, with Verona Rupes, the tallest known cliff in the solar system.' }),
  m({ id: 'ariel', parent: 'uranus', name: 'Ariel', color: '#c3c4c6', radiusKm: 578.9, periodDays: 2.520, dayHours: 60.49, gravity: 0.269, meanTempC: -213,
    description: 'The brightest of Uranus’ large moons, with a young surface cut by long fault valleys.' }),
  m({ id: 'umbriel', parent: 'uranus', name: 'Umbriel', color: '#7a7a7a', radiusKm: 584.7, periodDays: 4.144, dayHours: 99.46, gravity: 0.2, meanTempC: -198,
    description: 'The darkest of Uranus’ large moons, uniformly ancient except for Wunda, a mysterious bright ring.' }),
  m({ id: 'titania', parent: 'uranus', name: 'Titania', color: '#b4aca4', radiusKm: 788.4, periodDays: 8.706, dayHours: 208.94, gravity: 0.367, meanTempC: -203,
    listed: true,
    description: 'Uranus’ largest moon, scarred by enormous fault canyons such as Messina Chasma, 1,500 km long.' }),
  m({ id: 'oberon', parent: 'uranus', name: 'Oberon', color: '#a4968a', radiusKm: 761.4, periodDays: 13.463, dayHours: 323.12, gravity: 0.346, meanTempC: -198,
    description: 'The outermost large moon of Uranus: old, heavily cratered and slightly reddish.' }),

  m({ id: 'triton', parent: 'neptune', name: 'Triton', color: '#d9cbc2', radiusKm: 1353.4, periodDays: 5.877, dayHours: -141.04, gravity: 0.78, meanTempC: -235,
    listed: true, textureSize: 1024, bump: 0.004,
    description: 'Neptune’s largest moon orbits backwards — a captured Kuiper Belt object. Nitrogen geysers streak its pinkish south polar cap; it is one of the coldest surfaces measured.' }),

  m({ id: 'charon', parent: 'pluto', name: 'Charon', color: '#a8a5a1', radiusKm: 606, periodDays: 6.387, dayHours: 153.29, gravity: 0.288, meanTempC: -220,
    listed: true,
    description: 'Half Pluto’s size, Charon and Pluto orbit a point between them, each always showing the other the same face. Its north pole is stained red by Mordor Macula.' }),

  m({ id: 'phobos', parent: 'mars', name: 'Phobos', color: '#8a7f73', radiusKm: 11.08, periodDays: 0.319, dayHours: 7.65, gravity: 0.0057, meanTempC: -40,
    triaxialKm: [13.0, 11.4, 9.1],
    description: 'Mars’ larger moon orbits faster than Mars turns, rising in the west. Tides are pulling it inward; in about 50 million years it will break apart or crash.' }),
  m({ id: 'deimos', parent: 'mars', name: 'Deimos', color: '#9a8f82', radiusKm: 6.2, periodDays: 1.262, dayHours: 30.31, gravity: 0.003, meanTempC: -40,
    triaxialKm: [7.8, 6.0, 5.1],
    description: 'The smaller, outer moon of Mars: a dark, lumpy body smoothed by a thick blanket of dust.' }),
];

for (const b of MOONS) if (!MOON_SURFACES.includes(b.id)) throw new Error(`No surface for ${b.id}`);
registerBodies(MOONS);

// ---------------------------------------------------------------------------
// Rotation: synchronous, with the spin axis along the orbit normal and the prime
// meridian facing the planet (IAU convention for these moons' longitudes).
// ---------------------------------------------------------------------------
const cosE = Math.cos(OBLIQUITY_J2000), sinE = Math.sin(OBLIQUITY_J2000);
const eclToEq = (v) => [v.x, cosE * v.y - sinE * v.z, sinE * v.y + cosE * v.z];

let galMemo = new Map();
function galileanTT(jdTT) {
  let v = galMemo.get(jdTT);
  if (!v) {
    if (galMemo.size > 8) galMemo = new Map();
    v = galileanPositions(jdTT);
    galMemo.set(jdTT, v);
  }
  return v;
}

/** IAU-style [α0°, δ0°, W°] for a tidally locked moon from its parent-relative motion. */
export function synchronousRotation(posAt, periodDays) {
  return (T, d) => {
    const jd = J2000 + d;
    const r = eclToEq(posAt(jd));
    const r2 = eclToEq(posAt(jd + periodDays / 200));
    let P = [r[1] * r2[2] - r[2] * r2[1], r[2] * r2[0] - r[0] * r2[2], r[0] * r2[1] - r[1] * r2[0]];
    const pl = Math.hypot(...P);
    P = P.map((x) => x / pl);
    const alpha = Math.atan2(P[1], P[0]), delta = Math.asin(P[2]);
    const Q = [-Math.sin(alpha), Math.cos(alpha), 0];
    const PxQ = [P[1] * Q[2] - P[2] * Q[1], P[2] * Q[0] - P[0] * Q[2], P[0] * Q[1] - P[1] * Q[0]];
    const X = r.map((x) => -x); // toward the planet
    const W = Math.atan2(X[0] * PxQ[0] + X[1] * PxQ[1] + X[2] * PxQ[2], X[0] * Q[0] + X[1] * Q[1] + X[2] * Q[2]);
    const deg = 180 / Math.PI;
    return [alpha * deg, delta * deg, W * deg];
  };
}

for (const b of MOONS) {
  const posAt = b.orbit.kind === 'galilean' ? (jd) => galileanTT(jd)[b.id] : (jd) => satellitePosition(b.id, jd);
  registerRotationModel(b.id, synchronousRotation(posAt, b.orbit.kind === 'galilean' ? b.periodDays : satellitePeriod(b.id)));
}

// ---------------------------------------------------------------------------
// Pluto and Charon orbit a barycentre ~2,100 km from Pluto's centre: the planet
// provider gives the barycentre, so move Pluto (and with it Charon) off it.
// ---------------------------------------------------------------------------
const planet = getOrbitProvider('planet');
registerOrbitProvider('planet', {
  ...planet,
  position: (body, jd, ctx) => {
    const p = planet.position(body, jd, ctx);
    if (body.id !== 'pluto') return p;
    const o = plutoBarycentricOffset(J2000 + centuriesTT(jd) * 36525);
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
  },
});

// ---------------------------------------------------------------------------
// Feature hooks
// ---------------------------------------------------------------------------
const SHADOW_CASTERS = {
  jupiter: GALILEAN,
  saturn: ['titan', 'rhea', 'dione', 'tethys'],
  uranus: ['titania', 'oberon', 'ariel', 'umbriel'],
  neptune: ['triton'],
  pluto: ['charon'],
  mars: ['phobos', 'deimos'],
};

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export default {
  id: 'moons',

  setup(app) {
    const { bodies } = app;
    for (const [planetId, ids] of Object.entries(SHADOW_CASTERS)) {
      const p = bodies[planetId];
      if (p) for (const id of ids) if (bodies[id] && !p.shadowCasters.includes(id)) p.shadowCasters.push(id);
    }
    // the planet eclipses its moons
    for (const b of MOONS) bodies[b.id].shadowCasters.push(b.parent);
    this.moons = MOONS.map((b) => bodies[b.id]);
    for (const b of this.moons) b.orbitFade = 0;
  },

  update(app, dt) {
    const { bodies, camera } = app;
    const sel = bodies[state.selected];
    const k = Math.min(1, dt * 4);
    for (const b of this.moons) {
      const parent = bodies[b.parent];
      // Orbit lines: full strength when the planet or one of its moons is selected,
      // otherwise fading in as the camera approaches the planet's system.
      const orbitR = b.position.distanceTo(parent.position);
      const camD = camera.position.distanceTo(parent.position);
      const focused = sel && (sel.id === b.parent || sel.parent === b.parent);
      const target = focused ? 1 : 0.6 * (1 - smoothstep(orbitR * 3, orbitR * 8, camD));
      // self-healing: a single non-finite input (e.g. a degenerate camera for one frame) must not stick
      b.orbitFade = Number.isFinite(target) && Number.isFinite(k) && Number.isFinite(b.orbitFade) ? b.orbitFade + (target - b.orbitFade) * k : 0;
      if (b.orbit) {
        b.orbit.material.uniforms.opacity.value = b.orbitFade;
        b.orbit.visible = b.group.visible && b.orbitFade > 0.004;
      }
      // Phobos and Deimos are far from round: long axis toward Mars, short axis along the spin axis.
      const tri = b.data.triaxialKm;
      if (tri && b.mesh) {
        const s = b.radius / b.data.radiusKm;
        b.mesh.scale.set(tri[0] * s, tri[2] * s, tri[1] * s);
      }
    }
  },
};
