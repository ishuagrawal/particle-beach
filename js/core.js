// Shared uniforms, seeded randomness, and the glowing-speck point material that
// every layer of the scene is drawn with. Invisible occluder meshes give the
// specks depth: a pier deck hides the sunset behind it, hills hide the stars.
import * as THREE from 'three';
import { SAND_GLSL, PIER_GLSL } from './site.js';
import { SURF_GLSL } from './surf.js';

export const QUALITY = (() => {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  return small || cores <= 4 ? 0.55 : 1;
})();

const col = () => new THREE.Color();
const vec = (x = 0, y = 1, z = 0) => new THREE.Vector3(x, y, z);

// One set of uniform objects shared by reference across all materials, so the
// time-of-day system updates every layer by writing here once per frame.
export const U = {
  uTime: { value: 0 },
  uHour: { value: 12 }, // beach-local clock hour, for schedules
  uPR: { value: 1 },
  uScale: { value: 900 },
  uFogColor: { value: col() },
  uFogNear: { value: 160 },
  uFogFar: { value: 2600 },
  uSunDir: { value: vec() },
  uMoonDir: { value: vec(0, -1, 0) },
  uSunColor: { value: col() },
  uMoonColor: { value: new THREE.Color(0.66, 0.74, 1.0) },
  uSkyTop: { value: col() },
  uSkyHorizon: { value: col() },
  uSkyAnti: { value: col() },
  uAmb: { value: col() },
  uGlow: { value: col() },
  uWaterDeep: { value: col() },
  uWaterLit: { value: col() },
  uSand: { value: col() },
  uFoam: { value: col() },
  uLeaf: { value: col() },
  uDay: { value: 1 },
  uStars: { value: 0 },
  uBio: { value: 0 },
  uLights: { value: 0 },
  uHaze: { value: 0.3 },
  uSunVis: { value: 1 },
  uMoonVis: { value: 0 },
  uMoonLit: { value: 0.5 },
  uBg: { value: 0.5 },
  uWheelCol: { value: col() },
  uOpen: { value: 1 }, // Pacific Park rides running
};

