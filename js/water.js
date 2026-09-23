// People in the water: waders hopping the shore break (and ducking under the
// big ones), swimmers treading water and swimming laps, bodyboarders riding
// the whitewater in and wading back out, surfers working two peaks either
// side of the pier, and an open-water swim group with bright caps out past
// the lineup.
import * as THREE from 'three';
import { rng, presence, smoothstep, QUALITY } from './core.js';
import { shoreZ, sandHeight, PIER } from './site.js';
import { SURF, surfAt, seaHeight, pathS, waveOff, waveAmp, breakDist, crestInfo } from './surf.js';
import { FigureCloud, Body, Shape, HUMAN, GAITS, outfit, poseGait, poseSit, poseSurf, posePaddle } from './rigs.js';

const V = () => new THREE.Vector3();
const tmp = V();
const O = V(), X = V(), Y = V(), Z = V();
const joint = (body, j, out = V()) => out.fromArray(body.J, j * 3);
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const SEA = Math.PI;
const SHORE = 0;
const LINEUP_A = 1.6; // surfers sit just outside where a head-high wave breaks

function boardPts(r, len, width, n = 150) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const x = r.range(-len / 2, len / 2);
    const w = width * Math.sqrt(Math.max(0, 1 - (x / (len * 0.52)) ** 2)) * (x > 0 ? 1 - 0.35 * (x / (len / 2)) ** 2 : 1);
    pts.push([x, 0, (i % 3 === 0 ? (r() < 0.5 ? -1 : 1) : r.range(-1, 1)) * w]);
  }
  return pts;
}

