// The land behind the beach. North of the pier, the Palisades bluff with its
// row of tall, thin Mexican fan palms and the Ocean Avenue towers on top, and
// the Pacific Coast Highway at its foot, whose traffic draws light trails
// after dark. South of the pier, Ocean Front Walk with its palms and lamps,
// and the hotels and apartments along the sand.
import * as THREE from 'three';
import { rng, specks, Pack, QUALITY, solid, smoothstep } from './core.js';
import { PIER, VIEW } from './site.js';
import { Builder } from './build.js';

export const bluffZ = (x) => 160 + 0.012 * (x - 170) + 3 * Math.sin(x * 0.01);
// the bluff rises out of the slope by the pier's bridge and grows toward Pacific Palisades
export const bluffTop = (x) =>
  (26 + 9 * smoothstep(170, 900, x) + 3 * Math.sin(x * 0.023) + 2 * Math.sin(x * 0.061 + 1)) * (0.5 + 0.5 * smoothstep(165, 420, x));
const SLOPE = 0.42;
// far specks grow with distance so each stays a couple of pixels wide
const farSize = (x, z, base) => base + Math.hypot(x - VIEW.x, z - VIEW.z) * 0.0024;

// ---- Palms: Washingtonia robusta, the skyline palm of Santa Monica ----

const PALM_BODY = /* glsl */ `
  float sway = sin(uTime * 0.7 + aTree * 2.3) * 0.5 + sin(uTime * 1.9 + aTree) * 0.2;
  float h2 = aHeight * aHeight;
  pos.x += sway * h2 * 0.6;
  pos.z += sway * h2 * 0.25;
  if (aKind > 0.5 && aKind < 1.5) pos.y += sin(uTime * 3.1 + aSeed * 6.2831) * 0.12 * aHeight;
  vec3 L = lightAt(aNormal, 0.35);
  col = aAlbedo * L * 0.95 + aAlbedo * pierGlow(pos) * 0.4;
  alpha = aKind < 0.5 ? 0.55 : 0.7;`;

export function addWashingtonia(pk, r, x, y, z, height, id) {
  const grow = Math.max(1, Math.hypot(x - VIEW.x, z - VIEW.z) / 70); // bigger specks for far palms
  const lean = [r.gauss() * 0.04, r.gauss() * 0.04];
  const trunk = [0.42, 0.36, 0.3];
  const rings = Math.floor(height / 0.38);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const cx = x + lean[0] * height * t * t;
    const cz = z + lean[1] * height * t * t;
    const rad = 0.26 - 0.08 * t;
    for (let k = 0; k < 2; k++) {
      const a = r() * Math.PI * 2;
      pk.push({ position: [cx + Math.cos(a) * rad, y + t * height, cz + Math.sin(a) * rad], aSize: 0.12 * grow, aSeed: r(), aNormal: [Math.cos(a), 0, Math.sin(a)], aAlbedo: trunk, aKind: 0, aTree: id, aHeight: t });
    }
  }
  const top = [x + lean[0] * height, y + height, z + lean[1] * height];
  // skirt of dead fronds hanging under the crown
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    const rad = 0.3 + r() * 0.35;
    pk.push({ position: [top[0] + Math.cos(a) * rad, top[1] - 0.4 - r() * 2.2, top[2] + Math.sin(a) * rad], aSize: 0.13 * grow, aSeed: r(), aNormal: [Math.cos(a), 0, Math.sin(a)], aAlbedo: [0.5, 0.4, 0.27], aKind: 2, aTree: id, aHeight: 1 });
  }
  // a small, round crown of fan leaves on long petioles
  const fronds = 22 + Math.floor(r() * 8);
  for (let f = 0; f < fronds; f++) {
    const a = r() * Math.PI * 2;
    const up = r() * 1.1 - 0.35;
    const len = 1.6 + r() * 0.6;
    const dir = [Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up)];
    for (let k = 0; k < 13; k++) {
      const s = (k + r()) / 13;
      const fan = s > 0.55 ? (r() - 0.5) * 0.9 * (s - 0.55) * 2 : 0;
      pk.push({
        position: [top[0] + dir[0] * len * s - Math.sin(a) * fan, top[1] + dir[1] * len * s - 0.25 * s * s + fan * 0.3, top[2] + dir[2] * len * s + Math.cos(a) * fan],
        aSize: 0.11 * grow,
        aSeed: r(),
        aNormal: dir,
        aAlbedo: [0.2, 0.36, 0.18],
        aKind: 1,
        aTree: id,
        aHeight: 1,
      });
    }
  }
}