export function rng(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.gauss = () => {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
  return r;
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 1 inside the daily window [start, end] (hours, may wrap midnight), eased at the edges. */
export function presence(hour, start, end, fade = 0.5) {
  const len = (end - start + 24) % 24;
  const x = (hour - start + 24) % 24;
  return smoothstep(0, fade, x) * (1 - smoothstep(len - fade, len, x));
}

export const GLSL_COMMON = /* glsl */ `
uniform float uTime; uniform float uHour; uniform float uPR; uniform float uScale;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uSunColor; uniform vec3 uMoonColor;
uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uSkyAnti; uniform vec3 uAmb; uniform vec3 uGlow;
uniform vec3 uWaterDeep; uniform vec3 uWaterLit; uniform vec3 uSand; uniform vec3 uFoam; uniform vec3 uLeaf;
uniform float uDay; uniform float uStars; uniform float uBio; uniform float uLights; uniform float uHaze;
uniform float uSunVis; uniform float uMoonVis; uniform float uMoonLit; uniform float uBg;
uniform vec3 uWheelCol; uniform float uOpen;
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p), q = fract(p); vec2 u = q * q * (3.0 - 2.0 * q);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float presence(float h, float a, float b, float f) {
  float len = mod(b - a + 24.0, 24.0);
  float x = mod(h - a + 24.0, 24.0);
  return smoothstep(0.0, f, x) * (1.0 - smoothstep(len - f, len, x));
}
${SAND_GLSL}
${PIER_GLSL}
${SURF_GLSL}
// Light arriving at a surface with normal n: sun, moon and sky. wrap softens the terminator.
vec3 lightAt(vec3 n, float wrap) {
  float sd = clamp((dot(n, uSunDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  float md = clamp((dot(n, uMoonDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  return uSunColor * sd * uSunVis + uMoonColor * md * uMoonVis * uMoonLit * 0.2 + uAmb * (0.5 + 0.35 * n.y);
}
// After dark: lamp light along the pier and the wheel's LEDs spilling onto nearby things.
vec3 pierGlow(vec3 p) {
  float dx = max(abs(p.x - PIER_X) - PIER_HALF, 0.0);
  float dz = max(max(p.z - PIER_LAND, PIER_END - p.z), 0.0);
  float dy = p.y - PIER_DECK - 3.0;
  vec3 lamps = vec3(1.0, 0.7, 0.4) * uLights * 0.55 / (1.0 + (dx * dx + dz * dz + dy * dy * 0.4) * 0.01);
  vec3 dw = p - WHEEL_C;
  return lamps + uWheelCol * 1.6 / (1.0 + dot(dw, dw) * 0.0035);
}
// 1 where the deck stands between p and the sun.
float deckShadow(vec3 p) {
  if (uSunDir.y < 0.02 || p.y > PIER_DECK - 0.3) return 0.0;
  vec3 q = p + uSunDir * ((PIER_DECK - 0.3 - p.y) / uSunDir.y);
  return underDeck(q.xz) ? 1.0 : 0.0;
}
`;

// ---- Speck material: soft glowing dots, sized in metres or pixels ----

// Light glows as a gaussian; matter is a crisp dot with a soft rim.
const SPECK_FRAG = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
#ifdef MATTER
  float a = (1.0 - smoothstep(0.4, 1.0, r2)) * vAlpha;
#else
  float a = (exp(-r2 * 5.5) * 0.92 + exp(-r2 * 1.8) * 0.08) * vAlpha;
#endif
  gl_FragColor = vec4(vColor, a);
}`;

/**
 * Build a THREE.Points layer. `body` runs in object space and may rewrite
 * pos / col / alpha / size; `post` runs after the world transform with `wp`.
 * Pass `geometry` instead of `attributes` for interleaved or instanced data.
 */
export function specks({
  attributes,
  geometry = null,
  body = '',
  post = '',
  decl = '',
  uniforms = {},
  pixelSize = false,
  fog = true,
  maxPx = 0,
  depthTest = true,
  blend = 'add', // 'add' for light (sky, lamps, glints), 'normal' for matter
}) {
  const blending = blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
  const geo = geometry || new THREE.BufferGeometry();
  if (!geometry) {
    for (const [name, val] of Object.entries(attributes)) {
      const [arr, size] = Array.isArray(val) ? val : [val, name === 'position' ? 3 : 1];
      geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
  }
  const defines = {};
  if (pixelSize) defines.PIXEL_SIZE = '';
  if (!fog) defines.NO_FOG = '';
  if (maxPx) defines.MAX_PX = maxPx.toFixed(2);
  if (blend === 'normal') defines.MATTER = '';
  const vertexShader = /* glsl */ `
${GLSL_COMMON}
attribute float aSize;
attribute float aSeed;
${decl}
varying vec3 vColor; varying float vAlpha;
void main() {
  vec3 pos = position; vec3 col = vec3(1.0); float alpha = 1.0; float size = aSize;
  ${body}
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  ${post}
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.001);
#ifdef PIXEL_SIZE
  float ps = size * uPR;
#else
  float ps = size * uScale * uPR / dist;
#endif
#ifndef NO_FOG
  float fog = smoothstep(uFogNear, uFogFar, length(wp.xyz - cameraPosition)) * (0.55 + 0.45 * uHaze);
  col = mix(col, uFogColor, fog * 0.85);
  alpha *= 1.0 - fog * 0.6;
#endif
  float minPs = 1.25 * uPR;
  if (ps < minPs) { alpha *= ps / minPs; ps = minPs; }
#ifdef MAX_PX
  if (ps > MAX_PX * uPR) { alpha *= 0.35 + 0.65 * (MAX_PX * uPR) / ps; ps = MAX_PX * uPR; }
#endif
  gl_PointSize = min(ps, 48.0 * uPR);
  vColor = col; vAlpha = alpha;
  if (alpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...uniforms },
    defines,
    vertexShader,
    fragmentShader: SPECK_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest,
    blending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Growable typed-array builder for speck attributes. */
export class Pack {
  constructor(fields) {
    this.fields = fields; // { name: itemSize }
    this.data = Object.fromEntries(Object.keys(fields).map((k) => [k, []]));
    this.count = 0;
  }
  push(values) {
    for (const [k, size] of Object.entries(this.fields)) {
      const v = values[k];
      if (size === 1) this.data[k].push(v ?? 0);
      else if (v) for (let i = 0; i < size; i++) this.data[k].push(v[i]);
      else for (let i = 0; i < size; i++) this.data[k].push(0);
    }
    this.count++;
  }
  attributes() {
    const out = {};
    for (const [k, size] of Object.entries(this.fields)) {
      const arr = new Float32Array(this.data[k]);
      out[k] = k === 'position' || size === 1 ? arr : [arr, size];
    }
    return out;
  }
}

// ---- Solids: dim, lit fills under the specks of solid things ----
// They write depth, so a pier deck or a hill hides the specks behind it, and
// give backlit shapes a dark body the way a real silhouette has one.

const OCCLUDER_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });

/** Depth only: hides what is behind without drawing anything. */
export function occluder(geometry) {
  const m = new THREE.Mesh(geometry, OCCLUDER_MAT);
  m.renderOrder = -5;
  return m;
}

