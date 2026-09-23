// Breaking waves up close. As each crest reaches the bar it throws a lip
// forward that curls over and down into the trough ahead of it; where the lip
// lands a plume of spray bursts up and falls back, and a mist hangs over the
// impact zone and drifts ashore on the breeze. Before that, spindrift streams
// back off the crests as they stand up, gold when the sun is behind them.
// Everything is placed on the GPU from the shared surf model (surf.js), so the
// lips peel along the beach exactly where the sea's own surface breaks.
//
// Specks live on a strip along the beach that is cut into chunks near the
// viewer, finer ones close by and coarser ones far off, and each speck keeps
// itself with the probability that holds the density its distance calls for,
// the way the sand and sea fields do (field.js).
import * as THREE from 'three';
import { specks, QUALITY } from './core.js';

const X_RANGE = [-900, 1100];
const Z_RANGE = [-137, -10]; // every breaking crest lies this far off the waterline (± the cusps)
const Y_RANGE = [-1.5, 12];
const RADII = [12, 24, 48, 96, 192, 384, 768, 1500];
const FADE = 0.12;
const box = new THREE.Box3();

// Which wave a speck of each role belongs to, and where it is in its life.
const WAVE_GLSL = /* glsl */ `
const float G = 9.81;
// role 0: lip · 1: spray · 2: mist · 3: spindrift
// out: n, A, s (crest distance offshore now), q (0–1 while the lip is thrown), tau (s since the lip landed)
bool findWave(float x, int role, out float A, out float s, out float q, out float tau, out float n) {
  float n0 = floor(uTime / SURF_P);
  for (int k = 0; k < 4; k++) {
    n = n0 - float(k);
    float u = (uTime - n * SURF_P) / SURF_LIFE;
    if (u < 0.0 || u > 1.08) continue;
    A = waveAmp(n);
    float off = waveOff(x, n);
    float sb = breakDist(x, A);
    float lb = breakLen(A);
    s = pathS(u) + off;
    q = (sb - s) / lb;
    if (role == 0) {
      if (q > 0.0 && q < 1.0) return true;
    } else if (role == 3) {
      if (s < sb + 38.0 && q < 1.0) return true;
    } else if (q >= 1.0) {
      float tl = n * SURF_P + uAtS(sb - lb - off) * SURF_LIFE;
      tau = uTime - tl;
      if (tau < (role == 1 ? 1.4 + 1.1 * sqrt(A) : 7.5)) return true;
    }
  }
  return false;
}
// Light caught by water droplets: sun and sky on them, a strong forward glow
// when the sun is behind them, lamp and LED light after dark.
vec3 dropLight(vec3 p, float wet) {
  vec3 V = normalize(p - cameraPosition);
  float behind = pow(max(dot(V, uSunDir), 0.0), 6.0) * uSunVis;
  return uFoam * (0.3 + 0.65 * lightAt(vec3(0.0, 1.0, 0.0), 0.6)) * wet
       + uSunColor * behind * 1.6 + pierGlow(p) * 0.4;
}`;

/**
 * A strip of specks along the beach, with world-anchored level of detail.
 * K: specks per metre of beach at 1 m away, falling as 1/distance²; cap: the most per metre.
 */
