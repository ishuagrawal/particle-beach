// Games and goings-on on the sand below the crowd: skimboarders timing the
// backwash, sprinting and sliding out into the shore break; spikeball circles
// with diving saves; a keep-ups circle juggling a football; kids playing tag
// through the towels; cartwheels and handstands on the hard sand; a bubble
// artist by the pier sending giant soap bubbles drifting down the beach with
// kids chasing them; and now and then a gust that cartwheels an umbrella down
// the sand with its owner running after it.
import * as THREE from 'three';
import { rng, presence, smoothstep, clamp, QUALITY, specks } from './core.js';
import { shoreZ, sandHeight } from './site.js';
import { surfAt, seaHeight, swashFront, dodger } from './surf.js';
import { FigureCloud, Body, Shape, Line, HUMAN, GAITS, outfit, poseGait, poseSurf, poseLie, poseChair, frame } from './rigs.js';
import { PLAY } from './beach.js';
import * as G from './gear.js';

const V = () => new THREE.Vector3();
const O = V(), X = V(), Y = V(), Z = V(), tmp = V(), tmp2 = V();
const UP = new THREE.Vector3(0, 1, 0);
const joint = (body, j, out = V()) => out.fromArray(body.J, j * 3);
const setJ = (body, j, x, y, z) => ((body.J[j * 3] = x), (body.J[j * 3 + 1] = y), (body.J[j * 3 + 2] = z));
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const ease = (k) => k * k * (3 - 2 * k);
const SEA = Math.PI;
// the afternoon sea breeze: onshore, and a little down the coast toward Venice
const WIND = new THREE.Vector3(-0.8, 0, 0.6).normalize();

const spherePts = (r, rad, n) => Array.from({ length: n }, () => new THREE.Vector3(r.gauss(), r.gauss(), r.gauss()).normalize().multiplyScalar(rad).toArray());
const ovalPts = (r, len, wid, n) =>
  Array.from({ length: n }, (_, i) => {
    const a = r() * Math.PI * 2;
    const k = i % 3 === 0 ? 1 : Math.sqrt(r());
    return [Math.cos(a) * len * k, 0, Math.sin(a) * wid * k];
  });

/** A roundnet: a yellow rim on five legs with the black net stretched across it. */
function netPts(r) {
  const pts = [];
  const cols = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    pts.push([Math.cos(a) * 0.46, 0.3, Math.sin(a) * 0.46]);
    cols.push([0.98, 0.8, 0.1]);
  }
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * 0.44;
    pts.push([Math.cos(a) * rr, 0.28 - 0.03 * (1 - rr / 0.44), Math.sin(a) * rr]);
    cols.push([0.08, 0.08, 0.09]);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    for (let i = 0; i < 6; i++) {
      pts.push([Math.cos(a) * (0.46 + i * 0.012), 0.3 - i * 0.055, Math.sin(a) * (0.46 + i * 0.012)]);
      cols.push([0.15, 0.15, 0.16]);
    }
  }
  return { pts, cols };
}

// ---- Giant soap bubbles: a glow layer of specks on thin, wobbling spheres ----

const MAX_BUBBLES = 8;
function bubbleLayer(scene) {
  const PER = 1800;
  const n = MAX_BUBBLES * PER;
  const pos = new Float32Array(n * 3);
  const bi = new Float32Array(n);
  const seed = new Float32Array(n);
  const size = new Float32Array(n);
  const r = rng(808);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let b = 0; b < MAX_BUBBLES; b++) {
    for (let i = 0; i < PER; i++) {
      const k = b * PER + i;
      const y = 1 - ((i + 0.5) / PER) * 2;
      const rad = Math.sqrt(1 - y * y);
      const a = i * golden + b;
      pos.set([Math.cos(a) * rad, y, Math.sin(a) * rad], k * 3);
      bi[k] = b;
      seed[k] = r();
      size[k] = r();
    }
  }
  const uA = { value: Array.from({ length: MAX_BUBBLES }, () => new THREE.Vector4()) }; // centre, radius
  const uB = { value: Array.from({ length: MAX_BUBBLES }, () => new THREE.Vector4()) }; // phase, alpha, pop (−1 until it pops), stretch
  const pts = specks({
    attributes: { position: pos, aB: bi, aSeed: seed, aSize: size },
    uniforms: { uBubA: uA, uBubB: uB },
    decl: `attribute float aB; uniform vec4 uBubA[${MAX_BUBBLES}]; uniform vec4 uBubB[${MAX_BUBBLES}];
      vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }`,
    body: /* glsl */ `
      int i = int(aB + 0.5);
      vec4 A = uBubA[i];
      vec4 Bb = uBubB[i];
      if (Bb.y < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
      vec3 d = position;
      float ph = Bb.x;
      // the film sloshes: a few slow lobes travelling round the bubble
      float wob = 1.0 + 0.06 * sin(3.0 * d.x + ph * 2.3) * sin(2.0 * d.y + ph * 1.7) + 0.04 * sin(4.0 * d.z - ph * 2.9);
      vec3 p = vec3(d.x, d.y * Bb.w, d.z) * A.w * wob;
      float a;
      if (Bb.z >= 0.0) {
        // popping: the film tears into droplets that fly out and fall
        float k = Bb.z;
        p = d * A.w * (1.0 + k * 1.2) - vec3(0.0, k * k * 0.9, 0.0);
        a = (1.0 - k) * step(0.72, hash11(aSeed * 17.0)) * 0.9;
      } else {
        vec3 V = normalize(A.xyz + p - cameraPosition);
        float rim = 1.0 - abs(dot(normalize(p), -V));
        a = 0.1 + 0.9 * pow(rim, 1.8);
      }
      pos = A.xyz + p;
      vec3 V = normalize(pos - cameraPosition);
      vec3 n = normalize(p);
      float rim = 1.0 - abs(dot(n, -V));
      // thin-film colours: bands that slide with the film's thickness
      vec3 film = hue(d.y * 0.7 + rim * 0.8 + ph * 0.05 + 0.15 * sin(d.x * 3.0 + ph));
      vec3 light = uAmb * 2.2 + uSunColor * uSunVis * 0.8 + pierGlow(pos) * 0.8;
      float glint = pow(max(dot(reflect(V, n), uSunDir), 0.0), 60.0) * uSunVis;
      col = mix(vec3(1.0), film * 1.3, 0.8) * light + uSunColor * glint * 4.0;
      alpha = a * Bb.y * (1.0 + glint * 3.0);
      size = max(0.03, distance(pos, cameraPosition) * 0.003) * (0.8 + 0.4 * aSize) * (1.0 + glint);`,
    maxPx: 6,
  });
  pts.renderOrder = 2;
  scene.add(pts);
  return { a: uA.value, b: uB.value };
}

