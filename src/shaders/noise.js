// GLSL noise helpers.
// simplex 3D noise: Ian McEwan, Stefan Gustavson (Ashima Arts), MIT License.

export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p, int octaves){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 9; i++){
    if (i >= octaves) break;
    s += a * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

float ridged(vec3 p, int octaves){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 9; i++){
    if (i >= octaves) break;
    float n = 1.0 - abs(snoise(p));
    s += a * n * n;
    p = p * 2.07 + vec3(4.1, 1.3, 7.7);
    a *= 0.5;
  }
  return s;
}

vec3 hash33(vec3 p){
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yxz + 19.19);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Crater field: returns x = height offset, y = albedo offset
vec2 craters(vec3 p, float density){
  vec3 i = floor(p), f = fract(p);
  vec2 s = vec2(0.0);
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = hash33(i + o);
    if (h.z > density) continue;
    vec3 r = o + h - f;
    float d = length(r);
    float rad = 0.1 + 0.32 * h.x * h.x;
    float t = d / rad;
    if (t > 2.2) continue;
    float bowl = t < 1.0 ? (t * t - 1.0) : 0.0;
    float rim = exp(-pow((t - 1.0) * 5.0, 2.0));
    float ejecta = t > 1.0 ? exp(-(t - 1.0) * 3.0) * 0.25 : 0.0;
    s.x += (bowl * 0.8 + rim * 0.35) * rad;
    s.y += rim * 0.12 + ejecta * h.y * 0.25 - (t < 0.9 ? 0.06 : 0.0);
  }
  return s;
}
`;

export const SRGB = /* glsl */ `
vec3 srgbToLinear(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }
`;
