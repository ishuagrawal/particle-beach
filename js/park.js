// Pacific Park: the Pacific Wheel turning slowly and running LED shows after
// dark, the West Coaster's track with a train that climbs the lift and races
// the circuit, and the Sea Dragon swinging on its A-frame. Ribbons trail the
// train and the ship.
import * as THREE from 'three';
import { U, rng, specks, Pack, QUALITY, presence, smoothstep, clamp } from './core.js';
import { PIER, WHEEL, RIDES } from './site.js';
import { Builder } from './build.js';

const DECK = PIER.deck;

const SKINS = [[0.96, 0.82, 0.7], [0.9, 0.7, 0.55], [0.76, 0.54, 0.4], [0.58, 0.39, 0.27], [0.42, 0.28, 0.2]];
const HAIRS = [[0.08, 0.06, 0.05], [0.2, 0.13, 0.08], [0.38, 0.25, 0.14], [0.78, 0.64, 0.4]];
const SHIRTS = [[0.9, 0.2, 0.25], [0.15, 0.45, 0.85], [0.95, 0.75, 0.15], [0.1, 0.65, 0.6], [0.95, 0.95, 0.92], [0.55, 0.3, 0.75]];

/** A seated rider as a few specks: head, shoulders and knees, facing +z locally. */
function rider(push, r, x, y, z, facing = 1, legs = true) {
  const skin = r.pick(SKINS);
  const hair = r.pick(HAIRS);
  const shirt = r.pick(SHIRTS);
  for (let i = 0; i < 16; i++) {
    const v = [r.gauss(), r.gauss(), r.gauss()];
    const l = Math.hypot(...v) || 1;
    const up = v[1] / l;
    push([x + (v[0] / l) * 0.1, y + 0.62 + (v[1] / l) * 0.11, z + (v[2] / l) * 0.1 * facing], up > 0.2 ? hair : skin, [v[0] / l, up, v[2] / l]);
  }
  for (let i = 0; i < 16; i++) push([x + (r() - 0.5) * 0.36, y + 0.18 + r() * 0.34, z + (r() - 0.5) * 0.18 * facing], shirt, [0, 0.3, facing]);
  if (legs) for (let i = 0; i < 10; i++) push([x + (r() < 0.5 ? -0.1 : 0.1), y - 0.05 - r() * 0.4, z + 0.3 * facing], skin, [0, 0, facing]);
}

// ---- The Pacific Wheel ----------------------------------------------------------

const LED_GLSL = /* glsl */ `
vec3 hue3(float h) { h = fract(h) * 6.0; return clamp(vec3(abs(h - 3.0) - 1.0, 2.0 - abs(h - 2.0), 2.0 - abs(h - 4.0)), 0.0, 1.0); }
vec3 ledProgram(float p, float ang, float rad, float spoke, float t, float seed) {
  if (p < 0.5) return hue3(ang / 6.2831853 + t * 0.08);
  if (p < 1.5) return hue3(floor(t * 0.25) * 0.37) * (0.2 + 0.8 * pow(0.5 + 0.5 * sin(rad * 16.0 - t * 5.0), 3.0));
  if (p < 2.5) return hue3(ang / 3.14159 + rad * 1.2 - t * 0.3) * (0.35 + 0.65 * step(0.4, fract(ang / 0.6283 + rad * 2.0 - t * 0.8)));
  if (p < 3.5) return vec3(1.0, 0.8, 0.45) * step(fract(spoke / 20.0 - t * 0.55), 0.3);
  if (p < 4.5) return hue3(0.8 + 0.12 * sin(t * 0.2)) * (0.45 + 0.55 * sin(t * 1.3));
  return vec3(0.9, 0.93, 1.0) * step(0.93, hash11(seed * 31.0 + floor(t * 9.0 + seed * 7.0))) + vec3(0.05, 0.08, 0.2);
}`;

const PROGRAMS = 6;
const PROG_SECONDS = 14;