const SOLID_VS = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SOLID_FS = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uAlbedo; uniform float uTone; uniform float uHazeK; uniform float uLit; uniform float uFogOn;
varying vec3 vN; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float sh = deckShadow(vW);
  vec3 L = uSunColor * clamp((dot(n, uSunDir) + 0.2) / 1.2, 0.0, 1.0) * uSunVis * (1.0 - sh) + uAmb * (0.5 + 0.35 * n.y)
         + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonVis * uMoonLit * 0.2;
  vec3 c = uAlbedo * mix(vec3(0.55) * (0.3 + 0.7 * uDay), L, uLit) * uTone + uAlbedo * pierGlow(vW) * 0.25;
  float fog = smoothstep(uFogNear, uFogFar, distance(vW, cameraPosition)) * (0.55 + 0.45 * uHaze) * 0.85 * uFogOn + uHazeK;
  c = mix(c, uFogColor * mix(0.9, 0.8, 1.0 - uFogOn), clamp(fog, 0.0, 0.95));
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * A lit fill material. `tone` scales it below the specks drawn on top;
 * `hazeK` adds aerial haze for things far beyond the fog range.
 */
export function solidMaterial({ albedo = [0.35, 0.33, 0.3], tone = 0.4, hazeK = 0, lit = 1, fog = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uAlbedo: { value: new THREE.Color().setRGB(...albedo) },
      uTone: { value: tone },
      uHazeK: { value: hazeK },
      uLit: { value: lit },
      uFogOn: { value: fog ? 1 : 0 },
    },
    vertexShader: SOLID_VS,
    fragmentShader: SOLID_FS,
    side: THREE.DoubleSide,
  });
}

export function solid(geometry, opts) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const m = new THREE.Mesh(geometry, opts?.isMaterial ? opts : solidMaterial(opts));
  m.renderOrder = -5;
  return m;
}

// ---- Stippled solids: walls and decks you can walk right up to ----
// Buildings and the pier deck draw their specks in the fragment shader, as a
// dot pattern laid out in the surface's own coordinates. The dots keep a
// steady on-screen size at any distance (two scales cross-fade as you close
// in), so a wall reads the same from the sand or from a metre away.

const STIPPLE_VS = /* glsl */ `
attribute vec3 aAlb; attribute vec4 aWin; attribute vec4 aFace; attribute vec3 aGlass; attribute float aKind;
varying vec3 vN; varying vec3 vW; varying vec3 vAlb; varying vec4 vWin; varying vec4 vFace; varying vec3 vGlass; varying float vKind;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vAlb = aAlb; vWin = aWin; vFace = aFace; vGlass = aGlass; vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const STIPPLE_FS = /* glsl */ `
${GLSL_COMMON}
uniform float uTone; uniform float uFogOn; uniform float uDotMin;
varying vec3 vN; varying vec3 vW; varying vec3 vAlb; varying vec4 vWin; varying vec4 vFace; varying vec3 vGlass; varying float vKind;
float stip(vec2 uv, float s, float px, float salt, out float shade) {
  vec2 cell = floor(uv / s);
  vec2 h = vec2(hash21(cell + salt), hash21(cell.yx + salt * 1.7 + 3.1));
  vec2 c = (cell + 0.2 + 0.6 * h) * s;
  float r = s * (0.3 + 0.14 * hash21(cell * 1.31 + salt + 7.7));
  shade = 0.84 + 0.32 * hash21(cell * 0.73 + salt + 1.9);
  return 1.0 - smoothstep(r - px, r + px, length(uv - c));
}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 an = abs(n);
  vec2 uv = an.y > 0.5 ? vW.xz : (an.x > 0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y));
  vec3 alb = vAlb;
  float lit = 0.0; float glass = 0.0; vec3 warm = vec3(1.0, 0.74, 0.45);
  if (vWin.x > 0.5 && an.y < 0.5) {
    vec2 f = (uv - vFace.xy) / vFace.zw;
    float cx = f.x * vWin.x, cy = f.y * vWin.y;
    float fx = fract(cx), fy = fract(cy), m = vWin.z;
    if (fx > m && fx < 1.0 - m && fy > m * 1.4 && fy < 1.0 - m && cy > 0.0 && cy < vWin.y && cx > 0.0 && cx < vWin.x) {
      float id = floor(cx) * 17.13 + floor(cy) * 3.71 + vWin.w;
      float e = fract(abs(sin(id * 12.9898)) * 43758.5453) * 0.998;
      lit = step(hash11(e * 97.0 + floor(uHour * 0.6 + e * 5.0)), 0.32) * uLights;
      warm = mix(warm, vec3(0.8, 0.9, 1.0), step(0.75, hash11(e * 31.0)));
      alb = vGlass;
      glass = 1.0;
    }
  }
  if (vKind > 1.5 && n.y > 0.5) {
    // deck boards run across the pier, about 16 cm wide
    float pl = floor(vW.z / 0.16);
    alb *= (0.8 + 0.32 * hash11(pl * 1.73)) * (fract(vW.z / 0.16) < 0.09 ? 0.5 : 1.0);
  }
  float sh = deckShadow(vW);
  vec3 L = uSunColor * clamp((dot(n, uSunDir) + 0.25) / 1.25, 0.0, 1.0) * uSunVis * (1.0 - sh) + uAmb * (0.5 + 0.35 * n.y)
         + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonVis * uMoonLit * 0.25;
  vec3 glow = pierGlow(vW);
  vec3 fill = alb * L * uTone + alb * glow * 0.25 * uTone;
  vec3 dotC = alb * L * 0.9 + alb * glow * 0.22;
  dotC = mix(dotC, mix(dotC * (0.6 + 0.4 * uDay) + uAmb * 0.08, warm * 0.85, lit), glass);
  float px = max(length(fwidth(uv)), 1e-5);
  float S = max(px * 5.5, uDotMin);
  float lv = log2(S);
  float l0 = floor(lv);
  float s0, s1;
  float c0 = stip(uv, exp2(l0), px, 0.0, s0);
  float c1 = stip(uv, exp2(l0 + 1.0), px, 13.0, s1);
  float bl = lv - l0;
  float cov = mix(c0, c1, bl);
  vec3 c = mix(fill, dotC * mix(s0, s1, bl), cov * 0.85) + warm * lit * glass * 0.35 * (0.4 + cov);
  float fog = smoothstep(uFogNear, uFogFar, distance(vW, cameraPosition)) * (0.55 + 0.45 * uHaze) * 0.85 * uFogOn;
  c = mix(c, uFogColor * 0.9, clamp(fog, 0.0, 0.95));
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * A stippled solid from box records: { box: [x0, x1, z0, z1, y0, y1], albedo,
 * roof, win: { cols (per metre), rows, margin, glass, seed }, kind: 'deck' }.
 */