export function palmCloud(pk) {
  return specks({ blend: 'normal',
    attributes: pk.attributes(),
    decl: 'attribute vec3 aNormal; attribute vec3 aAlbedo; attribute float aKind; attribute float aTree; attribute float aHeight;',
    body: PALM_BODY,
  });
}

export const palmPack = () => new Pack({ position: 3, aSize: 1, aSeed: 1, aNormal: 3, aAlbedo: 3, aKind: 1, aTree: 1, aHeight: 1 });

// ---- The bluff and the road at its foot ----

function bluff(scene) {
  const r = rng(401);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aNormal: 3, aAlbedo: 3, aEmit: 1 });
  const n = Math.floor(90000 * QUALITY);
  for (let i = 0; i < n; i++) {
    const x = 170 + Math.pow(r(), 1.7) * 2300;
    const H = bluffTop(x);
    const f = r();
    const y = 1.5 + f * (H - 1.5);
    const gully = Math.sin(x * 0.21 + Math.sin(x * 0.05) * 3) * 0.5 + 0.5;
    const z = bluffZ(x) + (y - 1.5) * SLOPE + gully * 1.5;
    const veg = r() < 0.35 + 0.3 * (1 - f) ? 1 : 0;
    const albedo = veg ? [0.24 + r() * 0.08, 0.34 + r() * 0.1, 0.18] : [0.56 + r() * 0.08, 0.46 + r() * 0.06, 0.34];
    pk.push({ position: [x, y, z], aSize: farSize(x, z, 0.2), aSeed: r(), aNormal: [0, SLOPE, -1], aAlbedo: albedo, aEmit: 0 });
  }
  const b = specks({ blend: 'normal',
    attributes: pk.attributes(),
    decl: 'attribute vec3 aNormal; attribute vec3 aAlbedo; attribute float aEmit;',
    body: 'col = aAlbedo * lightAt(normalize(aNormal), 0.3) * 0.95; alpha = 0.55;',
  });
  scene.add(b);
  // the bluff's solid face and the top it stands on
  const pos = [];
  const idx = [];
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const x = 170 + (2400 * i) / steps;
    const H = bluffTop(x) - 0.4;
    const z0 = bluffZ(x) + 0.8;
    pos.push(x, 0, z0, x, H, z0 + (H - 1.5) * SLOPE, x, H, z0 + 80, x, 0, z0 + 80);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 4;
    const c = (i + 1) * 4;
    idx.push(a, a + 1, c, a + 1, c + 1, c, a + 1, a + 2, c + 1, a + 2, c + 2, c + 1);
  }
  idx.push(0, 1, 2, 0, 2, 3); // the end by the bridge
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  scene.add(solid(geo, { albedo: [0.5, 0.42, 0.32], tone: 0.45 }));
}

// Pacific Coast Highway: headlights coming toward you, tail lights going away;
// after dark each car's specks stretch into a long-exposure trail.
function highway() {
  const r = rng(411);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aCar: 4 });
  const CARS = Math.floor(160 * Math.max(QUALITY, 0.7));
  for (let c = 0; c < CARS; c++) {
    const lane = Math.floor(r() * 4);
    const toward = lane < 2 ? 1 : 0;
    const speed = 14 + r() * 8;
    const phase = r();
    for (let k = 0; k < 10; k++) pk.push({ aSize: 0.35, aSeed: r(), aCar: [lane, speed, phase, k / 9] });
  }
  return specks({ blend: 'normal',
    attributes: pk.attributes(),
    decl: 'attribute vec4 aCar; float bluffZ(float x) { return 160.0 + 0.012 * (x - 170.0) + 3.0 * sin(x * 0.01); }',
    body: /* glsl */ `
      float lane = aCar.x; float speed = aCar.y; float phase = aCar.z; float k = aCar.w;
      float toward = step(lane, 1.5);
      float L = 2300.0;
      float s = fract(phase + uTime * speed / L * (toward > 0.5 ? -1.0 : 1.0));
      float trail = k * mix(3.8, 26.0, uLights); // metres behind the car
      float x = 160.0 + s * L + (toward > 0.5 ? trail : -trail);
      float z = bluffZ(x) - 12.0 + lane * 3.4;
      pos = vec3(x, 0.9, z);
      vec3 paint = vec3(hash11(phase * 17.0), hash11(phase * 29.0), hash11(phase * 41.0)) * 0.7 + 0.15;
      vec3 day = paint * lightAt(vec3(0.0, 1.0, 0.0), 0.3) * 0.8;
      vec3 night = toward > 0.5 ? vec3(1.0, 0.95, 0.85) * 2.2 : vec3(1.0, 0.15, 0.08) * 2.0;
      col = mix(day, night, uLights);
      alpha = mix(0.8 * step(k, 0.35), 0.9 * (1.0 - k), uLights) * smoothstep(160.0, 200.0, x);`,
  });
}