class Strip {
  constructor(scene, { K, cap, blend, body, maxPx, salt }) {
    const q = Math.max(0.35, QUALITY);
    K *= q;
    cap *= q;
    const rho = (d) => Math.min(cap, K / (d * d));
    let seed = salt * 7919 + 17;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.levels = [];
    let rin = 0;
    RADII.forEach((rout, i) => {
      const last = i === RADII.length - 1;
      const chunk = Math.max(3, rout / 4);
      const rhoL = i === 0 ? cap : rho(rin * (1 - FADE));
      const n = Math.max(16, Math.round(rhoL * chunk));
      const base = new Float32Array(n * 3);
      const sd = new Float32Array(n);
      const sz = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        base[k * 3] = rnd(); // along the chunk
        base[k * 3 + 1] = rnd(); // role parameter
        base[k * 3 + 2] = rnd(); // keep threshold
        sd[k] = rnd();
        sz[k] = rnd();
      }
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      const chunkAttr = new THREE.InstancedBufferAttribute(new Float32Array(256), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aChunk', chunkAttr);
      geo.instanceCount = 0;
      const band = i === 0 ? [-2, -1] : [rin * (1 - FADE), rin * (1 + FADE)];
      band.push(last ? 1e9 : rout * (1 - FADE), last ? 1e9 + 1 : rout * (1 + FADE));
      const pts = specks({
        geometry: geo,
        blend,
        uniforms: {
          uChunk: { value: chunk },
          uBand: { value: new THREE.Vector4(...band) },
          uRhoL: { value: rhoL },
          uK: { value: K },
          uCap: { value: cap },
        },
        decl: `attribute float aChunk; uniform float uChunk; uniform vec4 uBand; uniform float uRhoL; uniform float uK; uniform float uCap;\n${WAVE_GLSL}`,
        body: /* glsl */ `
          float x = aChunk + position.x * uChunk;
          if (x < ${X_RANGE[0].toFixed(1)} || x > ${X_RANGE[1].toFixed(1)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          float sh = shoreZ(x);
          float keep = position.z;
          float para = position.y;
          bool live = true;
          ${body}
          // thin to the density this distance calls for
          float D = max(length(pos.xz - cameraPosition.xz), 0.5);
          float w = smoothstep(uBand.x, uBand.y, D) * (1.0 - smoothstep(uBand.z, uBand.w, D));
          float rho = min(uCap, uK / (D * D));
          if (!live || w * rho / uRhoL < keep || alpha < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }`,
        maxPx,
      });
      pts.visible = false;
      pts.renderOrder = 1;
      scene.add(pts);
      this.levels.push({ pts, geo, chunk, chunkAttr, n, hole: i === 0 ? -1 : rin * (1 - FADE), reach: last ? 1e6 : rout * (1 + FADE) });
      rin = rout;
    });
  }

  update(camera, frustum) {
    const cx = camera.position.x;
    const cz = camera.position.z;
    const [z0, z1] = Z_RANGE;
    const dz = Math.max(z0 - cz, 0, cz - z1);
    const fz = Math.max(Math.abs(z0 - cz), Math.abs(z1 - cz));
    for (const L of this.levels) {
      const R = L.reach;
      let n = 0;
      if (dz < R) {
        const ia = Math.floor(Math.max(X_RANGE[0], cx - R) / L.chunk);
        const ib = Math.floor(Math.min(X_RANGE[1], cx + R) / L.chunk);
        for (let i = ia; i <= ib; i++) {
          const X0 = i * L.chunk;
          const X1 = X0 + L.chunk;
          const dx = Math.max(X0 - cx, 0, cx - X1);
          if (dx * dx + dz * dz > R * R) continue;
          const fx = Math.max(Math.abs(X0 - cx), Math.abs(X1 - cx));
          if (fx * fx + fz * fz < L.hole * L.hole) continue;
          box.min.set(X0, Y_RANGE[0], z0);
          box.max.set(X1, Y_RANGE[1], z1);
          if (!frustum.intersectsBox(box)) continue;
          if (n >= L.chunkAttr.array.length) {
            const bigger = new THREE.InstancedBufferAttribute(new Float32Array(L.chunkAttr.array.length * 2), 1).setUsage(THREE.DynamicDrawUsage);
            bigger.array.set(L.chunkAttr.array);
            L.geo.setAttribute('aChunk', bigger);
            L.chunkAttr = bigger;
          }
          L.chunkAttr.array[n++] = X0;
        }
      }
      L.geo.instanceCount = n;
      L.pts.visible = n > 0;
      if (n > 0) {
        L.chunkAttr.clearUpdateRanges();
        L.chunkAttr.addUpdateRange(0, n);
        L.chunkAttr.needsUpdate = true;
      }
    }
  }

  verts() {
    return this.levels.reduce((s, L) => s + (L.pts.visible ? L.n * L.geo.instanceCount : 0), 0);
  }
}

