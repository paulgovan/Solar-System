// Curated moments for the events drawer (src/ui/events.js). Times are UTC.
//
//   when      ISO UTC time of the moment
//   body      body to fly to (a spacecraft id for flybys)
//   view      camera for the jump (default: the usual fly-to view of `body`):
//               radii, of   distance in radii of body `of` (default: `body`)
//               frame       distance that fits body `frame` as well
//               away        camera on the far side of `body` from this body, so it appears beyond `body`
//               toward      camera on the side of `body` facing this body
//               from        camera at this body, looking at `body`
//               tilt        lift of the camera direction out of the ecliptic (default 0.35)
//   blurb     one-sentence context
//
// Flyby times are the time of closest approach in the spacecraft trajectories (JPL Horizons);
// tests/events.test.js checks them against src/data/spacecraft/. Voyager 2 passed Saturn on
// 25 Aug 1981 in US Pacific time, which is 26 Aug 03:24 UTC.

export const MOMENT_GROUPS = [
  { id: 'missions', label: 'Exploration' },
  { id: 'sky', label: 'In the sky' },
  { id: 'comets', label: 'Comets' },
];

export const MOMENTS = [
  // --- Apollo ---
  { id: 'apollo8-earthrise', group: 'missions', title: 'Apollo 8 Earthrise', when: '1968-12-24T16:40Z', body: 'moon', view: { radii: 6, away: 'earth', tilt: 0.5 },
    blurb: 'Borman, Lovell and Anders see Earth rise over the lunar horizon: the first time humans see the whole planet from another world.' },
  { id: 'apollo11-landing', group: 'missions', title: 'Apollo 11 landing', when: '1969-07-20T20:17Z', body: 'moon',
    blurb: 'The Eagle lands in the Sea of Tranquillity at 20:17 UTC.' },
  { id: 'apollo17-landing', group: 'missions', title: 'Apollo 17 landing', when: '1972-12-11T19:54Z', body: 'moon',
    blurb: 'The last crewed Moon landing, in the Taurus–Littrow valley.' },
  // --- Pioneers ---
  { id: 'pioneer10-jupiter', group: 'missions', title: 'Pioneer 10 at Jupiter', when: '1973-12-04T02:25Z', body: 'pioneer10', view: { radii: 4, of: 'jupiter', away: 'jupiter' },
    blurb: 'The first spacecraft to fly past Jupiter, 203,000 km from its centre.' },
  { id: 'pioneer11-jupiter', group: 'missions', title: 'Pioneer 11 at Jupiter', when: '1974-12-03T05:21Z', body: 'pioneer11', view: { radii: 4, of: 'jupiter', away: 'jupiter' },
    blurb: 'Closest approach, 113,500 km from Jupiter’s centre; the encounter bends its path toward Saturn.' },
  { id: 'pioneer11-saturn', group: 'missions', title: 'Pioneer 11 at Saturn', when: '1979-09-01T16:29Z', body: 'pioneer11', view: { radii: 4, of: 'saturn', away: 'saturn' },
    blurb: 'The first flyby of Saturn, threading the gap between the rings and the planet.' },
  // --- Voyagers ---
  { id: 'voyager1-jupiter', group: 'missions', title: 'Voyager 1 at Jupiter', when: '1979-03-05T12:05Z', body: 'voyager1', view: { radii: 4, of: 'jupiter', away: 'jupiter' },
    blurb: 'Closest approach to Jupiter, 349,000 km from its centre. It finds volcanoes erupting on Io.' },
  { id: 'voyager2-jupiter', group: 'missions', title: 'Voyager 2 at Jupiter', when: '1979-07-09T22:29Z', body: 'voyager2', view: { radii: 4, of: 'jupiter', away: 'jupiter' },
    blurb: 'Closest approach, 721,000 km from Jupiter’s centre, four months after its twin.' },
  { id: 'voyager1-saturn', group: 'missions', title: 'Voyager 1 at Saturn', when: '1980-11-12T23:46Z', body: 'voyager1', view: { radii: 4, of: 'saturn', away: 'saturn' },
    blurb: 'Flies past Saturn and Titan, then leaves the plane of the planets.' },
  { id: 'voyager2-saturn', group: 'missions', title: 'Voyager 2 at Saturn', when: '1981-08-26T03:24Z', body: 'voyager2', view: { radii: 4, of: 'saturn', away: 'saturn' },
    blurb: 'Closest approach at 03:24 UTC on 26 Aug (25 Aug on the US west coast).' },
  { id: 'voyager2-uranus', group: 'missions', title: 'Voyager 2 at Uranus', when: '1986-01-24T17:59Z', body: 'voyager2', view: { radii: 5, of: 'uranus', away: 'uranus' },
    blurb: 'The only visit to Uranus so far, 107,000 km from its centre.' },
  { id: 'voyager2-neptune', group: 'missions', title: 'Voyager 2 at Neptune', when: '1989-08-25T03:55Z', body: 'voyager2', view: { radii: 5, of: 'neptune', away: 'neptune' },
    blurb: 'Grazes Neptune’s cloud tops, then Triton, completing the Grand Tour.' },
  { id: 'pale-blue-dot', group: 'missions', title: 'Pale Blue Dot', when: '1990-02-14T04:48Z', body: 'earth', view: { from: 'voyager1' },
    blurb: 'Voyager 1, 6 billion km from home, turns its camera back and takes the portrait of Earth as a pixel of light.' },
  { id: 'newhorizons-pluto', group: 'missions', title: 'New Horizons at Pluto', when: '2015-07-14T11:49Z', body: 'newhorizons', view: { radii: 6, of: 'pluto', away: 'pluto' },
    blurb: 'First close look at Pluto and Charon, 12,500 km above the surface.' },
  // --- In the sky ---
  { id: 'mars-2003', group: 'sky', title: 'Closest Mars in 60,000 years', when: '2003-08-27T09:51Z', body: 'mars',
    blurb: 'Mars passes 55.76 million km from Earth, its closest approach in nearly 60,000 years.' },
  { id: 'great-conjunction-2020', group: 'sky', title: 'Great Conjunction', when: '2020-12-21T18:20Z', body: 'jupiter', view: { frame: 'saturn', toward: 'earth', tilt: 0.15 },
    blurb: 'Jupiter and Saturn pass just 6′ apart in Earth’s sky, their closest since 1623.' },
  { id: 'jupiter-opposition-2024', group: 'sky', title: 'Jupiter opposition', when: '2024-12-07T20:58Z', body: 'jupiter',
    blurb: 'Earth passes between the Sun and Jupiter: the planet is at its biggest and brightest for the year.' },
  { id: 'mars-opposition-2025', group: 'sky', title: 'Mars opposition', when: '2025-01-16T02:38Z', body: 'mars',
    blurb: 'Mars is opposite the Sun in the sky, 0.64 AU from Earth.' },
  { id: 'saturn-opposition-2025', group: 'sky', title: 'Saturn opposition', when: '2025-09-21T05:45Z', body: 'saturn',
    blurb: 'Saturn at opposition, with its rings seen nearly edge-on from Earth.' },
  // --- Comets ---
  { id: 'halley-1986', group: 'comets', title: 'Halley’s Comet perihelion', when: '1986-02-09T11:00Z', body: 'halley', view: { radii: 40 },
    blurb: 'Halley is 0.587 AU from the Sun, between the orbits of Mercury and Venus, on its 1986 return. Its next perihelion is in 2061.' },
];
