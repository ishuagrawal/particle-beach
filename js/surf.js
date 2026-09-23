// Surf: a train of swells that shoal, break on the bar, roll in as whitewater
// and run up the beach face as swash, plus wind chop. The same model runs in
// GLSL (for every speck of water) and here in JS (for anything that rides or
// floats on it), so the two stay in step. Hashes use integer maths so both
// sides agree bit for bit.
import { shoreZ } from './site.js';

export const SURF = { P: 10.5, LIFE: 38, S0: 260, K: 0.05 };

export function hashU(n) {
  let x = ((n | 0) + 100000) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295; // ^= leaves a signed int: read it back unsigned, as the GPU does
}

const modp = (a, b) => a - b * Math.floor(a / b);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

// Sets: every seventh wave or so the swell builds for a few waves, from
// waist high to head high, and every couple of minutes a bigger set rolls
// through: four overhead waves, breaking far out and surging high up the sand.
const BIG = [0.9, 1.4, 1.75, 1.5];
const A_MAX = 3.6;
export function bigSet(n) {
  const m = Math.floor((n + 3) / 14);
  const k = n + 3 - m * 14;
  return k < 4 && hashU(m * 7 + 5) < 0.75 ? BIG[k] * (0.85 + 0.3 * hashU(n * 5 + 2)) : 0;
}
export function waveAmp(n) {
  const c = 0.5 + 0.5 * Math.cos((6.2831853 * modp(n, 7)) / 7);
  return Math.min(A_MAX, 0.55 + 1.05 * c * c * (0.75 + 0.5 * hashU(n * 3 + 1)) + bigSet(n));
}
/** How far wave n's swash runs up the beach face (m above the waterline). */
export function swashReach(x, n) {
  const A = waveAmp(n);
  return 3 + 4.2 * Math.min(A, 1.9) * (0.75 + 0.5 * hashU(n * 3 + 3)) + 2.2 * Math.max(A - 1.9, 0) + 0.8 * Math.sin(x * 0.05 + modp(n, 29));
}

// How far a crest lags (+) or leads (−) the mean along the beach.
export function waveOff(x, n) {
  const xo = 40 + 160 * (hashU(n * 3 + 2) - 0.5);
  const m = modp(n, 37);
  return SURF.K * (x - xo) + 5 * Math.sin(x * 0.015 + m * 1.7) + 2.5 * Math.sin(x * 0.041 - m * 0.9);
}

// Distance offshore where a wave of amplitude A breaks: bigger waves break
// further out, and the bar by the pier holds the break wider.
export function breakDist(x, A) {
  const q = (x - 150) / 45;
  return 22 + 21 * A + 7 * Math.sin(x * 0.021 + 1.3) + 8 * Math.exp(-q * q);
}

/** How far a wave travels while its lip pitches and lands: longer for bigger waves. */
export const breakLen = (A) => 6 + 3 * A;

export function pathS(u) {
  const v = 1 - u;
  return SURF.S0 * v * (0.35 + 0.65 * v);
}

/** Height, whitewater (0–1) and d(height)/dz of the swell train at (x, z). */
export function surfAt(x, z, t) {
  const sh = shoreZ(x);
  const n0 = Math.floor(t / SURF.P);
  let h = 0;
  let foam = 0;
  let dhdz = 0;
  for (let k = 0; k < 4; k++) {
    const n = n0 - k;
    const u = (t - n * SURF.P) / SURF.LIFE;
    if (u > 1.25) continue;
    const A = waveAmp(n);
    const s = pathS(u) + waveOff(x, n);
    const sb = breakDist(x, A);
    const lb = breakLen(A);
    const dz = z - (sh - s);
    const mass = 0.8 + 0.2 * A; // bigger swells carry more water behind the crest
    let H, wf, wb, white;
    if (s > sb) {
      const g = smoothstep(sb + 60, sb, s);
      H = A * 0.5 * (1 + 0.9 * g);
      wf = mix(5, 1.8, g);
      wb = mix(8, 5, g) * mass;
      white = 0;
    } else if (s > sb - lb) {
      const q = (sb - s) / lb;
      H = A * 0.95 * (1 - 0.7 * q);
      wf = mix(1.5, 1.0, q);
      wb = 4.5 * mass;
      white = smoothstep(0, 0.3, q);
    } else {
      const r = Math.min(1, Math.max(0, s / Math.max(sb - lb, 1)));
      H = A * (0.07 + 0.215 * Math.sqrt(r)) * smoothstep(-6, 0, s);
      wf = 0.9;
      wb = 4 * mass;
      white = 1;
    }
    const w = dz > 0 ? wf : wb;
    const e = Math.exp((-dz * dz) / (2 * w * w));
    const fade = smoothstep(0, 0.1, u) * (1 - smoothstep(1, 1.25, u));
    h += H * e * fade;
    dhdz += ((-dz / (w * w)) * H * e) * fade;
    const carpet = dz < 0.5 ? Math.exp(-Math.max(-dz, 0) / (3 + 7 * A)) : Math.exp(-dz * dz * 2);
    foam = Math.max(foam, white * carpet * fade);
  }
  return { h, foam, dhdz };
}