export function createPlay(scene, ribbons) {
  const cloud = new FigureCloud(scene, 70000);
  const r = rng(7117);
  const Q = Math.max(QUALITY, 0.6);
  const actors = [];
  const add = (fn) => actors.push(fn);
  const casters = [];
  const obstacles = [];
  const probe = {}; // live state, for the #debug hook
  const rib = (o) => ribbons.create({ seed: r() * 100, ...o });
  const person = (kind, opts = {}) => new Body(cloud, HUMAN, { outfit: outfit(r, kind), density: opts.density ?? 80, scale: opts.scale ?? 0.92 + r() * 0.16, seed: r() * 1e5 });
  const kid = (kind) => person(kind ?? r.pick(['trunks', 'onepiece', 'trunks', 'casual']), { scale: 0.58 + r() * 0.14, density: 70 });
  const ground = (x, z) => sandHeight(x, z);
  const WET = ['#e8feff', '#7fdcff'];

  // ---- skimboarders ----
  for (const x0 of PLAY.skim.slice(0, Math.max(2, Math.round(PLAY.skim.length * Q)))) {
    const body = person(r.pick(['trunks', 'trunks', 'onepiece', 'wetsuit']), { density: 72 });
    const board = new Shape(cloud, ovalPts(r, 0.6, 0.27, 120), { color: r.pick(['#ff5a3d', '#1fb5ff', '#ffd23f', '#ff7ad9', '#3ce07a']), size: 0.05, seed: r() * 1e4 });
    const wake = rib({ width: 0.6, life: 1.1, flat: true, colorA: WET[0], colorB: WET[1], opacity: 0.5, strands: 3, drift: [0, 0.08, 0], billow: 0.25, spread: 1.0, specks: 20 });
    const st = { mode: 'wait', x: x0, d: 7.5, t: 2 + r() * 8, v: 0, a: 0.5, heading: SEA, phase: 0, air: 0, spin: 0, prevFront: 0 };
    (probe.skim ??= []).push(st);
    const win = [9.3 + r(), 18.4 + r() * 0.8];
    let side = r() < 0.5 ? 1 : -1;
    add((t, dt, hour) => {
      const p = presence(hour, win[0], win[1], 0.3);
      if (p < 0.01) {
        wake.fade = 0;
        return;
      }
      const front = swashFront(st.x, t);
      const draining = front < st.prevFront - 0.02;
      st.prevFront = front;
      // travel: seaward and along the beach, a different diagonal each run
      const tx = Math.sin(st.a) * side;
      const td = -Math.cos(st.a);
      let speed = 0;
      let carry = true;
      if (st.mode === 'wait') {
        st.t -= dt;
        // watch the backwash: when a thin sheet is draining off the face, go
        if (st.t < 0 && draining && front > 1.2 && front < 6.5) {
          st.mode = 'run';
          st.v = 0;
          st.a = 0.35 + r() * 0.35;
        }
      } else if (st.mode === 'run') {
        st.v = Math.min(5.6, st.v + dt * 9);
        speed = st.v;
        if (st.d < front + 0.3 || st.d < 1.2) {
          st.mode = 'slide';
          st.v *= 1.08;
          st.t = 0;
          wake.reset();
        }
      } else if (st.mode === 'slide') {
        st.t += dt;
        st.v *= Math.exp(-dt * (st.d < 0 ? 1.1 : 0.4)); // the sheet is fast, deeper water drags
        speed = st.v;
        carry = false;
        const z = shoreZ(st.x) + st.d;
        const lip = Math.max(surfAt(st.x, z - 0.6, t).h, surfAt(st.x, z - 1.6, t).h);
        if (st.t > 0.4 && st.d < 2 && lip > 0.13) {
          // the shore break stands up in front of them: hit it and pop
          st.mode = 'air';
          st.air = 0;
          st.spin = r() < 0.5 ? Math.PI : 0;
        } else if (st.v < 1.2 || st.d < -3.5) {
          st.mode = 'walk';
        }
      } else if (st.mode === 'air') {
        st.air += dt / 0.8;
        speed = st.v * 0.6;
        carry = false;
        if (st.air >= 1) {
          st.mode = r() < 0.4 ? 'fall' : 'land';
          st.t = 0;
        }
      } else if (st.mode === 'land' || st.mode === 'fall') {
        st.t += dt;
        carry = false;
        // the whitewater carries them back up the face
        st.d += dt * (st.mode === 'land' ? 2.4 : 1.2) * Math.max(0, 1 - st.t / 1.8);
        if (st.t > (st.mode === 'land' ? 1.6 : 2.4)) st.mode = 'walk';
      }
      if (st.mode === 'run' || st.mode === 'slide' || st.mode === 'air') {
        st.x += tx * speed * dt;
        st.d += td * speed * dt;
      }
      if (st.mode === 'walk') {
        // back up to their spot, board under the arm
        const gx = x0 - st.x;
        const gd = 7.5 - st.d;
        const l = Math.hypot(gx, gd);
        if (l < 0.3) {
          st.mode = 'wait';
          st.t = 1.5 + r() * 5;
          side = -side;
        } else {
          st.x += (gx / l) * 1.35 * dt;
          st.d += (gd / l) * 1.35 * dt;
          st.heading = lerpAngle(st.heading, Math.atan2(gx, gd), 1 - Math.exp(-dt * 5));
          speed = 1.35;
        }
      } else if (st.mode === 'wait') st.heading = lerpAngle(st.heading, SEA, 1 - Math.exp(-dt * 3));
      else if (st.mode === 'run') st.heading = Math.atan2(tx, td);
      const x = st.x;
      const z = shoreZ(x) + st.d;
      const floor = Math.max(ground(x, z), seaHeight(x, z, t) - (st.d < 0 ? 0 : 0.05));
      st.phase += dt * (speed > 3 ? 3.2 : 1.9) * Math.max(speed, 0.001);
      const fx = Math.sin(st.heading);
      const fz = Math.cos(st.heading);
      if (carry) {
        const g = ground(x, z);
        O.set(x - fz * 0.33, g + 0.98, z + fx * 0.33);
        poseGait(body, { x, y: g, z, heading: st.heading, phase: st.phase, gait: speed > 3 ? GAITS.run : speed > 0.2 ? GAITS.walk : GAITS.stand, reach: tmp.copy(O).setY(g + 0.92) });
        body.write(p);
        X.set(fx, 0, fz);
        Y.set(-fz, 0, fx);
        Z.crossVectors(X, Y);
        board.write(O, X, Y, Z, p);
        wake.fade = 0;
        casters.push([x, z, 0.3, 1.7]);
        return;
      }
      // on the board: sideways stance, gliding over the sheet
      const hop = st.mode === 'air' ? Math.sin(st.air * Math.PI) * 1.05 : 0;
      const by = floor + 0.03 + hop;
      const travel = Math.atan2(tx, td);
      const spin = st.mode === 'air' ? st.spin * ease(st.air) : st.mode === 'slide' ? 0 : st.spin;
      X.set(Math.sin(travel + spin), 0, Math.cos(travel + spin));
      Y.set(0, 1, 0);
      if (st.mode === 'air') Y.applyAxisAngle(X, Math.sin(st.air * Math.PI * 2) * 0.35);
      Z.crossVectors(X, Y).normalize();
      if (st.mode === 'fall') {
        // wiped out: sprawled in the foam, the board tumbling beside them
        board.write(O.set(x + 1.2, floor + 0.05, z - 0.6), X.set(Math.cos(t * 2), 0, Math.sin(t * 2)), Y.set(0, 1, 0), Z.crossVectors(X, Y), p);
        poseLie(body, { x, y: floor - 0.12, z, heading: travel + 0.4, front: true, t });
      } else {
        board.write(O.set(x, by, z), X, Y, Z, p);
        poseSurf(body, { x, y: by + 0.02, z, heading: Math.atan2(X.x, X.z) - Math.PI / 2, t: t * 1.6 });
        if (st.mode === 'air') for (const hand of [6, 9]) body.J[hand * 3 + 1] += 0.35 * Math.sin(st.air * Math.PI);
      }
      body.write(p);
      wake.follow(tmp.set(x, floor + 0.04, z).addScaledVector(X.set(tx, 0, td), -0.5));
      wake.fade = st.mode === 'slide' || st.mode === 'land' ? p : 0;
      casters.push([x, z, 0.3, 1.5]);
    });
  }

  // ---- spikeball: four around a little trampoline net, diving for saves ----
  PLAY.spike.forEach(([cx, cd], gi) => {
    const net = (() => {
      const n = netPts(r);
      return new Shape(cloud, n.pts, { color: '#ffd21f', colors: n.cols, size: 0.035, seed: r() * 1e4 });
    })();
    const ball = new Shape(cloud, spherePts(r, 0.05, 36), { color: '#ffe23a', size: 0.035, seed: r() * 1e4 });
    const trail = gi === 0 ? rib({ width: 0.1, life: 0.6, minDist: 0.04, colorA: '#fffbd0', colorB: '#ffe24a', opacity: 0.4, twist: 0.5, strands: 1, drift: [0, 0, 0], billow: 0.05, specks: 10 }) : null;
    const rot = r() * Math.PI;
    const players = [0, 1, 2, 3].map((k) => {
      const a = rot + (k * Math.PI) / 2;
      return { body: person(r.pick(['trunks', 'bikini', 'jogger', 'trunks', 'onepiece']), { density: 66 }), team: k < 2 ? 0 : 1, a, pos: V(), goal: V(), heading: 0, phase: r() * 5, dive: 0, diveDir: 0, reach: 0 };
    });
    const dodge = dodger();
    const win = gi === 0 ? [9.6, 18.2] : [11, 17.4];
    const play = { from: 0, to: -1, t0: 0, dur: 1, apex: 1, a: V(), b: V(), touches: 0, team: 0, dead: 0, far: 0 };
    const C = V();
    const home = (pl, out) => out.set(C.x + Math.cos(pl.a) * 2.1, 0, C.z + Math.sin(pl.a) * 2.1);
    for (const pl of players) {
      C.set(cx, 0, shoreZ(cx) + cd);
      home(pl, pl.pos);
      pl.goal.copy(pl.pos);
    }
    // to: −1 is the net
    const send = (t, from, to, spot) => {
      play.from = from;
      play.to = to;
      play.t0 = t;
      play.a.copy(play.b); // the ball starts where it last ended (heights above the sand)
      if (to === -1) {
        play.b.set(C.x + (r() - 0.5) * 0.4, 0.3, C.z + (r() - 0.5) * 0.4);
        play.dur = 0.28 + r() * 0.08;
        play.apex = 0.05;
      } else {
        play.b.copy(spot);
        play.dur = from === -1 ? 0.75 + r() * 0.35 : 0.8 + r() * 0.3;
        play.apex = from === -1 ? 1.1 + r() * 1.4 : 1.4 + r() * 0.8;
      }
      if (from >= 0) players[from].reach = 0.3;
    };
    const serve = (t) => {
      const s = Math.floor(r() * 4);
      joint(players[s].body, 9, play.b);
      play.b.y -= ground(play.b.x, play.b.z);
      play.team = players[s].team;
      play.touches = 0;
      play.dead = 0;
      send(t, s, -1);
    };
    serve(0);
    add((t, dt, hour) => {
      const p = presence(hour, win[0], win[1], 0.35);
      if (p < 0.01) {
        if (trail) trail.fade = 0;
        return;
      }
      const lift = dodge(cx, cd - 2.5, t, dt).lift;
      C.set(cx, 0, shoreZ(cx) + cd + lift);
      C.y = ground(C.x, C.z);
      const k = (t - play.t0) / play.dur;
      if (play.dead > 0) {
        // the ball's dead on the sand: pick it up and serve again
        play.dead -= dt;
        if (play.dead <= 0) serve(t);
      } else if (k >= 1) {
        if (play.to === -1) {
          // off the net to the other team, somewhere near one of them
          const opp = players.filter((q) => q.team !== play.team);
          const pl = r.pick(opp);
          const h = home(pl, V());
          const spot = V().copy(h).add(tmp.set((r() - 0.5) * 4.6, 0, (r() - 0.5) * 4.6));
          spot.y = 0.9;
          play.far = Math.hypot(spot.x - h.x, spot.z - h.z);
          play.team = pl.team;
          play.touches = 0;
          pl.goal.set(spot.x, 0, spot.z);
          send(t, -1, players.indexOf(pl), spot);
        } else {
          const cur = players[play.to];
          const miss = play.far > 2.7 || r() < 0.08;
          if (miss) {
            play.dead = 1.6;
            play.b.y = 0.05;
          } else {
            if (play.far > 1.5) {
              cur.dive = 0.9; // lunging for it
              cur.diveDir = Math.atan2(play.b.x - cur.pos.x, play.b.z - cur.pos.z);
            }
            play.touches++;
            const mate = players.find((q) => q !== cur && q.team === cur.team);
            if (play.touches >= 2 || r() < 0.3) send(t, play.to, -1);
            else {
              const spot = V().set(mate.pos.x + (C.x - mate.pos.x) * 0.3, 1.1, mate.pos.z + (C.z - mate.pos.z) * 0.3);
              play.far = 0;
              mate.goal.set(spot.x, 0, spot.z);
              send(t, play.to, players.indexOf(mate), spot);
            }
          }
        }
      }
      // the ball
      const kk = clamp((t - play.t0) / play.dur, 0, 1);
      if (play.dead > 0) O.set(play.b.x, ground(play.b.x, play.b.z) + 0.05, play.b.z);
      else {
        const bx = play.a.x + (play.b.x - play.a.x) * kk;
        const bz = play.a.z + (play.b.z - play.a.z) * kk;
        const by = play.a.y + (play.b.y - play.a.y) * kk + 4 * play.apex * kk * (1 - kk);
        O.set(bx, ground(bx, bz) + by, bz);
      }
      ball.write(O, X.set(1, 0, 0), Y.set(0, 1, 0), Z.set(0, 0, 1), p);
      if (trail) {
        trail.follow(O);
        trail.fade = play.dead > 0 ? 0 : p;
      }
      net.write(tmp.set(C.x, C.y, C.z), X.set(1, 0, 0), Y.set(0, 1, 0), Z.set(0, 0, 1), p);
      players.forEach((pl, i) => {
        const target = i === play.to && play.dead <= 0 ? pl.goal : home(pl, tmp2);
        const px = pl.pos.x, pz = pl.pos.z;
        pl.pos.lerp(target, 1 - Math.exp(-dt * (i === play.to ? 3.2 : 1.6)));
        const v = Math.hypot(pl.pos.x - px, pl.pos.z - pz) / Math.max(dt, 1e-3);
        pl.phase += dt * (1 + v * 3.2);
        pl.reach -= dt;
        pl.dive -= dt;
        const y = ground(pl.pos.x, pl.pos.z);
        if (pl.dive > 0) {
          // laid out on the sand, arm out at the ball, then back up
          const k2 = pl.dive / 0.9;
          const down = Math.min(1, (1 - k2) * 4) * Math.min(1, k2 * 2.5);
          poseLie(pl.body, { x: pl.pos.x - Math.sin(pl.diveDir) * 0.5, y: y + (1 - down) * 0.6, z: pl.pos.z - Math.cos(pl.diveDir) * 0.5, heading: pl.diveDir, front: true, t });
          const J = pl.body.J;
          J[9 * 3 + 1] += 0.15;
        } else {
          pl.heading = lerpAngle(pl.heading, Math.atan2(C.x - pl.pos.x, C.z - pl.pos.z), 1 - Math.exp(-dt * 6));
          const hitting = pl.reach > 0 || (i === play.to && kk > 0.75 && play.dead <= 0);
          poseGait(pl.body, { x: pl.pos.x, y, z: pl.pos.z, heading: pl.heading, phase: pl.phase, gait: v > 1 ? GAITS.run : GAITS.ready, reach: hitting ? O : null });
        }
        pl.body.write(p);
        casters.push([pl.pos.x, pl.pos.z, 0.3, pl.dive > 0 ? 0.4 : 1.6]);
      });
    });
    obstacles.push({ x: cx, z: shoreZ(cx) + cd, r: 0.5 });
  });

  // ---- keep-ups: a football juggled round a circle, lobbed from player to player ----
  {
    const [cx, cd] = PLAY.keepups;
    const players = [0, 1, 2, 3].map((k) => ({ body: person(r.pick(['trunks', 'jogger', 'trunks', 'bikini']), { density: 66 }), a: (k / 4) * Math.PI * 2 + 0.4, pos: V(), heading: 0, kick: 0, part: 'foot' }));
    const ball = new Shape(cloud, spherePts(r, 0.11, 60), { color: '#ffffff', colors: Array.from({ length: 60 }, (_, i) => (i % 5 === 0 ? [0.1, 0.1, 0.12] : [0.97, 0.97, 0.95])), size: 0.045, seed: r() * 1e4 });
    const dodge = dodger();
    const C = V();
    const play = { who: 0, next: 1, t0: 0, dur: 0.7, apex: 0.9, a: V(), b: V(), left: 2 };
    const contact = (pl, part, out) => {
      const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
      const h = part === 'head' ? 1.72 : part === 'knee' ? 0.62 : 0.28;
      const f = part === 'head' ? 0.12 : 0.32;
      return out.set(pl.pos.x + fx * f, ground(pl.pos.x, pl.pos.z) + h * pl.body.scale, pl.pos.z + fz * f);
    };
    const touch = (t) => {
      const pl = players[play.who];
      pl.kick = 0.35;
      contact(pl, pl.part, play.a);
      let to = play.who;
      if (play.left <= 0) {
        to = (play.who + 1 + Math.floor(r() * 3)) % 4;
        play.left = 1 + Math.floor(r() * 3);
      } else play.left--;
      const tp = players[to];
      tp.part = r() < 0.55 ? 'foot' : r() < 0.75 ? 'knee' : 'head';
      contact(tp, tp.part, play.b);
      play.next = to;
      play.t0 = t;
      const pass = to !== play.who;
      play.dur = pass ? 1.2 + r() * 0.4 : 0.55 + r() * 0.3;
      play.apex = pass ? 2 + r() * 1.6 : 0.6 + r() * 0.8;
    };
    add((t, dt, hour) => {
      const p = presence(hour, 10.2, 18.6, 0.35);
      if (p < 0.01) return;
      const lift = dodge(cx, cd - 2.5, t, dt).lift;
      C.set(cx, 0, shoreZ(cx) + cd + lift);
      for (const pl of players) {
        pl.pos.lerp(tmp.set(C.x + Math.cos(pl.a) * 2.6, 0, C.z + Math.sin(pl.a) * 2.6), 1 - Math.exp(-dt * 2));
        pl.heading = lerpAngle(pl.heading, Math.atan2(C.x - pl.pos.x, C.z - pl.pos.z), 1 - Math.exp(-dt * 4));
      }
      if (t - play.t0 > play.dur) {
        play.who = play.next;
        touch(t);
      }
      const k = clamp((t - play.t0) / play.dur, 0, 1);
      O.lerpVectors(play.a, play.b, k);
      O.y += 4 * play.apex * k * (1 - k);
      ball.write(O, X.set(Math.cos(t * 9), 0, Math.sin(t * 9)), Y.set(0, 1, 0), Z.set(-Math.sin(t * 9), 0, Math.cos(t * 9)), p);
      players.forEach((pl, i) => {
        pl.kick -= dt;
        const y = ground(pl.pos.x, pl.pos.z);
        const waiting = i === play.next && k > 0.55;
        poseGait(pl.body, { x: pl.pos.x, y, z: pl.pos.z, heading: pl.heading, phase: t * 3 + i, gait: GAITS.ready, armsUp: pl.kick > 0 && pl.part === 'head' ? 0.25 : 0 });
        // the touch: foot or knee up to meet the ball
        if ((pl.kick > 0 || waiting) && pl.part !== 'head') {
          const up = pl.kick > 0 ? Math.sin((pl.kick / 0.35) * Math.PI) : smoothstep(0.55, 1, k) * 0.6;
          const hip = joint(pl.body, 13, tmp2);
          const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
          const s = pl.body.scale;
          if (pl.part === 'knee') {
            setJ(pl.body, 14, hip.x + fx * 0.38 * s * up, hip.y - 0.44 * s + 0.44 * s * up, hip.z + fz * 0.38 * s * up);
            setJ(pl.body, 15, hip.x + fx * 0.12 * s, y + 0.1 + 0.3 * up * s, hip.z + fz * 0.12 * s);
          } else {
            setJ(pl.body, 14, hip.x + fx * 0.28 * s * up, hip.y - 0.44 * s + 0.12 * up, hip.z + fz * 0.28 * s * up);
            setJ(pl.body, 15, hip.x + fx * 0.45 * s * up, y + 0.05 + 0.25 * up, hip.z + fz * 0.45 * s * up);
          }
        }
        pl.body.write(p);
        casters.push([pl.pos.x, pl.pos.z, 0.3, 1.7]);
      });
    });
  }

  // ---- tag: kids chasing through the towels ----
  {
    const F = PLAY.tag;
    const kids = Array.from({ length: Math.max(3, Math.round(5 * Q)) }, (_, i) => ({
      body: kid(),
      pos: V().set(F.x0 + r() * (F.x1 - F.x0), 0, 0),
      d: F.d0 + r() * (F.d1 - F.d0),
      vx: 0,
      vd: 0,
      heading: r() * 6,
      phase: r() * 5,
      frozen: 0,
      immune: 0,
      wander: r() * 10,
      ribbon: i < 2 ? rib({ width: 0.12, life: 1.1, minDist: 0.05, colorA: '#fff0a8', colorB: '#ff8fd0', twist: 1.6, strands: 2, drift: [0, 0.3, 0], specks: 14 }) : null,
    }));
    let it = 0;
    let pause = 1.5;
    add((t, dt, hour) => {
      const p = presence(hour, 10.4, 18.2, 0.3);
      if (p < 0.01) {
        kids.forEach((k) => k.ribbon && (k.ribbon.fade = 0));
        return;
      }
      pause -= dt;
      const chaser = kids[it];
      kids.forEach((k, i) => {
        k.frozen -= dt;
        k.immune -= dt;
        let ax = 0;
        let ad = 0;
        let top = 1.4;
        if (k.frozen > 0) top = 0;
        else if (i === it) {
          if (pause <= 0) {
            // run down the nearest one who isn't just back from being it
            let best = null;
            let bd = 1e9;
            kids.forEach((o, j) => {
              if (j === i || o.immune > 0) return;
              const dd = Math.hypot(o.pos.x - k.pos.x, o.d - k.d);
              if (dd < bd) (bd = dd), (best = o);
            });
            if (best) {
              ax = best.pos.x - k.pos.x;
              ad = best.d - k.d;
              top = 4.1;
              if (bd < 0.65) {
                best.frozen = 0.9;
                k.immune = 2.5;
                it = kids.indexOf(best);
                pause = 1.2;
              }
            }
          }
        } else {
          // flee when it comes near, otherwise mill about
          const dx = k.pos.x - chaser.pos.x;
          const dd = k.d - chaser.d;
          const dist = Math.hypot(dx, dd) || 1;
          const scared = smoothstep(9, 2, dist);
          ax = (dx / dist) * scared * 3 + Math.sin(t * 0.7 + k.wander) * 0.8;
          ad = (dd / dist) * scared * 3 + Math.cos(t * 0.53 + k.wander * 1.3) * 0.8;
          top = 1.2 + 2.6 * scared;
        }
        // keep inside the patch
        ax += smoothstep(F.x0 + 3, F.x0, k.pos.x) * 4 - smoothstep(F.x1 - 3, F.x1, k.pos.x) * 4;
        ad += smoothstep(F.d0 + 2, F.d0, k.d) * 4 - smoothstep(F.d1 - 2, F.d1, k.d) * 4;
        const al = Math.hypot(ax, ad);
        const tx = al > 1e-3 ? (ax / al) * top : 0;
        const td = al > 1e-3 ? (ad / al) * top : 0;
        k.vx += (tx - k.vx) * (1 - Math.exp(-dt * 3.5));
        k.vd += (td - k.vd) * (1 - Math.exp(-dt * 3.5));
        k.pos.x += k.vx * dt;
        k.d += k.vd * dt;
        const v = Math.hypot(k.vx, k.vd);
        if (v > 0.2) k.heading = lerpAngle(k.heading, Math.atan2(k.vx, k.vd), 1 - Math.exp(-dt * 8));
        k.phase += dt * (1.6 + v * 2.6);
        const z = shoreZ(k.pos.x) + k.d;
        poseGait(k.body, { x: k.pos.x, y: ground(k.pos.x, z), z, heading: k.heading, phase: k.phase, gait: v > 2.2 ? GAITS.run : v > 0.3 ? GAITS.walk : GAITS.stand, armsUp: k.frozen > 0 ? 0.85 : i === it && v > 2.5 ? 0.35 : 0 });
        k.body.write(p);
        if (k.ribbon) {
          k.ribbon.follow(joint(k.body, 9, tmp));
          k.ribbon.fade = p * smoothstep(1.5, 3, v);
        }
        casters.push([k.pos.x, z, 0.22, 1.1]);
      });
    });
  }

  // ---- cartwheels and handstands on the hard sand ----
  {
    const { x0, x1, d } = PLAY.cartwheel;
    // a star (arms up and out, legs apart) and a straight line (arms up, legs together), about the pelvis
    const STAR = [[0, 0, 0], [0, 0.46, 0], [0, 0.58, 0], [0, 0.71, 0], [-0.19, 0.43, 0], [-0.38, 0.68, 0], [-0.52, 0.94, 0], [0.19, 0.43, 0], [0.38, 0.68, 0], [0.52, 0.94, 0], [-0.1, -0.03, 0], [-0.3, -0.45, 0], [-0.48, -0.88, 0], [0.1, -0.03, 0], [0.3, -0.45, 0], [0.48, -0.88, 0]];
    const LINE = STAR.map(([a, b, c], j) => (j >= 10 ? [Math.sign(a) * 0.1, b * 1.03, c] : j >= 4 ? [Math.sign(a) * (0.19 - Math.min(0.1, Math.abs(b) * 0.05)), b + (j === 4 || j === 7 ? 0 : 0.12), c] : [a, b, c]));
    const performers = [0, 1].map((i) => ({ body: i ? kid('onepiece') : person(r.pick(['bikini', 'trunks']), { density: 72 }), ph: i * 9 }));
    const CYC = 18;
    add((t, dt, hour) => {
      const p = presence(hour, 10.8, 18.3, 0.35);
      if (p < 0.01) return;
      for (const pf of performers) {
        const k = ((t + pf.ph) % CYC) / CYC;
        const T = k * CYC; // seconds into this performer's turn
        const s = pf.body.scale;
        const heading = SEA; // facing the water, travelling sideways along the beach
        let off = 0; // metres along the lane
        let theta = 0;
        let straight = 0;
        let mode = 'wait';
        const L = x1 - x0;
        if (T < 1.1) {
          mode = 'run';
          off = T * 2.2;
        } else if (T < 3.1) {
          // two cartwheels
          theta = ((T - 1.1) / 2) * Math.PI * 4;
          off = 2.4 + theta * 0.38;
          mode = 'wheel';
        } else if (T < 5.9) {
          // a handstand: over, hold with a wobble, and down
          const u = T - 3.1;
          theta = u < 0.6 ? ease(u / 0.6) * Math.PI : u < 2.2 ? Math.PI + Math.sin((u - 0.6) * 5) * 0.06 : Math.PI + ease((u - 2.2) / 0.6) * Math.PI;
          straight = u < 0.6 ? ease(u / 0.6) : u < 2.2 ? 1 : 1 - ease((u - 2.2) / 0.6);
          off = 2.4 + Math.PI * 4 * 0.38 + (theta / (2 * Math.PI)) * 1.2;
          mode = 'wheel';
        } else if (T < 6.8) mode = 'tada';
        else if (T < 6.8 + L / 1.3) mode = 'back';
        const end = 2.4 + Math.PI * 4 * 0.38 + 1.2;
        if (mode === 'tada') off = end;
        if (mode === 'back') off = end * (1 - (T - 6.8) / (L / 1.3));
        const x = x0 + Math.min(off, L);
        const z = shoreZ(x) + d + (pf === performers[0] ? 0 : 2.2);
        const y = ground(x, z);
        if (mode === 'wheel') {
          // turn the pose about the facing axis, rolling along the lane
          const set = frame(x, y, z, heading, s);
          const c = Math.cos(theta), sn = Math.sin(theta);
          const lift = 0.94 + 0.08 * Math.abs(Math.sin(theta * 2));
          const J = pf.body.J;
          for (let j = 0; j < 16; j++) {
            const a = STAR[j][0] + (LINE[j][0] - STAR[j][0]) * straight;
            const b = STAR[j][1] + (LINE[j][1] - STAR[j][1]) * straight;
            // facing the sea, frame()'s side axis is +x: the top rolls toward it
            set(J, j, a * c + b * sn, lift - a * sn + b * c, 0);
          }
        } else {
          const walk = mode === 'run' || mode === 'back';
          poseGait(pf.body, { x, y, z, heading: mode === 'back' ? -Math.PI / 2 : mode === 'run' ? Math.PI / 2 : heading, phase: t * (mode === 'run' ? 9 : 5.2), gait: mode === 'run' ? GAITS.run : walk ? GAITS.walk : GAITS.stand, armsUp: mode === 'tada' ? 0.9 : 0 });
        }
        pf.body.write(p);
        casters.push([x, z, 0.3, mode === 'wheel' ? 1.2 : 1.6]);
      }
    });
  }

  // ---- the bubble artist: giant soap bubbles drifting down the beach ----
  {
    const [bx, bd] = PLAY.bubbles;
    const B = bubbleLayer(scene);
    const artist = person('casual', { density: 76 });
    const sticks = [0, 1].map(() => new Line(cloud, 30, { color: '#8a6a44', size: 0.03 }));
    const ropes = [0, 1].map(() => new Line(cloud, 60, { color: '#f4efe6', size: 0.02 }));
    const bucket = new Shape(
      cloud,
      Array.from({ length: 120 }, (_, i) => {
        const a = r() * Math.PI * 2;
        const top = i % 4 === 0;
        return [Math.cos(a) * 0.2, top ? 0.36 : r() * 0.36, Math.sin(a) * 0.2];
      }),
      { color: '#2f8cff', size: 0.04, seed: 55 }
    );
    const chasers = [0, 1].map(() => ({ body: kid(), pos: V(), heading: 0, phase: r() * 5, jump: 0, target: -1, home: r() * 6 }));
    const bubbles = Array.from({ length: MAX_BUBBLES }, () => ({ live: false, c: V(), v: V(), R: 0, age: 0, life: 0, pop: -1, ph: r() * 10, stretch: 1 }));
    const P0 = V().set(bx, 0, shoreZ(bx) + bd);
    P0.y = ground(P0.x, P0.z);
    const CYC = 6.5;
    let forming = null;
    let lastCyc = -1;
    const facing = Math.atan2(WIND.x, WIND.z); // the artist faces downwind, the bubble streams out ahead
    const tipL = V(), tipR = V(), mid = V();
    add((t, dt, hour) => {
      const p = presence(hour, 10.5, 18.8, 0.4);
      const cyc = Math.floor(t / CYC);
      const k = (t % CYC) / CYC;
      // the wand: dip (0–0.15), raise (0.15–0.28), open and sweep while the bubble grows (0.28–0.7), close and let go
      const dip = k < 0.15 ? Math.sin((k / 0.15) * Math.PI) : 0;
      const raise = smoothstep(0.12, 0.28, k) * (1 - smoothstep(0.85, 1, k));
      const open = smoothstep(0.28, 0.36, k) * (1 - smoothstep(0.66, 0.72, k));
      const fx = Math.sin(facing), fz = Math.cos(facing);
      const sx = -fz, sz = fx;
      const sway = Math.sin(t * 1.3) * 0.3 * open;
      poseGait(artist, { x: P0.x, y: P0.y, z: P0.z, heading: facing + sway * 0.3, phase: 0, gait: GAITS.stand });
      const s = artist.scale;
      const hy = P0.y + (0.95 + 0.45 * raise - 0.35 * dip) * s;
      for (const [side, hand, elbow, tip] of [[-1, 6, 5, tipL], [1, 9, 8, tipR]]) {
        const spread = 0.18 + 0.28 * open;
        const hx = P0.x + fx * 0.38 * s + sx * side * spread;
        const hz = P0.z + fz * 0.38 * s + sz * side * spread;
        setJ(artist, elbow, P0.x + fx * 0.2 * s + sx * side * (0.24 + spread * 0.3), P0.y + (1.15 + 0.2 * raise) * s, P0.z + fz * 0.2 * s + sz * side * (0.24 + spread * 0.3));
        setJ(artist, hand, hx, hy, hz);
        const out = 0.55 + 0.9 * open;
        tip.set(hx + fx * (0.55 + 0.45 * raise) + sx * side * out * 0.55, hy + 0.85 * raise - 0.55 * dip + 0.25, hz + fz * (0.55 + 0.45 * raise) + sz * side * out * 0.55);
        sticks[side < 0 ? 0 : 1].write(joint(artist, hand, tmp), tmp2.lerpVectors(joint(artist, hand, tmp), tip, 0.5), tip, p);
      }
      artist.write(p);
      bucket.write(tmp.set(P0.x - sx * 0.8 + fx * 0.3, P0.y, P0.z - sz * 0.8 + fz * 0.3), X.set(1, 0, 0), Y.set(0, 1, 0), Z.set(0, 0, 1), p);
      casters.push([P0.x, P0.z, 0.3, 1.7]);
      // the loop of rope between the tips: taut on top, sagging below as it opens
      mid.lerpVectors(tipL, tipR, 0.5);
      const gap = tipL.distanceTo(tipR);
      const sag = 0.1 + open * (0.3 + gap * 0.3);
      ropes[0].write(tipL, tmp.copy(mid).setY(mid.y + 0.02), tipR, p);
      ropes[1].write(tipL, tmp.copy(mid).setY(mid.y - sag * 2).addScaledVector(WIND, open * 0.9), tipR, p);
      // a new bubble grows out of the open loop, and is let go when the wand closes
      if (p > 0.2 && cyc !== lastCyc && k > 0.3 && k < 0.4) {
        lastCyc = cyc;
        forming = bubbles.find((b) => !b.live) || null;
        if (forming) Object.assign(forming, { live: true, age: 0, life: 9 + r() * 9, pop: -1, R: 0.1, stretch: 1.6, ph: r() * 10, chase: r() < 0.45 });
      }
      if (forming) {
        const grow = smoothstep(0.3, 0.68, k);
        forming.R = 0.12 + grow * (0.3 + gap * 0.15 + (forming.ph % 1) * 0.2);
        forming.c.copy(mid).setY(mid.y - sag * 0.5).addScaledVector(WIND, forming.R * 0.9);
        forming.c.y = Math.max(forming.c.y, ground(forming.c.x, forming.c.z) + forming.R + 0.35);
        forming.stretch = 1.5 - grow * 0.4;
        forming.v.copy(WIND).multiplyScalar(0.9);
        if (k > 0.7) forming = null; // let go
      }
      bubbles.forEach((b, i) => {
        if (!b.live) {
          B.b[i].y = 0;
          return;
        }
        if (b.pop >= 0) {
          b.pop += dt / 0.35;
          if (b.pop >= 1) b.live = false;
        } else if (b !== forming) {
          b.age += dt;
          // carried on the breeze, gusting, slowly settling and wobbling back to round
          const gust = 1 + 0.5 * Math.sin(t * 0.6 + b.ph) + 0.3 * Math.sin(t * 1.7 + b.ph * 2);
          b.v.lerp(tmp.copy(WIND).multiplyScalar(1.3 * gust).add(tmp2.set(0, -0.08 + 0.18 * Math.sin(t * 0.9 + b.ph), 0)), 1 - Math.exp(-dt * 0.8));
          b.c.addScaledVector(b.v, dt);
          b.stretch += (1 - b.stretch) * (1 - Math.exp(-dt * 1.5));
          const g = ground(b.c.x, b.c.z);
          if (b.c.y - b.R < g + 0.05 || b.age > b.life) b.pop = 0;
        }
        B.a[i].set(b.c.x, b.c.y, b.c.z, b.R);
        B.b[i].set(t * 1.2 + b.ph, p, b.pop, b.stretch);
      });
      // kids chasing the bubbles, jumping to pop them
      chasers.forEach((c, ci) => {
        if (c.target < 0 || !bubbles[c.target].live || bubbles[c.target].pop >= 0 || bubbles[c.target] === forming) {
          c.target = -1;
          let best = 1e9;
          bubbles.forEach((b, i) => {
            // let each one float a while before they go after it
            if (!b.live || !b.chase || b.pop >= 0 || b === forming || b.age < 3 + ci * 2 || chasers.some((o) => o !== c && o.target === i)) return;
            const dd = Math.hypot(b.c.x - c.pos.x, b.c.z - c.pos.z);
            if (dd < best && dd < 22) (best = dd), (c.target = i);
          });
        }
        if (c.pos.lengthSq() === 0) c.pos.set(P0.x - 2 - ci * 1.5, 0, P0.z + 1.5);
        const b = c.target >= 0 ? bubbles[c.target] : null;
        const goal = b ? tmp.set(b.c.x, 0, b.c.z) : tmp.set(P0.x - 2.5 + Math.sin(t * 0.3 + c.home) * 1.5, 0, P0.z + 2 + ci);
        const dx = goal.x - c.pos.x, dz = goal.z - c.pos.z;
        const dist = Math.hypot(dx, dz);
        const speed = b ? Math.min(2.8, dist * 2) : Math.min(1.2, dist);
        if (dist > 0.05) {
          c.pos.x += (dx / dist) * speed * dt;
          c.pos.z += (dz / dist) * speed * dt;
          c.heading = lerpAngle(c.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 7));
        }
        c.phase += dt * (1.5 + speed * 2.8);
        c.jump -= dt;
        const y = ground(c.pos.x, c.pos.z);
        if (b && dist < 0.9 && c.jump <= -0.8 && b.c.y - b.R < y + 2.4) {
          // a jump and a swipe: sometimes they get it, sometimes it wobbles off
          c.jump = 0.55;
          if (r() < 0.45) b.pop = 0;
          else b.v.y += 0.6;
        }
        const hop = c.jump > 0 ? Math.sin((c.jump / 0.55) * Math.PI) * 0.45 : 0;
        poseGait(c.body, { x: c.pos.x, y: y + hop, z: c.pos.z, heading: c.heading, phase: c.phase, gait: speed > 2 ? GAITS.run : speed > 0.3 ? GAITS.walk : GAITS.stand, armsUp: c.jump > 0 ? 0.95 : 0 });
        c.body.write(p);
      });
    });
    obstacles.push({ x: P0.x, z: P0.z, r: 0.5 });
  }

  // ---- a gust takes an umbrella, and its owner gives chase ----
  {
    const [ux, ud] = PLAY.umbrella;
    const colors = r.pick(G.STRIPES);
    const upts = [];
    const ucols = [];
    G.umbrella((pp, n, c) => (upts.push(pp), ucols.push(c)), r, 0, 0, 0, { tilt: 0, colors, radius: 1.05 });
    const umb = new Shape(cloud, upts, { color: '#ffffff', colors: ucols, size: 0.06, seed: 77 });
    const cpts = [];
    const ccols = [];
    const P0 = V().set(ux, 0, shoreZ(ux) + ud);
    P0.y = ground(P0.x, P0.z);
    const seat = V().set(P0.x + 0.9, 0, P0.z - 0.5);
    seat.y = ground(seat.x, seat.z);
    G.chair((pp, n, c) => (cpts.push(pp), ccols.push(c)), r, 0, 0, 0, 0, colors[0]);
    const chairShape = new Shape(cloud, cpts, { color: '#ffffff', colors: ccols, size: 0.05, seed: 78 });
    const owner = person(r.pick(['casual', 'onepiece', 'trunks']), { density: 80 });
    const towelPts = [];
    const towelCols = [];
    const tc = r.pick(G.TOWELS);
    G.towel((pp, n, c) => (towelPts.push(pp), towelCols.push(c)), r, 0, 0, 0, 0, tc);
    const towel = new Shape(cloud, towelPts, { color: '#ffffff', colors: towelCols, size: 0.055, seed: 79 });
    const L = 17;
    const st = { mode: 'planted', t: 25 + r() * 20, fly: 0, pos: V().copy(seat), heading: SEA, phase: 0, held: 0, spin: 0 };
    probe.umbrella = st;
    const C = V(); // the umbrella's middle
    const axis = V().crossVectors(UP, WIND).normalize();
    const tilt0 = 0.12;
    add((t, dt, hour) => {
      const p = presence(hour, 9.8, 18.4, 0.35);
      if (p < 0.01) return;
      st.t -= dt;
      const lean = tmp.set(0, 1, 0).applyAxisAngle(axis, -tilt0);
      if (st.mode === 'planted') {
        C.copy(P0);
        Y.copy(lean);
        if (st.t < 0) {
          st.mode = 'fly';
          st.fly = 0;
          st.t = 0.6; // a beat before the owner reacts
        }
      }
      if (st.mode === 'fly' || st.mode === 'chase') {
        st.fly = Math.min(1, st.fly + dt / 6);
        const k = 1 - (1 - st.fly) * (1 - st.fly);
        const s = L * k;
        // bowling along on its canopy, tumbling about a line across the wind
        const roll = tilt0 + s / 0.95 + smoothstep(0, 0.15, st.fly) * 0.6;
        Y.set(0, 1, 0).applyAxisAngle(axis, -roll);
        C.copy(P0).addScaledVector(WIND, s);
        C.y = ground(C.x, C.z) + 1.05 + 0.35 * Math.abs(Math.sin(roll)) + Math.sin(Math.min(1, st.fly * 5) * Math.PI) * 0.9;
        if (st.mode === 'fly' && st.t < 0) st.mode = 'chase';
      }
      if (st.mode === 'carry' || st.mode === 'replant') {
        // held up by the pole, canopy leaning into the wind
        const hand = joint(owner, 9, tmp2);
        Y.set(0, 1, 0).applyAxisAngle(axis, st.mode === 'replant' ? -tilt0 * smoothstep(0, 1, st.held) : 0.5);
        C.copy(hand).addScaledVector(Y, 0.3);
        if (st.mode === 'replant') C.lerp(tmp.copy(P0).addScaledVector(Y, 1.4), smoothstep(0, 1, st.held));
      }
      // the owner
      let speed = 0;
      if (st.mode === 'planted' || st.mode === 'fly') {
        poseChair(owner, { x: seat.x, y: seat.y, z: seat.z, heading: SEA, t });
        st.pos.copy(seat);
      } else if (st.mode === 'chase') {
        const dx = C.x - st.pos.x, dz = C.z - st.pos.z;
        const dist = Math.hypot(dx, dz);
        speed = Math.min(4.8, dist * 3);
        st.pos.x += (dx / (dist || 1)) * speed * dt;
        st.pos.z += (dz / (dist || 1)) * speed * dt;
        st.heading = lerpAngle(st.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
        if (dist < 1.1 && st.fly > 0.45) {
          st.mode = 'carry';
          st.held = 0;
        }
      } else if (st.mode === 'carry') {
        const dx = seat.x - 0.4 - st.pos.x, dz = seat.z - st.pos.z;
        const dist = Math.hypot(dx, dz);
        speed = 1.3;
        if (dist < 0.3) {
          st.mode = 'replant';
          st.held = 0;
        } else {
          st.pos.x += (dx / dist) * speed * dt;
          st.pos.z += (dz / dist) * speed * dt;
          st.heading = lerpAngle(st.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
        }
      } else if (st.mode === 'replant') {
        st.held += dt / 1.4;
        st.heading = lerpAngle(st.heading, Math.atan2(P0.x - st.pos.x, P0.z - st.pos.z), 1 - Math.exp(-dt * 6));
        if (st.held >= 1) {
          st.mode = 'planted';
          st.t = 70 + r() * 60;
        }
      }
      if (st.mode === 'chase' || st.mode === 'carry' || st.mode === 'replant') {
        st.phase += dt * (1.5 + speed * 2.9);
        const y = ground(st.pos.x, st.pos.z);
        const reach = st.mode === 'chase' ? tmp.copy(C).setY(Math.min(C.y, y + 1.6)) : tmp.set(st.pos.x + Math.sin(st.heading) * 0.3, y + 1.25, st.pos.z + Math.cos(st.heading) * 0.3);
        poseGait(owner, { x: st.pos.x, y, z: st.pos.z, heading: st.heading, phase: st.phase, gait: speed > 2 ? GAITS.run : speed > 0.2 ? GAITS.walk : GAITS.stand, reach });
      }
      owner.write(p);
      casters.push([st.pos.x, st.pos.z, 0.3, st.mode === 'planted' || st.mode === 'fly' ? 1 : 1.7]);
      // the umbrella itself: its local pole runs up +y from the foot
      const foot = O.copy(C).addScaledVector(Y, st.mode === 'planted' ? 0 : -1.4);
      if (st.mode === 'planted') foot.copy(P0);
      X.crossVectors(Y, axis).normalize();
      Z.crossVectors(X, Y).normalize();
      umb.write(foot, X, Y, Z, p, tmp2.copy(Y).setY(Math.abs(Y.y) + 0.6).normalize()); // a canopy is lit from whichever side faces up
      if (st.mode === 'planted') casters.push([P0.x, P0.z, 1.05, -1.8]);
      chairShape.write(tmp.copy(seat), X.set(-1, 0, 0), Y.set(0, 1, 0), Z.set(0, 0, -1), p);
      towel.write(tmp.set(P0.x - 1.3, P0.y, P0.z - 0.4), X.set(1, 0, 0), Y.set(0, 1, 0), Z.set(0, 0, 1), p);
    });
    obstacles.push({ x: seat.x, z: seat.z, r: 0.5 });
  }

  return {
    obstacles,
    probe,
    update(t, dt, ctx) {
      cloud.begin(ctx);
      casters.length = 0;
      for (const a of actors) a(t, dt, ctx.hour);
      cloud.commit();
    },
    casters(out) {
      for (const c of casters) out.push(c);
    },
  };
}
