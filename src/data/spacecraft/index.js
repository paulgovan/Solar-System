// Spacecraft: trajectories from JPL Horizons (written by scripts/fetch-horizons.mjs) plus
// mission facts (NASA mission pages). Positions after the last contact (Pioneer 10/11)
// or after the last tracking fit are JPL predictions.

import voyager1 from './voyager1.json';
import voyager2 from './voyager2.json';
import pioneer10 from './pioneer10.json';
import pioneer11 from './pioneer11.json';
import newhorizons from './newhorizons.json';

export const SPACECRAFT_DATA = { voyager1, voyager2, pioneer10, pioneer11, newhorizons };

const common = (id) => ({
  orbit: { kind: 'samples', data: SPACECRAFT_DATA[id] },
  toggle: 'spacecraft',
  labelPriority: 4,
  spacecraft: true,
  showRadius: false,
  radiusKm: 1, // marker size only (not to scale)
  type: 'Spacecraft',
  moons: null,
});

export const SPACECRAFT = [
  {
    id: 'voyager1', ...common('voyager1'), name: 'Voyager 1', color: '#7fe8c8',
    launched: '5 Sep 1977', massKg: 722, lastContact: null,
    flybys: 'Jupiter (Mar 1979), Saturn and Titan (Nov 1980)',
    description: 'The most distant human-made object. After Jupiter and Saturn it took the “Pale Blue Dot” portrait of Earth in 1990 and crossed the heliopause into interstellar space in August 2012.',
  },
  {
    id: 'voyager2', ...common('voyager2'), name: 'Voyager 2', color: '#80c8f0',
    launched: '20 Aug 1977', massKg: 722, lastContact: null,
    flybys: 'Jupiter (Jul 1979), Saturn (Aug 1981), Uranus (Jan 1986), Neptune (Aug 1989)',
    description: 'The only spacecraft to have visited Uranus and Neptune, completing the Grand Tour of all four giant planets. It entered interstellar space in November 2018.',
  },
  {
    id: 'pioneer10', ...common('pioneer10'), name: 'Pioneer 10', color: '#f2c879',
    launched: '3 Mar 1972', massKg: 258, lastContact: 'Jan 2003',
    flybys: 'Jupiter (Dec 1973)',
    description: 'The first spacecraft to cross the asteroid belt and to fly past Jupiter. It carries the Pioneer plaque. Its last signal arrived in January 2003; the position since then is a JPL prediction.',
  },
  {
    id: 'pioneer11', ...common('pioneer11'), name: 'Pioneer 11', color: '#f0a07c',
    launched: '6 Apr 1973', massKg: 259, lastContact: 'Sep 1995',
    flybys: 'Jupiter (Dec 1974), Saturn (Sep 1979)',
    description: 'Used Jupiter’s gravity to swing across the solar system and became the first spacecraft to fly past Saturn, scouting the route for the Voyagers. Contact was lost in September 1995.',
  },
  {
    id: 'newhorizons', ...common('newhorizons'), name: 'New Horizons', color: '#c6a2f5',
    launched: '19 Jan 2006', massKg: 478, lastContact: null,
    flybys: 'Jupiter (Feb 2007), Pluto (Jul 2015), Arrokoth (Jan 2019)',
    description: 'The fastest spacecraft ever launched from Earth. It made the first flyby of Pluto and Charon on 14 July 2015 and of the Kuiper Belt object Arrokoth on New Year’s Day 2019.',
  },
];