// The water itself: the lip (55% of these specks) and the plume of spray (45%).
const MATTER_BODY = /* glsl */ `
  int role = aSeed < 0.55 ? 0 : 1;
  float A, s, q, tau, n;
  live = findWave(x, role, A, s, q, tau, n);
  if (!live) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float H0 = A * 0.95;
  float h1 = hash11(aSeed * 71.3 + n * 1.7);
  float h2 = hash11(aSeed * 13.1 + n * 3.1);
  float h3 = hash11(aSeed * 37.7 + n * 5.3);
  vec3 N = vec3(0.0, 1.0, 0.0);
  float wet = 1.0;
  float glass = 0.0;
  if (role == 0) {
    // the lip: an arc from the crest's top curling forward and down, drawn a
    // little further each moment until its tip reaches the trough
    float top = H0 * (1.0 - 0.45 * q) + 0.1;
    float reach = 0.35 + 0.85 * H0;
    float w = para;
    float phi = w * mix(0.08, 1.0, smoothstep(0.0, 0.85, q)) * 1.95;
    float zc = sh - s;
    float thick = (0.04 + 0.07 * H0) * (h1 - 0.5) * (0.6 + w);
    vec2 arc = vec2(reach * sin(phi), (top + 0.15) * cos(phi) - 0.15);
    vec2 nrm = normalize(vec2(sin(phi) * (top + 0.15), cos(phi) * reach));
    pos = vec3(x + (h2 - 0.5) * 0.2, arc.y + nrm.y * thick, zc + arc.x + nrm.x * thick);
    N = normalize(vec3(0.0, nrm.y, nrm.x));
    // the tip tears into fingers
    float tear = noise2(vec2(x * 1.3, w * 3.0 + q * 2.0)) - 0.35 * w;
    alpha = smoothstep(0.0, 0.06, q) * (1.0 - smoothstep(0.82, 1.0, q)) * smoothstep(-0.12, 0.1, pos.y) * (w < 0.55 ? 1.0 : smoothstep(0.05, 0.3, tear));
    glass = 1.0 - smoothstep(0.1, 0.6, w);
    wet = mix(0.55, 1.0, smoothstep(0.2, 0.7, w));
    alpha *= 0.55 + 0.3 * w;
  } else {
    // the plume: spray blasted up and forward where the lip lands, slowed by the air, falling back
    float zl = sh - (breakDist(x, A) - breakLen(A)) + 0.3 * H0;
    float lift = sqrt(2.0 * G * H0 * (0.25 + 1.15 * pow(h1, 0.7)));
    vec3 v = vec3((h2 - 0.5) * 2.4, lift, -1.2 + 5.5 * h3 + 0.8 * H0);
    float k = 1.3;
    float e = (1.0 - exp(-k * tau)) / k;
    vec3 o = vec3(x + (para - 0.5) * 0.4, 0.05, zl + (para - 0.5) * 0.8 * H0);
    pos = o + v * e;
    pos.y -= 0.5 * G * 0.8 * tau * tau;
    float life = 1.4 + 1.1 * sqrt(A);
    alpha = smoothstep(0.0, 0.05, tau) * (1.0 - smoothstep(life * 0.55, life, tau)) * smoothstep(-0.05, 0.25, pos.y) * (0.45 + 0.35 * h2);
    N = normalize(vec3(0.0, 1.0, 0.3) + (vec3(h1, h2, h3) - 0.5));
  }
  vec3 V = normalize(pos - cameraPosition);
  float behind = pow(max(dot(V, uSunDir), 0.0), 5.0) * uSunVis;
  vec3 teal = vec3(0.1, 0.62, 0.5) * (uAmb * 1.6 + uSunColor * (0.2 * uSunVis + behind * 2.4));
  vec3 foam = uFoam * (0.28 + 0.7 * lightAt(N, 0.5)) + uSunColor * behind * 0.9;
  col = mix(foam, teal + uWaterLit * 0.3, glass * 0.8) + pierGlow(pos) * 0.4
      + vec3(0.1, 0.85, 1.0) * uBio * (0.8 + 0.6 * sin(uTime * 3.0 + aSeed * 40.0)) * wet;
  alpha *= 1.0 - deckShadow(pos) * 0.25;
  float camD = distance(pos, cameraPosition);
  size = max(0.022 + 0.01 * H0, camD * 0.0024) * (0.7 + 0.6 * aSize) * (1.0 + behind * 0.4);`;

