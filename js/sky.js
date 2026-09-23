// Sky over Santa Monica Bay: a grain-dithered backdrop with the Earth's shadow
// and Belt of Venus at twilight and LA's orange light dome over the land; then
// everything bright in it as specks — a light-polluted star field turning with
// sidereal time, the sun (flattened by refraction at the horizon), the moon in
// its real phase, cumulus over the water, high cirrus that catches sunset
// colour, and a marine haze band on the horizon.
import * as THREE from 'three';
import { U, GLSL_COMMON, rng, specks, Pack, QUALITY, occluder } from './core.js';
import { SITE, worldDir } from './site.js';

const R_SKY = 2900; // stars
const R_SUN = 2800; // sun and moon: beyond the hills and clouds
const D2R = Math.PI / 180;

const DOME_FRAG = /* glsl */ `
${GLSL_COMMON}
varying vec3 vWorld;
vec3 skyHoriz(vec2 dh) {
  float toward = dot(dh, normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
  float lowSun = 1.0 - smoothstep(0.1, 0.5, uSunDir.y);
  return mix(uSkyAnti, uSkyHorizon, mix(0.5, pow(toward, 2.0), lowSun));
}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float el = d.y;
  vec2 dh = normalize(d.xz + 1e-5);
  float toward = dot(dh, normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
  vec3 horiz = skyHoriz(dh);
  if (el < 0.0) {
    // Below the horizon: a dim ground tone under the specks — wet or dry
    // sand, or water mirroring the sky and the sun's path.
    float tHit = cameraPosition.y / max(-el, 1e-4);
    vec3 P = cameraPosition + d * tHit;
    float land = smoothstep(-0.8, 0.8, P.z - shoreZ(P.x));
    float urban = smoothstep(148.0, 153.0, P.z);
    vec3 R = vec3(d.x, -el, d.z);
    float fres = 0.02 + 0.98 * pow(1.0 - (-el), 5.0);
    vec3 skyR = mix(horiz, uSkyTop, pow(smoothstep(0.0, 0.8, -el), 0.55)) * uBg;
    vec3 water = mix(uWaterDeep * 0.8, skyR, fres * 0.75)
      + uSunColor * pow(max(dot(R, uSunDir), 0.0), 60.0) * 0.6 * uSunVis
      + uMoonColor * pow(max(dot(R, uMoonDir), 0.0), 60.0) * 0.3 * uMoonVis * uMoonLit;
    vec3 sandLight = uAmb * 0.55 + uSunColor * uSunVis * max(uSunDir.y, 0.0) + uMoonColor * max(uMoonDir.y, 0.0) * uMoonVis * uMoonLit * 0.6 + pierGlow(P) * 0.4;
    float dd = P.z - shoreZ(P.x);
    vec3 sandC = uSand * sandLight * mix(0.42, 0.7, smoothstep(0.5, 6.0, dd));
    sandC = mix(sandC, vec3(0.3, 0.3, 0.3) * sandLight + uGlow * 0.4, urban);
    vec3 ground = mix(water * 0.55, sandC * 0.62, land);
    ground = mix(ground, horiz * uBg * 0.55, smoothstep(250.0, 2600.0, tHit) * 0.7);
    gl_FragColor = vec4(max(ground, 0.0) + (hash21(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) * 0.012, 1.0);
    return;
  }
  float t = pow(smoothstep(-0.02, 0.6, el), 0.42);
  vec3 col = mix(horiz, uSkyTop * 1.08, t);
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 14.0) * 0.2 + pow(sd, 120.0) * 0.45) * smoothstep(-0.12, 0.02, uSunDir.y);
  // Earth's shadow and the Belt of Venus, opposite a sun near the horizon
  float twi = smoothstep(-0.1, -0.02, uSunDir.y) * (1.0 - smoothstep(0.02, 0.08, uSunDir.y));
  float anti = pow(1.0 - toward, 2.0);
  float belt = smoothstep(0.03, 0.09, el) * (1.0 - smoothstep(0.12, 0.3, el));
  col = mix(col, vec3(0.9, 0.56, 0.66) * (0.45 + 0.6 * uDay), belt * anti * twi * 0.55);
  col = mix(col, uSkyTop * 0.75, (1.0 - smoothstep(0.0, 0.05, el)) * anti * twi * 0.5);
  col += uMoonColor * pow(max(dot(d, uMoonDir), 0.0), 60.0) * 0.12 * uMoonVis * uMoonLit;
  // LA's light dome over the land, and the pier's own glow after dark
  float landward = smoothstep(0.15, -0.6, dot(dh, vec2(0.0, -1.0)));
  col += uGlow * exp(-max(el, 0.0) / 0.1) * (0.3 + 0.7 * landward);
  col += uWheelCol * pow(max(dot(d, normalize(WHEEL_C - cameraPosition)), 0.0), 30.0) * 0.1;
  col *= uBg * 0.55;
  col += (hash21(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) * 0.012;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

function makeDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: DOME_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

// Stars live in the equatorial frame (z to the celestial pole) and are turned
// into the local sky each frame; LA's glow leaves only the brighter ones.
function makeStars() {
  const r = rng(7);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aTint: 3, aBright: 1 });
  const n = Math.floor(2600 * Math.max(QUALITY, 0.7));
  for (let i = 0; i < n; i++) {
    const z = r() * 2 - 1;
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    const mag = Math.pow(r(), 5); // few bright, many faint
    const warm = r();
    pk.push({
      position: [s * Math.cos(a) * R_SKY, s * Math.sin(a) * R_SKY, z * R_SKY],
      aSize: 0.9 + mag * 2.6,
      aSeed: r(),
      aTint: warm < 0.45 ? [0.78, 0.86, 1.0] : warm < 0.85 ? [1, 1, 1] : [1.0, 0.84, 0.66],
      aBright: 0.25 + mag * 1.2,
    });
  }
  const pts = specks({
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    decl: 'attribute vec3 aTint; attribute float aBright;',
    body: `
      float tw = 0.65 + 0.35 * sin(uTime * (1.2 + aSeed * 3.0) + aSeed * 40.0);
      col = aTint * 1.6;
      alpha = uStars * tw * aBright;`,
    post: `
      vec3 d = normalize(wp.xyz - cameraPosition);
      float landward = smoothstep(0.15, -0.6, dot(normalize(d.xz + 1e-5), vec2(0.0, -1.0)));
      alpha *= smoothstep(0.02, 0.25, d.y) * (1.0 - 0.65 * landward * (1.0 - smoothstep(0.1, 0.7, d.y)));
      alpha *= 1.0 - 0.6 * uMoonVis * uMoonLit * step(aBright, 0.6);`,
  });
  pts.matrixAutoUpdate = false;
  return pts;
}

// Painterly sky grain: specks tinted with the sky behind them.
function makeDust() {
  const r = rng(21);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1 });
  const n = Math.floor(16000 * QUALITY);
  for (let i = 0; i < n; i++) {
    const az = r() < 0.75 ? r.gauss() * 1.0 + 0.6 : r.range(-Math.PI, Math.PI);
    const el = Math.pow(r(), 1.7) * 1.35;
    const R = 2850;
    pk.push({ position: [Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, -Math.cos(az) * Math.cos(el) * R], aSize: 0.9 + r() * 1.5, aSeed: r() });
  }
  return specks({
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    body: `
      vec3 d = normalize(position);
      float az = atan(d.x, -d.z);
      vec2 dh = normalize(d.xz + 1e-5);
      float toward = dot(dh, normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
      float lowSun = 1.0 - smoothstep(0.1, 0.5, uSunDir.y);
      vec3 horiz = mix(uSkyAnti, uSkyHorizon, mix(0.5, pow(toward, 2.0), lowSun));
      vec3 base = mix(horiz, uSkyTop, pow(smoothstep(0.0, 0.8, d.y), 0.6));
      float sp = max(dot(d, uSunDir), 0.0);
      base += uSunColor * (pow(sp, 5.0) * 0.7 + pow(sp, 40.0) * 1.2) * uSunVis;
      float streak = noise2(vec2(az * 4.0 + uTime * 0.003, d.y * 24.0)) * 0.7 + noise2(vec2(az * 11.0, d.y * 60.0)) * 0.3;
      col = base * (0.8 + 0.5 * hash11(aSeed * 3.0));
      alpha = (0.03 + 0.2 * smoothstep(0.45, 0.8, streak)) * (0.45 + 0.3 * uDay) * (0.35 + 0.65 * smoothstep(0.0, 0.25, d.y));
      alpha *= smoothstep(-0.005, 0.03, d.y);`,
  });
}

function makeSun() {
  const r = rng(3);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aPolar: 2, aKind: 1 });
  const n = Math.floor(4200 * Math.max(QUALITY, 0.7));
  const R = 17;
  for (let i = 0; i < n; i++) {
    const u = r();
    const disk = u < 0.55;
    const rad = disk ? R * Math.sqrt(r()) : R * (1 + -Math.log(1 - r() * 0.999) * 0.9);
    pk.push({ aSize: disk ? 1.6 + r() * 1.4 : 1 + r() * 1.3, aSeed: r(), aPolar: [rad, r() * Math.PI * 2], aKind: disk ? 0 : 1 });
  }
  return specks({
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    decl: 'attribute vec2 aPolar; attribute float aKind;',
    body: `
      float rad = aPolar.x;
      float ang = aPolar.y + (aKind > 0.5 ? uTime * 0.01 * (hash11(aSeed) - 0.5) : 0.0);
      // refraction flattens the disc as it nears the horizon
      float squash = 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.06, uSunDir.y));
      pos = vec3(cos(ang) * rad, sin(ang) * rad * squash, 0.0);
      float q = rad / ${R.toFixed(1)};
      vec3 hot = mix(uSunColor, vec3(1.0, 0.97, 0.9), 0.55 * smoothstep(0.0, 0.2, uSunDir.y) + 0.25);
      col = aKind < 0.5 ? hot * (2.6 - 0.9 * q * q) : uSunColor * 1.4;
      alpha = uSunVis * (aKind < 0.5 ? 0.9 : 0.8 * exp(-(q - 1.0) * 1.4));`,
  });
}

// The moon, lit on the side facing the sun: s is the sun's direction in the
// disc's own frame (x right, y up, z toward the viewer).
function makeMoon() {
  const r = rng(5);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aPolar: 2, aKind: 1 });
  const R = 14;
  for (let i = 0; i < 3600; i++) {
    const halo = i > 2700;
    const rad = halo ? R * (1.1 + -Math.log(1 - r() * 0.999) * 0.9) : R * Math.sqrt(r());
    pk.push({ aSize: halo ? 0.9 + r() : 1.3 + r() * 1.2, aSeed: r(), aPolar: [rad, r() * Math.PI * 2], aKind: halo ? 1 : 0 });
  }
  const uMoonS = { value: new THREE.Vector3(0, 0, 1) };
  const pts = specks({
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    uniforms: { uMoonS },
    decl: 'attribute vec2 aPolar; attribute float aKind; uniform vec3 uMoonS;',
    body: `
      vec2 q = vec2(cos(aPolar.y), sin(aPolar.y)) * aPolar.x;
      pos = vec3(q, 0.0);
      vec2 m = q / ${R.toFixed(1)};
      float lit = 1.0;
      if (aKind < 0.5) {
        vec3 n = vec3(m, sqrt(max(1.0 - dot(m, m), 0.0)));
        lit = smoothstep(-0.04, 0.12, dot(n, uMoonS));
      }
      float maria = noise2(m * 2.2 + 3.0) * 0.6 + noise2(m * 5.0 + 9.0) * 0.4;
      col = uMoonColor * (aKind < 0.5 ? (1.25 - 0.6 * smoothstep(0.45, 0.72, maria)) : 0.7);
      alpha = uMoonVis * (aKind < 0.5 ? 0.62 * (lit + 0.035) : 0.2 * uMoonLit * exp(-(aPolar.x / ${R.toFixed(1)} - 1.0)));`,
  });
  pts.userData.uMoonS = uMoonS;
  return pts;
}

// Cumulus over the water: lit tops, shaded bases, underlit at sunset.
function makeCumulus() {
  const r = rng(11);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aLocal: 1, aDrift: 1 });
  const per = Math.floor(1300 * QUALITY);
  for (let c = 0; c < 9; c++) {
    const az = r.range(-1.2, 1.9);
    const dist = r.range(2450, 2700);
    const base = dist * Math.tan(r.range(1.0, 5.5) * D2R);
    const w = r.range(280, 700);
    const h = r.range(22, 70);
    const drift = r.range(0.6, 1.6);
    const puffs = [];
    const np = 9 + Math.floor(r() * 9);
    for (let p = 0; p < np; p++) {
      const off = r.gauss() * 0.38;
      puffs.push({ x: off * w, y: r() * h * (1 - Math.abs(off)), rad: r.range(30, 80) * (1.2 - Math.abs(off)) });
    }
    const total = puffs.reduce((s, p) => s + p.rad, 0);
    const cx = Math.sin(az) * dist;
    const cz = -Math.cos(az) * dist;
    const tx = Math.cos(az);
    const tz = Math.sin(az);
    for (let i = 0; i < per; i++) {
      let pick = r() * total;
      let p = puffs[0];
      for (const q of puffs) if ((pick -= q.rad) <= 0) { p = q; break; }
      let ly = p.y + r.gauss() * p.rad * 0.3;
      if (ly < 0) ly *= -0.2;
      const along = p.x + r.gauss() * p.rad * 0.45;
      const depth = r.gauss() * p.rad * 0.4;
      pk.push({
        position: [cx + tx * along - Math.sin(az) * depth, base + ly, cz + tz * along + Math.cos(az) * depth],
        aSize: 1.1 + r() * 1.6,
        aSeed: r(),
        aLocal: Math.min(1, ly / (h + 14)),
        aDrift: drift,
      });
    }
  }
  return specks({
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    decl: 'attribute float aLocal; attribute float aDrift;',
    body: `
      float a = uTime * 0.00012 * aDrift;
      float c = cos(a), s = sin(a);
      pos.xz = mat2(c, -s, s, c) * pos.xz;`,
    post: `
      vec3 d = normalize(wp.xyz - cameraPosition);
      float sp = max(dot(d, uSunDir), 0.0);
      float lowSun = (1.0 - smoothstep(0.02, 0.35, uSunDir.y)) * smoothstep(-0.1, 0.0, uSunDir.y);
      vec3 top = mix(uSkyAnti, vec3(1.0), 0.5) * (0.25 + 0.85 * uDay);
      vec3 under = mix(uSkyTop * 0.75, uSunColor * 1.3, lowSun);
      col = mix(under, top, aLocal) + uSunColor * pow(sp, 6.0) * 1.1 * uSunVis;
      col = mix(col, uMoonColor * 0.25 + uGlow * 0.8 + uSkyHorizon * 0.4, (1.0 - uDay) * (1.0 - lowSun));
      alpha = (0.06 + 0.08 * hash11(aSeed * 3.0)) * (0.45 + 0.45 * uDay + 0.35 * lowSun);`,
  });
}

// High cirrus: fibrous streaks that stay lit after sunset.
function makeCirrus() {
  const r = rng(13);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aAlong: 1 });
  const per = Math.floor(1600 * QUALITY);
  for (let c = 0; c < 7; c++) {
    const az0 = r.range(-0.8, 1.8);
    const el0 = r.range(10, 42) * D2R;
    const len = r.range(0.25, 0.6);
    const tilt = r.range(-0.5, 0.5);
    const fibres = 3 + Math.floor(r() * 4);
    for (let i = 0; i < per; i++) {
      const u = r();
      const f = Math.floor(r() * fibres);
      const az = az0 + (u - 0.5) * len;
      const el = el0 + (u - 0.5) * len * tilt + (f - fibres / 2) * 0.012 + r.gauss() * 0.004 + Math.sin(u * 9 + f) * 0.01;
      const R = 2600;
      pk.push({
        position: [Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, -Math.cos(az) * Math.cos(el) * R],
        aSize: 0.9 + r() * 1.3,
        aSeed: r(),
        aAlong: Math.sin(Math.PI * u),
      });
    }
  }
  return specks({
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    decl: 'attribute float aAlong;',
    body: `
      float a = uTime * 0.0002;
      float c = cos(a), s = sin(a);
      pos.xz = mat2(c, -s, s, c) * pos.xz;`,
    post: `
      float glowT = smoothstep(-0.12, -0.02, uSunDir.y) * (1.0 - smoothstep(0.05, 0.3, uSunDir.y));
      vec3 dayC = mix(vec3(1.0), uSkyTop, 0.25) * (0.3 + 0.9 * uDay);
      vec3 fire = mix(uSunColor * 1.6, vec3(1.0, 0.45, 0.6), smoothstep(0.0, -0.08, uSunDir.y));
      col = mix(dayC, fire, glowT) + uGlow * 0.6 * (1.0 - uDay);
      alpha = aAlong * (0.1 + 0.12 * hash11(aSeed * 5.0)) * (0.35 + 0.5 * uDay + 0.9 * glowT + 0.25 * (1.0 - uDay));`,
  });
}

// The marine layer: a low band of haze along the horizon, thickest in the morning.
function makeHaze() {
  const r = rng(17);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1 });
  const n = Math.floor(9000 * QUALITY);
  for (let i = 0; i < n; i++) {
    const az = r.range(-1.8, 2.0);
    const el = Math.pow(r(), 1.8) * 2.4 * D2R;
    const R = 2050;
    pk.push({ position: [Math.sin(az) * R, Math.tan(el) * R - 2, -Math.cos(az) * R], aSize: 1.2 + r() * 2.2, aSeed: r() });
  }
  return specks({
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    body: `
      vec3 d = normalize(position);
      float toward = dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
      col = mix(uSkyAnti, uSkyHorizon, toward) * (0.6 + 0.5 * uDay) + uSunColor * pow(toward, 8.0) * 0.4 * uSunVis + uGlow * 0.5;
      alpha = uHaze * (0.1 + 0.1 * hash11(aSeed * 7.0)) * (1.0 - smoothstep(0.0, 0.042, d.y));`,
  });
}

export function createSky(scene) {
  scene.add(makeDome());
  const stars = makeStars();
  const dust = makeDust();
  const sun = makeSun();
  const moon = makeMoon();
  const haze = makeHaze();
  const cumulus = makeCumulus();
  const cirrus = makeCirrus();
  scene.add(stars, dust, sun, moon, cumulus, cirrus, haze);

  // The sea hides whatever sinks below the horizon.
  const seaPlane = occluder(new THREE.CircleGeometry(2750, 72).rotateX(-Math.PI / 2));
  seaPlane.position.y = -1.5;
  scene.add(seaPlane);

  const N = worldDir(0, 0);
  const E = worldDir(90, 0);
  const UP = new THREE.Vector3(0, 1, 0);
  const phi = SITE.lat * D2R;
  const M = new THREE.Vector3().copy(N).multiplyScalar(-Math.sin(phi)).addScaledVector(UP, Math.cos(phi));
  const W = new THREE.Vector3().copy(E).negate();
  const NCP = new THREE.Vector3().copy(N).multiplyScalar(Math.cos(phi)).addScaledVector(UP, Math.sin(phi));
  const cx = new THREE.Vector3();
  const cy = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  return {
    update(camera, { lst, illum, moonPos }) {
      // equatorial → local sky: columns are where RA 0h, RA 6h and the pole land
      cx.copy(M).multiplyScalar(Math.cos(lst)).addScaledVector(W, Math.sin(lst));
      cy.copy(M).multiplyScalar(Math.sin(lst)).addScaledVector(W, -Math.cos(lst));
      stars.matrix.makeBasis(cx, cy, NCP).setPosition(camera.position);
      stars.matrixWorldNeedsUpdate = true;
      dust.position.copy(camera.position);
      haze.position.set(camera.position.x, 0, camera.position.z);
      cumulus.position.set(camera.position.x, 0, camera.position.z);
      cirrus.position.set(camera.position.x, 0, camera.position.z);
      seaPlane.position.set(camera.position.x, -1.5, camera.position.z);

      sun.position.copy(camera.position).addScaledVector(U.uSunDir.value, R_SUN);
      sun.quaternion.copy(camera.quaternion);
      moon.position.copy(camera.position).addScaledVector(U.uMoonDir.value, R_SUN);
      moon.quaternion.copy(camera.quaternion);
      sun.visible = U.uSunVis.value > 0.001;
      moon.visible = U.uMoonVis.value > 0.001;

      // bright limb: anticlockwise from the zenith by (limb angle − parallactic angle)
      const za = illum.angle - moonPos.parallactic;
      const si = Math.sin(illum.inc);
      tmp.set(-Math.sin(za) * si, Math.cos(za) * si, Math.cos(illum.inc));
      moon.userData.uMoonS.value.copy(tmp);
    },
  };
}