// ---- Buildings ----

function city(scene) {
  const b = new Builder(421);
  const r = b.r;
  const tones = [[0.9, 0.86, 0.78], [0.82, 0.84, 0.86], [0.92, 0.9, 0.84], [0.76, 0.72, 0.66], [0.62, 0.7, 0.78], [0.94, 0.88, 0.74]];
  // Ocean Avenue towers atop the bluff
  let x = 190;
  while (x < 1300) {
    const w = 14 + r() * 22;
    const h = 10 + Math.pow(r(), 2.2) * 34;
    const top = bluffTop(x + w / 2);
    const z0 = bluffZ(x) + top * SLOPE + 45 + r() * 25;
    const sz = farSize(x, z0, 0.12);
    b.box(x, x + w, z0, z0 + 16 + r() * 14, top, top + h, { albedo: r.pick(tones), roof: [0.45, 0.44, 0.42], spacing: sz * 1.6, size: sz, win: { cols: 0.28, rows: Math.round(h / 3.2), margin: 0.2 } });
    x += w + 6 + r() * 26;
  }
  // south of the pier: a hotel, apartments and shops behind Ocean Front Walk
  const hs = farSize(-125, 206, 0.12);
  b.box(-170, -80, 190, 226, 2.4, 24, { albedo: [0.9, 0.87, 0.8], roof: [0.5, 0.48, 0.45], spacing: hs * 1.6, size: hs, win: { cols: 0.3, rows: 7, margin: 0.2 } });
  let sx = -420;
  while (sx < 100) {
    if (sx > -175 && sx < -75) {
      sx = -75;
      continue;
    }
    const w = 12 + r() * 22;
    const h = 5 + r() * 10;
    const z0 = 176 + r() * 12;
    const s = farSize(sx, z0, 0.1);
    b.box(sx, sx + w, z0, z0 + 20 + r() * 18, 2.4, 2.4 + h, { albedo: r.pick(tones), roof: [0.5, 0.36, 0.3], spacing: s * 1.6, size: s, win: { cols: 0.3, rows: Math.round(h / 3.1), margin: 0.2 } });
    sx += w + 4 + r() * 10;
  }
  // lamps along Ocean Front Walk
  for (let lx = -420; lx < PIER.x - 12; lx += 18) {
    b.line([lx, 2.4, 153], [lx, 6.4, 153], 0.3, [0, 0, -1], [0.18, 0.2, 0.2], 0.1);
    for (let k = 0; k < 8; k++) b.dot([lx + (r() - 0.5) * 0.3, 6.6, 153 + (r() - 0.5) * 0.3], [0, 1, 0], [0.85, 0.85, 0.8], 0.16, 1);
  }
  scene.add(b.points({ alpha: 0.85, maxPx: 4 }));
  scene.add(b.stippled({ tone: 0.26 }));
}

export function createShore(scene) {
  bluff(scene);
  city(scene);
  scene.add(highway());

  const r = rng(431);
  const pk = palmPack();
  let id = 0;
  // Palisades Park, along the bluff top
  for (let x = 186; x < 1150; x += 8 + r() * 5) {
    if (r() < 0.12) continue;
    const top = bluffTop(x);
    addWashingtonia(pk, r, x, top, bluffZ(x) + top * SLOPE + 7 + r() * 3, 17 + r() * 9, id++);
  }
  // Ocean Front Walk and the beach lots south of the pier
  for (let x = -330; x < PIER.x - 20; x += 11 + r() * 8) {
    addWashingtonia(pk, r, x, 2.4, 156 + r() * 3, 15 + r() * 10, id++);
    if (r() < 0.3) addWashingtonia(pk, r, x + 3, 2.4, 166 + r() * 4, 13 + r() * 9, id++);
  }
  scene.add(palmCloud(pk));
  return {};
}