// Light caught in the air: the mist over the impact zone (40%) and spindrift off the crests (60%).
const GLOW_BODY = /* glsl */ `
  int role = aSeed < 0.4 ? 2 : 3;
  float A, s, q, tau, n;
  live = findWave(x, role, A, s, q, tau, n);
  if (!live) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float H0 = A * 0.95;
  float h1 = hash11(aSeed * 71.3 + n * 1.7);
  float h2 = hash11(aSeed * 13.1 + n * 3.1);
  float camD;
  vec3 V;
  if (role == 2) {
    // mist: rises off the impact, spreads, and drifts ashore on the sea breeze
    float zl = sh - (breakDist(x, A) - breakLen(A)) + 0.3 * H0;
    float rise = H0 * (0.3 + 1.1 * h1) * (1.0 - exp(-tau * 1.1)) + 0.12 * tau;
    pos = vec3(x + (h2 - 0.5) * 1.5, 0.2 + rise, zl + (para - 0.5) * (2.0 + 2.5 * H0) + (0.9 + 0.8 * h2) * tau);
    alpha = smoothstep(0.0, 0.5, tau) * (1.0 - smoothstep(2.0, 7.5, tau)) * 0.055 * smoothstep(0.4, 1.6, A);
    camD = distance(pos, cameraPosition);
    V = (pos - cameraPosition) / camD;
    size = max(0.35 + 0.35 * H0 * aSize + 0.25 * tau, camD * 0.006);
  } else {
    // spindrift: blown back off the crest as it stands up, a trail of drops
    // that rises and falls behind it; strongest in the morning offshore wind
    float zc = sh - s;
    float stand = smoothstep(breakDist(x, A) + 38.0, breakDist(x, A) + 4.0, s) * (1.0 - smoothstep(0.35, 1.0, q)) * smoothstep(0.7, 1.6, A);
    float age = fract(para + uTime / 1.5);
    float top = H0 * (1.0 - 0.45 * max(q, 0.0)) * mix(0.62, 1.0, smoothstep(breakDist(x, A) + 38.0, breakDist(x, A), s));
    float back = (4.0 + 5.0 * h1) * age * 1.5;
    pos = vec3(x + (h2 - 0.5) * 0.3, top + 0.08 + age * (0.9 + 0.5 * H0) - age * age * 1.4, zc - 0.25 - back);
    float wind = 0.55 + 0.45 * presence(uHour, 5.5, 12.0, 1.0);
    alpha = pow(1.0 - age, 1.5) * smoothstep(0.0, 0.08, age) * stand * wind * (0.35 + 0.3 * h2);
    camD = distance(pos, cameraPosition);
    V = (pos - cameraPosition) / camD;
    size = max(0.03, camD * 0.0026) * (0.7 + 0.8 * aSize);
  }
  float behind = pow(max(dot(V, uSunDir), 0.0), 6.0) * uSunVis;
  col = uFoam * (0.25 + 0.55 * lightAt(vec3(0.0, 1.0, 0.0), 0.6)) + uSunColor * behind * 2.2 + pierGlow(pos) * 0.3
      + vec3(0.1, 0.85, 1.0) * uBio * 0.5;
  alpha *= 1.0 + behind * 1.5;`;

export function createBreakers(scene) {
  const strips = [
    new Strip(scene, { K: 330000, cap: 2400, blend: 'normal', body: MATTER_BODY, maxPx: 10, salt: 61 }),
    new Strip(scene, { K: 70000, cap: 500, blend: 'add', body: GLOW_BODY, maxPx: 40, salt: 67 }),
  ];
  return {
    strips,
    update(t, dt, { camera, frustum }) {
      for (const s of strips) s.update(camera, frustum);
    },
    verts: () => strips.reduce((a, s) => a + s.verts(), 0),
  };
}