export function createWater(scene, ribbons) {
  const cloud = new FigureCloud(scene, 90000);
  const r = rng(3131);
  const Q = Math.max(QUALITY, 0.6);
  const count = (n) => Math.max(1, Math.round(n * Q));
  const rib = (o) => ribbons.create({ seed: r() * 100, ...o });
  const actors = [];
  const person = (kind, opts = {}) => new Body(cloud, HUMAN, { outfit: outfit(r, kind), density: opts.density ?? 84, scale: opts.scale ?? 0.92 + r() * 0.16, seed: r() * 1e5 });
  const beachX = () => (r() < 0.78 ? -230 + r() * 330 : 172 + r() * 130);

  // ---- waders jumping the shore break, and ducking under the big ones ----
  for (let i = 0; i < count(22); i++) {
    const kid = r() < 0.25;
    const body = person(r.pick(['trunks', 'bikini', 'onepiece', 'trunks']), kid ? { scale: 0.6 + r() * 0.1 } : {});
    const x0 = beachX();
    const off = 1.5 + r() * 7;
    const st = { jump: 0, duck: 0, x: x0 };
    const win = [10 + r() * 1.5, 16.8 + r() * 1.8];
    const ph = r() * 10;
    actors.push((t, dt, hour) => {
      const p = presence(hour, win[0], win[1], 0.3);
      if (p < 0.01) return;
      st.x = x0 + Math.sin((t + ph) * 0.03) * 3;
      const z = shoreZ(st.x) - off;
      const s = surfAt(st.x, z + 2.5, t);
      if (st.jump <= 0 && st.duck <= 0 && s.h > 0.45) {
        if (s.h > 0.95 && !kid && r() < 0.7) st.duck = 1.6; // dive under the big ones
        else st.jump = 0.8;
      }
      st.jump -= dt;
      st.duck -= dt;
      const hop = st.jump > 0 ? Math.sin((st.jump / 0.8) * Math.PI) * 0.45 : 0;
      const under = st.duck > 0 ? Math.sin((st.duck / 1.6) * Math.PI) * 1.4 : 0;
      const floor = sandHeight(st.x, z);
      poseGait(body, { x: st.x, y: floor + hop - under, z, heading: SEA + Math.sin(t * 0.2 + i) * 0.4, phase: 0, gait: GAITS.stand, armsUp: hop > 0.1 || under > 0.1 ? 0.8 : 0 });
      body.write(p);
    });
  }

  // ---- swimmers: some treading water, some swimming laps along the beach ----
  for (let i = 0; i < count(15); i++) {
    const body = person(r.pick(['trunks', 'onepiece', 'bikini']), { density: 50 });
    const x0 = beachX();
    const off = 14 + r() * 26;
    const ph = r() * 10;
    const laps = i % 3 === 0;
    const win = [10.5 + r(), 17 + r()];
    actors.push((t, dt, hour) => {
      const p = presence(hour, win[0], win[1], 0.3);
      if (p < 0.01) return;
      const swing = laps ? 30 : 12;
      const x = x0 + Math.sin((t + ph) * (laps ? 0.035 : 0.05)) * swing;
      const z = shoreZ(x) - off;
      const w = seaHeight(x, z, t);
      const dir = Math.cos((t + ph) * (laps ? 0.035 : 0.05)) > 0 ? Math.PI / 2 : -Math.PI / 2;
      // only the head and the reaching arms clear the surface
      posePaddle(body, { x, y: w - (laps ? 0.2 : 0.32), z, heading: dir, phase: (t + ph) * (laps ? 4.5 : 3) });
      body.write(p);
    });
  }

  // ---- bodyboarders riding the whitewater in, then wading back out ----
  for (let i = 0; i < count(9); i++) {
    const kid = r() < 0.35;
    const body = person(r.pick(['trunks', 'onepiece', 'wetsuit']), kid ? { scale: 0.64 + r() * 0.1, density: 64 } : { density: 64 });
    const board = new Shape(cloud, boardPts(r, 1.05, 0.28, 90), { color: r.pick(['#ff4f7a', '#ffd23f', '#3fb6ff', '#43e08f', '#ff8a3d']), size: 0.05, seed: r() * 1e4 });
    const ribbon = i < 5 ? rib({ width: 0.45, life: 1.2, flat: true, colorA: '#e8feff', colorB: '#4fd6ff', opacity: 0.45, strands: 3, drift: [0, 0.05, 0], billow: 0.2, spread: 0.8, specks: 18 }) : null;
    const x0 = beachX();
    const wait = 16 + r() * 14;
    const st = { mode: 'wait', x: x0, off: wait, n: 0, t: 0, heading: SHORE };
    const win = [10 + r() * 1.5, 17.2 + r()];
    actors.push((t, dt, hour) => {
      const p = presence(hour, win[0], win[1], 0.3);
      if (p < 0.01) {
        if (ribbon) ribbon.fade = 0;
        return;
      }
      st.t += dt;
      if (st.mode === 'wait') {
        st.off += (wait - st.off) * dt * 0.2;
        st.x += (x0 - st.x) * dt * 0.05;
        // a broken wave's whitewater reaching them: kick in and go
        const n0 = Math.floor(t / SURF.P);
        for (let k = 0; k < 4; k++) {
          const c = crestInfo(st.x, n0 - k, t);
          if (c.u > 0 && c.u < 1 && c.broken && c.s < st.off + 1 && c.s > st.off - 1.5 && st.t > 4) {
            st.mode = 'ride';
            st.n = n0 - k;
            st.t = 0;
            ribbon?.reset();
          }
        }
      } else if (st.mode === 'ride') {
        const c = crestInfo(st.x, st.n, t);
        st.off = c.s - 0.9;
        st.x += 0.8 * dt;
        if (st.off < 2 || st.t > 14) {
          st.mode = 'stand';
          st.t = 0;
        }
      } else if (st.mode === 'stand') {
        if (st.t > 3) {
          st.mode = 'out';
          st.t = 0;
        }
      } else if (st.mode === 'out') {
        st.off += (st.off < 7 ? 0.7 : 1.1) * dt;
        if (st.off >= wait) {
          st.mode = 'wait';
          st.t = 0;
        }
      }
      const x = st.x;
      const z = shoreZ(x) - st.off;
      const y = seaHeight(x, z, t);
      const walking = st.mode === 'stand' || (st.mode === 'out' && st.off < 7);
      st.heading = lerpAngle(st.heading, st.mode === 'ride' || st.mode === 'wait' ? SHORE : SEA, 1 - Math.exp(-dt * 3));
      const fx = Math.sin(st.heading);
      const fz = Math.cos(st.heading);
      if (walking) {
        const floor = sandHeight(x, z);
        poseGait(body, { x, y: floor, z, heading: st.heading, phase: t * 4, gait: st.mode === 'stand' ? GAITS.stand : GAITS.walk, reach: tmp.set(x - fz * 0.3, floor + 1.05, z + fx * 0.3) });
        body.write(p);
        // board carried under the arm
        X.set(0, 1, 0);
        Y.set(-fz, 0, fx);
        Z.crossVectors(X, Y);
        board.write(O.set(x - fz * 0.34, floor + 0.95, z + fx * 0.34), X, Y, Z, p);
      } else {
        X.set(fx, 0, fz);
        Y.set(0, 1, 0);
        Z.crossVectors(X, Y);
        board.write(O.set(x, y + 0.04, z), X, Y, Z, p);
        // prone on the board: kicking and paddling out, arms forward riding in
        posePaddle(body, { x: x - fx * 0.3, y: y - 0.02, z: z - fz * 0.3, heading: st.heading, phase: st.mode === 'ride' ? 1.2 : st.mode === 'out' ? t * 4 : t * 0.6 });
        body.write(p);
      }
      if (ribbon) {
        ribbon.follow(O.set(x, y + 0.02, z).addScaledVector(X.set(fx, 0, fz), -0.6));
        ribbon.fade = st.mode === 'ride' ? p : 0;
      }
    });
  }

  // ---- surfers: two peaks, one each side of the pier ----
  const surfers = [];
  for (let i = 0; i < count(14); i++) {
    const north = i % 2 === 1;
    const kind = r() < 0.8 ? 'wetsuit' : 'trunks';
    const body = person(kind, { density: 56 });
    const board = new Shape(cloud, boardPts(r, r() < 0.3 ? 2.9 : 2.0, 0.28), { color: r.pick(['#f4f7ff', '#ffe7a8', '#bfe9ff', '#ffc2d1', '#e6ffd5']), size: 0.06, seed: r() * 1e4 });
    const ribs = [
      rib({ width: 0.55, life: 1.6, flat: true, colorA: '#e8feff', colorB: '#4fd6ff', opacity: 0.5, strands: 3, drift: [0, 0.05, 0], billow: 0.2, spread: 0.8, specks: 22 }),
      rib({ width: 0.28, life: 1.2, colorA: '#ffffff', colorB: '#7fe6ff', opacity: 0.55, twist: 1.3, drift: [0, 0.6, 0.3], billow: 0.4, specks: 16 }),
    ];
    const x0 = north ? 178 + (i / 2) * 9 + r() * 5 : 55 + (i / 2) * 9 + r() * 5;
    const win = i < 5 ? [6.2, 11] : i < 10 ? [10, 17] : [15.8, 19.4];
    surfers.push({ body, board, ribs, x0, x: x0, xEnd: north ? 290 : PIER.wide.south - 4, win, state: 'wait', s: breakDist(x0, LINEUP_A) + 8, n: 0, rideT: 0, ph: r() * 10, heading: Math.PI, cool: r() * 20, duck: 0 });
  }
  actors.push((t, dt, hour) => {
    for (const sf of surfers) {
      const p = presence(hour, sf.win[0], sf.win[1], 0.4);
      if (p < 0.01) {
        sf.ribs.forEach((rb) => (rb.fade = 0));
        sf.state = 'wait';
        continue;
      }
      const lineup = breakDist(sf.x0, LINEUP_A) + 8;
      sf.cool -= dt;
      sf.duck = Math.max(0, sf.duck - dt);
      if (sf.state !== 'ride') {
        // a wave arriving at the surfer: a good one, turn and go; one already
        // broken (the big sets break outside them), duck-dive under it
        const n0 = Math.floor(t / SURF.P);
        for (let k = 0; k < 4; k++) {
          const n = n0 - k;
          const u = (t - n * SURF.P) / SURF.LIFE;
          const s = pathS(u) + waveOff(sf.x, n);
          const A = waveAmp(n);
          if (u < 0.05 || u > 1) continue;
          if (s < sf.s + 1.5 && s > sf.s - 1.5 && s < breakDist(sf.x, A)) sf.duck = Math.max(sf.duck, 1.4);
          else if (sf.state === 'wait' && sf.cool <= 0 && sf.duck <= 0 && A > 1.25 && A < 2.6 && s < sf.s + 1 && s > sf.s - 2) {
            sf.state = 'ride';
            sf.n = n;
            sf.rideT = 0;
            sf.ribs.forEach((rb) => rb.reset());
          }
        }
      }
      if (sf.state === 'wait') {
        sf.x += (sf.x0 - sf.x) * dt * 0.1;
        sf.s += (lineup - sf.s) * dt * 0.3;
      } else if (sf.state === 'ride') {
        sf.rideT += dt;
        sf.x += 6.2 * dt;
        const u = (t - sf.n * SURF.P) / SURF.LIFE;
        sf.s = pathS(u) + waveOff(sf.x, sf.n) - 1.3;
        if (sf.rideT > 8 || sf.s < 8 || sf.x > sf.xEnd) {
          sf.state = 'out';
          sf.cool = 8 + r() * 25;
        }
      } else {
        sf.s += 1.1 * dt;
        sf.x += (sf.x0 - sf.x) * dt * 0.05;
        if (sf.s >= lineup) sf.state = 'wait';
      }
      const x = sf.x;
      const z = shoreZ(x) - sf.s;
      const y = seaHeight(x, z, t);
      if (sf.state === 'ride') {
        const zA = shoreZ(x + 0.6) - (pathS((t - sf.n * SURF.P) / SURF.LIFE) + waveOff(x + 0.6, sf.n) - 1.3);
        X.set(0.6, 0, zA - z).normalize();
        const hx = seaHeight(x + 0.4, z, t) - seaHeight(x - 0.4, z, t);
        const hz = seaHeight(x, z + 0.4, t) - seaHeight(x, z - 0.4, t);
        Y.set(-hx / 0.8, 1, -hz / 0.8).normalize();
        Z.crossVectors(X, Y).normalize();
        X.crossVectors(Y, Z).normalize();
        sf.board.write(O.set(x, y + 0.05, z), X, Y, Z, p);
        poseSurf(sf.body, { x, y: y + 0.08, z, heading: Math.atan2(X.x, X.z) - Math.PI / 2, t: t + sf.ph });
        sf.body.write(p);
        sf.ribs[0].follow(O.set(x, y + 0.02, z).addScaledVector(X, -1.0));
        sf.ribs[1].follow(joint(sf.body, 9, tmp));
        sf.ribs.forEach((rb) => (rb.fade = p));
      } else {
        const toShore = sf.state === 'wait' ? Math.PI : 0;
        sf.heading = lerpAngle(sf.heading, toShore, 1 - Math.exp(-dt * 2));
        X.set(Math.sin(sf.heading), 0, Math.cos(sf.heading));
        Y.set(0, 1, 0);
        Z.crossVectors(X, Y);
        const under = Math.sin((sf.duck / 1.4) * Math.PI) * 0.9;
        sf.board.write(O.set(x, y + 0.04 - under, z), X, Y, Z, p);
        if (sf.duck > 0) posePaddle(sf.body, { x, y: y - 0.1 - under, z, heading: sf.heading, phase: 1.2 });
        else if (sf.state === 'wait') poseSit(sf.body, { x, y: y - 0.25, z, heading: sf.heading, t: t + sf.ph, lean: 0.05 });
        else posePaddle(sf.body, { x, y: y - 0.05, z, heading: sf.heading, phase: (t + sf.ph) * 4 });
        sf.body.write(p);
        sf.ribs.forEach((rb) => (rb.fade = 0));
      }
    }
  });

  // ---- an open-water swim group, bright caps in a line past the lineup ----
  {
    const swimmers = Array.from({ length: count(6) }, () => {
      const body = person(r.pick(['wetsuit', 'wetsuit', 'onepiece']), { density: 50 });
      // a bright cap: recolour the top of the head
      const cap = r.pick([[1.0, 0.45, 0.1], [1.0, 0.9, 0.1], [0.95, 0.2, 0.5], [0.2, 0.8, 1.0]]);
      body.groups.forEach((g, gi) => {
        if (g.role !== 'head') return;
        let i0 = 0;
        for (let k = 0; k < gi; k++) i0 += body.groups[k].n;
        for (let k = 0; k < g.n; k++) if (body.rt[i0 + k] > 0.1) body.col.set(cap, (i0 + k) * 3);
      });
      return { body, lag: r() * 4, lane: r() * 3 };
    });
    const ph = r() * 1000;
    actors.push((t, dt, hour) => {
      const p = presence(hour, 6.4, 8.6, 0.3) + presence(hour, 17.2, 18.8, 0.3);
      if (p < 0.01) return;
      const L = 740; // south of the pier, and back
      swimmers.forEach((s, k) => {
        const u = (((t + ph - k * 3.2 - s.lag) * 1.15) % (2 * L) + 2 * L) % (2 * L);
        const back = u > L;
        const x = back ? 90 - (u - L) : -650 + u;
        const edge = smoothstep(0, 30, Math.min(u % L, L - (u % L)));
        const z = shoreZ(x) - 150 - s.lane;
        posePaddle(s.body, { x, y: seaHeight(x, z, t) - 0.2, z, heading: back ? -Math.PI / 2 : Math.PI / 2, phase: t * 4.2 + k });
        s.body.write(Math.min(1, p) * edge);
      });
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