function makeWheel() {
  const r = rng(201);
  const R = WHEEL.r;
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aPolar: 2, aKind: 1, aLocal: 3, aNormal: 3, aAlbedo: 3 }); // position is filled in the shader
  const steel = [0.86, 0.87, 0.88];
  const add = (kind, ang, rad, local, n, albedo, size) => pk.push({ aSize: size, aSeed: r(), aPolar: [ang, rad], aKind: kind, aLocal: local, aNormal: n, aAlbedo: albedo });
  const q = Math.max(QUALITY, 0.7);
  // two rims and an inner ring, one each side of the wheel's plane
  for (const side of [-1, 1]) {
    for (const [rad, step] of [[R, 0.07], [R * 0.86, 0.09]]) {
      const n = Math.floor((Math.PI * 2 * rad) / step * q);
      for (let i = 0; i < n; i++) add(0, (i / n) * Math.PI * 2, rad, [side * 1.0, 0, 0], [0, 0, 0], steel, 0.09);
    }
  }
  // twenty spokes from the hub to each rim
  for (let s = 0; s < 20; s++) {
    const a = (s / 20) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const n = Math.floor(120 * q);
      for (let i = 0; i < n; i++) {
        const t = (i + r()) / n;
        add(1 + s / 100, a + (side * 0.012), 0.8 + (R - 0.8) * t, [side * (1.9 - 0.9 * t), 0, 0], [side, 0, 0], steel, 0.08);
      }
    }
    for (let k = 0; k < 10; k++) add(0, a, R, [-1 + (k / 9) * 2, 0, 0], [0, 0, 0], steel, 0.08);
  }
  for (let i = 0; i < 160; i++) add(2, r() * Math.PI * 2, r() * 0.9, [(r() - 0.5) * 4, 0, 0], [1, 0, 0], [0.7, 0.7, 0.72], 0.1);
  // gondolas hang level from the rim
  const GONDOLA = [[0.95, 0.78, 0.2], [0.9, 0.3, 0.22], [0.2, 0.5, 0.85], [0.95, 0.78, 0.2], [0.35, 0.72, 0.45]];
  for (let s = 0; s < 20; s++) {
    const a = ((s + 0.5) / 20) * Math.PI * 2;
    const c = GONDOLA[s % GONDOLA.length];
    for (let i = 0; i < 110 * q; i++) {
      const face = r();
      let l;
      let n;
      if (face < 0.2) {
        l = [(r() - 0.5) * 1.6, -0.35, (r() - 0.5) * 1.6];
        n = [0, 1, 0];
      } else {
        const onX = face < 0.6;
        const sgn = r() < 0.5 ? -1 : 1;
        l = onX ? [sgn * 0.8, -0.35 - r() * 1.9, (r() - 0.5) * 1.6] : [(r() - 0.5) * 1.6, -0.35 - r() * 1.9, sgn * 0.8];
        n = onX ? [sgn, 0, 0] : [0, 0, sgn];
      }
      const window = l[1] < -0.8 && l[1] > -1.7;
      add(3, a, R, l, n, window ? [0.15, 0.18, 0.22] : c, 0.08);
    }
    // riders in most gondolas, heads and shoulders in the windows
    if (r() < 0.7) {
      const seats = 1 + Math.floor(r() * 3);
      for (let k = 0; k < seats; k++) rider((p, col, nn) => add(4, a, R, p, nn, col, 0.06), r, -0.4 + k * 0.4, -1.75, (k % 2 ? 1 : -1) * 0.35, k % 2 ? -1 : 1, false);
    }
  }
  const pts = specks({ blend: 'normal',
    attributes: pk.attributes(),
    uniforms: { uWheelAng: { value: 0 }, uLed: { value: 0 }, uProgA: { value: 0 }, uProgB: { value: 1 }, uProgMix: { value: 0 } },
    decl: `attribute vec2 aPolar; attribute float aKind; attribute vec3 aLocal; attribute vec3 aNormal; attribute vec3 aAlbedo;
      uniform float uWheelAng; uniform float uLed; uniform float uProgA; uniform float uProgB; uniform float uProgMix;
      ${LED_GLSL}`,
    body: /* glsl */ `
      float a = aPolar.x + uWheelAng;
      float rad = aPolar.y;
      vec3 C = WHEEL_C;
      vec3 radial = vec3(0.0, sin(a), cos(a));
      vec3 n = aNormal;
      if (aKind < 2.5) {
        pos = C + radial * rad + vec3(aLocal.x, 0.0, 0.0);
        if (aKind < 0.5) n = radial;
      } else {
        pos = C + radial * rad + aLocal;
      }
      vec3 L = lightAt(n, 0.3);
      col = aAlbedo * L * 0.9 + aAlbedo * pierGlow(pos) * 0.3;
      alpha = 0.6;
      if (aKind < 2.5 && uLed > 0.001) {
        float spoke = floor(fract(aKind) * 100.0 + 0.5);
        vec3 led = mix(ledProgram(uProgA, aPolar.x, rad / ${R.toFixed(2)}, spoke, uTime, aSeed), ledProgram(uProgB, aPolar.x, rad / ${R.toFixed(2)}, spoke, uTime, aSeed), uProgMix);
        col += led * 3.2 * uLed;
        alpha += uLed * 0.35 * max(max(led.r, led.g), led.b);
      }
      if (aKind > 2.5) col += vec3(1.0, 0.85, 0.6) * 0.25 * uLights;
      if (aKind > 3.5) alpha = 0.8 * uOpen;`,
    maxPx: 5,
  });
  return pts;
}

// Average colour of each LED programme, for light spilling onto sand and water.
const hue = (h, out) => {
  h = (((h % 1) + 1) % 1) * 6;
  return out.setRGB(Math.min(1, Math.max(0, Math.abs(h - 3) - 1)), Math.min(1, Math.max(0, 2 - Math.abs(h - 2))), Math.min(1, Math.max(0, 2 - Math.abs(h - 4))));
};
function programColor(p, t, out) {
  switch (p) {
    case 1:
      return hue(Math.floor(t * 0.25) * 0.37, out).multiplyScalar(0.45);
    case 3:
      return out.setRGB(0.3, 0.24, 0.14);
    case 4:
      return hue(0.8 + 0.12 * Math.sin(t * 0.2), out).multiplyScalar(0.45 + 0.4 * Math.sin(t * 1.3));
    case 5:
      return out.setRGB(0.1, 0.12, 0.2);
    default:
      return out.setRGB(0.42, 0.42, 0.44);
  }
}

