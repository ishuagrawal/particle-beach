// Traffic over and on the bay: jets climbing out of LAX to the south with
// their nav lights and strobes, a high airliner drawing a contrail, a banner
// plane towing tonight's sunset time along the beach, sailboats out of Marina
// del Rey, an LA County lifeguard rescue boat on patrol, and paddleboarders.
import * as THREE from 'three';
import { rng, specks, Pack, QUALITY, presence, smoothstep } from './core.js';
import { shoreZ, PIER } from './site.js';
import { seaHeight } from './surf.js';
import { FigureCloud, Body, Shape, Line, HUMAN, GAITS, outfit, poseGait, poseSit, fillPolygon } from './rigs.js';
import { textPoints } from './text.js';

const D2R = Math.PI / 180;
const V = () => new THREE.Vector3();
const O = V(), X = V(), Y = V(), Z = V(), tmp = V();

// Jets are drawn in their own layer so their lights can blink and glow.
function makeJets() {
  const r = rng(801);
  const pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aJet: 1, aLocal: 3, aKind: 1 });
  const JETS = 3;
  for (let j = 0; j < JETS; j++) {
    const body = (l, k, n, size) => {
      for (let i = 0; i < n; i++) pk.push({ aSize: size, aSeed: r(), aJet: j, aLocal: l(), aKind: k });
    };
    body(() => [r.range(-20, 20), r.range(-1.6, 1.6), r.range(-1.6, 1.6)], 0, 160, 1.1); // fuselage
    body(() => {
      const u = r();
      return [r.range(-4, 3) - u * 6, 0, (r() < 0.5 ? -1 : 1) * u * 18];
    }, 0, 140, 1.0); // wings
    body(() => [-18 - r() * 3, r() * 7, 0], 0, 30, 1.0); // fin
    for (const [l, k] of [[[-6, 0, -18], 1], [[-6, 0, 18], 2], [[-21, 7, 0], 3], [[0, -1.8, 0], 3], [[4, -1.6, 0], 4], [[16, -1, 0], 5]]) {
      for (let i = 0; i < 3; i++) pk.push({ aSize: 2.2, aSeed: r(), aJet: j, aLocal: l, aKind: k });
    }
  }
  // the high airliner and its contrail
  for (let i = 0; i < 80; i++) pk.push({ aSize: 1.0, aSeed: r(), aJet: 9, aLocal: [r.range(-6, 6), 0, 0], aKind: 0 });
  for (let i = 0; i < Math.floor(2200 * Math.max(QUALITY, 0.6)); i++) pk.push({ aSize: 1.2, aSeed: r(), aJet: 9, aLocal: [0, 0, 0], aKind: 6 });
  return specks({
    attributes: pk.attributes(),
    pixelSize: true,
    fog: false,
    decl: 'attribute float aJet; attribute vec3 aLocal; attribute float aKind;',
    body: /* glsl */ `
      vec3 C = vec3(cameraPosition.x, 0.0, cameraPosition.z);
      if (aJet < 8.5) {
        // departures climb out westward over the sea, one every 80 s or so
        float cyc = 80.0;
        float k = fract((uTime + aJet * cyc / 3.0) / cyc);
        float b = radians(mix(-78.0, -28.0, k));
        float R = mix(2300.0, 1500.0, k);
        float el = radians(mix(0.8, 11.0, k * k));
        vec3 P = C + vec3(sin(b) * R, tan(el) * R, -cos(b) * R);
        vec3 F = normalize(vec3(cos(b) * 0.6, 0.18, sin(b) * 0.6) + vec3(0.0, 0.0, -0.5));
        vec3 S = normalize(cross(F, vec3(0.0, 1.0, 0.0)));
        vec3 Uu = cross(S, F);
        pos = P + F * aLocal.x + Uu * aLocal.y + S * aLocal.z;
        float show = smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.85, 1.0, k));
        vec3 hazeC = mix(uSkyAnti, uSkyHorizon, 0.5) * uBg * 0.6;
        if (aKind < 0.5) {
          col = mix(vec3(0.8, 0.82, 0.86) * (uAmb * 0.6 + uSunColor * uSunVis * 0.6), hazeC, 0.35);
          alpha = 0.6 * show;
        } else {
          float night = uLights;
          if (aKind < 1.5) col = vec3(1.0, 0.1, 0.08) * 2.5;
          else if (aKind < 2.5) col = vec3(0.1, 1.0, 0.3) * 2.5;
          else if (aKind < 3.5) col = vec3(1.0, 0.15, 0.1) * 3.0 * step(0.82, fract(uTime * 1.1 + aJet * 0.3));
          else if (aKind < 4.5) col = vec3(1.0) * 4.0 * step(0.9, fract(uTime * 1.3 + aJet * 0.21)) * step(0.5, fract(uTime * 2.6));
          else col = vec3(1.0, 0.97, 0.9) * 3.0 * (1.0 - smoothstep(0.3, 0.6, k));
          alpha = show * (0.2 + 0.8 * night) * min(1.0, length(col));
        }
      } else {
        // an airliner at cruise, high over the bay, trailing a contrail
        float cyc = 210.0;
        float k = fract(uTime / cyc + 0.3);
        float R = 2600.0;
        float az = radians(mix(-30.0, 120.0, k));
        float el = radians(38.0 + 6.0 * sin(k * 3.14));
        vec3 dir = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
        vec3 head = C + dir * R;
        if (aKind < 5.5) {
          vec3 F = normalize(vec3(cos(az), 0.0, sin(az)));
          pos = head + F * aLocal.x;
          col = vec3(0.9, 0.92, 0.95) * (0.4 + 0.7 * uDay) + vec3(1.0, 0.2, 0.1) * uLights * step(0.8, fract(uTime + aSeed));
          alpha = 0.5 * smoothstep(0.0, 0.03, k) * (1.0 - smoothstep(0.95, 1.0, k));
        } else {
          // contrail: specks laid behind the plane, spreading and fading with age
          float age = aSeed * 70.0;
          float ka = k - age / cyc;
          float aza = radians(mix(-30.0, 120.0, ka));
          float ela = radians(38.0 + 6.0 * sin(ka * 3.14));
          vec3 d2 = vec3(sin(aza) * cos(ela), sin(ela), -cos(aza) * cos(ela));
          float spread = 2.0 + age * 0.9;
          pos = C + d2 * R + vec3(hash11(aSeed * 3.0) - 0.5, hash11(aSeed * 5.0) - 0.5, hash11(aSeed * 7.0) - 0.5) * spread * 2.0;
          vec3 lit = mix(vec3(1.0), uSunColor * 1.2, 1.0 - smoothstep(0.05, 0.4, uSunDir.y));
          col = lit * (0.45 + 0.7 * uDay) + uSkyTop * 0.2;
          alpha = (1.0 - age / 70.0) * 0.28 * smoothstep(0.0, 1.5, age) * step(0.0, ka) * (0.35 + 0.65 * uDay + 0.5 * smoothstep(-0.12, 0.0, uSunDir.y));
        }
      }`,
  });
}