// Wind chop: short swell trains, flattened in the shallows.
const CHOP = [
  [0.1, 1, 0.16, 21, 0.0],
  [-0.4, 1, 0.1, 12.5, 1.7],
  [0.55, 1, 0.06, 7.2, 4.1],
  [-0.15, 1, 0.035, 4.1, 2.3],
  [0.95, 0.5, 0.025, 2.6, 5.5],
].map(([dx, dz, A, L, P]) => {
  const l = Math.hypot(dx, dz);
  const k = (2 * Math.PI) / L;
  return { dx: dx / l, dz: dz / l, A, k, w: Math.sqrt(9.81 * k) * 0.8, P };
});

export const chopAtten = (x, z) => 0.15 + 0.85 * smoothstep(0, 40, shoreZ(x) - z);

export function chopAt(x, z, t) {
  let h = 0;
  for (const c of CHOP) h += c.A * Math.sin(c.k * (c.dx * x + c.dz * z) - c.w * t + c.P);
  return h * chopAtten(x, z);
}

export const seaHeight = (x, z, t) => surfAt(x, z, t).h + chopAt(x, z, t);

/** Where wave n's crest sits at x and time t, and whether it has broken there. */
export function crestInfo(x, n, t) {
  const u = (t - n * SURF.P) / SURF.LIFE;
  const A = waveAmp(n);
  const s = pathS(u) + waveOff(x, n);
  return { z: shoreZ(x) - s, s, u, A, broken: s < breakDist(x, A) };
}

/** How far up the beach face the swash reaches at x right now (m above the waterline; <0 when none). */
export function swashFront(x, t) {
  const nS = Math.floor((t - SURF.LIFE) / SURF.P);
  let front = -1;
  for (let k = -1; k < 3; k++) {
    const sw = swashOf(x, nS - k, t);
    if (sw.tau >= 0 && sw.tau < 10) front = Math.max(front, sw.front);
  }
  return front;
}

/**
 * Someone near the water stepping up the sand when a set surges in, and
 * drifting back down after it drains. Call every frame with where they would
 * stand (d metres above the waterline); returns how far up they have moved
 * and how fast they are going.
 */
export function dodger() {
  const st = { lift: 0, v: 0 };
  return (x, d, t, dt) => {
    const target = Math.max(0, swashFront(x, t) + 0.9 - d);
    const prev = st.lift;
    st.lift += (target - st.lift) * (1 - Math.exp(-dt * (target > st.lift ? 3.2 : 0.5)));
    st.v = (st.lift - prev) / Math.max(dt, 1e-3);
    return st;
  };
}

/** Front of wave n's swash up the beach face (m above the waterline) and time since it landed. */
export function swashOf(x, n, t) {
  const tau = t - n * SURF.P - SURF.LIFE * (1 + waveOff(x, n) / (0.35 * SURF.S0));
  const R = swashReach(x, n);
  const up = 3.2;
  const f = tau < 0 ? -1 : tau < up ? R * Math.sin((1.5707963 * tau) / up) : R * (1 - smoothstep(up, up + 6.5, tau));
  return { front: f, tau };
}

const f5 = (n) => n.toFixed(5);

