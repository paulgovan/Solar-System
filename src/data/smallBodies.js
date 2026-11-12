// Dwarf planets, Vesta and Halley's Comet. Orbits come from JPL osculating elements at
// many epochs (src/data/smallBodyElements.json, written by scripts/fetch-horizons.mjs)
// and are propagated with the `elements` orbit provider (src/features/smallBodies.js).
// Physical data: NASA/JPL (Dawn mission results for Ceres and Vesta), IAU WGCCRE 2015
// rotation models where they exist.
//
// Extra fields used by src/features/smallBodies.js:
//   axesKm   [a, b, c] triaxial semi-axes; the mesh is stretched to this shape (c = pole)
//   comet    draw a coma and dust/ion tails

import ELEMENTS from './smallBodyElements.json';

const common = (id) => ({
  orbit: { kind: 'elements', rows: ELEMENTS.bodies[id].elements },
  toggle: 'smallBodies',
  labelPriority: 2,
  dwarf: true,
  textureSize: 512,
});

export const SMALL_BODIES = [
  {
    id: 'ceres', ...common('ceres'), bump: 0.012, name: 'Ceres', type: 'Dwarf planet (asteroid belt)', color: '#b9b4ab',
    radiusKm: 469.7, axesKm: [482.1, 482.1, 445.9], periodDays: 1680.1, dayHours: 9.074, tiltDeg: 4, moons: 0,
    gravity: 0.28, meanTempC: -105,
    description: 'The largest object in the asteroid belt and the only dwarf planet in the inner solar system. NASA’s Dawn orbited it from 2015 to 2018 and found bright salt deposits in Occator crater, left by briny water from below.',
  },
  {
    id: 'vesta', ...common('vesta'), bump: 0.016, dwarf: false, name: 'Vesta', type: 'Asteroid (protoplanet)', color: '#cdbfa8',
    radiusKm: 262.7, axesKm: [286.3, 278.6, 223.2], periodDays: 1325.9, dayHours: 5.342, tiltDeg: 29, moons: 0,
    gravity: 0.25,
    description: 'The second most massive asteroid, a surviving protoplanet with a differentiated core. A giant impact carved the 500 km Rheasilvia basin at its south pole; fragments of that blast reach Earth as HED meteorites.',
  },
  {
    id: 'eris', ...common('eris'), bump: 0.004, name: 'Eris', type: 'Dwarf planet (scattered disc)', color: '#e4e7ee',
    radiusKm: 1163, periodDays: 203830, dayHours: 378.9, moons: 1,
    gravity: 0.82, meanTempC: -231,
    description: 'Almost exactly Pluto’s size but 27% more massive. Its discovery in 2005 led the IAU to define “dwarf planet” in 2006. Its frost-covered surface reflects 96% of sunlight; its moon Dysnomia keeps one face of Eris turned toward it.',
  },
  {
    id: 'haumea', ...common('haumea'), bump: 0.006, name: 'Haumea', type: 'Dwarf planet (Kuiper Belt)', color: '#dce3ea',
    radiusKm: 798, axesKm: [1161, 852, 513], periodDays: 103410, dayHours: 3.9155, moons: 2,
    gravity: 0.4, meanTempC: -241,
    description: 'Spinning once every 3.9 hours, the fastest rotation of any large body in the solar system, which has stretched it into an egg shape twice as long as it is thick. It has two moons and a thin ring.',
  },
  {
    id: 'makemake', ...common('makemake'), bump: 0.006, name: 'Makemake', type: 'Dwarf planet (Kuiper Belt)', color: '#d8a888',
    radiusKm: 715, periodDays: 112230, dayHours: 22.83, moons: 1,
    gravity: 0.5, meanTempC: -239,
    description: 'The second-brightest Kuiper Belt object after Pluto, with a reddish-brown surface of frozen methane and ethane. Found shortly after Easter 2005, it is named after the creator god of the Rapa Nui people.',
  },
  {
    id: 'halley', ...common('halley'), dwarf: false, comet: true, textureSize: 256, bump: 0.02, labelPriority: 2,
    name: 'Halley’s Comet', type: 'Periodic comet (1P/Halley)', color: '#a6d4ff',
    radiusKm: 5.5, axesKm: [7.5, 4.1, 4.1], periodDays: 27730, dayHours: 52.8, moons: null,
    description: 'The most famous periodic comet, returning every 75–76 years. In 1986 the Giotto, Vega 1 and 2, Suisei and Sakigake probes visited it; Giotto photographed its dark, peanut-shaped nucleus from 600 km. Its next perihelion is on 28 July 2061.',
  },
];

// Rotation models fn(T centuries, d days) → [α0°, δ0°, W°]: IAU WGCCRE 2015 for Ceres and
// Vesta. The others have no adopted pole; they spin at their measured rate about an
// assumed pole at the ecliptic north (RA 270°, Dec 66.56°).
const spin = (hours, W0 = 0) => (T, d) => [270, 66.5607, W0 + (360 * 24 / hours) * d];
export const ROTATION_MODELS = {
  ceres: (T, d) => [291.418, 66.764, 170.65 + 952.1532635 * d],
  vesta: (T, d) => [309.031, 42.235, 285.39 + 1617.3329428 * d],
  eris: spin(378.9),
  haumea: spin(3.9155),
  makemake: spin(22.83),
  halley: spin(52.8),
};