// The wheel's A-frame legs, loading platform and the red light on top.
function wheelFrame(b) {
  const { x, y, z } = WHEEL;
  for (const side of [-1, 1]) {
    const fx = x + side * 2.3;
    for (const dz of [-8.5, 8.5]) b.line([fx, DECK, z + dz], [x + side * 1.3, y, z], 0.1, [side, 0, 0], [0.84, 0.85, 0.86], 0.11);
    b.line([fx, DECK + 4, z - 6], [fx, DECK + 4, z + 6], 0.12, [side, 0, 0], [0.84, 0.85, 0.86], 0.1);
  }
  b.box(x - 3.5, x + 3.5, z + 9.5, z + 14.5, DECK, DECK + 3, { albedo: [0.92, 0.9, 0.86], win: { cols: 0.4, rows: 1, margin: 0.25 } });
}

// ---- The West Coaster --------------------------------------------------------------

const TRACK = [
  [138, 3.0, 18], [139, 3.2, 8], [139.5, 9, -4], [139.5, 15.5, -16], [136, 15.8, -26], [128, 6, -33], [120, 3.2, -30],
  [116.5, 9.5, -20], [117, 12, -6], [118, 5, 6], [122, 9, 17], [129, 11.5, 20], [133, 6.5, 12], [131, 8.5, 2],
  [126, 5, -6], [130, 4, -12], [135, 3.5, -4], [136.5, 3, 10],
].map(([x, h, z]) => new THREE.Vector3(x, DECK + h, z));

function trackCurve() {
  const curve = new THREE.CatmullRomCurve3(TRACK, true, 'centripetal');
  const length = curve.getLength();
  return { curve, length };
}

const UP = new THREE.Vector3(0, 1, 0);

function coasterTrack(b, curve, length) {
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  const P = new THREE.Vector3();
  const rail = [0.88, 0.3, 0.22];
  const steps = Math.floor(length / 0.12);
  for (let i = 0; i < steps; i++) {
    const u = i / steps;
    curve.getPointAt(u, P);
    curve.getTangentAt(u, T);
    B.crossVectors(T, UP).normalize();
    for (const s of [-0.5, 0.5]) b.dot([P.x + B.x * s, P.y, P.z + B.z * s], [0, 1, 0], rail, 0.08);
    if (i % 8 === 0) for (let k = -2; k <= 2; k++) b.dot([P.x + B.x * k * 0.25, P.y - 0.12, P.z + B.z * k * 0.25], [0, 1, 0], [0.5, 0.48, 0.46], 0.07);
    if (i % 12 === 0) b.dot([P.x + B.x * 0.62, P.y + 0.05, P.z + B.z * 0.62], [0, 1, 0], [0.9, 0.9, 0.85], 0.11, 1);
  }
  // supports down to the deck, braced on the tall ones
  const supports = Math.floor(length / 3.5);
  for (let i = 0; i < supports; i++) {
    const u = i / supports;
    curve.getPointAt(u, P);
    curve.getTangentAt(u, T);
    B.crossVectors(T, UP).normalize();
    if (P.y - DECK < 1.2) continue;
    for (const s of [-0.55, 0.55]) b.line([P.x + B.x * s, DECK, P.z + B.z * s], [P.x + B.x * s, P.y - 0.2, P.z + B.z * s], 0.3, [B.x, 0, B.z], [0.74, 0.74, 0.72], 0.08);
    if (P.y - DECK > 6) b.line([P.x - B.x * 0.55, DECK + 1, P.z - B.z * 0.55], [P.x + B.x * 0.55, P.y - 1, P.z + B.z * 0.55], 0.35, [B.x, 0, B.z], [0.74, 0.74, 0.72], 0.07);
  }
}

// A car: an open tub with a row of riders' heads.
function carShape(r) {
  const pts = [];
  const cols = [];
  for (let i = 0; i < 70; i++) {
    const u = r() - 0.5;
    const w = r() - 0.5;
    const edge = r();
    if (edge < 0.5) pts.push([u * 1.6, -0.1 + r() * 0.5, Math.sign(w) * 0.55]);
    else if (edge < 0.75) pts.push([Math.sign(u) * 0.8, -0.1 + r() * 0.5, w * 1.1]);
    else pts.push([u * 1.6, -0.1, w * 1.1]);
    cols.push([0.95, 0.72, 0.12]);
  }
  for (const hx of [-0.4, 0.4]) {
    for (let i = 0; i < 14; i++) {
      pts.push([hx + (r() - 0.5) * 0.25, 0.75 + (r() - 0.5) * 0.25, (r() - 0.5) * 0.25]);
      cols.push([0.85, 0.66, 0.52]);
    }
  }
  return { pts, cols };
}