function sailboat(r, spinnaker) {
  const pts = [];
  const cols = [];
  const push = (list, c) => list.forEach((p) => (pts.push(p), cols.push(c)));
  push(fillPolygon(r, [[-4.2, 0], [4.6, 0], [3.8, -0.8], [-3.8, -0.7]], 90, 20), [0.95, 0.95, 0.93]);
  const mast = Array.from({ length: 40 }, (_, i) => [0.4, (i / 39) * 11, 0]);
  push(mast, [0.8, 0.8, 0.8]);
  push(fillPolygon(r, [[0.5, 1.2], [0.5, 10.8], [-3.6, 1.3]], 230, 30), [0.97, 0.96, 0.92]);
  push(fillPolygon(r, [[4.2, 0.4], [0.55, 10.2], [0.8, 0.9]], 150, 22), spinnaker ? [0.95, 0.35, 0.3] : [0.95, 0.94, 0.9]);
  return { pts: pts.map(([x, y]) => [x, y, 0]), cols };
}

export function createTraffic(scene, ribbons, { sunsetLabel }) {
  scene.add(makeJets());
  const cloud = new FigureCloud(scene, 30000);
  const r = rng(811);
  const actors = [];

  // ---- the banner plane ----
  const plane = new Shape(
    cloud,
    [
      ...Array.from({ length: 50 }, () => [r.range(-3.5, 3.5), r.range(-0.5, 0.5), r.range(-0.5, 0.5)]),
      ...Array.from({ length: 60 }, () => [r.range(-0.8, 0.8), 0.6, r.range(-5.5, 5.5)]),
      ...Array.from({ length: 12 }, () => [-3.5, r.range(0, 1.4), 0]),
    ],
    { color: '#f2f0ea', size: 0.35, seed: 1 }
  );
  const letters = textPoints([sunsetLabel], { height: 3.4, step: 3, font: '800 72px "Arial Black", Arial, sans-serif' });
  let maxX = 0;
  for (const [x] of letters) maxX = Math.max(maxX, Math.abs(x));
  const W = maxX * 2 + 4;
  const bannerPts = [];
  const bannerCols = [];
  for (let i = 0; i < 900; i++) {
    bannerPts.push([r.range(-W / 2, W / 2), r.range(-0.2, 4.4), 0]);
    bannerCols.push([0.97, 0.96, 0.92]);
  }
  for (const [x, y] of letters) {
    bannerPts.push([x, y + 0.2, 0.05]);
    bannerCols.push([0.82, 0.1, 0.12]);
  }
  const banner = new Shape(cloud, bannerPts, { color: '#ffffff', colors: bannerCols, size: 0.3, seed: 2 });
  const bannerLocal = banner.local.slice();
  const tow = new Line(cloud, 40, { color: '#d8d4cc', size: 0.12, seed: 3 });
  const bannerRib = ribbons.create({ width: 1.2, life: 2.2, flat: true, colorA: '#fff4d6', colorB: '#ff8a6a', opacity: 0.35, strands: 3, drift: [0, 0, 0], billow: 0.4, minDist: 0.5, specks: 30 });
  actors.push((t, dt, hour) => {
    const p = presence(hour, 11.2, 17.6, 0.3);
    const L = 1600;
    const u = ((t * 22 + 700) % L) / L;
    const edge = smoothstep(0, 0.05, u) * (1 - smoothstep(0.95, 1, u));
    const a = p * edge;
    if (a < 0.01) {
      plane.hide();
      banner.hide();
      tow.hide();
      bannerRib.fade = 0;
      return;
    }
    const x = 700 - u * L;
    const z = shoreZ(x) - 230;
    const y = 120 + Math.sin(t * 0.3) * 3;
    X.set(-1, 0, 0);
    Y.set(0, 1, 0);
    Z.set(0, 0, -1);
    plane.write(O.set(x, y, z), X, Y, Z, a);
    // the banner trails 60 m behind on its tow line, flapping
    const bx = x + 60 + W / 2;
    const L0 = banner.local;
    for (let i = 0; i < banner.n; i++) {
      const lx = bannerLocal[i * 3];
      const wave = Math.sin(lx * 0.35 + t * 7) * 0.5 * (0.3 + (lx + W / 2) / W);
      L0[i * 3 + 2] = bannerLocal[i * 3 + 2] + wave;
    }
    // seen from the beach (looking toward −z) world +x reads left to right
    banner.write(O.set(bx, y - 6, z), X.set(1, 0, 0), Y, Z.set(0, 0, 1), a);
    tow.write(tmp.set(x + 3.5, y, z), V().set(x + 30, y - 6, z), V().set(bx - W / 2, y - 4, z), a * 0.8);
    bannerRib.follow(tmp.set(bx + W / 2, y - 4, z));
    bannerRib.fade = a;
  });

  // ---- sailboats ----
  for (let i = 0; i < 5; i++) {
    const s = sailboat(r, i === 2);
    const boat = new Shape(cloud, s.pts, { color: '#ffffff', colors: s.cols, size: 0.28, seed: 10 + i });
    const lane = 380 + i * 230 + r() * 80;
    const speed = 1.6 + r() * 1.4;
    const ph = r() * 3000;
    const tack = r() < 0.5 ? 1 : -1;
    actors.push((t, dt, hour) => {
      const p = presence(hour, 9.5 + i * 0.3, 19.1 - i * 0.2, 0.5);
      if (p < 0.01) return boat.hide();
      const L = 2600;
      const u = (((ph + t * speed * tack) % L) + L) % L;
      const x = -1300 + u;
      const edge = smoothstep(0, 120, u) * (1 - smoothstep(L - 120, L, u));
      const z = shoreZ(x) - lane;
      const y = seaHeight(x, z, t);
      const heel = 0.18 + 0.05 * Math.sin(t * 0.5 + i);
      X.set(tack, 0, 0);
      Y.set(0, Math.cos(heel), Math.sin(heel) * tack);
      Z.crossVectors(X, Y);
      boat.write(O.set(x, y + 0.2, z), X, Y, Z, p * edge * 0.95);
    });
  }

  // ---- LA County lifeguard rescue boat ----
  {
    const pts = [];
    const cols = [];
    const add = (list, c) => list.forEach((q) => (pts.push([q[0], q[1], q[2] ?? 0]), cols.push(c)));
    for (const zz of [-1.3, 1.3]) add(fillPolygon(r, [[-5, 0], [5.5, 0.4], [4.6, -1], [-4.8, -1]], 150, 30, zz), [0.96, 0.96, 0.95]);
    for (const zz of [-1.32, 1.32]) add(Array.from({ length: 40 }, (_, i) => [-4.8 + i * 0.25, -0.35, zz]), [0.85, 0.12, 0.1]);
    add(fillPolygon(r, [[-2.4, 0.2], [1.6, 0.2], [0.8, 2.3], [-2.2, 2.3]], 150, 20), [0.95, 0.8, 0.15]);
    for (let i = 0; i < 12; i++) cols.push(i % 2 ? [0.9, 0.15, 0.1] : [0.2, 0.4, 0.95]), pts.push([-0.8 + i * 0.12, 2.5, 0]);
    const boat = new Shape(cloud, pts, { color: '#ffffff', colors: cols, size: 0.16, seed: 30 });
    const wake = ribbons.create({ width: 2.4, life: 6, minDist: 0.6, flat: true, colorA: '#f0feff', colorB: '#79c4ff', opacity: 0.45, drift: [0, 0, 0], billow: 0.1, spread: 0.7, strands: 4, specks: 30 });
    actors.push((t, dt, hour) => {
      const p = presence(hour, 9, 18.4, 0.4);
      const L = 1400;
      const u = ((t * 5 + 400) % L) / L;
      const dir = u < 0.5 ? 1 : -1;
      const k = u < 0.5 ? u * 2 : 2 - u * 2;
      const x = -500 + k * 900;
      const edge = smoothstep(0, 0.04, k) * (1 - smoothstep(0.96, 1, k));
      const a = p * edge;
      if (a < 0.01) {
        boat.hide();
        wake.fade = 0;
        return;
      }
      const z = shoreZ(x) - 260;
      const y = seaHeight(x, z, t);
      X.set(dir, 0, 0);
      Y.set(0, 1, 0);
      Z.crossVectors(X, Y);
      boat.write(O.set(x, y + 0.5, z), X, Y, Z, a);
      wake.follow(tmp.set(x - dir * 5, y + 0.05, z));
      wake.fade = a;
    });
  }

  // ---- stand-up paddleboarders beyond the break ----
  for (let i = 0; i < 2; i++) {
    const body = new Body(cloud, HUMAN, { outfit: outfit(r, i ? 'bikini' : 'trunks'), density: 60, seed: r() * 1e5 });
    const board = new Shape(cloud, Array.from({ length: 120 }, () => [r.range(-1.6, 1.6), 0, r.range(-0.35, 0.35)]), { color: i ? '#9fe3ff' : '#ffd08a', size: 0.08, seed: 40 + i });
    const paddle = new Line(cloud, 26, { color: '#2a2a2a', size: 0.05, seed: 44 + i });
    const lane = 150 + i * 35;
    const ph = r() * 500;
    actors.push((t, dt, hour) => {
      const p = presence(hour, 8.3 + i, 17 - i, 0.4);
      if (p < 0.01) {
        body.hide();
        board.hide();
        paddle.hide();
        return;
      }
      const x = -120 + ((ph + t * 0.9) % 400);
      const z = shoreZ(x) - lane;
      const y = seaHeight(x, z, t);
      X.set(1, 0, 0);
      Y.set(0, 1, 0);
      Z.set(0, 0, 1);
      board.write(O.set(x, y + 0.05, z), X, Y, Z, p);
      poseGait(body, { x, y: y + 0.1, z, heading: Math.PI / 2, phase: 0, gait: GAITS.stand, reach: tmp.set(x + 0.8, y + 0.4, z + 0.4 * Math.sin(t * 1.2)) });
      body.write(p);
      const stroke = Math.sin(t * 1.2 + i);
      paddle.write(V().set(x + 0.2, y + 1.6, z + 0.3), V().set(x + 0.5, y + 0.8, z + 0.4 + stroke * 0.2), V().set(x + 0.9 - stroke * 0.5, y - 0.2, z + 0.5), p);
    });
  }

  // ---- kayakers along the outside of the surf ----
  for (let i = 0; i < 3; i++) {
    const hull = [];
    for (let k = 0; k < 160; k++) {
      const u = r.range(-1, 1);
      const w = 0.32 * Math.sqrt(Math.max(0, 1 - u * u));
      hull.push([u * 2.1, r() < 0.3 ? 0.15 : r() * 0.12, (r() < 0.5 ? -1 : 1) * w * (0.6 + 0.4 * r())]);
    }
    const kayak = new Shape(cloud, hull, { color: r.pick(['#ffd23f', '#ff5a3d', '#3fd0ff', '#6dff8a']), size: 0.06, seed: 60 + i });
    const body = new Body(cloud, HUMAN, { outfit: outfit(r, r.pick(['trunks', 'casual', 'onepiece'])), density: 56, seed: r() * 1e5 });
    const paddle = new Line(cloud, 30, { color: '#e8e8e0', size: 0.04, seed: 70 + i });
    const lane = 135 + i * 28 + r() * 15;
    const ph = r() * 800;
    const dir = i % 2 ? 1 : -1;
    const wake = ribbons.create({ width: 0.8, life: 3, minDist: 0.3, flat: true, colorA: '#f0feff', colorB: '#79c4ff', opacity: 0.3, drift: [0, 0, 0], billow: 0.1, spread: 0.4, strands: 2, specks: 10 });
    actors.push((t, dt, hour) => {
      const p0 = presence(hour, 8 + i, 17.5, 0.4);
      const L = 700;
      const u = (((ph + t * 1.2 * dir) % L) + L) % L;
      const x = -560 + u;
      const p = p0 * smoothstep(0, 40, u) * (1 - smoothstep(L - 40, L, u));
      if (p < 0.01) {
        wake.fade = 0;
        return;
      }
      const z = shoreZ(x) - lane;
      const y = seaHeight(x, z, t);
      X.set(dir, 0, 0);
      Y.set(0, 1, 0);
      Z.crossVectors(X, Y);
      kayak.write(O.set(x, y + 0.02, z), X, Y, Z, p);
      poseSit(body, { x, y: y - 0.02, z, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, t, lean: 0.1 });
      body.write(p);
      // a double-bladed paddle dipping one side, then the other
      const s = Math.sin(t * 2.4 + i);
      const c = Math.cos(t * 2.4 + i);
      const cx = x + dir * 0.35;
      paddle.write(V().set(cx + dir * 0.4 * c, y + 0.55 + 0.5 * s, z - 1.1), V().set(cx, y + 0.75, z), V().set(cx - dir * 0.4 * c, y + 0.55 - 0.5 * s, z + 1.1), p);
      wake.follow(tmp.set(x - dir * 2, y + 0.03, z));
      wake.fade = p;
    });
  }

  // ---- a sportfishing boat heading out from the end of the pier, and back ----
  {
    const pts = [];
    const cols = [];
    const add = (list, c) => list.forEach((q) => (pts.push([q[0], q[1], q[2] ?? 0]), cols.push(c)));
    for (const zz of [-1.9, 1.9]) add(fillPolygon(r, [[-7.5, 0], [8, 0.6], [6.5, -1.3], [-7.2, -1.2]], 260, 40, zz), [0.96, 0.96, 0.95]);
    add(Array.from({ length: 80 }, () => [r.range(-7, 7.5), 0.55, r.range(-1.8, 1.8)]), [0.85, 0.82, 0.76]);
    for (const zz of [-1.2, 1.2]) add(fillPolygon(r, [[-2.5, 0.6], [3, 0.6], [2.2, 3.1], [-2.5, 3.1]], 140, 20, zz), [0.94, 0.94, 0.92]);
    add(Array.from({ length: 60 }, () => [r.range(-2.5, 2.2), 3.15, r.range(-1.2, 1.2)]), [0.9, 0.9, 0.88]);
    add(Array.from({ length: 30 }, () => [r.range(-0.2, 0.2), 3.2 + r() * 2.8, 0]), [0.8, 0.8, 0.8]);
    for (let k = 0; k < 20; k++) (pts.push([r.range(0.2, 2), r.range(1.5, 2.6), (r() < 0.5 ? -1 : 1) * 1.22]), cols.push([0.15, 0.2, 0.28]));
    const boat = new Shape(cloud, pts, { color: '#ffffff', colors: cols, size: 0.14, seed: 80 });
    const wake = ribbons.create({ width: 3.2, life: 7, minDist: 0.7, flat: true, colorA: '#f0feff', colorB: '#79c4ff', opacity: 0.4, drift: [0, 0, 0], billow: 0.1, spread: 0.8, strands: 4, specks: 24 });
    const dock = [PIER.x + PIER.half + 12, PIER.end + 15];
    actors.push((t, dt, hour) => {
      const p = presence(hour, 6.2, 17.2, 0.4);
      // out to the fishing grounds and back, every twenty minutes
      const cyc = 1200;
      const k = (((t + 400) % cyc) + cyc) % cyc;
      let x, z, dir, a;
      if (k < 60) return (wake.fade = 0); // tied up out of sight round the far side
      const out = k < 630;
      const s = out ? smoothstep(60, 630, k) : 1 - smoothstep(630, 1200, k);
      x = dock[0] + s * 260;
      z = dock[1] - s * 1100;
      dir = out ? 1 : -1;
      const hx = 260 * dir;
      const hz = -1100 * dir;
      a = Math.hypot(hx, hz);
      const edge = smoothstep(0, 0.03, s) * (1 - smoothstep(0.9, 1, s));
      if (p * edge < 0.01) {
        wake.fade = 0;
        return;
      }
      const y = seaHeight(x, z, t);
      X.set(hx / a, 0, hz / a);
      Y.set(0, 1, 0);
      Z.crossVectors(X, Y);
      boat.write(O.set(x, y + 0.9, z), X, Y, Z, p * edge);
      wake.follow(tmp.set(x - (hx / a) * 7.5, y + 0.05, z - (hz / a) * 7.5));
      wake.fade = p * edge;
    });
  }

  return {
    update(t, dt, ctx) {
      cloud.begin(ctx);
      for (const a of actors) a(t, dt, ctx.hour);
      cloud.commit();
    },
  };
}