export function stippled(records, { tone = 0.4, fog = true, dotMin = 0.02 } = {}) {
  const pos = [], nrm = [], alb = [], win = [], face = [], glass = [], kind = [];
  const r = rng(records.length * 7 + 3);
  for (const rec of records) {
    const [x0, x1, z0, z1, y0, y1] = rec.box;
    const k = rec.kind === 'deck' ? 2 : 0;
    const W = rec.win;
    const faces = [
      // normal, corners (counter-clockwise seen from outside), uv rect, has windows
      [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [x0, y0, x1 - x0, y1 - y0], x1 - x0],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [x0, y0, x1 - x0, y1 - y0], x1 - x0],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [z0, y0, z1 - z0, y1 - y0], z1 - z0],
      [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [z0, y0, z1 - z0, y1 - y0], z1 - z0],
      [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [x0, z0, x1 - x0, z1 - z0], 0],
      [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [x0, z0, x1 - x0, z1 - z0], 0],
    ];
    faces.forEach(([n, q, rect, span], fi) => {
      const top = n[1] !== 0;
      const a = top && n[1] > 0 && rec.roof ? rec.roof : rec.albedo;
      const w = W && span > 0 ? [Math.max(1, Math.round((W.cols ?? 0.5) * span)), W.rows, W.margin, (W.seed ?? r() * 100) + fi * 23.7] : [0, 0, 0, 0];
      const g = W?.glass || [0.16, 0.2, 0.26];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[i]);
        nrm.push(...n);
        alb.push(...a);
        win.push(...w);
        face.push(...rect);
        glass.push(...g);
        kind.push(k);
      }
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aAlb', new THREE.Float32BufferAttribute(alb, 3));
  geo.setAttribute('aWin', new THREE.Float32BufferAttribute(win, 4));
  geo.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 4));
  geo.setAttribute('aGlass', new THREE.Float32BufferAttribute(glass, 3));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uTone: { value: tone }, uFogOn: { value: fog ? 1 : 0 }, uDotMin: { value: dotMin } },
    vertexShader: STIPPLE_VS,
    fragmentShader: STIPPLE_FS,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -5;
  return m;
}

/** Merge boxes [cx, cy, cz, sx, sy, sz] into one flat-shaded geometry. */
export function boxGeometry(boxes) {
  const pos = [];
  const nrm = [];
  const quads = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  for (const [cx, cy, cz, sx, sy, sz] of boxes) {
    for (const [n, q] of quads) {
      const v = q.map(([a, b, c]) => [cx + (a * sx) / 2, cy + (b * sy) / 2, cz + (c * sz) / 2]);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...v[i]);
        nrm.push(...n);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}