// ---- The Sea Dragon ------------------------------------------------------------------

const DRAGON = { x: 128, z: 32, pivot: DECK + 11, arm: 8.5 };

function dragonFrame(b) {
  const { x, z, pivot } = DRAGON;
  for (const dx of [-2.2, 2.2]) {
    for (const dz of [-5, 5]) b.line([x + dx, DECK, z + dz], [x + dx * 0.4, pivot, z], 0.1, [Math.sign(dx), 0, 0], [0.3, 0.55, 0.45], 0.11);
  }
  b.line([x - 1.2, pivot, z], [x + 1.2, pivot, z], 0.1, [0, 1, 0], [0.3, 0.3, 0.32], 0.11);
}

function makeDragon() {
  const r = rng(233);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aNormal: 3, aAlbedo: 3 });
  const hull = [0.72, 0.16, 0.14];
  const trim = [0.95, 0.78, 0.25];
  for (let i = 0; i < 700 * QUALITY + 200; i++) {
    const u = r() * 2 - 1; // along the boat, −1 stern to +1 bow
    const curve = 0.9 * u * u; // ends sweep up
    const side = r() < 0.5 ? -1 : 1;
    const y = -DRAGON.arm + curve + r() * 1.3;
    const w = 1.2 * (1 - 0.5 * u * u);
    pk.push({ position: [side * w, y, u * 4.6], aSize: 0.1, aSeed: r(), aNormal: [side, 0, 0], aAlbedo: y > -DRAGON.arm + curve + 1.1 ? trim : hull });
  }
  // dragon head and tail curls
  for (const [end, dir] of [[4.6, 1], [-4.6, -1]]) {
    for (let i = 0; i < 90; i++) {
      const t = i / 90;
      const a = t * Math.PI * 1.3;
      pk.push({ position: [(r() - 0.5) * 0.4, -DRAGON.arm + 0.9 + Math.sin(a) * 1.4, end + dir * (0.2 + (1 - Math.cos(a)) * 0.8)], aSize: 0.12, aSeed: r(), aNormal: [1, 0, 0], aAlbedo: [0.2, 0.6, 0.35] });
    }
  }
  // the arms up to the pivot
  for (const dz of [-1.5, 1.5]) {
    for (let i = 0; i < 60; i++) {
      const t = i / 60;
      pk.push({ position: [0, -DRAGON.arm * t, dz * t], aSize: 0.08, aSeed: r(), aNormal: [1, 0, 0], aAlbedo: [0.8, 0.8, 0.78] });
    }
  }
  // rows of riders along the boat
  const riders = new Pack({ position: 3, aSize: 1, aSeed: 1, aNormal: 3, aAlbedo: 3 });
  for (let row = 0; row < 7; row++) {
    const u = -0.72 + row * 0.24;
    for (const x of [-0.75, -0.25, 0.25, 0.75]) {
      if (r() < 0.15) continue;
      rider((p, c, n) => riders.push({ position: p, aSize: 0.07, aSeed: r(), aNormal: n, aAlbedo: c }), r, x, -DRAGON.arm + 0.9 * u * u + 0.55, u * 4.6, row < 3 ? -1 : 1, false);
    }
  }
  const all = pk.attributes();
  const extra = riders.attributes();
  const merged = {};
  for (const k of Object.keys(all)) {
    const [a, size] = Array.isArray(all[k]) ? all[k] : [all[k], k === 'position' ? 3 : 1];
    const [b2] = Array.isArray(extra[k]) ? extra[k] : [extra[k]];
    const m = new Float32Array(a.length + b2.length);
    m.set(a);
    m.set(b2, a.length);
    merged[k] = k === 'position' || size === 1 ? m : [m, size];
  }
  merged.aRider = new Float32Array(pk.count + riders.count).fill(1, pk.count);
  const pts = specks({ blend: 'normal',
    attributes: merged,
    decl: 'attribute vec3 aNormal; attribute vec3 aAlbedo; attribute float aRider;',
    body: `col = aAlbedo * lightAt(aNormal, 0.3) * 0.9 + aAlbedo * pierGlow(position) * 0.3 + vec3(1.0, 0.8, 0.5) * 0.2 * uLights; alpha = 0.62 * mix(1.0, uOpen, aRider);`,
  });
  pts.position.set(DRAGON.x, DRAGON.pivot, DRAGON.z);
  return pts;
}

// ---- Pacific Plunge, Inkie's Scrambler and the Seaside Swing ---------------------

