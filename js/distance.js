// The far side of Santa Monica Bay. Ridgelines are drawn at pseudo-distances
// just beyond the sea field, sized to their true angular height and hazed by
// their true distance: the Santa Monica Mountains and the Malibu coast running
// out to Point Dume behind the pier, Palos Verdes and Catalina Island to the
// south. After dark, hillside homes and Pacific Coast Highway traffic glow.
import * as THREE from 'three';
import { U, rng, specks, Pack, QUALITY, solid, solidMaterial, smoothstep } from './core.js';
import { VIEW } from './site.js';

const D2R = Math.PI / 180;

function noise1(seed) {
  const r = rng(seed);
  const vals = Array.from({ length: 1024 }, () => r());
  const at = (i) => vals[((i % 1024) + 1024) % 1024];
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return at(i) + (at(i + 1) - at(i)) * u;
  };
}
const fbm = (n, x) => 0.5 * n(x) + 0.25 * n(x * 2.1 + 7) + 0.125 * n(x * 4.3 + 13) + 0.0625 * n(x * 8.7 + 29);
const taper = (r, a, b, k = 0.18) => {
  const s = (b - a) * k;
  return smoothstep(a, a + s, r) * (1 - smoothstep(b - s, b, r));
};

// bearing r in degrees from seaward (+ toward the pier); profile gives elevation in degrees
const n1 = noise1(301);
const n2 = noise1(302);
const n3 = noise1(303);
const n4 = noise1(304);
// Point Dume lies almost due west (268°, r ≈ 38°): at the equinoxes the sun sets just off its tip.
const RIDGES = [
  { from: 41, to: 66, R: 2390, km: 42, lights: 0.25, top: (r) => taper(r, 41, 66, 0.3) * (0.5 + 1.0 * fbm(n1, r * 0.22)) },
  { from: 37.6, to: 47, R: 2370, km: 29, lights: 0.3, top: (r) => smoothstep(37.6, 38.1, r) * (1 - smoothstep(44, 47, r)) * (0.11 + 0.1 * fbm(n2, r * 0.8)) },
  { from: 44, to: 86, R: 2320, km: 16, lights: 0.55, top: (r) => taper(r, 44, 86, 0.22) * (1.1 + 2.3 * fbm(n2, r * 0.18 + 4)) },
  { from: 70, to: 150, R: 2250, km: 8, lights: 1, top: (r) => taper(r, 70, 150, 0.12) * (1.6 + 2.2 * fbm(n3, r * 0.15)) },
  { from: -82, to: -47, R: 2300, km: 25, lights: 1.4, top: (r) => Math.pow(Math.sin((Math.PI * (r + 82)) / 35), 0.8) * (0.8 + 0.35 * fbm(n4, r * 0.5)) },
  {
    from: -38, to: -13, R: 2410, km: 40, lights: 0.12, catalina: true,
    top: (r) => {
      const west = taper(r, -38, -23.5, 0.35) * (0.7 + 0.35 * fbm(n1, r * 0.9 + 40));
      const east = taper(r, -22.5, -13, 0.35) * (0.45 + 0.25 * fbm(n2, r * 0.9 + 60));
      return Math.max(west, east, taper(r, -25, -21, 0.4) * 0.18);
    },
  },
];

const place = (r, el, R) => {
  const a = r * D2R;
  return [VIEW.x + Math.sin(a) * R, Math.tan(el * D2R) * R - 1.2, VIEW.z - Math.cos(a) * R];
};

