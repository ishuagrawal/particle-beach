// Life on the pier: people strolling its length and milling round Pacific
// Park, leaning on the rails and taking photos, anglers at the far end
// casting out and now and then reeling one in, and a busker by the stairs
// with a ring of people watching.
import * as THREE from 'three';
import { rng, presence, smoothstep, QUALITY } from './core.js';
import { PIER } from './site.js';
import { seaHeight } from './surf.js';
import { FigureCloud, Body, Shape, Line, HUMAN, GAITS, outfit, poseGait } from './rigs.js';

const V = () => new THREE.Vector3();
const tmp = V();
const O = V(), X = V(), Y = V(), Z = V();
const joint = (body, j, out = V()) => out.fromArray(body.J, j * 3);
const pingpong = (u) => 1 - Math.abs(1 - ((u % 2) + 2) % 2);
const DECK = PIER.deck;
const SOUTH = PIER.x - PIER.half; // rail on the south side
const NORTH = PIER.x + PIER.half;

// Stretches of deck clear of buildings: [z0, z1, x0, x1]
const STRETCHES = [
  [70, 148, 141.4, 150.8], // by the Hippodrome
  [-50, 64, 141.4, 150.2], // past the arcades
  [-158, -52, 141.4, 158.6],
  [-224, -178, 146.8, 158.6], // round the harbour office
  [-298, -238, 141.4, 158.6],
];