/** Specks whose positions are rebuilt each frame from rigid parts. */
class Parts {
  constructor(scene, parts, size = 0.07) {
    this.parts = parts; // [{ pts: [[x, y, z]], cols: [[r, g, b]] }]
    const n = parts.reduce((s, p) => s + p.pts.length, 0);
    this.pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let i = 0;
    for (const p of parts) {
      p.off = i;
      p.cols.forEach((c) => col.set(c, 3 * i++));
    }
    this.points = specks({
      blend: 'normal',
      attributes: { position: this.pos, aColor: [col, 3], aSize: new Float32Array(n).fill(size), aSeed: Float32Array.from({ length: n }, (_, k) => (k * 0.618) % 1) },
      uniforms: { uOn: { value: 1 } },
      decl: 'attribute vec3 aColor; uniform float uOn;',
      body: 'col = aColor * lightAt(vec3(0.0, 1.0, 0.0), 0.6) * 0.9 + aColor * pierGlow(position) * 0.4 + vec3(1.0, 0.85, 0.6) * 0.15 * uLights; alpha = 0.72 * uOn;',
      maxPx: 8,
    });
    this.points.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.points);
  }

  /** Place part k with origin o and axes x, y, z (local point = o + x·a + y·b + z·c). */
  place(k, o, x, y, z) {
    const p = this.parts[k];
    const P = this.pos;
    p.pts.forEach(([a, b, c], j) => {
      const i = (p.off + j) * 3;
      P[i] = o.x + x.x * a + y.x * b + z.x * c;
      P[i + 1] = o.y + x.y * a + y.y * b + z.y * c;
      P[i + 2] = o.z + x.z * a + y.z * b + z.z * c;
    });
  }

  commit() {
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

const part = () => ({ pts: [], cols: [] });
const into = (pt) => (p, c) => (pt.pts.push(p), pt.cols.push(c));

function plungeFrame(b) {
  const { x, z, height } = RIDES.plunge;
  const steel = [0.85, 0.86, 0.88];
  for (const dx of [-0.7, 0.7]) for (const dz of [-0.7, 0.7]) b.line([x + dx, DECK, z + dz], [x + dx, DECK + height, z + dz], 0.12, [Math.sign(dx), 0, 0], steel, 0.1);
  for (let y = DECK + 1; y < DECK + height; y += 1.2) {
    b.line([x - 0.7, y, z - 0.7], [x + 0.7, y + 0.6, z - 0.7], 0.1, [0, 0, -1], steel, 0.06);
    b.line([x - 0.7, y, z + 0.7], [x + 0.7, y + 0.6, z + 0.7], 0.1, [0, 0, 1], steel, 0.06);
  }
  // the crown, lit after dark, and a ring of chaser lights up the tower
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * Math.PI * 2;
    b.dot([x + Math.cos(a) * 1.3, DECK + height + 0.4, z + Math.sin(a) * 1.3], [Math.cos(a), 0, Math.sin(a)], [0.95, 0.6, 0.2], 0.12, k % 3 ? 3 + ((k * 0.13) % 1) : 1);
  }
  for (let y = DECK + 2; y < DECK + height; y += 0.9) b.dot([x + 0.72, y, z], [1, 0, 0], [0.9, 0.9, 0.9], 0.1, 3 + ((y * 0.07) % 1));
}

function makePlunge(scene) {
  const r = rng(271);
  const parts = [part(), part()];
  for (const [k, side] of [[0, 1], [1, -1]]) {
    const pt = parts[k];
    const add = into(pt);
    // a five-seat bench facing out from the tower
    for (let i = 0; i < 90; i++) add([side * (0.95 + r() * 0.25), r() * 0.12, (r() - 0.5) * 3.2], [0.2, 0.25, 0.3]);
    for (let i = 0; i < 60; i++) add([side * 0.85, r() * 1.1, (r() - 0.5) * 3.2], [0.9, 0.3, 0.2]);
    for (let s = 0; s < 5; s++) if (r() < 0.85) rider((p, c) => add([side * (1.12 + p[2]), p[1], p[0] + (s - 2) * 0.66], c), r, 0, 0.2, 0, 1, true);
  }
  return new Parts(scene, parts, 0.07);
}

function scramblerFrame(b) {
  const { x, z } = RIDES.scrambler;
  b.column(x, z, DECK, DECK + 3.2, 0.45, 0.22, 10, [0.95, 0.8, 0.2], 0.1);
  // a low fence round the ride
  for (let k = 0; k < 140; k++) {
    const a = (k / 140) * Math.PI * 2;
    for (const h of [0.35, 0.9]) b.dot([x + Math.cos(a) * 7.2, DECK + h, z + Math.sin(a) * 7.2], [Math.cos(a), 0, Math.sin(a)], [0.85, 0.2, 0.3], 0.07);
  }
}

