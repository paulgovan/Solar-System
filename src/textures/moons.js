// Procedural surfaces for the major moons (GLSL bake functions, see registerBakeFunction
// in src/textures.js). Longitudes are east-positive with 0° at the sub-planet point,
// so for these tidally locked moons the leading hemisphere is centred on dir = +Z
// (90° W) and the trailing one on −Z. Named features sit at their real coordinates.

import { registerBakeFunction } from '../textures.js';

// Shared helpers (prefixed to avoid clashing with other modules' GLSL).
const HELPERS = /* glsl */ `
vec2 satCraters(vec3 dir, float s, float density){
  return craters(dir * 4.0 * s, density) + craters(dir * 10.0 * s, density + 0.05) * 0.6
       + craters(dir * 24.0 * s, 0.8) * 0.35 + craters(dir * 56.0 * s, 0.8) * 0.2;
}
// Circular basin/crater at (lat0, lon0) with angular radius r (rad): x = floor depth, y = rim
vec2 satBasin(vec3 dir, float lat0, float lon0, float r){
  float d = acos(clamp(dot(dir, dirFromLatLon(lat0, lon0)), -1.0, 1.0)) / r;
  float floorD = 1.0 - smoothstep(0.75, 1.0, d);
  float rim = exp(-pow((d - 1.0) * 6.0, 2.0));
  return vec2(floorD, rim);
}
// Thin wandering lines (lineae, grooves, fractures): 1 on the line, 0 elsewhere
float satLines(vec3 p, float width){
  return 1.0 - smoothstep(0.0, width, abs(snoise(p)));
}
// Generic cratered ice/rock: two albedo endpoints, crater contrast, leading/trailing contrast
vec4 satCratered(vec3 dir, vec3 dark, vec3 bright, float o, float craterK, float lead){
  float n = fbm(dir * 2.2 + o, 6);
  vec2 c = satCraters(dir + o * 0.37, 1.0, 0.62);
  vec3 col = mix(dark, bright, clamp(n * 0.6 + 0.5, 0.0, 1.0));
  col *= 1.0 + lead * dir.z;
  col *= 1.0 + c.y * craterK;
  return vec4(col, clamp(0.5 + c.x * 0.6 + n * 0.1, 0.0, 1.0));
}
`;

