// Spacecraft trajectories sampled from JPL Horizons (see scripts/fetch-horizons.mjs).
//
// Data (src/data/spacecraft/<id>.json):
//   t0                 TDB Julian Date of the first sample; all times are days after t0
//   end                last sample time
//   t, p               heliocentric knots (J2000 ecliptic, AU)
//   encounters[]       { body, t, p, fadeIn, fadeOut }: planet-centred knots around a
//                      flyby (or Earth departure)
//
// Inside an encounter window the heliocentric position is rebuilt as
// planet(app ephemeris) + planet-relative offset, so the spacecraft passes the planet
// the app draws at the true distance and on the true side, even though the app's
// planet positions are approximate. Near the window edges this fades back to the
// heliocentric track.

import { createTrack, trackPosition } from './samples.js';
import { jdTDB } from './smallBody.js';

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function createTrajectory(data) {
  return {
    id: data.id,
    t0: data.t0,
    end: data.end,
    helio: createTrack(data.t, data.p),
    encounters: data.encounters.map((e) => ({
      body: e.body,
      track: createTrack(e.t, e.p),
      start: e.t[0],
      end: e.t[e.t.length - 1],
      fadeIn: e.fadeIn,
      fadeOut: e.fadeOut,
    })),
  };
}

/** First and last UTC-ish Julian Dates covered (TDB; the ~1 min difference is irrelevant here). */
export function trajectoryRange(traj) {
  return [traj.t0, traj.t0 + traj.end];
}

/** Days after t0 for a UTC Julian Date. */
export const trajectoryDay = (traj, jdUTC) => jdTDB(jdUTC) - traj.t0;

/** The encounter active at day d (or null) and its fade weight 0…1. */
export function encounterAt(traj, d) {
  for (const e of traj.encounters) {
    if (d < e.start || d > e.end) continue;
    const wIn = e.fadeIn > 0 ? smooth((d - e.start) / e.fadeIn) : 1;
    const wOut = e.fadeOut > 0 ? smooth((e.end - d) / e.fadeOut) : 1;
    return { enc: e, weight: Math.min(wIn, wOut) };
  }
  return null;
}

/**
 * Full state at day d: { au (heliocentric, AU), helio, enc, weight, rel }.
 * `planetAU(id)` returns the app's heliocentric position of a planet at the same time.
 */
export function trajectoryState(traj, d, planetAU, out = {}) {
  const helio = trackPosition(traj.helio, d, out.helio || {});
  out.helio = helio;
  const hit = encounterAt(traj, d);
  if (!hit || hit.weight <= 0) {
    out.au = { x: helio.x, y: helio.y, z: helio.z };
    out.enc = null; out.weight = 0; out.rel = null;
    return out;
  }
  const rel = trackPosition(hit.enc.track, d, out.relBuf || (out.relBuf = {}));
  const pl = planetAU(hit.enc.body);
  const w = hit.weight;
  out.au = {
    x: helio.x + (pl.x + rel.x - helio.x) * w,
    y: helio.y + (pl.y + rel.y - helio.y) * w,
    z: helio.z + (pl.z + rel.z - helio.z) * w,
  };
  out.enc = hit.enc; out.weight = w; out.rel = { x: rel.x, y: rel.y, z: rel.z };
  return out;
}

/** Heliocentric velocity (AU/day) from the heliocentric track. */
export function trajectoryVelocity(traj, d, h = 0.05) {
  const a = trackPosition(traj.helio, d - h, {}), b = trackPosition(traj.helio, d + h, {});
  return { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h), z: (b.z - a.z) / (2 * h) };
}

/** Planet-relative velocity (AU/day) during an encounter. */
export function encounterVelocity(enc, d, h = 0.002) {
  const a = trackPosition(enc.track, d - h, {}), b = trackPosition(enc.track, d + h, {});
  return { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h), z: (b.z - a.z) / (2 * h) };
}