function makeScrambler(scene) {
  const r = rng(281);
  const parts = [];
  // 0–2: the main arms; 3–5: the sub-hub crosses; 6–17: the cars
  for (let k = 0; k < 3; k++) {
    const pt = part();
    for (let i = 0; i < 40; i++) into(pt)([i * 0.12, 0, (r() - 0.5) * 0.12], [0.95, 0.8, 0.2]);
    parts.push(pt);
  }
  for (let k = 0; k < 3; k++) {
    const pt = part();
    for (let arm = 0; arm < 4; arm++) for (let i = 0; i < 12; i++) {
      const a = (arm / 4) * Math.PI * 2;
      into(pt)([Math.cos(a) * i * 0.16, -0.1, Math.sin(a) * i * 0.16], [0.8, 0.8, 0.82]);
    }
    parts.push(pt);
  }
  const TUBS = [[0.95, 0.25, 0.3], [0.2, 0.6, 0.95], [0.3, 0.85, 0.45], [0.98, 0.7, 0.15]];
  for (let k = 0; k < 12; k++) {
    const pt = part();
    const add = into(pt);
    const c = TUBS[k % 4];
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const rim = r() < 0.7;
      add([Math.cos(a) * (rim ? 0.62 : r() * 0.62), rim ? r() * 0.55 : 0, Math.sin(a) * (rim ? 0.5 : r() * 0.5)], c);
    }
    const seats = r() < 0.8 ? 2 : 1;
    for (let s = 0; s < seats; s++) rider(add, r, (s - (seats - 1) / 2) * 0.42, 0.25, 0, 1, false);
    parts.push(pt);
  }
  return new Parts(scene, parts, 0.07);
}

function swingFrame(b) {
  const { x, z, pivot } = RIDES.swing;
  const steel = [0.2, 0.55, 0.85];
  for (const dx of [-2.45, 2.45]) {
    for (const dz of [-3.3, 3.3]) b.line([x + dx, DECK, z + dz], [x + dx, DECK + pivot, z], 0.1, [Math.sign(dx), 0, 0], steel, 0.11);
  }
  b.line([x - 2.45, DECK + pivot, z], [x + 2.45, DECK + pivot, z], 0.08, [0, 1, 0], [0.3, 0.3, 0.32], 0.11);
  for (let k = 0; k < 24; k++) b.dot([x - 2.45 + (k / 23) * 4.9, DECK + pivot + 0.25, z], [0, 1, 0], [0.95, 0.8, 0.3], 0.1, k % 2 ? 3 + k / 24 : 1);
}

function makeSwing(scene) {
  const r = rng(291);
  const { arm } = RIDES.swing;
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aNormal: 3, aAlbedo: 3, aRider: 1 });
  const add = (p, c, n = [0, 1, 0], s = 0.08, rid = 0) => pk.push({ position: p, aSize: s, aSeed: r(), aNormal: n, aAlbedo: c, aRider: rid });
  // two arms down from the axle to a back-to-back bench
  for (const dx of [-1.9, 1.9]) for (let i = 0; i < 60; i++) add([dx, -(i / 60) * arm, 0], [0.85, 0.85, 0.86], [1, 0, 0], 0.07);
  for (let i = 0; i < 260; i++) {
    const u = (r() - 0.5) * 4;
    const back = r() < 0.4;
    add([u, -arm + (back ? r() * 0.9 : 0), back ? (r() - 0.5) * 0.12 : (r() - 0.5) * 1.1], back ? [0.2, 0.55, 0.85] : [0.95, 0.85, 0.3], [0, 1, 0], 0.08);
  }
  for (const facing of [-1, 1]) for (let s = 0; s < 8; s++) if (r() < 0.8) rider((p, c, n) => add(p, c, n, 0.07, 1), r, -1.75 + s * 0.5, -arm + 0.1, facing * 0.35, facing, true);
  const pts = specks({ blend: 'normal',
    attributes: pk.attributes(),
    decl: 'attribute vec3 aNormal; attribute vec3 aAlbedo; attribute float aRider;',
    body: `col = aAlbedo * lightAt(aNormal, 0.3) * 0.9 + aAlbedo * pierGlow(position) * 0.3 + vec3(1.0, 0.8, 0.5) * 0.2 * uLights; alpha = 0.66 * mix(1.0, uOpen, aRider);`,
    maxPx: 8,
  });
  pts.position.set(RIDES.swing.x, DECK + RIDES.swing.pivot, RIDES.swing.z);
  scene.add(pts);
  return pts;
}

// ---- Assembly and motion ----------------------------------------------------------