const SURFACES = {
  // Io: sulfur plains, red Pele ring, dark paterae, reddish-brown poles
  io: /* glsl */ `
vec4 io(vec3 dir, float lat, float lon){
  vec3 w = vec3(fbm(dir * 2.0 + 3.1, 3), fbm(dir * 2.0 + 7.3, 3), fbm(dir * 2.0 + 1.7, 3));
  float n = fbm(dir * 3.0 + w * 0.6 + 11.0, 6);
  vec3 col = mix(vec3(0.80, 0.72, 0.34), vec3(0.95, 0.90, 0.62), smoothstep(-0.4, 0.5, n));
  col = mix(col, vec3(0.86, 0.58, 0.26), smoothstep(0.15, 0.55, fbm(dir * 4.0 + w, 4)) * 0.6);   // orange flows
  col = mix(col, vec3(0.93, 0.93, 0.86), smoothstep(0.3, 0.6, fbm(dir * 5.0 + 23.0, 4)) * 0.55); // SO2 frost
  float pole = smoothstep(0.55, 0.95, abs(sin(lat)) + 0.1 * n);
  col = mix(col, vec3(0.55, 0.40, 0.28), pole * 0.75);
  // scattered paterae: dark calderas with orange/red halos
  vec3 cell = hash33(floor(dir * 9.0));
  vec3 cp = (floor(dir * 9.0) + 0.2 + 0.6 * cell) / 9.0;
  float dc = length(dir * 1.0 - normalize(cp) * length(dir)) * 9.0;
  float pat = (1.0 - smoothstep(0.05, 0.12 + 0.08 * cell.x, dc)) * step(0.45, cell.y);
  float halo = (1.0 - smoothstep(0.1, 0.45, dc)) * step(0.45, cell.y) * step(0.7, cell.z);
  col = mix(col, vec3(0.75, 0.32, 0.14), halo * 0.55);
  col = mix(col, vec3(0.12, 0.09, 0.07), pat * 0.9);
  // Pele (18.7°S, 255.3°W) red plume ring, Loki (13°N, 309°W) dark patera, Prometheus (1.5°S, 153°W)
  vec2 pele = satBasin(dir, radians(-18.7), radians(104.7), 0.22);
  col = mix(col, vec3(0.70, 0.25, 0.12), clamp(pele.y * 1.4 + pele.x * 0.35, 0.0, 1.0) * 0.8);
  col = mix(col, vec3(0.10, 0.08, 0.06), satBasin(dir, radians(13.0), radians(51.0), 0.07).x);
  col = mix(col, vec3(0.97, 0.95, 0.85), satBasin(dir, radians(-1.5), radians(-153.0), 0.12).y * 0.6);
  return vec4(col, clamp(0.5 + n * 0.08 - pat * 0.1, 0.0, 1.0));
}`,

  // Europa: bright water ice crossed by reddish lineae; trailing hemisphere darker and redder
  europa: /* glsl */ `
vec4 europa(vec3 dir, float lat, float lon){
  float n = fbm(dir * 3.0 + 5.0, 5);
  vec3 col = mix(vec3(0.80, 0.76, 0.68), vec3(0.93, 0.91, 0.86), smoothstep(-0.5, 0.5, n));
  float trail = smoothstep(0.1, -0.8, dir.z);
  col = mix(col, vec3(0.66, 0.54, 0.42), trail * 0.55 * (0.6 + 0.4 * fbm(dir * 6.0, 3)));
  float lines = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec3 q = dir * (1.2 + fi * 0.9) + vec3(fi * 7.1, fi * 3.3, -fi * 5.7);
    lines = max(lines, satLines(q, 0.025 + 0.01 * fi) * (0.55 + 0.45 * smoothstep(-0.2, 0.4, snoise(dir * 2.0 + fi))));
  }
  col = mix(col, vec3(0.52, 0.34, 0.22), lines * 0.75);
  // chaos terrain (Conamara-like mottling) and the young crater Pwyll (25°S, 271°W)
  float chaos = smoothstep(0.35, 0.6, fbm(dir * 7.0 + 2.0, 4));
  col = mix(col, vec3(0.62, 0.48, 0.38), chaos * 0.45);
  vec2 pw = satBasin(dir, radians(-25.0), radians(89.0), 0.05);
  col = mix(col, vec3(0.97, 0.97, 0.95), clamp(pw.y + satBasin(dir, radians(-25.0), radians(89.0), 0.25).x * 0.25, 0.0, 1.0) * 0.7);
  return vec4(col, clamp(0.5 + lines * 0.06 - chaos * 0.04, 0.0, 1.0));
}`,

  // Ganymede: dark ancient regions (Galileo Regio) and bright grooved terrain; frosty poles
  ganymede: /* glsl */ `
vec4 ganymede(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.6 + 9.0, 6);
  float darkReg = smoothstep(0.05, 0.25, fbm(dir * 1.3 + 2.4, 5) + 0.35 * spot(lat, lon, radians(35.0), radians(-145.0), 0.9, 0.6));
  vec3 brightT = mix(vec3(0.58, 0.55, 0.50), vec3(0.72, 0.69, 0.64), n * 0.5 + 0.5);
  vec3 darkT = mix(vec3(0.30, 0.27, 0.23), vec3(0.42, 0.38, 0.33), n * 0.5 + 0.5);
  float grooves = satLines(dir * 9.0 + vec3(fbm(dir * 3.0, 3)) * 2.0, 0.18) * (1.0 - darkReg);
  vec3 col = mix(brightT, darkT, darkReg);
  col *= 1.0 + grooves * 0.12;
  vec2 c = satCraters(dir + 1.3, 1.0, 0.72);
  col *= 1.0 + c.y * 0.7;
  float cap = smoothstep(0.6, 0.85, abs(sin(lat)) + 0.08 * n);
  col = mix(col, vec3(0.82, 0.82, 0.82), cap * 0.6);
  return vec4(col, clamp(0.5 + c.x * 0.5 + grooves * 0.05, 0.0, 1.0));
}`,

  // Callisto: dark, saturated with bright craters; Valhalla multi-ring basin (14°N, 56°W)
  callisto: /* glsl */ `
vec4 callisto(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.8 + 4.0, 6);
  vec3 col = mix(vec3(0.24, 0.21, 0.18), vec3(0.36, 0.32, 0.27), n * 0.5 + 0.5);
  vec2 c = satCraters(dir + 2.7, 1.3, 0.55);
  col *= 1.0 + max(c.y, 0.0) * 2.4 + min(c.y, 0.0) * 0.5;
  // bright speckle of fresh crater ejecta
  float fresh = pow(max(fbm(dir * 60.0, 2), 0.0), 3.0) * 3.0;
  col += vec3(0.25) * fresh;
  vec3 vd = dirFromLatLon(radians(14.0), radians(-56.0));
  float d = acos(clamp(dot(dir, vd), -1.0, 1.0));
  float rings = (0.5 + 0.5 * cos(d * 70.0)) * smoothstep(0.75, 0.15, d);
  col = mix(col, vec3(0.62, 0.58, 0.52), (1.0 - smoothstep(0.05, 0.12, d)) * 0.8 + rings * 0.18);
  return vec4(col, clamp(0.5 + c.x * 0.6 + n * 0.1, 0.0, 1.0));
}`,

  // Titan: surface under the haze — Xanadu bright (10°S, 100°W), dark equatorial dune seas,
  // northern lakes — kept low-contrast and orange; the atmosphere shell supplies the haze.
  titan: /* glsl */ `
vec4 titan(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.5 + 3.0, 6);
  vec3 col = mix(vec3(0.62, 0.42, 0.20), vec3(0.78, 0.56, 0.28), n * 0.5 + 0.5);
  float dunes = smoothstep(0.55, 0.0, abs(lat) / radians(30.0)) * smoothstep(-0.1, 0.3, fbm(dir * 2.0 + 8.0, 5));
  col = mix(col, vec3(0.40, 0.25, 0.12), dunes * 0.5);
  float xanadu = spot(lat, lon, radians(-10.0), radians(-100.0), 0.75, 0.38) * smoothstep(-0.3, 0.2, fbm(dir * 4.0, 3));
  col = mix(col, vec3(0.88, 0.70, 0.42), xanadu * 0.6);
  float lakes = smoothstep(radians(60.0), radians(75.0), lat) * smoothstep(0.1, 0.3, fbm(dir * 6.0 + 1.0, 4));
  col = mix(col, vec3(0.28, 0.18, 0.10), lakes * 0.6);
  return vec4(col, 0.5);
}`,

  // Enceladus: brightest body in the solar system; blue-white "tiger stripes" at the south pole
  enceladus: /* glsl */ `
vec4 enceladus(vec3 dir, float lat, float lon){
  float n = fbm(dir * 3.0 + 6.0, 5);
  vec3 col = mix(vec3(0.88, 0.90, 0.92), vec3(0.98, 0.98, 0.99), n * 0.5 + 0.5);
  vec2 c = satCraters(dir + 5.5, 1.2, 0.6);
  float north = smoothstep(-0.2, 0.5, sin(lat)); // cratered north, smooth young south
  col *= 1.0 + c.y * 0.35 * north;
  float spole = smoothstep(radians(-55.0), radians(-70.0), lat);
  float stripes = (1.0 - smoothstep(0.0, 0.12, abs(sin(dir.x * 22.0 + dir.z * 9.0 + fbm(dir * 4.0, 3) * 1.5)))) * spole;
  col = mix(col, vec3(0.62, 0.78, 0.88), stripes * 0.75);
  float fract = satLines(dir * 5.0 + 3.0, 0.03) * (1.0 - north);
  col = mix(col, vec3(0.75, 0.82, 0.88), fract * 0.4);
  return vec4(col, clamp(0.5 + c.x * 0.4 * north - stripes * 0.08, 0.0, 1.0));
}`,

  // Mimas: heavily cratered, dominated by Herschel (1.7°S, 111.8°W)
  mimas: /* glsl */ `
vec4 mimas(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.55, 0.54, 0.52), vec3(0.78, 0.77, 0.75), 2.0, 1.1, 0.0);
  vec2 h = satBasin(dir, radians(-1.7), radians(-111.8), 0.36);
  vec2 peak = satBasin(dir, radians(-1.7), radians(-111.8), 0.05);
  s.rgb *= 1.0 - h.x * 0.2 + h.y * 0.25 + peak.x * 0.25;
  s.a = clamp(s.a - h.x * 0.35 + h.y * 0.3 + peak.x * 0.3, 0.0, 1.0);
  return s;
}`,

  // Tethys: bright ice; Odysseus (32.8°N, 128.9°W) and the Ithaca Chasma canyon
  tethys: /* glsl */ `
vec4 tethys(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.70, 0.70, 0.69), vec3(0.90, 0.90, 0.89), 7.0, 0.8, -0.06);
  vec2 o = satBasin(dir, radians(32.8), radians(-128.9), 0.42);
  s.rgb *= 1.0 - o.x * 0.08 + o.y * 0.12;
  // Ithaca Chasma: a great circle roughly perpendicular to the direction of Odysseus
  vec3 axis = dirFromLatLon(radians(32.8), radians(-128.9));
  float ch = 1.0 - smoothstep(0.0, 0.05, abs(dot(dir, axis)) + 0.02 * snoise(dir * 8.0));
  s.rgb *= 1.0 - ch * 0.18;
  s.a = clamp(s.a - o.x * 0.25 + o.y * 0.2 - ch * 0.25, 0.0, 1.0);
  return s;
}`,

  // Dione: cratered leading hemisphere, bright wispy fractures on the trailing side
  dione: /* glsl */ `
vec4 dione(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.58, 0.58, 0.58), vec3(0.80, 0.80, 0.79), 4.0, 0.9, 0.08);
  float trail = smoothstep(0.0, -0.7, dir.z);
  s.rgb *= 1.0 - trail * 0.18;
  float wisps = max(satLines(dir * 4.0 + 9.0, 0.06), satLines(dir * 7.0 + 2.0, 0.05) * 0.7) * trail;
  s.rgb = mix(s.rgb, vec3(0.93, 0.93, 0.93), wisps * 0.8);
  return s;
}`,

  // Rhea: heavily cratered ice, fainter trailing-side wisps
  rhea: /* glsl */ `
vec4 rhea(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.60, 0.59, 0.57), vec3(0.82, 0.81, 0.79), 1.0, 1.1, 0.05);
  float trail = smoothstep(0.0, -0.7, dir.z);
  float wisps = satLines(dir * 3.5 + 4.0, 0.05) * trail;
  s.rgb = mix(s.rgb * (1.0 - trail * 0.12), vec3(0.9), wisps * 0.6);
  return s;
}`,

  // Iapetus: coal-dark leading hemisphere (Cassini Regio), bright trailing side and poles
  iapetus: /* glsl */ `
vec4 iapetus(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.62, 0.60, 0.55), vec3(0.85, 0.83, 0.78), 6.0, 0.7, 0.0);
  float lead = dir.z + 0.25 * fbm(dir * 4.0 + 2.0, 4) - 0.35 * pow(abs(sin(lat)), 2.0);
  float dark = smoothstep(0.05, 0.3, lead);
  s.rgb = mix(s.rgb, vec3(0.16, 0.10, 0.06) * (1.0 + 0.3 * fbm(dir * 10.0, 3)), dark);
  float ridge = exp(-pow(lat / radians(1.2), 2.0)) * smoothstep(-0.2, 0.4, dir.z);
  s.a = clamp(s.a + ridge * 0.4, 0.0, 1.0);
  return s;
}`,

  // Miranda: patchwork of cratered terrain and grooved "coronae" (chevrons)
  miranda: /* glsl */ `
vec4 miranda(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.50, 0.50, 0.50), vec3(0.72, 0.72, 0.71), 3.0, 0.9, 0.0);
  float corona = max(max(spot(lat, lon, radians(-40.0), radians(0.0), 0.6, 0.5),
                         spot(lat, lon, radians(-35.0), radians(-90.0), 0.55, 0.5)),
                     spot(lat, lon, radians(-30.0), radians(110.0), 0.6, 0.5));
  float bands = 0.5 + 0.5 * sin(length(dir.xz - vec2(0.4, 0.2)) * 60.0 + fbm(dir * 3.0, 3) * 3.0);
  s.rgb = mix(s.rgb, mix(vec3(0.42), vec3(0.80), bands), corona * 0.8);
  s.a = clamp(s.a + (bands - 0.5) * 0.25 * corona, 0.0, 1.0);
  return s;
}`,

  // Ariel: bright, young surface cut by canyons
  ariel: /* glsl */ `
vec4 ariel(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.55, 0.55, 0.56), vec3(0.75, 0.75, 0.76), 8.0, 0.7, 0.0);
  float can = satLines(dir * 2.5 + 1.0, 0.04);
  s.rgb *= 1.0 - can * 0.25;
  s.a = clamp(s.a - can * 0.3, 0.0, 1.0);
  return s;
}`,

  // Umbriel: dark and uniform, with the bright ring Wunda (7.9°S, 273.6°E)
  umbriel: /* glsl */ `
vec4 umbriel(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.24, 0.24, 0.24), vec3(0.34, 0.34, 0.34), 5.0, 0.8, 0.0);
  vec2 w = satBasin(dir, radians(-7.9), radians(-86.4), 0.09);
  s.rgb = mix(s.rgb, vec3(0.72, 0.72, 0.70), w.y * 0.9);
  return s;
}`,

  // Titania: grey ice with large fault canyons (Messina Chasmata)
  titania: /* glsl */ `
vec4 titania(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.44, 0.43, 0.42), vec3(0.66, 0.64, 0.62), 9.0, 0.8, 0.0);
  float can = satLines(dir * 1.8 + 6.0, 0.035);
  s.rgb *= 1.0 - can * 0.3;
  s.a = clamp(s.a - can * 0.35, 0.0, 1.0);
  return s;
}`,

  // Oberon: old, reddish-grey, craters with dark floors
  oberon: /* glsl */ `
vec4 oberon(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.2 + 10.0, 6);
  vec2 c = satCraters(dir + 10.0, 1.0, 0.6);
  vec3 col = mix(vec3(0.38, 0.34, 0.31), vec3(0.58, 0.53, 0.48), n * 0.6 + 0.5);
  col *= 1.0 + c.y * 0.9 - max(-c.x, 0.0) * 0.6;
  return vec4(col, clamp(0.5 + c.x * 0.6 + n * 0.1, 0.0, 1.0));
}`,

  // Triton: pinkish nitrogen-ice south polar cap with dark plume streaks, "cantaloupe" terrain
  triton: /* glsl */ `
vec4 triton(vec3 dir, float lat, float lon){
  float n = fbm(dir * 3.0 + 12.0, 5);
  vec3 col = mix(vec3(0.62, 0.64, 0.58), vec3(0.76, 0.76, 0.70), n * 0.5 + 0.5);
  float dimples = 0.5 + 0.5 * cos(length(fract(dir * 18.0 + 0.3 * snoise(dir * 6.0)) - 0.5) * 9.0);
  col *= 1.0 + smoothstep(0.0, 0.3, sin(lat)) * (dimples - 0.5) * 0.12;
  float cap = smoothstep(radians(-5.0), radians(-25.0), lat + 0.15 * fbm(dir * 3.0, 3));
  col = mix(col, vec3(0.92, 0.82, 0.76), cap);
  float streaks = smoothstep(0.55, 0.8, fbm(dir * vec3(14.0, 3.0, 14.0) + 3.0, 3)) * cap;
  col = mix(col, vec3(0.35, 0.28, 0.25), streaks * 0.7);
  return vec4(col, clamp(0.5 + (dimples - 0.5) * 0.1, 0.0, 1.0));
}`,

  // Charon: grey water ice with the dark red polar cap Mordor Macula
  charon: /* glsl */ `
vec4 charon(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.46, 0.46, 0.46), vec3(0.64, 0.63, 0.62), 11.0, 0.7, 0.0);
  float mordor = smoothstep(radians(55.0), radians(75.0), lat + 0.1 * fbm(dir * 3.0, 3));
  s.rgb = mix(s.rgb, vec3(0.36, 0.18, 0.12), mordor * 0.85);
  float belt = exp(-pow((lat - radians(5.0)) / radians(10.0), 2.0)) * satLines(dir * 2.0, 0.08);
  s.rgb *= 1.0 - belt * 0.2;
  return s;
}`,

  // Phobos: dark carbonaceous rock, parallel grooves, Stickney crater (1°S, 49°W)
  phobos: /* glsl */ `
vec4 phobos(vec3 dir, float lat, float lon){
  vec4 s = satCratered(dir, vec3(0.17, 0.15, 0.13), vec3(0.28, 0.25, 0.22), 13.0, 1.0, 0.0);
  float grooves = (1.0 - smoothstep(0.0, 0.15, abs(sin(dir.y * 40.0 + dir.z * 10.0 + snoise(dir * 3.0))))) * smoothstep(-0.4, 0.4, -dir.z);
  s.rgb *= 1.0 - grooves * 0.15;
  vec2 st = satBasin(dir, radians(-1.0), radians(-49.0), 0.42);
  s.rgb *= 1.0 - st.x * 0.12 + st.y * 0.2;
  s.a = clamp(s.a - st.x * 0.4 + st.y * 0.3 - grooves * 0.1, 0.0, 1.0);
  return s;
}`,

  // Deimos: smooth, dust-mantled
  deimos: /* glsl */ `
vec4 deimos(vec3 dir, float lat, float lon){
  float n = fbm(dir * 2.0 + 14.0, 5);
  vec2 c = satCraters(dir + 14.0, 0.8, 0.5);
  vec3 col = mix(vec3(0.20, 0.18, 0.16), vec3(0.32, 0.29, 0.26), n * 0.5 + 0.5);
  col *= 1.0 + c.y * 0.4;
  return vec4(col, clamp(0.5 + c.x * 0.3 + n * 0.15, 0.0, 1.0));
}`,
};

let first = true;
for (const [name, glsl] of Object.entries(SURFACES)) {
  registerBakeFunction(name, first ? HELPERS + glsl : glsl);
  first = false;
}

export const MOON_SURFACES = Object.keys(SURFACES);
