// Wildlife of Santa Monica Bay: brown pelicans gliding single file just over
// the swells (flapping in sequence down the line, now and then one plunging
// for a fish), western gulls wheeling overhead and loafing on the sand,
// sanderlings sprinting after the backwash, and a pod of bottlenose dolphins
// surfacing beyond the break.
import * as THREE from 'three';
import { rng, presence, smoothstep } from './core.js';
import { shoreZ, sandHeight, PIER } from './site.js';
import { SURF, seaHeight, swashOf } from './surf.js';
import { FigureCloud, Body, Shape } from './rigs.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = () => new THREE.Vector3();
const O = V(), X = V(), Y = V(), Z = V(), tmp = V();

function wingPanel(r, span, chord0, chord1, sweep, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = r();
    const v = r();
    pts.push([u * span, 0, -0.03 + v * (chord0 + (chord1 - chord0) * u) + u * sweep]);
  }
  for (let i = 0; i < n * 0.3; i++) {
    const u = r();
    pts.push([u * span, 0, -0.03 + u * sweep]);
  }
  return pts;
}

// A bird in flight: body along F, wings built from inner and outer panels.
class Bird {
  constructor(cloud, r, { spec, palette, scale, inner, outer, wingColors, density = 70, size = 0.06 }) {
    this.body = new Body(cloud, spec, { palette, scale, density, size, seed: r() * 1e5 });
    this.wings = [0, 1, 2, 3].map((k) => new Shape(cloud, k % 2 === 0 ? wingPanel(r, ...inner) : wingPanel(r, ...outer), { color: wingColors[k % 2], size: size * 1.1, seed: r() * 1e4 }));
    this.inner = inner[0];
    this.outer = outer[0];
    this.scale = scale;
    this.len = spec.len;
  }

  hide() {
    this.body.hide();
    this.wings.forEach((w) => w.hide());
  }

  /** Place at p flying along f with bank angle `roll`; b1, b2 are wing angles (inner, outer). */
  pose(p, f, roll, b1, b2, alpha, fold = 0) {
    const F = O.copy(f).normalize();
    const S = X.crossVectors(F, UP).normalize();
    const U = Y.crossVectors(S, F);
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const S0 = (this.scratch ??= V()).copy(S);
    S.multiplyScalar(c).addScaledVector(U, s);
    U.multiplyScalar(c).addScaledVector(S0, -s);
    const J = this.body.J;
    const k = this.scale;
    const set = (j, a, b, cc) => {
      J[j * 3] = p.x + F.x * a * k + U.x * b * k + S.x * cc * k;
      J[j * 3 + 1] = p.y + F.y * a * k + U.y * b * k + S.y * cc * k;
      J[j * 3 + 2] = p.z + F.z * a * k + U.z * b * k + S.z * cc * k;
    };
    this.len(set);
    this.body.write(alpha);
    const back = Z.copy(F).negate();
    const span1 = this.inner * (1 - 0.7 * fold);
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      const root = V().set(p.x, p.y, p.z).addScaledVector(F, 0.05 * k).addScaledVector(S, sg * 0.05 * k);
      const D1 = V().copy(S).multiplyScalar(sg * Math.cos(b1)).addScaledVector(U, Math.sin(b1)).addScaledVector(back, fold * 0.9).normalize();
      this.wings[side * 2].write(root, D1, U, back, alpha);
      const tip = root.clone().addScaledVector(D1, span1);
      const D2 = V().copy(S).multiplyScalar(sg * Math.cos(b1 + b2)).addScaledVector(U, Math.sin(b1 + b2)).addScaledVector(back, fold * 1.2).normalize();
      this.wings[side * 2 + 1].write(tip, D2, U, back, alpha);
      if (side === 0) this.tipL = tip.clone().addScaledVector(D2, this.outer);
      else this.tipR = tip.clone().addScaledVector(D2, this.outer);
    }
  }
}

