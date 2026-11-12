// Two-body (Keplerian) helpers shared by planets, satellites and small bodies.

export function wrapPi(x) {
  x = (x + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
}

/** Solve Kepler's equation E − e·sin(E) = M (radians) by Newton iteration. */
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/** Rotate orbital-plane coordinates (x', y') into the J2000 ecliptic frame. */
export function orbitalToEcliptic(xp, yp, { I, Omega, omega }) {
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cO = Math.cos(Omega), sO = Math.sin(Omega);
  const cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp,
  };
}

/** Position from elements, at eccentric anomaly E. */
export function positionFromElements(elems, E) {
  const { a, e } = elems;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return orbitalToEcliptic(xp, yp, elems);
}