function ridgeSpecks() {
  const rr = rng(311);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aKm: 1, aFrac: 1, aLight: 1 });
  for (const L of RIDGES) {
    const span = L.to - L.from;
    const n = Math.floor(span * 900 * QUALITY * (L.km > 30 ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const r = L.from + rr() * span;
      const top = L.top(r);
      if (top < 0.02) continue;
      const f = 1 - Math.pow(rr(), 2.2); // denser toward the ridgeline
      pk.push({ position: place(r, top * f, L.R), aSize: 1.0 + rr() * 1.4, aSeed: rr(), aKm: L.km, aFrac: f, aLight: 0 });
    }
    // homes on the lower slopes, and on Catalina the lights of Avalon
    const lights = Math.floor(span * 60 * L.lights * QUALITY);
    for (let i = 0; i < lights; i++) {
      const r = L.catalina ? -15.6 + rr.gauss() * 0.35 : L.from + rr() * span;
      const top = L.top(r);
      if (top < 0.05) continue;
      pk.push({ position: place(r, top * Math.pow(rr(), 2.5) * 0.7, L.R - 3), aSize: 1.1 + rr() * 1.1, aSeed: rr(), aKm: L.km, aFrac: 0, aLight: 1 });
    }
  }
  // Pacific Coast Highway along the Malibu shore: traffic both ways
  for (let i = 0; i < 700 * QUALITY; i++) {
    pk.push({ position: [0, 0, 0], aSize: 1.3, aSeed: rr(), aKm: 12, aFrac: 0, aLight: 2 });
  }
  return specks({ blend: 'normal',
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    decl: 'attribute float aKm; attribute float aFrac; attribute float aLight;',
    body: /* glsl */ `
      float vis = 36.0 * (1.25 - uHaze);
      float haze = 1.0 - exp(-aKm / vis);
      vec3 d = normalize(position - vec3(${VIEW.x.toFixed(1)}, 0.0, ${VIEW.z.toFixed(1)}));
      float toward = dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
      vec3 hor = mix(uSkyAnti, uSkyHorizon, mix(0.5, pow(toward, 2.0), 1.0 - smoothstep(0.1, 0.5, uSunDir.y))) * uBg * 0.6;
      if (aLight < 0.5) {
        float facet = noise2(vec2(position.x * 0.03, position.y * 0.3)) - 0.5;
        float sun = clamp(0.45 + facet + 0.4 * aFrac, 0.0, 1.0) * uSunVis * (0.4 + 0.6 * smoothstep(-0.2, 0.6, 1.0 - toward + 0.3));
        vec3 land = vec3(0.34, 0.33, 0.24) * (uAmb * 0.45 + uSunColor * sun * 0.7);
        col = mix(land, hor, haze);
        alpha = (0.35 + 0.35 * aFrac) * (1.0 - haze * 0.55);
      } else if (aLight < 1.5) {
        float tw = 0.75 + 0.25 * sin(uTime * (2.0 + aSeed * 5.0) + aSeed * 40.0);
        col = mix(vec3(1.0, 0.78, 0.5), vec3(0.85, 0.9, 1.0), step(0.7, aSeed)) * 1.6;
        alpha = uLights * tw * (1.0 - haze * 0.6) * step(0.25, hash11(aSeed * 7.0 + floor(uHour)));
      } else {
        // a car on PCH: position along the coast animated by time
        float dir = step(0.5, aSeed);
        float r = mix(44.0, 96.0, fract(aSeed * 13.7 + uTime * (dir > 0.5 ? 0.0021 : -0.0019)));
        float a = radians(r);
        float R = 2240.0;
        pos = vec3(${VIEW.x.toFixed(1)} + sin(a) * R, 0.35 + dir * 0.4, ${VIEW.z.toFixed(1)} - cos(a) * R);
        col = dir > 0.5 ? vec3(1.0, 0.95, 0.85) * 1.8 : vec3(1.0, 0.12, 0.08) * 1.6;
        alpha = uLights * 0.9 * (1.0 - haze * 0.5);
      }`,
  });
}