export function createPierLife(scene) {
  const cloud = new FigureCloud(scene, 110000);
  const r = rng(4242);
  const Q = Math.max(QUALITY, 0.6);
  const count = (n) => Math.max(1, Math.round(n * Q));
  const actors = [];
  const person = (kind, opts = {}) => new Body(cloud, HUMAN, { outfit: outfit(r, kind), density: opts.density ?? 80, scale: opts.scale ?? 0.92 + r() * 0.16, seed: r() * 1e5 });
  const busy = (i) => (i % 6 === 0 ? [18.3 + r() * 0.5, 23.6] : i % 6 === 1 ? [7.5 + r(), 12 + r() * 2] : [9.5 + r() * 2.5, 20.5 + r() * 2.5]);

  // ---- strollers, alone and in twos and threes, some with kids ----
  const lengths = STRETCHES.map(([z0, z1]) => z1 - z0);
  const total = lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < count(46); i++) {
    // pick a stretch in proportion to its length
    let pick = r() * total;
    let k = 0;
    while (pick > lengths[k]) pick -= lengths[k++];
    const [z0, z1, x0, x1] = STRETCHES[k];
    const n = r() < 0.4 ? 1 : r() < 0.75 ? 2 : 3;
    const lane = x0 + r() * (x1 - x0 - n * 0.7);
    const L = z1 - z0;
    const speed = 0.9 + r() * 0.5;
    const phase = r() * 500;
    const win = busy(i);
    const members = Array.from({ length: n }, (_, m) => {
      const kid = n === 3 && m === 2 && r() < 0.7;
      return { body: person(kid ? r.pick(['trunks', 'onepiece']) : r.pick(['casual', 'casual', 'jogger', 'onepiece', 'bikini']), kid ? { scale: 0.6 + r() * 0.1 } : {}), off: m * 0.7, kid };
    });
    const pause = r() < 0.3; // some stop now and then to look out
    actors.push((t, dt, hour) => {
      const p = presence(hour, win[0], win[1], 0.4);
      if (p < 0.01) return;
      const tt = t + phase;
      const stopped = pause && Math.sin(tt * 0.05) > 0.8;
      const u = ((stopped ? Math.floor(tt / 8) * 8 : tt) * speed) / L;
      const z = z0 + pingpong(u) * L;
      const dir = Math.floor(((u % 2) + 2) % 2) === 0 ? 1 : -1;
      for (const m of members) {
        const heading = stopped ? (lane < PIER.x ? -Math.PI / 2 : Math.PI / 2) : dir > 0 ? 0 : Math.PI;
        poseGait(m.body, { x: lane + m.off, y: DECK, z, heading, phase: tt * (m.kid ? 6.6 : 5.2) * speed, gait: stopped ? GAITS.stand : GAITS.walk });
        m.body.write(p);
      }
    });
  }

  // ---- people milling round Pacific Park's rides ----
  for (let i = 0; i < count(18); i++) {
    const body = person(r.pick(['casual', 'casual', 'jogger', 'onepiece', 'trunks']), r() < 0.25 ? { scale: 0.6 + r() * 0.1 } : {});
    const spots = [[114.5, 139, 45.5, 51.5], [123, 139, -59, -55], [132, 139.5, 38.5, 51.5], [114, 124, 20, 30]];
    const [ax, bx, az, bz] = r.pick(spots);
    const hx = ax + r() * (bx - ax);
    const hz = az + r() * (bz - az);
    const ph = r() * 100;
    const win = [11 + r(), 22 + r()];
    actors.push((t, dt, hour) => {
      const p = presence(hour, win[0], win[1], 0.4);
      if (p < 0.01) return;
      // drift between two nearby points, pausing to watch the rides
      const s = 0.5 + 0.5 * Math.sin((t + ph) * 0.06);
      const x = hx + (s - 0.5) * Math.min(6, bx - ax) * 0.8;
      const z = hz + Math.sin((t + ph) * 0.045) * Math.min(4, (bz - az) * 0.4);
      const moving = Math.abs(Math.cos((t + ph) * 0.06)) > 0.35;
      const heading = moving ? (Math.cos((t + ph) * 0.06) > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.sin(ph) * 3;
      poseGait(body, { x, y: DECK, z, heading, phase: (t + ph) * 3.5, gait: moving ? GAITS.walk : GAITS.stand, reach: !moving && Math.sin(t * 0.3 + ph) > 0.7 ? tmp.set(x + Math.sin(heading) * 0.6, DECK + 1.6, z + Math.cos(heading) * 0.6) : null });
      body.write(p);
    });
  }

  // ---- leaning on the rails, looking out, taking photos ----
  for (let i = 0; i < count(26); i++) {
    const body = person(r.pick(['casual', 'casual', 'onepiece', 'jogger']));
    const south = r() < 0.5;
    let z;
    do z = -300 + r() * 440;
    while ((z > -50 && z < 64 && !south) || (z > 100 && z < 138 && !south) || (z > 96 && z < 101 && south) || (z > -176 && z < -160 && !south) || (z > -236 && z < -226 && south) || (z > -60 && z < 70 && south));
    const x = south ? SOUTH + 0.55 : NORTH - 0.55;
    const out = south ? -Math.PI / 2 : Math.PI / 2;
    const win = busy(i);
    const ph = r() * 10;
    actors.push((t, dt, hour) => {
      const p = presence(hour, win[0], win[1], 0.4);
      if (p < 0.01) return;
      const side = south ? -1 : 1;
      const photo = Math.sin(t * 0.11 + ph) > 0.75;
      poseGait(body, { x, y: DECK, z, heading: out + Math.sin(t * 0.07 + ph) * 0.3, phase: 0, gait: GAITS.stand, reach: photo ? tmp.set(x + side * 0.55, DECK + 1.6, z) : tmp.set(x + side * 0.42, DECK + 1.1, z + 0.15) });
      body.write(p);
    });
  }

  // ---- anglers at the far end: waiting, casting, and now and then a catch ----
  for (let i = 0; i < count(12); i++) {
    const body = person(r.pick(['casual', 'casual', 'jogger']), { density: 56 });
    const rod = new Line(cloud, 36, { color: '#303030', size: 0.035, seed: 50 + i });
    const line = new Line(cloud, 40, { color: '#e8e8e0', size: 0.022, seed: 90 + i });
    const fish = new Shape(cloud, Array.from({ length: 30 }, () => [r.range(-0.18, 0.18), r.range(-0.05, 0.05) * (1 - Math.abs(r())), r.range(-0.02, 0.02)]), { color: '#c8d4dc', size: 0.035, seed: r() * 1e4 });
    const end = i < 3;
    const side = end ? 0 : i % 2 ? 1 : -1;
    const x = end ? PIER.x - 6 + i * 6 : PIER.x + side * (PIER.half - 0.8);
    const z = end ? PIER.end + 0.8 : PIER.end + 4 + (i - 3) * 6 + r() * 2;
    const outX = end ? 0 : side;
    const outZ = end ? -1 : 0;
    const cyc = 50 + r() * 50;
    const ph = r() * cyc;
    const catches = r() < 0.5;
    actors.push((t, dt, hour) => {
      const p = presence(hour, 5.2, 22.8, 0.4);
      if (p < 0.01) return;
      const k = ((t + ph) % cyc) / cyc;
      const cycle = Math.floor((t + ph) / cyc);
      const catching = catches && cycle % 3 === 1;
      const heading = Math.atan2(outX, outZ);
      // the cast: rod back over the shoulder, then whipped out
      const castT = (k * cyc) < 2.2 ? (k * cyc) / 2.2 : 1;
      const back = castT < 0.55 ? smoothstep(0, 0.55, castT) : 1 - smoothstep(0.55, 0.75, castT);
      // reeling one in over the last stretch of the cycle
      const reel = catching ? smoothstep(0.55, 0.95, k) : 0;
      const hand = tmp.set(x + outX * 0.5, DECK + 1.25, z + outZ * 0.5);
      poseGait(body, { x, y: DECK, z, heading, phase: 0, gait: GAITS.stand, reach: hand });
      body.write(p);
      const h = joint(body, 9, O);
      const lift = 1.6 + back * 1.4 + reel * 0.6;
      const reachOut = 2.2 - back * 2.6 - reel * 0.8;
      const tip = V().set(h.x + outX * reachOut, h.y + lift, h.z + outZ * reachOut);
      const mid = V().lerpVectors(h, tip, 0.5).addScaledVector(Y.set(0, 1, 0), catching && reel > 0 ? -0.35 * (1 - reel) : 0.12);
      rod.write(h, mid, tip, p);
      const wx = tip.x + outX * 6;
      const wz = tip.z + outZ * 6;
      const water = seaHeight(wx, wz, t);
      if (reel > 0.02) {
        // the fish comes up out of the water on the line
        const fy = water + (tip.y - 0.6 - water) * reel;
        const fp = V().set(tip.x + outX * 6 * (1 - reel), fy, tip.z + outZ * 6 * (1 - reel));
        line.write(tip, V().lerpVectors(tip, fp, 0.5), fp, p * 0.7);
        const wiggle = Math.sin(t * 16) * 0.5;
        X.set(Math.cos(wiggle) * -outZ + outX * Math.sin(wiggle), 0, Math.cos(wiggle) * outX + outZ * Math.sin(wiggle)).normalize();
        Y.set(0, 1, 0);
        Z.crossVectors(X, Y);
        fish.write(fp, Y, X, Z, p);
      } else {
        const slack = V().set(tip.x + outX * 3, DECK - 1 - back * 2, tip.z + outZ * 3);
        line.write(tip, slack, V().set(wx, water, wz), p * 0.7);
      }
    });
  }

  // ---- a busker by the stairs, and a ring of people watching ----
  {
    const bx = PIER.x - 3;
    const bz = 84;
    const busker = person('casual', { density: 70 });
    const amp = new Shape(cloud, Array.from({ length: 80 }, () => [r.range(-0.25, 0.25), r.range(0, 0.5), r.range(-0.18, 0.18)]), { color: '#222226', size: 0.05, seed: 7 });
    actors.push((t, dt, hour) => {
      const p = presence(hour, 12.5, 21.8, 0.4);
      if (p < 0.01) return;
      // dancing: a bounce, a turn, arms up on the beat
      const beat = t * 2.1;
      const turn = Math.sin(t * 0.4) * 1.2;
      poseGait(busker, { x: bx + Math.sin(t * 0.7) * 0.4, y: DECK + Math.abs(Math.sin(beat * Math.PI)) * 0.12, z: bz, heading: turn, phase: beat * Math.PI, gait: GAITS.run, armsUp: Math.sin(t * 0.9) > 0.3 ? 0.75 + 0.2 * Math.sin(beat * Math.PI * 2) : 0 });
      busker.write(p);
      amp.write(O.set(bx + 1.1, DECK, bz - 0.8), X.set(1, 0, 0), Y.set(0, 1, 0), Z.set(0, 0, 1), p);
    });
    for (let i = 0; i < count(11); i++) {
      const body = person(r.pick(['casual', 'casual', 'onepiece', 'jogger', 'bikini']), r() < 0.2 ? { scale: 0.62 } : {});
      const a = -1.2 + (i / 10) * 2.4 + (r() - 0.5) * 0.2; // a half ring on the deck side
      const rad = 3.2 + r() * 1.3;
      const x = Math.min(NORTH - 0.6, bx + Math.cos(a) * rad);
      const z = bz + Math.sin(a) * rad;
      const ph = r() * 10;
      actors.push((t, dt, hour) => {
        const p = presence(hour, 12.6 + i * 0.05, 21.7, 0.4);
        if (p < 0.01) return;
        const clap = Math.sin(t * 0.23 + ph) > 0.82;
        const film = !clap && Math.sin(t * 0.17 + ph * 2) > 0.8;
        const heading = Math.atan2(bx - x, bz - z);
        poseGait(body, { x, y: DECK, z, heading: heading + Math.sin(t * 0.3 + ph) * 0.1, phase: 0, gait: GAITS.stand, armsUp: clap ? 0.42 + 0.08 * Math.sin(t * 15 + ph) : 0, reach: film ? tmp.set(x + Math.sin(heading) * 0.5, DECK + 1.55, z + Math.cos(heading) * 0.5) : null });
        body.write(p);
      });
    }
  }

  return {
    update(t, dt, ctx) {
      cloud.begin(ctx);
      for (const a of actors) a(t, dt, ctx.hour);
      cloud.commit();
    },
  };
}
