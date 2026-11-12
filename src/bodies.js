// Physical data and descriptions for each body.
// Sources: NASA Planetary Fact Sheets, IAU. Moon counts as of 2025.

export const BODIES = [
  {
    id: 'sun', name: 'Sun', type: 'G-type star', color: '#ffcc66',
    radiusKm: 695700, dayHours: 609.12, tiltDeg: 7.25, moons: null,
    gravity: 274, meanTempC: 5500,
    description: 'A 4.6-billion-year-old yellow dwarf holding 99.86% of the solar system’s mass. Its light takes about 8 minutes 20 seconds to reach Earth.',
  },
  {
    id: 'mercury', name: 'Mercury', type: 'Terrestrial planet', color: '#b5aca3',
    radiusKm: 2439.7, periodDays: 87.969, dayHours: 1407.6, tiltDeg: 0.03, moons: 0,
    gravity: 3.7, meanTempC: 167, atmosphere: null,
    description: 'The smallest planet and closest to the Sun. Its cratered surface swings from 430 °C by day to −180 °C at night.',
  },
  {
    id: 'venus', name: 'Venus', type: 'Terrestrial planet', color: '#e8c98a',
    radiusKm: 6051.8, periodDays: 224.701, dayHours: -5832.5, tiltDeg: 177.4, moons: 0,
    gravity: 8.87, meanTempC: 464, atmosphere: [1.0, 0.85, 0.55], atmosphereStrength: 1.0,
    description: 'Shrouded in sulfuric-acid clouds over a crushing CO₂ atmosphere, Venus is the hottest planet. It spins backwards, and a day there is longer than its year.',
  },
  {
    id: 'earth', name: 'Earth', type: 'Terrestrial planet', color: '#4f8fe8',
    radiusKm: 6371.0, periodDays: 365.256, dayHours: 23.934, tiltDeg: 23.44, moons: 1,
    gravity: 9.81, meanTempC: 15, atmosphere: [0.35, 0.6, 1.0], atmosphereStrength: 1.0,
    description: 'Our home: the only known world with liquid surface oceans and life. Surface shown here is procedurally generated, but its tilt, spin and position are real.',
  },
  {
    id: 'moon', name: 'Moon', type: 'Natural satellite', color: '#cfcac2', parent: 'earth',
    radiusKm: 1737.4, periodDays: 27.322, dayHours: 655.7, tiltDeg: 6.68, moons: null,
    gravity: 1.62, meanTempC: -20,
    description: 'Earth’s only natural satellite, tidally locked so the same face always points toward us. It is slowly drifting away at about 3.8 cm per year.',
  },
  {
    id: 'mars', name: 'Mars', type: 'Terrestrial planet', color: '#e0703c',
    radiusKm: 3389.5, periodDays: 686.98, dayHours: 24.623, tiltDeg: 25.19, moons: 2,
    gravity: 3.71, meanTempC: -65, atmosphere: [1.0, 0.6, 0.4], atmosphereStrength: 0.45,
    description: 'The rusty red planet, home to Olympus Mons, the tallest volcano in the solar system, and Valles Marineris, a canyon as long as the United States.',
  },
  {
    id: 'jupiter', name: 'Jupiter', type: 'Gas giant', color: '#d8b48a',
    radiusKm: 69911, periodDays: 4332.59, dayHours: 9.925, tiltDeg: 3.13, moons: 95,
    gravity: 24.79, meanTempC: -110, atmosphere: [0.95, 0.85, 0.7], atmosphereStrength: 0.6,
    description: 'The largest planet — more than twice the mass of all the others combined. Its Great Red Spot is a storm wider than Earth that has raged for centuries.',
  },
  {
    id: 'saturn', name: 'Saturn', type: 'Gas giant', color: '#e8d5a0',
    radiusKm: 58232, periodDays: 10759.22, dayHours: 10.656, tiltDeg: 26.73, moons: 274,
    gravity: 10.44, meanTempC: -140, atmosphere: [1.0, 0.9, 0.7], atmosphereStrength: 0.5,
    rings: { innerKm: 74500, outerKm: 140220 },
    description: 'Famous for its brilliant ring system of ice and rock, Saturn is so light it would float in water. It has more known moons than any other planet.',
  },
  {
    id: 'uranus', name: 'Uranus', type: 'Ice giant', color: '#9fdde6',
    radiusKm: 25362, periodDays: 30688.5, dayHours: -17.24, tiltDeg: 97.77, moons: 29,
    gravity: 8.87, meanTempC: -195, atmosphere: [0.6, 0.9, 1.0], atmosphereStrength: 0.7,
    description: 'An ice giant knocked onto its side: its axis is tilted 98°, so each pole gets 42 years of continuous sunlight followed by 42 years of darkness.',
  },
  {
    id: 'neptune', name: 'Neptune', type: 'Ice giant', color: '#4f6fe0',
    radiusKm: 24622, periodDays: 60195, dayHours: 16.11, tiltDeg: 28.32, moons: 16,
    gravity: 11.15, meanTempC: -200, atmosphere: [0.4, 0.55, 1.0], atmosphereStrength: 0.8,
    description: 'The windiest world, with supersonic storms reaching 2,000 km/h. It was the first planet found by mathematical prediction rather than observation.',
  },
  {
    id: 'pluto', name: 'Pluto', type: 'Dwarf planet', color: '#d9b99b', dwarf: true,
    radiusKm: 1188.3, periodDays: 90560, dayHours: -153.29, tiltDeg: 122.53, moons: 5,
    gravity: 0.62, meanTempC: -225,
    description: 'A dwarf planet in the Kuiper Belt with a heart-shaped nitrogen-ice plain, Sputnik Planitia, revealed by New Horizons in 2015.',
  },
];

export const BODY_MAP = Object.fromEntries(BODIES.map((b) => [b.id, b]));
