// People on the sand and the Strand, each on their own schedule: walkers and
// joggers along the hard sand, kids dodging the swash, people wandering down
// to the water and back, surfers carrying boards, paddleball, frisbee and
// football games, volleyball on all four courts, the lifeguard truck on
// patrol, the beach rake at dawn, the Muscle Beach rings and bars, lifeguards
// in their towers, bikes, skates and surreys on the Strand, sunset
// photographers, and kites. Ribbons stream behind the fast ones.
import * as THREE from 'three';
import { U, rng, presence, smoothstep, clamp, QUALITY } from './core.js';
import { shoreZ, sandHeight, strandZ } from './site.js';
import { swashFront, dodger } from './surf.js';
import { FigureCloud, Body, Shape, Line, HUMAN, GAITS, outfit, poseGait, poseCycle, poseHang, fillPolygon } from './rigs.js';
import { COURTS, TOWERS, RINGS } from './beach.js';
import * as G from './gear.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = () => new THREE.Vector3();
const tmp = V();
const O = V(), X = V(), Y = V(), Z = V();
const joint = (body, j, out = V()) => out.fromArray(body.J, j * 3);
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const pingpong = (u) => 1 - Math.abs(1 - ((u % 2) + 2) % 2);
const EAST = Math.PI / 2; // heading along +x, toward the pier
const WEST = -Math.PI / 2;
const SEA = Math.PI;

function boardPts(r, len, width) {
  const pts = [];
  for (let i = 0; i < 150; i++) {
    const x = r.range(-len / 2, len / 2);
    const w = width * Math.sqrt(Math.max(0, 1 - (x / (len * 0.52)) ** 2)) * (x > 0 ? 1 - 0.35 * (x / (len / 2)) ** 2 : 1);
    pts.push([x, 0, (i % 3 === 0 ? (r() < 0.5 ? -1 : 1) : r.range(-1, 1)) * w]);
  }
  return pts;
}

function bikePts(r) {
  const pts = [];
  const cols = [];
  for (const cx of [-0.52, 0.52]) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * 0.34, 0.34 + Math.sin(a) * 0.34, 0]);
      cols.push([0.1, 0.1, 0.11]);
    }
  }
  const frame = r.pick([[0.85, 0.2, 0.2], [0.2, 0.5, 0.85], [0.9, 0.9, 0.88], [0.3, 0.75, 0.55]]);
  const seg = (a, b, n) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]);
      cols.push(frame);
    }
  };
  seg([-0.52, 0.34], [-0.05, 0.36], 8);
  seg([-0.05, 0.36], [-0.12, 0.92], 8);
  seg([-0.12, 0.92], [0.45, 0.92], 8);
  seg([0.45, 0.92], [0.52, 0.34], 8);
  seg([-0.05, 0.36], [0.45, 0.92], 8);
  seg([0.45, 0.92], [0.5, 1.1], 3);
  return { pts, cols };
}

/** A four-wheeled surrey: two seats side by side under a fringed canopy. */
function surreyPts(r) {
  const pts = [];
  const cols = [];
  const canopy = r.pick([[0.95, 0.3, 0.3], [0.2, 0.55, 0.9], [0.98, 0.8, 0.2], [0.3, 0.75, 0.5]]);
  for (const cx of [-0.8, 0.8]) for (const cz of [-0.62, 0.62]) for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * 0.3, 0.3 + Math.sin(a) * 0.3, cz]);
    cols.push([0.1, 0.1, 0.11]);
  }
  for (let i = 0; i < 120; i++) {
    pts.push([r.range(-0.95, 0.95), 0.62 + r() * 0.06, r.range(-0.62, 0.62)]);
    cols.push([0.25, 0.25, 0.27]);
  }
  for (let i = 0; i < 260; i++) {
    const u = r.range(-1.05, 1.05);
    const v = r.range(-0.75, 0.75);
    const fringe = r() < 0.25;
    pts.push([u, fringe ? 1.85 - r() * 0.12 : 1.95 + 0.06 * (1 - (u / 1.05) ** 2), fringe ? Math.sign(v) * 0.75 : v]);
    cols.push(fringe ? [0.97, 0.95, 0.9] : canopy);
  }
  for (const cx of [-0.9, 0.9]) for (const cz of [-0.65, 0.65]) for (let i = 0; i < 12; i++) {
    pts.push([cx, 0.6 + (i / 12) * 1.3, cz]);
    cols.push([0.85, 0.85, 0.85]);
  }
  return { pts, cols };
}

/** The lifeguard pickup facing +x, with its light bar apart so it can flash. */
function truckPts(r) {
  const pts = [];
  const cols = [];
  G.truck((p, n, c) => (pts.push(p), cols.push(c)), r, 0, 0, 0, Math.PI / 2);
  const body = [];
  const bodyCols = [];
  const bar = [];
  pts.forEach((p, i) => {
    if (p[1] > 1.9) bar.push(p);
    else {
      body.push(p);
      bodyCols.push(cols[i]);
    }
  });
  return { body, bodyCols, bar };
}

/** A beach-cleaning tractor facing +x, towing its rake. */
function tractorPts(r) {
  const pts = [];
  const cols = [];
  const box = (x0, x1, y0, y1, z0, z1, c, n) => {
    for (let i = 0; i < n; i++) {
      const f = Math.floor(r() * 3);
      const p = [r.range(x0, x1), r.range(y0, y1), r.range(z0, z1)];
      if (f === 0) p[0] = r() < 0.5 ? x0 : x1;
      else if (f === 1) p[1] = y1;
      else p[2] = r() < 0.5 ? z0 : z1;
      pts.push(p);
      cols.push(c);
    }
  };
  box(-1.2, 1.0, 0.5, 1.2, -0.7, 0.7, [0.92, 0.7, 0.12], 260); // body
  box(-1.0, 0.1, 1.2, 2.3, -0.6, 0.6, [0.2, 0.22, 0.25], 160); // cab
  for (const cx of [-0.9, 0.7]) for (const cz of [-0.8, 0.8]) for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rad = cx < 0 ? 0.55 : 0.4;
    pts.push([cx + Math.cos(a) * rad, rad + Math.sin(a) * rad, cz]);
    cols.push([0.08, 0.08, 0.09]);
  }
  for (let i = 0; i < 160; i++) {
    pts.push([-2.4 + (r() < 0.3 ? r() * 0.8 : 0), 0.1 + (r() < 0.5 ? 0.25 : r() * 0.25), r.range(-2.2, 2.2)]);
    cols.push([0.6, 0.6, 0.62]);
  }
  return { pts, cols };
}

function discPts(r, radius, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * radius;
    pts.push([Math.cos(a) * rr, 0, Math.sin(a) * rr]);
  }
  return pts;
}