const PELICAN = {
  joints: 5, // tail chest neck-base head bill-tip
  center: 1,
  radius: 1.4,
  bones: [[0, 1, 0.1, 0.16, 1.3, 'body'], [1, 2, 0.07, 0.06, 0.35, 'neck'], [3, 4, 0.045, 0.012, 0.4, 'bill']],
  balls: [[3, 0.075, 0.3, 'head']],
  len: (set) => {
    set(0, -0.55, 0, 0);
    set(1, 0.2, 0.02, 0);
    set(2, 0.34, 0.06, 0);
    set(3, 0.42, 0.1, 0);
    set(4, 0.78, 0.02, 0);
  },
};

const GULL = {
  joints: 4, // tail chest head beak
  center: 1,
  radius: 0.6,
  bones: [[0, 1, 0.05, 0.075, 0.9, 'body'], [2, 3, 0.02, 0.008, 0.15, 'bill']],
  balls: [[2, 0.05, 0.3, 'head']],
  len: (set) => {
    set(0, -0.22, 0, 0);
    set(1, 0.12, 0.01, 0);
    set(2, 0.24, 0.05, 0);
    set(3, 0.33, 0.04, 0);
  },
};

export function createWildlife(scene, ribbons) {
  const cloud = new FigureCloud(scene, 26000);
  const r = rng(707);
  const actors = [];
  const probe = { pelicans: [] }; // live positions, for the trailer camera

  // ---- brown pelicans, two squadrons ----
  const squads = [
    { n: 5, dir: 1, off: 55, speed: 9.5, phase: 0, win: [6.4, 19.6] },
    { n: 4, dir: -1, off: 95, speed: 8.5, phase: 480, win: [7, 19] },
  ];
  for (const sq of squads) {
    const birds = Array.from({ length: sq.n }, () => ({
      bird: new Bird(cloud, r, {
        spec: PELICAN,
        palette: { body: [0.42, 0.4, 0.38], neck: [0.5, 0.36, 0.26], head: [0.95, 0.92, 0.78], bill: [0.7, 0.6, 0.45] },
        scale: 1.0,
        inner: [0.55, 0.36, 0.3, 0.02, 90],
        outer: [0.55, 0.3, 0.1, 0.12, 80],
        wingColors: [[0.42, 0.41, 0.4], [0.2, 0.2, 0.21]],
        density: 60,
        size: 0.07,
      }),
      dive: -1,
      rib: ribbons.create({ width: 0.12, life: 1.6, colorA: '#fff7e0', colorB: '#8fc7ff', opacity: 0.45, twist: 0.4, strands: 1.5, billow: 0.15, drift: [0, 0, 0], minDist: 0.25, specks: 18 }),
    }));
    let nextDive = 25 + r() * 30;
    const seen = birds.map(() => V());
    probe.pelicans.push(seen);
    actors.push((t, dt, hour) => {
      const p = presence(hour, sq.win[0], sq.win[1], 0.5);
      const L = 1300;
      const u = (((sq.phase + t * sq.speed) % L) + L) % L;
      const lead = sq.dir > 0 ? -600 + u : 700 - u;
      const edge = smoothstep(0, 60, u) * (1 - smoothstep(L - 60, L, u));
      nextDive -= dt;
      if (nextDive < 0) {
        const pick = birds[Math.floor(r() * birds.length)];
        if (pick.dive < 0) pick.dive = 0;
        nextDive = 30 + r() * 40;
      }
      birds.forEach((b, i) => {
        const a = p * edge;
        if (a < 0.01) {
          b.bird.hide();
          b.rib.fade = 0;
          return;
        }
        const x = lead - sq.dir * i * 3.4;
        const z = shoreZ(x) - sq.off - i * 0.5 + Math.sin(t * 0.3 + i) * 1.5;
        const sea = seaHeight(x, z, t);
        let y = sea + 1.4 + 0.25 * Math.sin(t * 0.8 + i * 0.7);
        // flap in sequence down the line, then glide
        const wave = t * 0.22 - i * 0.12;
        const flapping = (wave - Math.floor(wave)) < 0.18;
        let b1 = flapping ? 0.1 + 0.55 * Math.sin(t * 16 - i) : 0.06 + 0.03 * Math.sin(t + i);
        let b2 = flapping ? 0.2 * Math.sin(t * 16 - i - 0.8) : -0.12;
        let fold = 0;
        if (b.dive >= 0) {
          b.dive += dt / 3.2;
          const d = b.dive;
          if (d < 0.45) y += smoothstep(0, 0.45, d) * 9; // climb
          else if (d < 0.62) {
            const k = (d - 0.45) / 0.17; // tuck and plunge
            y += 9 * (1 - k * k) - k * 1.2;
            fold = smoothstep(0, 0.4, k);
            b1 = 0.2;
            b2 = -0.3;
          } else if (d < 0.85) y = sea - 0.2; // under, then bob up
          else y = sea + 0.1 + (d - 0.85) * 8;
          if (d >= 1) b.dive = -1;
        }
        tmp.set(x, y, z);
        seen[i].copy(tmp);
        const f = V().set(sq.dir, b.dive > 0.45 && b.dive < 0.62 ? -1.6 : 0, 0);
        b.bird.pose(tmp, f, Math.sin(t * 0.4 + i) * 0.08, b1, b2, a, fold);
        b.rib.follow(b.bird.tipL ?? tmp);
        b.rib.fade = a * 0.8;
      });
    });
  }

  // ---- western gulls: wheeling over the beach and pier ----
  const gullPalette = { body: [0.93, 0.94, 0.95], head: [0.96, 0.96, 0.96], bill: [0.95, 0.8, 0.2] };
  const S = 1.6;
  const loops = [
    { c: [-6, 11, -4], R: [20, 7], w: 0.16, p: 0 },
    { c: [40, 14, -18], R: [26, 10], w: 0.12, p: 2 },
    { c: [10, 8, 6], R: [12, 5], w: 0.2, p: 4 },
    { c: [110, 22, -30], R: [28, 12], w: 0.1, p: 1 },
    { c: [70, 12, 8], R: [14, 7], w: 0.18, p: 3 },
  ];
  const gulls = loops.map((d) => ({
    ...d,
    bird: new Bird(cloud, r, {
      spec: GULL,
      palette: gullPalette,
      scale: S,
      inner: [0.36 * S, 0.16 * S, 0.13 * S, 0.02 * S, 80],
      outer: [0.42 * S, 0.13 * S, 0.03 * S, 0.14 * S, 70],
      wingColors: [[0.72, 0.76, 0.8], [0.2, 0.2, 0.22]],
      density: 50,
      size: 0.05,
    }),
    rib: ribbons.create({ width: 0.15, life: 2.2, colorA: '#ffffff', colorB: '#7fd4ff', opacity: 0.5, twist: 0.8, strands: 2, billow: 0.2, drift: [0, 0.1, 0], minDist: 0.2, specks: 22 }),
    phase: r() * 6,
    heading: 0,
    roll: 0,
  }));
  actors.push((t, dt, hour) => {
    const p = presence(hour, 5.8, 19.9, 0.5);
    for (const g of gulls) {
      if (p < 0.01) {
        g.bird.hide();
        g.rib.fade = 0;
        continue;
      }
      const th = g.w * t + g.p;
      const x = g.c[0] + g.R[0] * Math.sin(th);
      const z = g.c[2] + g.R[1] * Math.sin(2 * th) * 0.5;
      const y = g.c[1] + 1.8 * Math.sin(0.5 * th + g.p);
      const vx = g.R[0] * g.w * Math.cos(th);
      const vz = g.R[1] * g.w * Math.cos(2 * th);
      const h = Math.atan2(vx, vz);
      const dh = Math.atan2(Math.sin(h - g.heading), Math.cos(h - g.heading)) / Math.max(dt, 1e-3);
      g.heading = h;
      g.roll += (Math.max(-0.7, Math.min(0.7, -dh * 0.9)) - g.roll) * (1 - Math.exp(-dt * 3));
      const flap = smoothstep(0.35, 0.65, 0.5 + 0.5 * Math.sin(0.37 * t + g.p * 3));
      g.phase += dt * (5 + 4 * flap);
      const amp = 0.15 + 0.55 * flap;
      tmp.set(x, y, z);
      g.bird.pose(tmp, V().set(vx, 0.9 * g.w * Math.cos(0.5 * th + g.p), vz), g.roll, amp * Math.sin(g.phase) + 0.24, amp * 0.8 * Math.sin(g.phase - 0.6) - 0.5, p);
      g.rib.follow(V().fromArray(g.bird.body.J, 0));
      g.rib.fade = p;
    }
  });

  // ---- gulls loafing on the sand, flushing when someone walks up ----
  const loafers = Array.from({ length: 16 }, (_, i) => {
    const x = (i < 12 ? -60 : 170) + (i % 12) * 9 + r() * 6;
    return {
      x,
      d: 5 + r() * 12,
      bird: new Bird(cloud, r, { spec: GULL, palette: gullPalette, scale: 1.5, inner: [0.36 * 1.5, 0.16 * 1.5, 0.13 * 1.5, 0.02 * 1.5, 60], outer: [0.42 * 1.5, 0.13 * 1.5, 0.03 * 1.5, 0.14 * 1.5, 50], wingColors: [[0.72, 0.76, 0.8], [0.2, 0.2, 0.22]], density: 60, size: 0.05 }),
      ph: r() * 10,
      h: r() * 6,
      fly: -1, // seconds into a flight, or −1 on the ground
      from: V(),
      to: V(),
      scare: 40 + r() * 120,
    };
  });
  const flush = (g, awayX, awayZ) => {
    if (g.fly >= 0) return;
    g.fly = 0;
    g.from.set(g.x, 0, 0);
    const a = Math.atan2(awayX, awayZ) + (r() - 0.5) * 1.2;
    const dist = 9 + r() * 10;
    g.to.set(Math.sin(a) * dist, 0, Math.cos(a) * dist);
    g.dur = 3.5 + r() * 2.5;
  };
  actors.push((t, dt, hour, cam) => {
    const p = presence(hour, 6, 19.5, 0.4);
    if (p < 0.01) return;
    for (const g of loafers) {
      const wander = g.fly < 0 ? Math.sin(t * 0.05 + g.ph) * 1.5 : 0;
      const x = g.x + wander;
      const z = shoreZ(x) + g.d + Math.cos(t * 0.04 + g.ph) * 0.8;
      const y = sandHeight(x, z) + 0.26 * 1.5;
      // someone walking right up to them, or now and then a kid running at them
      g.scare -= dt;
      const near = cam && cam.y < y + 3.5 && Math.hypot(cam.x - x, cam.z - z) < 4.5;
      if (g.fly < 0 && (near || g.scare < 0)) {
        const ax = near ? x - cam.x : r() - 0.5;
        const az = near ? z - cam.z : -(0.3 + r());
        for (const o of loafers) if (o === g || Math.hypot(o.x - g.x, o.d - g.d) < 6) flush(o, ax, az);
        g.scare = 60 + r() * 140;
      }
      if (g.fly >= 0) {
        g.fly += dt;
        const k = Math.min(1, g.fly / g.dur);
        const e = k * k * (3 - 2 * k);
        const fx = x + g.to.x * e;
        const fz = z + g.to.z * e;
        const fy = y + Math.sin(Math.PI * k) * (2.2 + g.dur * 0.4);
        const flap = 0.2 + 0.55 * (1 - k * 0.5);
        tmp.set(fx, fy, fz);
        g.bird.pose(tmp, V().set(g.to.x, 3 * (1 - 2 * k), g.to.z), Math.sin(t * 3 + g.ph) * 0.15, flap * Math.sin(t * 13 + g.ph) + 0.25, flap * 0.8 * Math.sin(t * 13 + g.ph - 0.6) - 0.4, p);
        if (k >= 1) {
          // land where the flight ended
          g.x += g.to.x;
          g.d += g.to.z;
          g.d = Math.min(Math.max(g.d, 3), 30);
          g.fly = -1;
        }
        continue;
      }
      g.h += Math.sin(t * 0.3 + g.ph) * dt * 0.3;
      const fx = Math.sin(g.h);
      const fz = Math.cos(g.h);
      const peck = Math.max(0, Math.sin(t * 0.7 + g.ph * 3)) ** 8;
      const J = g.bird.body.J;
      const put = (j, a, b) => {
        J[j * 3] = x + fx * a * 1.5;
        J[j * 3 + 1] = y + b * 1.5;
        J[j * 3 + 2] = z + fz * a * 1.5;
      };
      put(0, -0.2, 0.02);
      put(1, 0.1, 0.02);
      put(2, 0.18 + peck * 0.05, 0.12 - peck * 0.22);
      put(3, 0.27 + peck * 0.06, 0.1 - peck * 0.26);
      g.bird.body.write(p);
      // wings folded along the back
      for (const [k, side] of [[0, 1], [1, -1]]) {
        const Xw = V().set(-fx * 0.95, 0.1, -fz * 0.95).addScaledVector(V().set(fz, 0, -fx), side * 0.25).normalize();
        const Zw = V().set(0, -1, 0);
        const Yw = V().crossVectors(Zw, Xw).normalize();
        const root = V().set(x + fx * 0.12 + fz * side * 0.08, y + 0.12, z + fz * 0.12 - fx * side * 0.08);
        g.bird.wings[k * 2].write(root, Xw, Yw, Zw, p);
        g.bird.wings[k * 2 + 1].write(root.addScaledVector(Xw, g.bird.inner), Xw, Yw, Zw, p);
      }
    }
  });

  // ---- sanderlings: a flock chasing the backwash ----
  const SANDERLING = {
    joints: 5, // body head bill-tip foot-L foot-R
    center: 0,
    radius: 0.25,
    bones: [[0, 1, 0.045, 0.035, 0.6, 'body'], [1, 2, 0.008, 0.004, 0.08, 'bill'], [0, 3, 0.006, 0.006, 0.08, 'leg'], [0, 4, 0.006, 0.006, 0.08, 'leg']],
    balls: [[1, 0.03, 0.15, 'head']],
  };
  const flocks = [[8, 24], [-52, 18]].map(([x0, n]) =>
    Array.from({ length: n }, () => ({
      x0: x0 + r.gauss() * 5,
      lag: r() * 0.6,
      z: 0,
      h: Math.PI / 2,
      step: r() * 6,
      body: new Body(cloud, SANDERLING, { palette: { body: [0.86, 0.84, 0.8], head: [0.8, 0.78, 0.74], bill: [0.08, 0.08, 0.08], leg: [0.08, 0.08, 0.08] }, scale: 1, density: 90, size: 0.035, seed: r() * 1e5 }),
    }))
  );
  actors.push((t, dt, hour) => {
    const p = presence(hour, 6.2, 19.2, 0.4);
    const nS = Math.floor((t - SURF.LIFE) / SURF.P);
    for (const flock of flocks) {
      for (const b of flock) {
        if (p < 0.01) {
          b.body.hide();
          continue;
        }
        const x = b.x0 + Math.sin(t * 0.03 + b.lag * 9) * 3;
        let front = 0.5;
        for (let k = -1; k < 3; k++) {
          const sw = swashOf(x, nS - k, t - b.lag);
          if (sw.tau >= 0 && sw.tau < 10) front = Math.max(front, sw.front);
        }
        const target = shoreZ(x) + front + 0.6 + b.lag;
        const prev = b.z || target;
        b.z = prev + (target - prev) * (1 - Math.exp(-dt * 6));
        const v = (b.z - prev) / Math.max(dt, 1e-3);
        b.h = v > 0.1 ? 0 : v < -0.1 ? Math.PI : b.h;
        b.step += dt * (4 + Math.abs(v) * 10);
        const y = sandHeight(x, b.z);
        const fx = Math.sin(b.h);
        const fz = Math.cos(b.h);
        const J = b.body.J;
        const put = (j, a, bb, c) => {
          J[j * 3] = x + fx * a - fz * c;
          J[j * 3 + 1] = y + bb;
          J[j * 3 + 2] = b.z + fz * a + fx * c;
        };
        put(0, 0, 0.1, 0);
        put(1, 0.07, 0.15, 0);
        put(2, 0.12, 0.13, 0);
        put(3, Math.sin(b.step) * 0.03, 0.0, -0.015);
        put(4, -Math.sin(b.step) * 0.03, 0.0, 0.015);
        b.body.write(p);
      }
    }
  });

  // ---- bottlenose dolphins cruising the outer surf ----
  const DOLPHIN = {
    joints: 6, // fluke peduncle body head rostrum dorsal
    center: 2,
    radius: 2.6,
    bones: [[0, 1, 0.04, 0.1, 0.4, 'body'], [1, 2, 0.1, 0.24, 1.2, 'body'], [2, 3, 0.24, 0.2, 1.1, 'body'], [3, 4, 0.1, 0.04, 0.3, 'body'], [2, 5, 0.06, 0.01, 0.3, 'fin']],
  };
  const pod = Array.from({ length: 4 }, (_, i) => ({
    lane: 150 + i * 7 + r() * 5,
    lead: i * 5 + r() * 3,
    period: 5 + r() * 2,
    ph: r() * 10,
    body: new Body(cloud, DOLPHIN, { palette: { body: [0.42, 0.46, 0.5], fin: [0.3, 0.33, 0.36] }, scale: 1, density: 90, size: 0.06, seed: r() * 1e5 }),
    rib: ribbons.create({ width: 0.4, life: 1.2, flat: true, colorA: '#f4ffff', colorB: '#66ccff', opacity: 0.5, strands: 3, drift: [0, 0.2, 0], billow: 0.3, spread: 1.2, specks: 24 }),
  }));
  actors.push((t, dt, hour) => {
    const p = presence(hour, 7.2, 18.2, 0.5);
    const L = 1500;
    const u = (((t * 3.2 + 900) % L) + L) % L;
    const edge = smoothstep(0, 80, u) * (1 - smoothstep(L - 80, L, u));
    for (const d of pod) {
      const a = p * edge;
      if (a < 0.01) {
        d.body.hide();
        d.rib.fade = 0;
        continue;
      }
      const headX = -700 + u + d.lead;
      const z = shoreZ(headX) - d.lane;
      // each joint follows the head's path a little later: a porpoising arc
      const arcY = (tt) => {
        const k = ((tt + d.ph) % d.period) / d.period;
        return k < 0.32 ? -1.1 + 1.55 * Math.sin((Math.PI * k) / 0.32) : -1.1 - 0.3 * Math.sin((Math.PI * (k - 0.32)) / 0.68);
      };
      const J = d.body.J;
      const offsets = [[0, -2.3], [1, -1.8], [2, -0.9], [3, -0.2], [4, 0.2]];
      for (const [j, s] of offsets) {
        const tt = t + s / 3.2;
        const x = headX + s;
        J[j * 3] = x;
        J[j * 3 + 1] = seaHeight(x, z, t) + arcY(tt);
        J[j * 3 + 2] = z;
      }
      J[5 * 3] = J[2 * 3] - 0.25;
      J[5 * 3 + 1] = J[2 * 3 + 1] + 0.42;
      J[5 * 3 + 2] = J[2 * 3 + 2];
      d.body.write(a);
      const k = ((t + d.ph) % d.period) / d.period;
      tmp.fromArray(J, 9);
      d.rib.follow(tmp);
      d.rib.fade = a * (k < 0.36 ? 1 : 0);
    }
  });

  // ---- pelicans perched on the end rail, preening and stretching ----
  for (let i = 0; i < 4; i++) {
    const bird = new Bird(cloud, r, {
      spec: PELICAN,
      palette: { body: [0.42, 0.4, 0.38], neck: [0.5, 0.36, 0.26], head: [0.95, 0.92, 0.78], bill: [0.7, 0.6, 0.45] },
      scale: 1.0,
      inner: [0.55, 0.36, 0.3, 0.02, 90],
      outer: [0.55, 0.3, 0.1, 0.12, 80],
      wingColors: [[0.42, 0.41, 0.4], [0.2, 0.2, 0.22]],
      density: 60,
      size: 0.07,
    });
    const x = PIER.x - 7 + i * 4.2 + r();
    const z = PIER.end + 0.05;
    const face = r() < 0.5 ? 1 : -1;
    const ph = r() * 30;
    actors.push((t, dt, hour) => {
      const p = presence(hour, 6, 19.8, 0.4);
      if (p < 0.01) return;
      const stretch = Math.max(0, Math.sin((t + ph) * 0.09)) ** 12;
      const open = stretch;
      const J = bird.body.J;
      const y = PIER.deck + 1.1 + 0.32;
      // sitting along the rail: body level, neck folded back, bill resting on the breast
      const put = (j, a, b) => {
        J[j * 3] = x + face * a;
        J[j * 3 + 1] = y + b;
        J[j * 3 + 2] = z;
      };
      const turn = Math.sin((t + ph) * 0.13) * 0.08;
      put(0, -0.45, -0.05);
      put(1, 0.15, 0.02);
      put(2, 0.2, 0.25 + stretch * 0.2);
      put(3, 0.26 + turn, 0.42 + stretch * 0.25);
      put(4, 0.55 + turn, 0.12 + stretch * 0.3);
      bird.body.write(p);
      // wings folded along the back, now and then opened wide to dry
      for (const [k, side] of [[0, 1], [1, -1]]) {
        const Xw = V().set(-face * (1 - open) * 0.9, 0.15 + open * 0.8, side * (0.35 + open * 0.9)).normalize();
        const Zw = V().set(face * 0.2 * open, -1 + open * 0.3, 0).normalize();
        const Yw = V().crossVectors(Zw, Xw).normalize();
        const root = V().set(x + face * 0.12, y + 0.1, z + side * 0.13);
        bird.wings[k * 2].write(root, Xw, Yw, Zw, p);
        bird.wings[k * 2 + 1].write(root.addScaledVector(Xw, bird.inner), Xw, Yw, Zw, p);
      }
    });
  }

  // ---- California sea lions lazing by the pier's far end ----
  const SEALION = {
    joints: 6, // tail hips chest neck head nose
    center: 2,
    radius: 1.4,
    bones: [[0, 1, 0.05, 0.16, 0.6, 'body'], [1, 2, 0.16, 0.22, 1.3, 'body'], [2, 3, 0.2, 0.12, 0.7, 'body'], [3, 4, 0.12, 0.09, 0.4, 'body'], [4, 5, 0.08, 0.03, 0.2, 'body']],
  };
  for (let i = 0; i < 3; i++) {
    const body = new Body(cloud, SEALION, { palette: { body: [0.3, 0.22, 0.16] }, scale: 1, density: 80, size: 0.06, seed: r() * 1e5 });
    const cx = PIER.x + (i - 1) * 16 + r() * 5;
    const cz = PIER.end + 25 + r() * 60;
    const ph = r() * 50;
    actors.push((t, dt, hour) => {
      const tt = t + ph;
      // circling slowly, now and then lifting the head to look round
      const a = tt * 0.06;
      const x = cx + Math.cos(a) * 7;
      const z = cz + Math.sin(a) * 7 - (Math.abs(cx - PIER.x) < 12 ? 16 : 0);
      const hx = -Math.sin(a);
      const hz = Math.cos(a);
      const sea = seaHeight(x, z, t);
      const look = Math.max(0, Math.sin(tt * 0.11)) ** 6;
      const J = body.J;
      const put = (j, s, y) => {
        J[j * 3] = x + hx * s;
        J[j * 3 + 1] = sea + y;
        J[j * 3 + 2] = z + hz * s;
      };
      put(0, -1.0, -0.12);
      put(1, -0.55, -0.05);
      put(2, 0.05, 0.0);
      put(3, 0.45, 0.08 + look * 0.35);
      put(4, 0.62 - look * 0.1, 0.16 + look * 0.55);
      put(5, 0.8 - look * 0.1, 0.12 + look * 0.5);
      body.write(1);
    });
  }

  return {
    loafers,
    probe,
    update(t, dt, ctx) {
      cloud.begin(ctx);
      for (const a of actors) a(t, dt, ctx.hour, ctx.camera.position);
      cloud.commit();
    },
  };
}