function ridgeSolids(scene) {
  const solids = [];
  for (const L of RIDGES) {
    const pos = [];
    const steps = Math.ceil((L.to - L.from) * 3);
    for (let i = 0; i <= steps; i++) {
      const r = L.from + ((L.to - L.from) * i) / steps;
      const top = Math.max(L.top(r) * 0.985, 0);
      const a = place(r, top, L.R + 8);
      const b = place(r, -0.3, L.R + 8);
      pos.push(...b, ...a);
    }
    const idx = [];
    for (let i = 0; i < steps; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = solidMaterial({ albedo: [0.3, 0.3, 0.22], tone: 0.55, lit: 0.6, fog: false });
    const m = solid(geo, mat);
    m.userData.km = L.km;
    scene.add(m);
    solids.push(m);
  }
  return solids;
}

// A container ship crossing the horizon, lit at night.
function makeShip() {
  const r = rng(331);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aColor: 3, aEmit: 1 });
  const LEN = 40;
  for (let i = 0; i < 900 * QUALITY + 200; i++) {
    const u = r() - 0.5;
    const hull = r() < 0.4;
    if (hull) pk.push({ position: [u * LEN, r() * 1.4, 0], aSize: 1.2, aSeed: r(), aColor: [0.12, 0.13, 0.16], aEmit: 0 });
    else if (u > -0.38) {
      const stack = Math.floor((u + 0.5) * 22);
      const c = [[0.7, 0.25, 0.2], [0.2, 0.35, 0.6], [0.85, 0.6, 0.2], [0.3, 0.55, 0.4], [0.75, 0.75, 0.72]][(stack * 7) % 5];
      pk.push({ position: [u * LEN * 0.98, 1.4 + r() * 3.2, 0], aSize: 1.1, aSeed: r(), aColor: c, aEmit: 0 });
    } else pk.push({ position: [u * LEN, 1.4 + r() * 5.2, 0], aSize: 1.1, aSeed: r(), aColor: [0.9, 0.9, 0.88], aEmit: 0.5 });
  }
  const lamp = (x, y, c, e) => pk.push({ position: [x, y, 0], aSize: 2.2, aSeed: r(), aColor: c, aEmit: e });
  lamp(-LEN * 0.42, 7.4, [1, 1, 0.95], 1);
  lamp(LEN * 0.4, 5.6, [1, 1, 0.95], 1);
  lamp(-LEN * 0.44, 4.2, [1, 0.2, 0.15], 1);
  for (let i = 0; i < 12; i++) lamp(-LEN * 0.4 + i * 3.4, 4.8, [1, 0.85, 0.6], 0.8);
  const pts = specks({ blend: 'normal',
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    decl: 'attribute vec3 aColor; attribute float aEmit;',
    body: `
      float haze = 1.0 - exp(-14.0 / (36.0 * (1.25 - uHaze)));
      vec3 hor = mix(uSkyAnti, uSkyHorizon, 0.5) * uBg * 0.6;
      col = mix(aColor * (uAmb * 0.5 + uSunColor * uSunVis * 0.5), hor, haze);
      alpha = 0.6 * (1.0 - haze * 0.5);
      if (aEmit > 0.9) { col = aColor * 2.0; alpha = uLights; }
      else if (aEmit > 0.6) { col += aColor * uLights * 1.2; alpha += uLights * 0.3; }
      else if (aEmit > 0.4) { col += vec3(1.0, 0.9, 0.7) * uLights * 0.6 * step(0.6, hash11(aSeed * 3.0)); }`,
  });
  return pts;
}

export function createDistance(scene) {
  // Everything here is kilometres off, drawn at pseudo-distances round the
  // viewpoint: it travels with you so the mountains don't slide as you walk.
  const ridges = ridgeSpecks();
  scene.add(ridges);
  const solids = ridgeSolids(scene);
  const ship = makeShip();
  scene.add(ship);
  const R = 1900;
  return {
    update(t, dt, { camera }) {
      const ox = camera.position.x - VIEW.x;
      const oz = camera.position.z - VIEW.z;
      ridges.position.set(ox, 0, oz);
      const vis = 36 * (1.25 - U.uHaze.value);
      for (const m of solids) {
        m.material.uniforms.uHazeK.value = 1 - Math.exp(-m.userData.km / vis);
        m.position.set(ox, 0, oz);
      }
      // ~0.03°/s: a slow crawl along the horizon, looping every half hour
      const r = (-34 + ((t * 0.03 + 12) % 56)) * D2R;
      ship.position.set(camera.position.x + Math.sin(r) * R, 0, camera.position.z - Math.cos(r) * R);
      ship.rotation.y = -r;
    },
  };
}