export function createPeople(scene, ribbons, { crowd } = {}) {
  const cloud = new FigureCloud(scene, 180000);
  const r = rng(2026);
  const Q = Math.max(QUALITY, 0.6);
  const count = (n) => Math.max(1, Math.round(n * Q));
  const rib = (o) => ribbons.create({ seed: r() * 100, ...o });
  const actors = [];
  const add = (a) => (actors.push(a), a);
  const ground = (x, z) => sandHeight(x, z);
  const person = (kind, opts = {}) => new Body(cloud, HUMAN, { outfit: outfit(r, kind), density: opts.density ?? 90, scale: opts.scale ?? 0.92 + r() * 0.16, seed: r() * 1e5 });
  const casters = [];
  const RIB_COLORS = [['#ffd9b3', '#ff7a9a'], ['#cfe8ff', '#7f8cff'], ['#fff1b8', '#ffa45c'], ['#d7ffe8', '#43c6ac'], ['#ffe08a', '#ff6b6b'], ['#e0ffd0', '#28c98f']];
  // walks along the waterline stay on one side of the pier
  const span = () => (r() < 0.8 ? [-420, 104] : [170, 326]);
  const WINDOWS = [[6.2, 10.5], [8.5, 13], [10, 16.5], [11.5, 18.5], [13.5, 19.6], [15.5, 20.6], [18.8, 23.2]];

  // ---- walkers along the hard sand, alone, in pairs and threes ----
  for (let i = 0; i < count(24); i++) {
    const [a, b] = span();
    const len = Math.min(b - a, 120 + r() * 360);
    const x0 = a + r() * (b - a - len);
    const n = r() < 0.45 ? 1 : r() < 0.75 ? 2 : 3;
    const d = 2.2 + r() * 6;
    const speed = 1.0 + r() * 0.5;
    const win = r.pick(WINDOWS).map((h) => h + (r() - 0.5));
    const phase = r() * 1000;
    const members = [];
    for (let m = 0; m < n; m++) {
      const kid = n === 3 && m === 2 && r() < 0.6;
      const body = person(r.pick(['casual', 'bikini', 'trunks', 'onepiece', 'casual']), kid ? { scale: 0.62 + r() * 0.1 } : {});
      const colors = r.pick(RIB_COLORS);
      const ribbon = i < 7 ? rib({ width: 0.14, life: 1.8, step: 0.06, minDist: 0.05, colorA: colors[0], colorB: colors[1], opacity: 0.5, drift: [0, 0.18, 0], billow: 0.25, specks: 18 }) : null;
      members.push({ body, off: m * 0.72, ribbon, kid, dodge: dodger() });
    }
    add({
      update(t, dt, hour) {
        const p = presence(hour, win[0], win[1], 0.4);
        const u = ((t + phase) * speed) / len;
        const k = pingpong(u);
        const dir = Math.floor(((u % 2) + 2) % 2) === 0 ? 1 : -1;
        const x = x0 + k * len;
        for (const m of members) {
          if (p < 0.01) {
            if (m.ribbon) m.ribbon.fade = 0;
            continue;
          }
          const dg = m.dodge(x, d + m.off, t, dt);
          const z = shoreZ(x) + d + m.off + dg.lift;
          const hurry = smoothstep(0.3, 1.2, dg.v);
          poseGait(m.body, { x, y: ground(x, z), z, heading: (dir > 0 ? EAST : WEST) * (1 - hurry * 0.6), phase: (t + phase) * (m.kid ? 7 : 5.4) * speed + m.off * 2 + dg.lift * 3, gait: hurry > 0.5 ? GAITS.run : GAITS.walk, armsUp: hurry > 0.5 && m.kid ? 0.6 : 0 });
          m.body.write(p);
          if (m.ribbon) {
            m.ribbon.follow(joint(m.body, m.off > 0.3 ? 6 : 9, tmp));
            m.ribbon.fade = p;
          }
          casters.push([x, z, 0.3, 1.7]);
        }
      },
    });
  }

  // ---- joggers on the wet sand ----
  for (let i = 0; i < count(11); i++) {
    const body = person('jogger', { density: 64 });
    const [a, b] = span();
    const len = Math.min(b - a, 200 + r() * 300);
    const x0 = a + r() * (b - a - len);
    const phase = r() * 400;
    const speed = 2.8 + r() * 1.1;
    const win = i % 3 === 0 ? [6, 9.8] : i % 3 === 1 ? [16.4, 20] : [7.5 + r() * 3, 12 + r() * 6];
    const d = 1.6 + r() * 2.8;
    const colors = r.pick(RIB_COLORS);
    const ribbon = rib({ width: 0.22, life: 1.4, minDist: 0.08, colorA: colors[0], colorB: colors[1], twist: 1.4, strands: 2, drift: [0, 0.35, 0], billow: 0.25, specks: 20 });
    let runPhase = 0;
    const dodge = dodger();
    add({
      update(t, dt, hour) {
        const p = presence(hour, win[0], win[1], 0.35);
        if (p < 0.01) {
          ribbon.fade = 0;
          return;
        }
        const u = ((t + phase) * speed) / len;
        const x = x0 + pingpong(u) * len;
        const dir = Math.floor(((u % 2) + 2) % 2) === 0 ? 1 : -1;
        const z = shoreZ(x) + d + dodge(x, d, t, dt).lift;
        runPhase += dt * 3.1 * speed;
        poseGait(body, { x, y: ground(x, z), z, heading: dir > 0 ? EAST : WEST, phase: runPhase, gait: GAITS.run });
        body.write(p);
        ribbon.follow(joint(body, 6, tmp));
        ribbon.fade = p;
        casters.push([x, z, 0.3, 1.7]);
      },
    });
  }

  // ---- kids dodging the swash, and parents watching ----
  const kidX = [];
  for (let i = 0; i < count(13); i++) kidX.push(r() < 0.75 ? -200 + r() * 300 : 175 + r() * 140);
  kidX.forEach((kx, i) => {
    const body = person(r.pick(['trunks', 'onepiece']), { scale: 0.56 + r() * 0.12, density: 70 });
    const ribbon = i < 6 ? rib({ width: 0.12, life: 1.1, minDist: 0.05, colorA: '#fff0a8', colorB: '#ff8fd0', twist: 1.6, strands: 2, drift: [0, 0.3, 0], specks: 16 }) : null;
    const st = { z: shoreZ(kx) + 4, x: kx, heading: Math.PI, phase: 0 };
    const win = [9.8 + r() * 1.5, 16.8 + r() * 1.6];
    add({
      update(t, dt, hour) {
        const p = presence(hour, win[0], win[1], 0.3);
        if (p < 0.01) {
          if (ribbon) ribbon.fade = 0;
          return;
        }
        // chase the backwash, flee the next surge
        const front = Math.max(1, swashFront(st.x, t));
        const target = shoreZ(st.x) + front + 1.2 + Math.sin(t * 0.3 + i) * 0.8;
        const prevZ = st.z;
        st.z += (target - st.z) * (1 - Math.exp(-dt * 3.5));
        st.x = kx + Math.sin(t * 0.21 + i * 2) * 2.5;
        const v = (st.z - prevZ) / Math.max(dt, 1e-3);
        if (Math.abs(v) > 0.2) st.heading = lerpAngle(st.heading, v > 0 ? 0 : Math.PI, 1 - Math.exp(-dt * 8));
        st.phase += dt * (2 + Math.min(Math.abs(v), 4) * 2.4);
        poseGait(body, { x: st.x, y: ground(st.x, st.z), z: st.z, heading: st.heading, phase: st.phase, gait: Math.abs(v) > 1.2 ? GAITS.run : GAITS.walk, armsUp: Math.abs(v) > 2 ? 0.7 : 0 });
        body.write(p);
        if (ribbon) {
          ribbon.follow(joint(body, 9, tmp));
          ribbon.fade = p * smoothstep(0.5, 2, Math.abs(v));
        }
      },
    });
    if (i % 3 === 0) {
      const parent = person(r.pick(['casual', 'onepiece', 'trunks']));
      const px = kx + 2 + r() * 2;
      const dodge = dodger();
      add({
        update(t, dt, hour) {
          const p = presence(hour, win[0], win[1], 0.3);
          if (p < 0.01) return;
          const z = shoreZ(px) + 3.2 + dodge(px, 3.2, t, dt).lift;
          const y = ground(px, z);
          poseGait(parent, { x: px, y, z, heading: SEA + 0.3 * Math.sin(t * 0.1 + i), phase: 0, gait: GAITS.stand, reach: Math.sin(t * 0.13 + i) > 0.85 ? tmp.set(px + 0.3, y + 1.6, z - 0.6) : null });
          parent.write(p);
          casters.push([px, z, 0.3, 1.7]);
        },
      });
    }
  });

  // ---- wandering down to the water and back ----
  const groups = (crowd?.groups || []).filter((g) => g.members.some((m) => !m.kid) && ((g.x > -260 && g.x < 104) || (g.x > 168 && g.x < 330)));
  for (let i = 0; i < count(18) && groups.length; i++) {
    const body = person(r.pick(['trunks', 'bikini', 'onepiece', 'trunks', 'bikini']));
    const st = { g: r.pick(groups), mode: 'rest', t: r() * 40, x: 0, z: 0, tx: 0, tz: 0, heading: SEA, phase: r() * 10 };
    add({
      update(t, dt, hour) {
        st.t -= dt;
        if (st.mode === 'rest') {
          if (st.t < 0) {
            // head down to the water from wherever the group is
            st.g = r.pick(groups);
            st.x = st.g.x + (r() - 0.5) * 2;
            st.z = st.g.z - 1.5;
            st.tx = st.x + (r() - 0.5) * 6;
            st.tz = shoreZ(st.tx) + 0.8 + r() * 1.5;
            st.mode = 'down';
          }
          return;
        }
        const g = st.g;
        const p = presence(hour, g.win[0] + 0.1, g.win[1] - 0.1, 0.3);
        if (p < 0.01) {
          st.mode = 'rest';
          st.t = 20 + r() * 40;
          return;
        }
        let speed = 0;
        if (st.mode === 'down' || st.mode === 'up') {
          const dx = st.tx - st.x;
          const dz = st.tz - st.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.3) {
            if (st.mode === 'down') {
              st.mode = 'look';
              st.t = 15 + r() * 45;
            } else {
              st.mode = 'rest';
              st.t = 25 + r() * 70;
              return;
            }
          } else {
            speed = st.mode === 'down' && d > 12 ? 1.5 : 1.2;
            st.x += (dx / d) * speed * dt;
            st.z += (dz / d) * speed * dt;
            st.heading = lerpAngle(st.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 5));
          }
        } else if (st.mode === 'look') {
          st.heading = lerpAngle(st.heading, SEA + 0.3 * Math.sin(t * 0.07 + i), 1 - Math.exp(-dt * 2));
          if (st.t < 0) {
            st.mode = 'up';
            st.tx = st.g.x + (r() - 0.5) * 2;
            st.tz = st.g.z - 1.2;
          }
        }
        st.phase += dt * speed * 3.9;
        const y = ground(st.x, st.z);
        const photo = st.mode === 'look' && Math.sin(t * 0.2 + i) > 0.6;
        poseGait(body, { x: st.x, y, z: st.z, heading: st.heading, phase: st.phase, gait: speed > 0 ? GAITS.walk : GAITS.stand, reach: photo ? tmp.set(st.x + Math.sin(st.heading) * 0.6, y + 1.55, st.z + Math.cos(st.heading) * 0.6) : null });
        body.write(p * smoothstep(0, 1.2, Math.hypot(st.x - st.g.x, st.z - st.g.z)));
        casters.push([st.x, st.z, 0.3, 1.7]);
      },
    });
  }

  // ---- surfers carrying boards between the Strand and the water ----
  for (let i = 0; i < count(6); i++) {
    const body = person(r() < 0.75 ? 'wetsuit' : 'trunks', { density: 70 });
    const len = r() < 0.3 ? 2.8 : 2.0;
    const board = new Shape(cloud, boardPts(r, len, 0.27), { color: r.pick(['#f4f7ff', '#ffe7a8', '#bfe9ff', '#ffc2d1']), size: 0.06, seed: r() * 1e4 });
    const x = r() < 0.7 ? 35 + r() * 70 : 175 + r() * 60;
    const top = strandZ(x) - 4;
    const cyc = 140 + r() * 80;
    const ph = r() * cyc;
    const win = [6.5 + r() * 2, 17.5 + r() * 2];
    add({
      update(t, dt, hour) {
        const p0 = presence(hour, win[0], win[1], 0.4);
        const k = ((t + ph) % cyc) / cyc;
        // walk down (0–0.4), out surfing, walk back up (0.55–0.95), gone again
        const down = k < 0.4;
        const up = k > 0.55 && k < 0.95;
        if (p0 < 0.01 || !(down || up)) return;
        const s = down ? k / 0.4 : (k - 0.55) / 0.4;
        const bottom = shoreZ(x) + 0.5;
        const z = down ? top + (bottom - top) * s : bottom + (top - bottom) * s;
        const p = p0 * smoothstep(0, 0.06, s) * (1 - smoothstep(0.94, 1, s));
        const heading = down ? SEA : 0;
        const y = ground(x, z);
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        // board under the right arm, along the direction of travel
        O.set(x - fz * 0.33, y + 1.02, z + fx * 0.33);
        poseGait(body, { x, y, z, heading, phase: t * 5.2, gait: GAITS.walk, reach: tmp.copy(O).setY(y + 0.95) });
        body.write(p);
        X.set(fx, 0, fz);
        Y.set(-fz, 0, fx);
        Z.crossVectors(X, Y);
        board.write(O, X, Y, Z, p);
      },
    });
  }

  // ---- paddleball by the water: the smack of the ball, back and forth ----
  for (let i = 0; i < count(6); i++) {
    const cx = r() < 0.8 ? -200 + r() * 290 : 180 + r() * 120;
    const d = 4 + r() * 4;
    const win = [9 + r() * 3, 15 + r() * 3.5];
    const A = { body: person(r.pick(['trunks', 'bikini'])), side: -1, off: 0, cur: 0 };
    const B = { body: person(r.pick(['trunks', 'bikini'])), side: 1, off: 0, cur: 0 };
    for (const pl of [A, B]) pl.paddle = new Shape(cloud, discPts(r, 0.13, 30), { color: r.pick(['#8a5a2b', '#2b5d8a', '#b23a3a']), size: 0.05, seed: r() * 1e4 });
    const ball = new Shape(cloud, discPts(r, 0.035, 10).map(([a, b, c]) => [a, b + (r() - 0.5) * 0.06, c]), { color: '#fff04a', size: 0.05, seed: r() * 1e4 });
    const ballRib = i < 3 ? rib({ width: 0.06, life: 0.5, minDist: 0.04, colorA: '#fffbd0', colorB: '#ffe24a', opacity: 0.4, twist: 0.4, strands: 1, drift: [0, 0, 0], billow: 0.05, specks: 10 }) : null;
    const rally = { from: A, to: B, t0: 0, dur: 1, apex: 1.2, a: V(), b: V(), shift: 0 };
    const gap = 8 + r() * 3;
    const dodge = dodger();
    const serve = (t) => {
      [rally.from, rally.to] = [rally.to, rally.from];
      rally.t0 = t;
      rally.dur = 0.85 + r() * 0.5;
      rally.apex = 0.6 + r() * 1.1;
      rally.shift = (r() - 0.5) * 2.2;
      rally.to.off = rally.shift;
    };
    add({
      update(t, dt, hour) {
        const p = presence(hour, win[0], win[1], 0.35);
        if (p < 0.01) {
          if (ballRib) ballRib.fade = 0;
          return;
        }
        if (t - rally.t0 > rally.dur) serve(t);
        const z0 = shoreZ(cx) + d + dodge(cx, d, t, dt).lift;
        for (const pl of [A, B]) {
          pl.cur += (pl.off - pl.cur) * (1 - Math.exp(-dt * 4));
          const x = cx + (pl.side * gap) / 2;
          const z = z0 + pl.cur;
          const y = ground(x, z);
          const hitting = (pl === rally.to && t - rally.t0 > rally.dur - 0.25) || (pl === rally.from && t - rally.t0 < 0.15);
          poseGait(pl.body, { x, y, z, heading: pl.side < 0 ? EAST : WEST, phase: t * 4, gait: GAITS.ready, reach: hitting ? tmp.set(x - pl.side * 0.45, y + 1.15, z - 0.35 * pl.side) : null });
          pl.body.write(p);
          X.set(0, 0, 1);
          Y.set(-pl.side, 0, 0);
          Z.set(0, 1, 0);
          pl.paddle.write(joint(pl.body, 9, O), Z, Y, X, p);
          casters.push([x, z, 0.3, 1.7]);
        }
        const k = clamp((t - rally.t0) / rally.dur, 0, 1);
        rally.a.set(cx + (rally.from.side * gap) / 2 - rally.from.side * 0.5, 0, z0 + rally.from.cur);
        rally.b.set(cx + (rally.to.side * gap) / 2 - rally.to.side * 0.5, 0, z0 + rally.shift);
        const bx = rally.a.x + (rally.b.x - rally.a.x) * k;
        const bz = rally.a.z + (rally.b.z - rally.a.z) * k;
        O.set(bx, ground(bx, bz) + 1.15 + 4 * rally.apex * k * (1 - k), bz);
        ball.write(O, X.set(1, 0, 0), Y.set(0, 1, 0), Z.set(0, 0, 1), p);
        if (ballRib) {
          ballRib.follow(O);
          ballRib.fade = p;
        }
      },
    });
  }

  // ---- frisbee and football on the open sand ----
  const games = [];
  for (let i = 0; i < count(4); i++) games.push({ kind: 'disc', gap: 14 + r() * 7, apex: 1.8 + r() * 1.5, dur: [1.9, 2.8] });
  for (let i = 0; i < count(3); i++) games.push({ kind: 'ball', gap: 18 + r() * 7, apex: 4.5 + r() * 3, dur: [1.7, 2.4] });
  for (const gm of games) {
    const cx = r() < 0.8 ? -230 + r() * 320 : 175 + r() * 130;
    const cz = shoreZ(cx) + 5 + r() * 4;
    const ang = (r() - 0.5) * 0.6; // throws run mostly along the beach
    const n = gm.kind === 'disc' && r() < 0.4 ? 3 : 2;
    const win = [9.5 + r() * 3, 15.5 + r() * 3];
    const players = [];
    for (let k = 0; k < n; k++) {
      const s = n === 2 ? (k === 0 ? -0.5 : 0.5) : [-0.5, 0.5, 0][k];
      const perp = n === 3 && k === 2 ? 0.4 : 0;
      const hx = cx + Math.cos(ang) * s * gm.gap - Math.sin(ang) * perp * gm.gap;
      const hz = cz + Math.sin(ang) * s * gm.gap + Math.cos(ang) * perp * gm.gap * 0.5;
      players.push({ body: person(r.pick(['trunks', 'bikini', 'jogger', 'trunks'])), home: V().set(hx, 0, hz), pos: V().set(hx, 0, hz), target: null, heading: 0, phase: r() * 5, hand: V().set(hx, 1.1, hz) });
    }
    const obj = gm.kind === 'disc'
      ? new Shape(cloud, [...discPts(r, 0.13, 50), ...Array.from({ length: 24 }, (_, j) => [Math.cos((j / 24) * 6.283) * 0.135, 0.01, Math.sin((j / 24) * 6.283) * 0.135])], { color: r.pick(['#ff5a5a', '#ffd23f', '#3fb6ff', '#6dff8a', '#ff8ae0']), size: 0.05, seed: r() * 1e4 })
      : new Shape(cloud, Array.from({ length: 50 }, () => {
          const u = r.range(-1, 1);
          const a = r() * 6.283;
          const w = 0.085 * Math.sqrt(1 - u * u);
          return [u * 0.14, Math.cos(a) * w, Math.sin(a) * w];
        }), { color: '#8a4b25', size: 0.04, seed: r() * 1e4 });
    const trail = rib({ width: gm.kind === 'disc' ? 0.3 : 0.12, life: 1.2, minDist: 0.06, colorA: '#ffffff', colorB: gm.kind === 'disc' ? '#ffd23f' : '#ff9a4a', opacity: 0.35, twist: 0.6, strands: 2, drift: [0, 0.05, 0], billow: 0.1, specks: 14 });
    const play = { from: 0, to: 1, t0: -99, dur: 2, curve: 0 };
    const a0 = V();
    const b0 = V();
    add({
      update(t, dt, hour) {
        const p = presence(hour, win[0], win[1], 0.35);
        if (p < 0.01) {
          trail.fade = 0;
          return;
        }
        if (t - play.t0 > play.dur + 0.6) {
          // the catcher throws next, to a spot a few steps off someone else
          play.from = play.to;
          play.to = (play.to + 1 + Math.floor(r() * (n - 1))) % n;
          play.t0 = t;
          play.dur = gm.dur[0] + r() * (gm.dur[1] - gm.dur[0]);
          play.curve = (r() - 0.5) * (gm.kind === 'disc' ? 5 : 1);
          const catcher = players[play.to];
          catcher.target = V().set(catcher.home.x + (r() - 0.5) * 6, 0, catcher.home.z + (r() - 0.5) * 5);
          a0.copy(players[play.from].hand);
        }
        const k = clamp((t - play.t0) / play.dur, 0, 1);
        players.forEach((pl, idx) => {
          const goal = idx === play.to && pl.target ? pl.target : pl.home;
          const prev = pl.pos.clone();
          pl.pos.lerp(goal, 1 - Math.exp(-dt * (idx === play.to ? 1.6 : 0.8)));
          const v = prev.distanceTo(pl.pos) / Math.max(dt, 1e-3);
          pl.phase += dt * (1 + v * 3.4);
          const face = players[idx === play.to ? play.from : play.to].pos;
          pl.heading = lerpAngle(pl.heading, Math.atan2(face.x - pl.pos.x, face.z - pl.pos.z), 1 - Math.exp(-dt * 4));
          const y = ground(pl.pos.x, pl.pos.z);
          const throwing = idx === play.from && t - play.t0 < 0.35;
          const catching = idx === play.to && k > 0.8;
          pl.hand.set(pl.pos.x + Math.sin(pl.heading) * 0.5, y + (catching ? 1.4 : 1.1), pl.pos.z + Math.cos(pl.heading) * 0.5);
          poseGait(pl.body, { x: pl.pos.x, y, z: pl.pos.z, heading: pl.heading, phase: pl.phase, gait: v > 1 ? GAITS.run : v > 0.3 ? GAITS.walk : GAITS.stand, reach: throwing || catching ? pl.hand : null });
          pl.body.write(p);
          casters.push([pl.pos.x, pl.pos.z, 0.3, 1.7]);
        });
        b0.copy(players[play.to].hand);
        const x = a0.x + (b0.x - a0.x) * k + Math.sin(Math.PI * k) * play.curve * 0.3;
        const z = a0.z + (b0.z - a0.z) * k + Math.sin(Math.PI * k) * play.curve * 0.3;
        const y = a0.y + (b0.y - a0.y) * k + 4 * gm.apex * k * (1 - k);
        O.set(x, y, z);
        const hx = b0.x - a0.x;
        const hz = b0.z - a0.z;
        const hl = Math.hypot(hx, hz) || 1;
        if (gm.kind === 'disc') {
          // flying flat, banked a little into its curve
          X.set(hx / hl, 0, hz / hl);
          Y.set(0, 1, 0);
          Z.crossVectors(X, Y).normalize();
          Y.addScaledVector(Z, 0.12 * play.curve * (1 - 2 * k)).normalize();
          Z.crossVectors(X, Y).normalize();
          obj.write(O, X, Y, Z, p);
        } else {
          // a spiral, nose along the arc
          X.set(hx / hl, (4 * gm.apex * (1 - 2 * k)) / hl, hz / hl).normalize();
          Y.set(0, 1, 0).applyAxisAngle(X, t * 18);
          Z.crossVectors(X, Y).normalize();
          Y.crossVectors(Z, X);
          obj.write(O, X, Y, Z, p);
        }
        trail.follow(O);
        trail.fade = k > 0.02 && k < 0.98 ? p : 0;
      },
    });
  }

  // ---- volleyball: two on two on every court, the ball arcing between them ----
  COURTS.forEach(([courtX, courtZ], ci) => {
    const win = [[9, 18.7], [10.5, 17.8], [8.5, 13.5], [14, 19.2]][ci];
    const players = [0, 1, 2, 3].map((i) => ({ body: person(r.pick(['trunks', 'bikini', 'jogger']), { density: 62 }), side: i < 2 ? 1 : -1, slot: i % 2 ? 1 : -1, pos: V(), heading: 0, phase: 0, hit: 0 }));
    const ball = new Shape(cloud, Array.from({ length: 40 }, () => new THREE.Vector3(r.gauss(), r.gauss(), r.gauss()).normalize().multiplyScalar(0.11).toArray()), { color: '#fff3c4', size: 0.05, seed: 7 + ci });
    const ballRib = ci < 2 ? rib({ width: 0.14, life: 1.1, minDist: 0.05, colorA: '#fff6d0', colorB: '#ffb24a', twist: 1.8, strands: 2, drift: [0, 0, 0], billow: 0.1, specks: 24 }) : null;
    for (const pl of players) pl.pos.set(courtX + pl.slot * 2, 0, courtZ + pl.side * 4.5);
    const rally = { from: 0, to: 2, t0: 0, dur: 1.8, a: V(), b: V(), apex: 5, touches: 0 };
    const spot = (pl) => V().set(courtX + pl.slot * 2 + (r() - 0.5) * 2.5, 0, courtZ + pl.side * (2 + r() * 4));
    const launch = (t, from, to) => {
      rally.from = from;
      rally.to = to;
      rally.t0 = t;
      const over = players[from].side !== players[to].side;
      rally.dur = over ? 1.3 + r() * 0.7 : 1.2 + r() * 0.4;
      rally.apex = over ? 3.4 + r() * 3 : 4 + r() * 2;
      rally.a.copy(joint(players[from].body, 3));
      rally.a.y += 0.5;
      rally.b.copy(spot(players[to]));
      players[to].target = rally.b.clone();
      players[from].hit = 0.35;
    };
    launch(0, 0, 2);
    add({
      update(t, dt, hour) {
        const p = presence(hour, win[0], win[1], 0.4);
        if (p < 0.01) {
          if (ballRib) ballRib.fade = 0;
          return;
        }
        const k = (t - rally.t0) / rally.dur;
        if (k >= 1) {
          const cur = players[rally.to];
          rally.touches = players[rally.from].side === cur.side ? rally.touches + 1 : 1;
          const mate = players.findIndex((q) => q !== cur && q.side === cur.side);
          const opps = players.map((q, i) => i).filter((i) => players[i].side !== cur.side);
          launch(t, rally.to, rally.touches >= 3 || r() < 0.25 ? r.pick(opps) : mate);
        }
        const kk = clamp((t - rally.t0) / rally.dur, 0, 1);
        const bx = rally.a.x + (rally.b.x - rally.a.x) * kk;
        const bz = rally.a.z + (rally.b.z - rally.a.z) * kk;
        const by = rally.a.y + (rally.b.y + 2.1 - rally.a.y) * kk + 4 * rally.apex * kk * (1 - kk);
        ball.write(O.set(bx, sandHeight(bx, bz) + by, bz), X.set(1, 0, 0), Y.set(0, 1, 0), Z.set(0, 0, 1), p);
        if (ballRib) {
          ballRib.follow(O);
          ballRib.fade = p;
        }
        players.forEach((pl, i) => {
          const goal = pl.target && i === rally.to ? pl.target : V().set(courtX + pl.slot * 2, 0, courtZ + pl.side * 4.5);
          const prev = pl.pos.clone();
          pl.pos.lerp(goal, 1 - Math.exp(-dt * 2.2));
          const v = prev.distanceTo(pl.pos) / Math.max(dt, 1e-3);
          pl.phase += dt * (1 + v * 3);
          pl.hit -= dt;
          const face = pl.side > 0 ? Math.PI : 0;
          pl.heading = lerpAngle(pl.heading, face, 1 - Math.exp(-dt * 5));
          const y = sandHeight(pl.pos.x, pl.pos.z);
          const jump = i === rally.from && pl.hit > 0 && players[rally.to].side !== pl.side ? Math.sin((pl.hit / 0.35) * Math.PI) * 0.5 : 0;
          poseGait(pl.body, { x: pl.pos.x, y: y + jump, z: pl.pos.z, heading: pl.heading, phase: pl.phase, gait: v > 0.6 ? GAITS.run : GAITS.ready, armsUp: pl.hit > 0 ? 0.85 : 0 });
          pl.body.write(p);
          casters.push([pl.pos.x, pl.pos.z, 0.3, 1.8]);
        });
      },
    });
  });

  // ---- the lifeguard truck on patrol ----
  {
    const tp = truckPts(r);
    const truck = new Shape(cloud, tp.body, { color: '#ffffff', colors: tp.bodyCols, size: 0.075, seed: 91 });
    const bar = new Shape(cloud, tp.bar, { color: '#ff3a2a', size: 0.08, seed: 92 });
    const driver = person('lifeguard', { density: 50 });
    // two lanes joined by turns, on the tyre track the sand shows
    const laneZ = (x) => 44 + 1.5 * Math.sin(x * 0.01);
    const X0 = -360;
    const X1 = 300;
    const stops = [-330, -70, 92];
    const st = { x: -200, dir: 1, wait: 0, turn: -1, heading: EAST, z: laneZ(-200) };
    add({
      update(t, dt, hour) {
        const p = presence(hour, 8.2, 18.6, 0.3);
        if (p < 0.01) return;
        if (st.wait > 0) st.wait -= dt;
        else if (st.turn >= 0) {
          st.turn = Math.min(1, st.turn + dt / 6);
          const a = st.turn * Math.PI;
          const cx = st.dir > 0 ? X1 : X0;
          st.x = cx + st.dir * Math.sin(a) * 5;
          st.z = laneZ(cx) - 5 + Math.cos(a) * 5;
          st.heading = (st.dir > 0 ? EAST : WEST) + st.dir * a;
          if (st.turn >= 1) {
            st.turn = -1;
            st.dir = -st.dir;
          }
        } else {
          const nx = st.x + st.dir * 3.6 * dt;
          for (const s of stops) if (st.dir > 0 && (st.x - s) * (nx - s) < 0) st.wait = 22;
          st.x = nx;
          st.z = st.dir > 0 ? laneZ(st.x) : laneZ(st.x) - 10;
          st.heading = st.dir > 0 ? EAST : WEST;
          if ((st.dir > 0 && st.x > X1) || (st.dir < 0 && st.x < X0)) st.turn = 0;
        }
        const y = ground(st.x, st.z);
        const fx = Math.sin(st.heading);
        const fz = Math.cos(st.heading);
        X.set(fx, 0, fz);
        Y.set(0, 1, 0);
        Z.crossVectors(X, Y);
        truck.write(O.set(st.x, y, st.z), X, Y, Z, p);
        // the light bar flashes red and amber while it's parked by a tower
        const on = Math.floor(t * 3) % 2;
        for (let i = 0; i < bar.n; i++) {
          const red = (i + on) % 2 === 0;
          const glow = st.wait > 0 ? 1.7 : 0.9;
          bar.col[i * 3] = glow;
          bar.col[i * 3 + 1] = red ? 0.12 : 0.62 * glow;
          bar.col[i * 3 + 2] = 0.08;
        }
        bar.write(O, X, Y, Z, p);
        poseGait(driver, { x: st.x + fx * 0.6 - fz * 0.45, y: y + 0.5, z: st.z + fz * 0.6 + fx * 0.45, heading: st.heading, phase: 0, gait: GAITS.stand });
        driver.write(p);
        casters.push([st.x, st.z, 1.3, 1.9]);
      },
    });
  }

  // ---- the beach rake, grooming the upper beach at dawn ----
  {
    const tp = tractorPts(r);
    const rake = new Shape(cloud, tp.pts, { color: '#ffffff', colors: tp.cols, size: 0.08, seed: 93 });
    const operator = person('casual', { density: 50 });
    const rk = { x: -250, lane: 0, dir: 1 };
    add({
      update(t, dt, hour) {
        const p = presence(hour, 5.3, 8.1, 0.25);
        if (p < 0.01) return;
        rk.x += rk.dir * 2.6 * dt;
        if (rk.x > 90 || rk.x < -250) {
          rk.dir = -rk.dir;
          rk.lane = (rk.lane + 1) % 6;
          rk.x = clamp(rk.x, -250, 90);
        }
        const z = strandZ(rk.x) - 14 - rk.lane * 6;
        const y = ground(rk.x, z);
        X.set(rk.dir, 0, 0);
        Y.set(0, 1, 0);
        Z.crossVectors(X, Y);
        rake.write(O.set(rk.x, y, z), X, Y, Z, p);
        poseGait(operator, { x: rk.x - rk.dir * 0.45, y: y + 0.7, z, heading: rk.dir > 0 ? EAST : WEST, phase: 0, gait: GAITS.stand });
        operator.write(p);
      },
    });
  }

  // ---- sunset: people at the water's edge holding phones up to the sun ----
  for (let i = 0; i < count(12); i++) {
    const body = person(r.pick(['casual', 'casual', 'bikini', 'trunks']));
    const x = r() < 0.8 ? -120 + r() * 220 : 175 + r() * 100;
    const d = 2.5 + r() * 5;
    const ph = r() * 10;
    const dodge = dodger();
    add({
      update(t, dt, hour, sunDir) {
        const p = presence(hour, 17.4 + i * 0.03, 19.3, 0.3);
        if (p < 0.01) return;
        const dg = dodge(x, d, t, dt);
        const z = shoreZ(x) + d + dg.lift;
        const y = ground(x, z);
        const hurry = smoothstep(0.2, 0.9, dg.v);
        const heading = Math.atan2(sunDir.x, sunDir.z) * (1 - hurry);
        const snap = hurry < 0.2 && Math.sin(t * 0.2 + ph) > -0.3;
        poseGait(body, { x, y, z, heading, phase: t * 9, gait: hurry > 0.3 ? GAITS.run : GAITS.stand, reach: snap ? tmp.set(x + sunDir.x * 0.6, y + 1.55, z + sunDir.z * 0.6) : null });
        body.write(p);
      },
    });
  }

  // ---- cyclists, skaters and walkers on the Strand ----
  for (let i = 0; i < count(28); i++) {
    const kind = i < 14 ? 'bike' : i < 22 ? 'skate' : 'walk';
    const bike = kind === 'bike';
    const body = person(r.pick(['casual', 'jogger', 'bikini', 'trunks']), { density: 50 });
    const b = bike ? bikePts(r) : null;
    const frame = bike ? new Shape(cloud, b.pts, { color: '#222', colors: b.cols, size: 0.045, seed: r() * 1e4 }) : null;
    const colors = r.pick(RIB_COLORS);
    const ribbon = kind !== 'walk' && i % 2 === 0 ? rib({ width: bike ? 0.3 : 0.2, life: 1.6, minDist: 0.1, colorA: colors[0], colorB: colors[1], twist: 1.2, strands: 2, drift: [0, 0.3, 0], billow: 0.3, specks: 20 }) : null;
    const dir = i % 2 ? 1 : -1;
    const speed = bike ? 4.5 + r() * 2.5 : kind === 'skate' ? 3 + r() : 1.2 + r() * 0.3;
    const phase = r();
    const win = kind === 'walk' ? [8 + r() * 3, 19 + r() * 2] : [6.8 + r() * 2, 19.4 + r() * 1.2];
    const L = kind === 'walk' ? 500 : 1200;
    const x00 = kind === 'walk' ? -300 - r() * 50 : -850;
    let pedal = 0;
    add({
      update(t, dt, hour) {
        const p0 = presence(hour, win[0], win[1], 0.4);
        const u = (((phase + (t * speed * dir) / L) % 1) + 1) % 1;
        const x = x00 + u * L;
        const p = p0 * smoothstep(0, 0.04, u) * (1 - smoothstep(0.96, 1, u));
        if (p < 0.01) {
          if (ribbon) ribbon.fade = 0;
          return;
        }
        const z = strandZ(x) + dir * 1.1;
        const dz = (strandZ(x + 0.5) - strandZ(x - 0.5)) * dir;
        const heading = Math.atan2(dir, dz);
        const y = sandHeight(x, z) + 0.05;
        pedal += dt * speed * 1.6;
        if (bike) {
          X.set(Math.sin(heading), 0, Math.cos(heading));
          Y.set(0, 1, 0);
          Z.crossVectors(X, Y);
          frame.write(O.set(x, y, z), X, Y, Z, p);
          poseCycle(body, { x, y, z, heading, phase: pedal });
        } else poseGait(body, { x, y, z, heading, phase: kind === 'walk' ? t * 5.2 + phase * 9 : pedal * 0.8, gait: kind === 'walk' ? GAITS.walk : GAITS.skate });
        body.write(p);
        if (ribbon) {
          ribbon.follow(joint(body, bike ? 1 : 6, tmp));
          ribbon.fade = p;
        }
      },
    });
  }

  // ---- surreys: a family pedalling together under a fringed canopy ----
  for (let i = 0; i < count(3); i++) {
    const s = surreyPts(r);
    const cart = new Shape(cloud, s.pts, { color: '#fff', colors: s.cols, size: 0.06, seed: r() * 1e4 });
    const riders = [person('casual', { density: 50 }), person(r.pick(['casual', 'bikini']), { density: 50 })];
    const dir = i % 2 ? 1 : -1;
    const phase = r();
    let pedal = 0;
    add({
      update(t, dt, hour) {
        const p0 = presence(hour, 10 + i, 18.5, 0.4);
        const L = 1000;
        const u = (((phase + (t * 2.6 * dir) / L) % 1) + 1) % 1;
        const x = -700 + u * L;
        const p = p0 * smoothstep(0, 0.04, u) * (1 - smoothstep(0.96, 1, u));
        if (p < 0.01) return;
        const z = strandZ(x) + dir * 1.2;
        const dz = (strandZ(x + 0.5) - strandZ(x - 0.5)) * dir;
        const heading = Math.atan2(dir, dz);
        const y = sandHeight(x, z) + 0.05;
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        X.set(fx, 0, fz);
        Y.set(0, 1, 0);
        Z.crossVectors(X, Y);
        cart.write(O.set(x, y, z), X, Y, Z, p);
        pedal += dt * 4;
        riders.forEach((rd, k) => {
          const side = k ? 0.35 : -0.35;
          poseCycle(rd, { x: x - fz * side, y: y - 0.15, z: z + fx * side, heading, phase: pedal + k * 1.3 });
          rd.write(p);
        });
      },
    });
  }

  // ---- Muscle Beach: the rings, the parallel bars, and people watching ----
  {
    const ringers = [0, 1].map((k) => ({
      body: person('trunks', { density: 64 }),
      ribbon: rib({ width: 0.2, life: 1.3, minDist: 0.06, colorA: '#fff3b0', colorB: '#ff7a3d', twist: 1.5, strands: 2, drift: [0, 0.1, 0], specks: 20 }),
      x: k ? 0.95 : -0.95,
      ph: k * 2.1,
      win: k ? [9.5, 17.6] : [8, 18.2],
    }));
    for (const rg of ringers) {
      add({
        update(t, dt, hour) {
          const p = presence(hour, rg.win[0], rg.win[1], 0.4);
          if (p < 0.01) {
            rg.ribbon.fade = 0;
            return;
          }
          const swing = Math.sin(t * 1.6 + rg.ph) * (0.35 + 0.3 * Math.max(0, Math.sin(t * 0.2 + rg.ph)));
          poseHang(rg.body, { x: RINGS.x + rg.x, y: sandHeight(RINGS.x, RINGS.z) + 2.6, z: RINGS.z, heading: Math.PI, swing });
          rg.body.write(p);
          rg.ribbon.follow(joint(rg.body, 12, tmp));
          rg.ribbon.fade = p * smoothstep(0.2, 0.4, Math.abs(swing));
        },
      });
    }
    const dipper = person('trunks', { density: 64 });
    add({
      update(t, dt, hour) {
        const p = presence(hour, 9, 17.5, 0.4);
        if (p < 0.01) return;
        // dips on the parallel bars: arms straight, then bent
        const k = 0.5 + 0.5 * Math.sin(t * 2.2);
        const x = RINGS.x + 5.5;
        const g = sandHeight(x, RINGS.z);
        poseGait(dipper, { x, y: g + 0.62 - k * 0.35, z: RINGS.z, heading: EAST, phase: 0, gait: GAITS.stand });
        const J = dipper.J;
        for (const [sh, side] of [[4, -1], [7, 1]]) {
          J[(sh + 2) * 3] = x;
          J[(sh + 2) * 3 + 1] = g + 1.62;
          J[(sh + 2) * 3 + 2] = RINGS.z + side * 0.25;
          J[(sh + 1) * 3] = x - 0.18 * k;
          J[(sh + 1) * 3 + 1] = (J[sh * 3 + 1] + g + 1.62) / 2 + 0.05;
          J[(sh + 1) * 3 + 2] = RINGS.z + side * 0.3;
        }
        dipper.write(p);
      },
    });
    for (let i = 0; i < 4; i++) {
      const body = person(r.pick(['casual', 'jogger', 'bikini']));
      const x = RINGS.x - 4 + i * 2.6 + r();
      const z = RINGS.z - 3.5 - r() * 2;
      const ph = r() * 10;
      add({
        update(t, dt, hour) {
          const p = presence(hour, 9.5 + i * 0.4, 17.5, 0.4);
          if (p < 0.01) return;
          const y = sandHeight(x, z);
          const clap = Math.sin(t * 0.3 + ph) > 0.9;
          poseGait(body, { x, y, z, heading: Math.atan2(RINGS.x - x, RINGS.z - z), phase: 0, gait: GAITS.stand, armsUp: clap ? 0.45 + 0.1 * Math.sin(t * 14) : 0 });
          body.write(p);
          casters.push([x, z, 0.3, 1.7]);
        },
      });
    }
  }

  // ---- lifeguards on duty ----
  for (const [tx, d] of TOWERS.slice(0, 3)) {
    const body = person('lifeguard', { density: 60 });
    add({
      update(t, dt, hour) {
        const p = presence(hour, 9, 18.6, 0.3);
        if (p < 0.01) return;
        const z = shoreZ(tx) + d - 2.1;
        const y = sandHeight(tx, z + 2) + 1.6;
        const scan = Math.sin(t * 0.15 + tx) * 0.6;
        poseGait(body, { x: tx + Math.sin(t * 0.05 + tx) * 1.1, y, z, heading: SEA + scan, phase: 0, gait: GAITS.stand, armsUp: Math.sin(t * 0.07 + tx) > 0.93 ? 0.55 : 0 });
        body.write(p);
      },
    });
  }

  // ---- kites on the sea breeze ----
  for (const [kx, kd, cols] of [[25, 12, ['#ff5fa2', '#ffc24a']], [-95, 16, ['#3fb6ff', '#f4f4f0']]]) {
    const kid = person('trunks', { scale: 0.72, density: 60 });
    const K0 = V().set(kx, 0, shoreZ(kx) + kd);
    K0.y = sandHeight(K0.x, K0.z);
    const kitePoly = [[0, 0.95], [0.72, 0.1], [0, -1.35], [-0.72, 0.1]].map(([x, y]) => [x * 1.25, y * 1.25]);
    const kitePts = fillPolygon(r, kitePoly, 380, 60);
    const kite = new Shape(cloud, kitePts, { color: '#ffffff', size: 0.07, seed: 6, colors: kitePts.map(([x]) => (x < 0 ? cols[0] : cols[1])) });
    const kiteLine = new Line(cloud, 110, { color: '#f4efe6', size: 0.03, seed: 7 });
    const kiteRibs = [
      rib({ width: 0.34, life: 3.0, step: 0.04, minDist: 0.1, colorA: cols[0], colorB: cols[1], twist: 1.6, drift: [0.3, -0.4, 1.0], billow: 0.45, strands: 3 }),
      rib({ width: 0.22, life: 2.4, step: 0.04, minDist: 0.1, colorA: '#ffd36b', colorB: '#8a7bff', twist: 1.9, drift: [0.4, -0.3, 0.9], billow: 0.5, strands: 2 }),
    ];
    const kp = V();
    const ph = kx * 0.1;
    add({
      update(t, dt, hour) {
        const p = presence(hour, 10.5, 17.8, 0.35);
        if (p < 0.01) {
          kiteRibs.forEach((rb) => (rb.fade = 0));
          return;
        }
        // onshore breeze: the kite flies inland of its flier
        const tt = t + ph;
        kp.set(K0.x + 3 + 5 * Math.sin(0.37 * tt) + 1.5 * Math.sin(0.9 * tt), K0.y + 13 + 2.4 * Math.sin(0.53 * tt) + 0.8 * Math.sin(1.7 * tt), K0.z + 12 + 2 * Math.sin(0.29 * tt));
        poseGait(kid, { x: K0.x, y: K0.y, z: K0.z, heading: Math.atan2(kp.x - K0.x, kp.z - K0.z), phase: 0, gait: GAITS.stand, reach: kp });
        kid.write(p);
        Z.copy(K0).addScaledVector(UP, 1.2).sub(kp).normalize();
        X.crossVectors(UP, Z).normalize();
        Y.crossVectors(Z, X);
        const roll = 0.3 * Math.sin(1.3 * tt);
        const c = Math.cos(roll);
        const s = Math.sin(roll);
        tmp.copy(X);
        X.multiplyScalar(c).addScaledVector(Y, s);
        Y.multiplyScalar(c).addScaledVector(tmp, -s);
        kite.write(kp, X, Y, Z, p);
        const hand = joint(kid, 9);
        const mid = hand.clone().lerp(kp, 0.5);
        mid.y -= 1.6;
        kiteLine.write(hand, mid, kp, p * 0.5);
        const tail = tmp.copy(kp).addScaledVector(Y, -1.35 * 1.25);
        kiteRibs.forEach((rb) => {
          rb.follow(tail);
          rb.fade = p;
        });
      },
    });
  }

  const sunDir = V();
  return {
    update(t, dt, ctx) {
      const { hour } = ctx;
      cloud.begin(ctx);
      casters.length = 0;
      sunDir.copy(U.uSunDir.value).setY(0).normalize();
      for (const a of actors) a.update(t, dt, hour, sunDir);
      cloud.commit();
    },
    casters(out) {
      for (const c of casters) out.push(c);
    },
  };
}