export function createPark(scene, ribbons) {
  const wheel = makeWheel();
  const b = new Builder(211, { fine: 2, lineNear: 30 });
  wheelFrame(b);
  const { curve, length } = trackCurve();
  coasterTrack(b, curve, length);
  dragonFrame(b);
  plungeFrame(b);
  scramblerFrame(b);
  swingFrame(b);
  scene.add(wheel, b.points({ alpha: 0.8, maxPx: 18 }), b.stippled({ tone: 0.45 }));
  const plunge = makePlunge(scene);
  const scrambler = makeScrambler(scene);
  const swing = makeSwing(scene);
  const V3 = () => new THREE.Vector3();
  const pO = V3(), pX = V3(), pY = V3(), pZ = V3();
  let scrT = 0;
  let scrA = 0;
  let scrB = 0;
  let benchT = 0;
  const dragon = makeDragon();
  scene.add(dragon);

  // the train: five cars rebuilt into one small dynamic cloud each frame
  const r = rng(221);
  const car = carShape(r);
  const CARS = 5;
  const per = car.pts.length;
  const trainPos = new Float32Array(CARS * per * 3);
  const trainCol = new Float32Array(CARS * per * 3);
  const trainSize = new Float32Array(CARS * per).fill(0.1);
  const trainSeed = Float32Array.from({ length: CARS * per }, () => r());
  for (let c = 0; c < CARS; c++) for (let i = 0; i < per; i++) trainCol.set(car.cols[i], (c * per + i) * 3);
  const train = specks({ blend: 'normal',
    attributes: { position: trainPos, aColor: [trainCol, 3], aSize: trainSize, aSeed: trainSeed },
    uniforms: { uTrainOn: { value: 0 } },
    decl: 'attribute vec3 aColor; uniform float uTrainOn;',
    body: 'col = aColor * lightAt(vec3(0.0, 1.0, 0.0), 0.5) * 0.9 + vec3(1.0, 0.85, 0.6) * 0.3 * uLights; alpha = 0.7 * uTrainOn;',
  });
  train.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  scene.add(train);

  const trainRibs = [
    ribbons.create({ width: 0.45, life: 1.6, minDist: 0.15, colorA: '#ffd36b', colorB: '#ff4f7a', twist: 1.4, strands: 3, drift: [0, 0.3, 0], billow: 0.3, specks: 40 }),
    ribbons.create({ width: 0.3, life: 1.2, minDist: 0.15, colorA: '#fff1c4', colorB: '#6f8bff', twist: 1.8, strands: 2, drift: [0, 0.4, 0], billow: 0.35, specks: 30 }),
  ];
  const dragonRibs = [
    ribbons.create({ width: 0.5, life: 1.4, minDist: 0.12, colorA: '#7dffc4', colorB: '#2a7bff', twist: 1.0, strands: 3, drift: [0, 0.1, 0], billow: 0.2, specks: 30 }),
    ribbons.create({ width: 0.5, life: 1.4, minDist: 0.12, colorA: '#ffe08a', colorB: '#ff5a3c', twist: 1.0, strands: 3, drift: [0, 0.1, 0], billow: 0.2, specks: 30 }),
  ];

  const wu = wheel.material.uniforms;
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  const N = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const avg = new THREE.Color();
  const avgB = new THREE.Color();
  let wheelAng = 0;
  let s = 0; // train position along the track (m)
  let v = 0;
  let dwell = 4;
  let swingT = 0;

  // the lift hill: from the station up to its crest
  const liftStart = 0.02 * length;
  const liftEnd = 0.2 * length;
  // for the trailer camera: where the train is, and a way to cue it
  const probe = {
    train: new THREE.Vector3(),
    trainDir: new THREE.Vector3(),
    speed: 0,
    length,
    curve,
    cue(at, speed) {
      s = at * length;
      v = speed;
      dwell = 0;
      trainRibs.forEach((rb) => rb.reset());
    },
  };

  return {
    probe,
    update(t, dt, { hour }) {
      const open = presence(hour, 10.9, 23.1, 0.25);
      U.uOpen.value = open;

      // wheel: turns during park hours; the LED show runs from dusk to 1 am
      wheelAng += dt * 0.055 * open;
      wu.uWheelAng.value = wheelAng;
      const led = smoothstep(0.35, 0.8, U.uLights.value) * (1 - presence(hour, 1, 5.5, 0.3));
      wu.uLed.value = led;
      const k = t / PROG_SECONDS;
      const pa = Math.floor(k) % PROGRAMS;
      const pb = (pa + 1) % PROGRAMS;
      const mixAB = smoothstep(0.85, 1, k - Math.floor(k));
      wu.uProgA.value = pa;
      wu.uProgB.value = pb;
      wu.uProgMix.value = mixAB;
      programColor(pa, t, avg);
      programColor(pb, t, avgB);
      U.uWheelCol.value.copy(avg).lerp(avgB, mixAB).multiplyScalar(led);

      // coaster: dwell in the station, climb the lift, then let gravity run it
      const running = open > 0.5;
      if (dwell > 0) {
        dwell -= dt;
        v = 0;
        if (!running) dwell = Math.max(dwell, 1);
      } else {
        const u = s / length;
        curve.getPointAt(Math.min(0.9999, u), P);
        if (s >= liftStart && s < liftEnd) v = 2.4;
        else {
          curve.getTangentAt(Math.min(0.9999, u), T);
          v = Math.max(3, v - 9.81 * T.y * dt - 0.08 * v * dt);
          if (s > length * 0.965) v = Math.max(1.2, v - 6 * dt);
        }
        s += v * dt;
        if (s >= length) {
          s = 0;
          dwell = 7;
          trainRibs.forEach((rb) => rb.reset());
        }
      }
      train.material.uniforms.uTrainOn.value = open;
      for (let c = 0; c < CARS; c++) {
        const sc = ((s - c * 2.0) % length + length) % length;
        const u = sc / length;
        curve.getPointAt(u, P);
        curve.getTangentAt(u, T);
        B.crossVectors(T, UP).normalize();
        N.crossVectors(B, T).normalize();
        for (let i = 0; i < per; i++) {
          const [lx, ly, lz] = car.pts[i];
          const o = (c * per + i) * 3;
          trainPos[o] = P.x + T.x * lx + N.x * (ly + 0.35) + B.x * lz;
          trainPos[o + 1] = P.y + T.y * lx + N.y * (ly + 0.35) + B.y * lz;
          trainPos[o + 2] = P.z + T.z * lx + N.z * (ly + 0.35) + B.z * lz;
        }
        if (c === 0) {
          probe.train.copy(P);
          probe.trainDir.copy(T);
          probe.speed = v;
        }
        if (c === CARS - 1) {
          tmp.copy(P).addScaledVector(N, 1.2).addScaledVector(T, -0.8);
          trainRibs[0].follow(tmp.clone().addScaledVector(B, -0.4));
          trainRibs[1].follow(tmp.addScaledVector(B, 0.4));
        }
      }
      train.geometry.attributes.position.needsUpdate = true;
      const moving = v > 3 ? 1 : smoothstep(0, 3, v);
      trainRibs.forEach((rb) => (rb.fade = open * moving));

      // Pacific Plunge: load, a slow lift up the tower, a pause at the top, the drop
      {
        const cyc = 70;
        const k = (((t * open) % cyc) + cyc) % cyc;
        const top = RIDES.plunge.height - 2.4;
        let h = 1.1;
        if (k > 18 && k < 32) h = 1.1 + (top - 1.1) * smoothstep(18, 32, k);
        else if (k >= 32 && k < 35) h = top;
        else if (k >= 35 && k < 36.5) {
          const f = k - 35;
          h = Math.max(2.2, top - 0.5 * 9.81 * f * f);
        } else if (k >= 36.5 && k < 40) h = 1.1 + 1.1 * Math.exp(-(k - 36.5) * 1.6) * Math.cos((k - 36.5) * 5);
        pX.set(1, 0, 0);
        pY.set(0, 1, 0);
        pZ.set(0, 0, 1);
        pO.set(RIDES.plunge.x, DECK + h, RIDES.plunge.z);
        plunge.place(0, pO, pX, pY, pZ);
        plunge.place(1, pO, pX, pY, pZ);
        plunge.commit();
      }

      // Inkie's Scrambler: three arms one way, the cars whirling round the other
      {
        const cyc = 95;
        const k = (((t * open) % cyc) + cyc) % cyc;
        const speed = smoothstep(0, 8, k) * (1 - smoothstep(58, 66, k));
        scrT += dt * speed;
        scrA -= dt * speed * 0.95;
        scrB += dt * speed * 1.9;
        const { x, z } = RIDES.scrambler;
        for (let a = 0; a < 3; a++) {
          const ang = scrA + (a / 3) * Math.PI * 2;
          pX.set(Math.cos(ang), 0, Math.sin(ang));
          pZ.set(-Math.sin(ang), 0, Math.cos(ang));
          pY.set(0, 1, 0);
          pO.set(x, DECK + 2.9, z);
          scrambler.place(a, pO, pX, pY, pZ);
          const hx = x + Math.cos(ang) * 4.6;
          const hz = z + Math.sin(ang) * 4.6;
          const sub = scrB + a;
          pX.set(Math.cos(sub), 0, Math.sin(sub));
          pZ.set(-Math.sin(sub), 0, Math.cos(sub));
          pO.set(hx, DECK + 2.8, hz);
          scrambler.place(3 + a, pO, pX, pY, pZ);
          for (let c = 0; c < 4; c++) {
            const ca = sub + (c / 4) * Math.PI * 2;
            pO.set(hx + Math.cos(ca) * 1.9, DECK + 0.45, hz + Math.sin(ca) * 1.9);
            pZ.set(Math.cos(ca), 0, Math.sin(ca));
            pX.set(Math.sin(ca), 0, -Math.cos(ca));
            scrambler.place(6 + a * 4 + c, pO, pX, pY, pZ);
          }
        }
        scrambler.commit();
      }

      // Seaside Swing: a two-sided bench swaying out to 45 degrees
      {
        benchT += dt * open;
        const cyc = benchT % 75;
        const amp = cyc < 62 ? 0.79 * smoothstep(0, 14, cyc) * (1 - smoothstep(46, 62, cyc)) : 0;
        swing.rotation.x = amp * Math.sin((benchT * Math.PI * 2) / 6.2);
        swing.updateMatrixWorld();
      }

      // Sea Dragon: 80 s rides with a 12 s pause, amplitude building and fading
      swingT += dt * open;
      const cyc = swingT % 92;
      const amp = cyc < 80 ? 0.95 * smoothstep(0, 22, cyc) * (1 - smoothstep(58, 80, cyc)) : 0;
      const ang = amp * Math.sin((swingT * Math.PI * 2) / 6.4);
      dragon.rotation.x = ang;
      dragon.updateMatrixWorld();
      for (const [i, end] of [[0, 4.9], [1, -4.9]]) {
        tmp.set(0, -DRAGON.arm + 2.2, end).applyMatrix4(dragon.matrixWorld);
        dragonRibs[i].follow(tmp);
        dragonRibs[i].fade = smoothstep(0.15, 0.5, amp);
      }
    },
  };
}