export const SURF_GLSL = /* glsl */ `
const float SURF_P = ${SURF.P.toFixed(2)};
const float SURF_LIFE = ${SURF.LIFE.toFixed(2)};
const float SURF_S0 = ${SURF.S0.toFixed(2)};
const float SURF_K = ${SURF.K.toFixed(3)};
float hashU(float n) {
  uint x = uint(int(n) + 100000);
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return float(x) / 4294967295.0;
}
float modp(float a, float b) { return a - b * floor(a / b); }
float bigSet(float n) {
  float m = floor((n + 3.0) / 14.0);
  float k = n + 3.0 - m * 14.0;
  if (k > 3.5 || hashU(m * 7.0 + 5.0) >= 0.75) return 0.0;
  return (k < 0.5 ? ${BIG[0].toFixed(2)} : k < 1.5 ? ${BIG[1].toFixed(2)} : k < 2.5 ? ${BIG[2].toFixed(2)} : ${BIG[3].toFixed(2)}) * (0.85 + 0.3 * hashU(n * 5.0 + 2.0));
}
float waveAmp(float n) { float c = 0.5 + 0.5 * cos(6.2831853 * modp(n, 7.0) / 7.0); return min(${A_MAX.toFixed(2)}, 0.55 + 1.05 * c * c * (0.75 + 0.5 * hashU(n * 3.0 + 1.0)) + bigSet(n)); }
float swashReach(float x, float n) {
  float A = waveAmp(n);
  return 3.0 + 4.2 * min(A, 1.9) * (0.75 + 0.5 * hashU(n * 3.0 + 3.0)) + 2.2 * max(A - 1.9, 0.0) + 0.8 * sin(x * 0.05 + modp(n, 29.0));
}
float waveOff(float x, float n) {
  float xo = 40.0 + 160.0 * (hashU(n * 3.0 + 2.0) - 0.5); float m = modp(n, 37.0);
  return SURF_K * (x - xo) + 5.0 * sin(x * 0.015 + m * 1.7) + 2.5 * sin(x * 0.041 - m * 0.9);
}
float breakDist(float x, float A) { float q = (x - 150.0) / 45.0; return 22.0 + 21.0 * A + 7.0 * sin(x * 0.021 + 1.3) + 8.0 * exp(-q * q); }
float breakLen(float A) { return 6.0 + 3.0 * A; }
float pathS(float u) { float v = 1.0 - u; return SURF_S0 * v * (0.35 + 0.65 * v); }
// the inverse: the age u at which a crest has s metres left to run (s > -12)
float uAtS(float s) { return 1.0 - (-0.35 + sqrt(max(0.1225 + 2.6 * s / SURF_S0, 0.0))) / 1.3; }
// x: height, y: whitewater, z: d(height)/dz
vec3 surf(vec2 p, float t) {
  float sh = shoreZ(p.x);
  float n0 = floor(t / SURF_P);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float n = n0 - float(k);
    float u = (t - n * SURF_P) / SURF_LIFE;
    if (u > 1.25) continue;
    float A = waveAmp(n);
    float s = pathS(u) + waveOff(p.x, n);
    float sb = breakDist(p.x, A);
    float lb = breakLen(A);
    float dz = p.y - (sh - s);
    float mass = 0.8 + 0.2 * A;
    float H; float wf; float wb; float white;
    if (s > sb) {
      float g = smoothstep(sb + 60.0, sb, s);
      H = A * 0.5 * (1.0 + 0.9 * g); wf = mix(5.0, 1.8, g); wb = mix(8.0, 5.0, g) * mass; white = 0.0;
    } else if (s > sb - lb) {
      float q = (sb - s) / lb;
      H = A * 0.95 * (1.0 - 0.7 * q); wf = mix(1.5, 1.0, q); wb = 4.5 * mass; white = smoothstep(0.0, 0.3, q);
    } else {
      float r = clamp(s / max(sb - lb, 1.0), 0.0, 1.0);
      H = A * (0.07 + 0.215 * sqrt(r)) * smoothstep(-6.0, 0.0, s); wf = 0.9; wb = 4.0 * mass; white = 1.0;
    }
    float w = dz > 0.0 ? wf : wb;
    float e = exp(-dz * dz / (2.0 * w * w));
    float fade = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(1.0, 1.25, u));
    acc.x += H * e * fade;
    acc.z += -dz / (w * w) * H * e * fade;
    float carpet = dz < 0.5 ? exp(-max(-dz, 0.0) / (3.0 + 7.0 * A)) : exp(-dz * dz * 2.0);
    acc.y = max(acc.y, white * carpet * fade);
  }
  return acc;
}
vec2 swashOf(float x, float n, float t) {
  float tau = t - n * SURF_P - SURF_LIFE * (1.0 + waveOff(x, n) / (0.35 * SURF_S0));
  float R = swashReach(x, n);
  float up = 3.2;
  float f = tau < 0.0 ? -1.0 : (tau < up ? R * sin(1.5707963 * tau / up) : R * (1.0 - smoothstep(up, up + 6.5, tau)));
  return vec2(f, tau);
}
float chopAtten(vec2 p) { return 0.15 + 0.85 * smoothstep(0.0, 40.0, shoreZ(p.x) - p.y); }
float chop(vec2 p, float t, out vec2 g) {
  float h = 0.0; float a; g = vec2(0.0);
${CHOP.map(
  (c) => `  a = ${f5(c.k)} * dot(vec2(${f5(c.dx)}, ${f5(c.dz)}), p) - ${f5(c.w)} * t + ${f5(c.P)};
  h += ${f5(c.A)} * sin(a); g += ${f5(c.A * c.k)} * cos(a) * vec2(${f5(c.dx)}, ${f5(c.dz)});`
).join('\n')}
  float at = chopAtten(p);
  g *= at;
  return h * at;
}`;
