// Walking the beach in first person. Drag to look around and scroll or pinch
// to zoom the lens, as before; WASD or the arrow keys walk (Shift runs), a
// click or tap on the ground walks you there, and the "Go to" row glides you
// to a named spot. You can wade into the surf and swim out past the break,
// and take the stairs by the Hippodrome up onto the pier.
import * as THREE from 'three';
import { PIER, VIEW, STAIRS, DECK_BLOCKS, PLACES, sandHeight, shoreZ, onDeck, PILE_XS_NARROW, PILE_XS_WIDE, pileRowZ } from './site.js';
import { seaHeight } from './surf.js';

const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const EYE = 1.65;
const BODY = 0.3; // your radius when brushing past things
const WALK = 1.4;
const RUN = 4.5;
const SWIM = 0.9;
const X_MIN = -420;
const X_MAX = 330;
const SWIM_LIMIT = -190; // metres offshore you may swim out to
const DECK_IN = 0.45; // how close to the rail you can stand
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const backOf = (x) => (x > 165 ? 132 : 145); // the back of the beach: Ocean Front Walk, the lots north of the pier
const STAIR_X = (STAIRS.x0 + STAIRS.x1) / 2;
const STAIR_BASE = sandHeight(STAIR_X, STAIRS.z0);

export class WalkControls {
  constructor(camera, dom, opts) {
    this.camera = camera;
    this.dom = dom;
    this.o = { pitchMin: -60, pitchMax: 60, fovMin: 16, fovMax: 64, ...opts };
    this.yaw = opts.yaw;
    this.pitch = opts.pitch;
    this.fov = opts.fov;
    this.home = opts.yaw;
    this.vy = 0;
    this.vp = 0;
    this.pointers = new Map();
    this.pinch = 0;
    this.idleSince = performance.now();
    this.driftDir = 1;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onInteract = () => {};
    this.onPlace = () => {};

    this.x = VIEW.x;
    this.z = VIEW.z;
    this.level = 'ground'; // ground, stairs or deck
    this.vx = 0;
    this.vz = 0;
    this.keys = new Set();
    this.path = [];
    this.stuck = 0;
    this.glide = null;
    this.eyeY = sandHeight(this.x, this.z) + EYE;
    this.eyeV = 0;
    this.step = 0;
    this.swimming = false;
    this.place = 'home';
    this.circles = []; // things on the sand: { x, z, r }
    this.boxes = []; // { x0, x1, z0, z1 }
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.t = 0;

    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 });
      this.vy = this.vp = 0;
      this.touch();
    });
    dom.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1) {
        const k = (this.fov / window.innerHeight) * 1.1;
        const dy = -(e.clientX - p.x) * k;
        const dp = (e.clientY - p.y) * k;
        this.turn(dy, dp);
        this.vy = dy * 60;
        this.vp = dp * 60;
      }
      p.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoom(this.pinch / d);
        this.pinch = d;
        a.moved = b.moved = 99;
      }
      this.touch();
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      const single = this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      this.pinch = 0;
      this.touch();
      // a tap or click without a drag: walk there
      if (p && single && e.type === 'pointerup' && p.moved < 7 && performance.now() - p.t0 < 450 && e.button === 0) {
        this.vy = this.vp = 0;
        const hit = this.pick(e.clientX, e.clientY);
        if (hit) this.walkTo(hit);
      }
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(e.deltaY * 0.0012));
        this.touch();
      },
      { passive: false }
    );
    const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (!MOVE.has(e.code)) return;
      if (e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
      if (!e.code.startsWith('Shift')) {
        this.path.length = 0;
        this.touch();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  touch() {
    this.idleSince = performance.now();
    this.onInteract();
  }

  turn(dy, dp) {
    this.yaw += dy;
    if (this.yaw > 180) this.yaw -= 360;
    if (this.yaw < -180) this.yaw += 360;
    this.pitch = clamp(this.pitch + dp, this.o.pitchMin, this.o.pitchMax);
  }

  zoom(f) {
    this.fov = clamp(this.fov * f, this.o.fovMin, this.o.fovMax);
  }

  addObstacles(list = []) {
    for (const o of list) {
      if (o.r !== undefined) this.circles.push(o);
      else this.boxes.push(o);
    }
  }

  // ---- Where a click lands ----

  pick(cx, cy) {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.ndc, this.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (o.y > PIER.deck + 0.5 && d.y < 0) {
      const t = (PIER.deck - o.y) / d.y;
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      if (onDeck(x, z)) return { x, z, level: 'deck' };
    }
    let t = 0.4;
    for (let i = 0; i < 600 && t < 900; i++) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      // clicking the pier, its rail or a building on it from below: go up there
      if (o.y < PIER.deck && y > PIER.deck - 0.9 && y < PIER.deck + 12 && onDeck(x, z)) return { x, z, level: 'deck' };
      if (y <= Math.max(sandHeight(x, z), 0)) return { x, z, level: 'ground' };
      t += Math.max(0.2, t * 0.015);
    }
    return null;
  }

  /** Walk to a point, by way of the stairs if it is on another level. */
  walkTo(hit) {
    const bottom = { x: STAIR_X, z: STAIRS.z0 - 1.3 };
    const foot = { x: STAIR_X, z: STAIRS.z0 + 0.6 };
    const top = { x: STAIR_X, z: (STAIRS.z1 + STAIRS.landing) / 2 };
    const deck = { x: PIER.x - PIER.half + 1.6, z: top.z };
    top.x = PIER.x - PIER.half - 1.2;
    const path = [];
    const here = this.level === 'stairs' ? 'stairs' : this.level;
    if (hit.level === 'deck' && here === 'ground') path.push(bottom, foot, top, deck);
    else if (hit.level === 'deck' && here === 'stairs') path.push(top, deck);
    else if (hit.level === 'ground' && here === 'deck') path.push(deck, top, foot, bottom);
    else if (hit.level === 'ground' && here === 'stairs') path.push(foot, bottom);
    path.push({ x: hit.x, z: hit.z });
    this.path = path;
    this.stuck = 0;
    this.glide = null;
  }

  /** Glide to one of PLACES. */
  goTo(key, portrait = false) {
    const p = PLACES[key];
    if (!p) return;
    const water = p.z - shoreZ(p.x) < -30;
    const y1 = p.level === 'deck' ? PIER.deck + EYE : water ? 0.35 : sandHeight(p.x, p.z) + EYE;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    const yaw = key === 'home' && portrait ? VIEW.yawPortrait : p.yaw;
    let dYaw = yaw - this.yaw;
    dYaw -= 360 * Math.round(dYaw / 360);
    this.glide = {
      key,
      x0: this.x, z0: this.z, y0: this.eyeY, yaw0: this.yaw, pitch0: this.pitch,
      x1: p.x, z1: p.z, y1, dYaw, pitch1: p.pitch, level: p.level,
      arc: Math.min(38, 3 + dist * 0.07),
      t: 0,
      dur: this.reduced ? 0.01 : clamp(1.6 + dist / 150, 1.8, 5.2),
    };
    this.path.length = 0;
    this.vx = this.vz = 0;
    this.touch();
  }

  // ---- Keeping to where you can stand ----

  resolve(x, z) {
    let level = this.level;
    const EDGE = PIER.x - PIER.half;
    if (level === 'deck') {
      const gap = z > STAIRS.z1 + 0.25 && z < STAIRS.landing - 0.25;
      if (gap && x < EDGE) {
        level = 'stairs';
      } else {
        [x, z] = clampToDeck(x, z, gap);
        for (const [x0, x1, z0, z1] of DECK_BLOCKS) [x, z] = outOfBox(x, z, x0, x1, z0, z1);
        [x, z] = clampToDeck(x, z, gap);
      }
    }
    if (level === 'stairs') {
      const onLanding = z > STAIRS.z1;
      if (onLanding && x > EDGE + 0.25) {
        level = 'deck';
      } else {
        x = clamp(x, STAIRS.x0 + BODY, onLanding ? EDGE + 0.5 : STAIRS.x1 - BODY);
        z = Math.min(z, STAIRS.landing - BODY);
        if (z < STAIRS.z0 - 0.35) level = 'ground';
      }
    }
    if (level === 'ground') {
      x = clamp(x, X_MIN, X_MAX);
      z = Math.min(z, backOf(x));
      z = Math.max(z, shoreZ(x) + SWIM_LIMIT);
      // the stairs: a way up from their foot, a wall along their sides
      if (x > STAIRS.x0 - BODY && x < STAIRS.x1 + BODY && z > STAIRS.z0 - 0.2 && z < STAIRS.landing + BODY) {
        if (this.level === 'ground' && x > STAIRS.x0 + 0.2 && x < STAIRS.x1 - 0.2 && this.z < STAIRS.z0 + 0.1) level = 'stairs';
        else [x, z] = outOfBox(x, z, STAIRS.x0, STAIRS.x1, STAIRS.z0, STAIRS.landing);
      }
      if (level === 'ground') {
        if (onDeck(x, z, -1)) [x, z] = outOfPiles(x, z);
        for (const c of this.circles) {
          const dx = x - c.x;
          const dz = z - c.z;
          const rr = c.r + BODY;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = c.x + (dx / d) * rr;
            z = c.z + (dz / d) * rr;
          }
        }
        for (const b of this.boxes) [x, z] = outOfBox(x, z, b.x0, b.x1, b.z0, b.z1);
      }
    }
    return [x, z, level];
  }

  floorAt(x, z, level) {
    if (level === 'deck') return PIER.deck;
    if (level === 'stairs') return STAIR_BASE + (PIER.deck - STAIR_BASE) * clamp((z - STAIRS.z0) / (STAIRS.z1 - STAIRS.z0), 0, 1);
    return sandHeight(x, z);
  }

  update(dt, t) {
    this.t = t;
    const idle = performance.now() - this.idleSince > 12000;
    if (this.pointers.size === 0 && !this.reduced) {
      const decay = Math.exp(-dt * 4);
      if (Math.abs(this.vy) + Math.abs(this.vp) > 0.01) this.turn(this.vy * dt, this.vp * dt);
      this.vy *= decay;
      this.vp *= decay;
    }

    const g = this.glide;
    if (g) {
      g.t += dt;
      const k = Math.min(1, g.t / g.dur);
      const e = easeInOut(k);
      this.x = g.x0 + (g.x1 - g.x0) * e;
      this.z = g.z0 + (g.z1 - g.z0) * e;
      this.eyeY = g.y0 + (g.y1 - g.y0) * e + g.arc * Math.sin(Math.PI * e);
      this.yaw = g.yaw0 + g.dYaw * e;
      this.pitch = g.pitch0 + (g.pitch1 - g.pitch0) * e;
      if (k >= 1) {
        this.glide = null;
        this.level = g.level;
        this.eyeV = 0;
        this.home = this.yaw;
        this.setPlace(g.key);
      }
    } else {
      this.walk(dt, t, idle);
    }

    const cam = this.camera;
    cam.position.set(this.x, this.eyeY, this.z);
    const y = this.yaw * D2R;
    const p = this.pitch * D2R;
    cam.lookAt(cam.position.x + Math.sin(y) * Math.cos(p), cam.position.y + Math.sin(p), cam.position.z - Math.cos(y) * Math.cos(p));
    if (Math.abs(cam.fov - this.fov) > 1e-3) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
      return true;
    }
    return false;
  }

  walk(dt, t, idle) {
    const K = this.keys;
    const fwd = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0);
    const side = (K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0);
    const spin = (K.has('ArrowRight') ? 1 : 0) - (K.has('ArrowLeft') ? 1 : 0);
    const running = K.has('ShiftLeft') || K.has('ShiftRight');
    if (spin) this.turn(spin * 80 * dt, 0);

    const depth = -sandHeight(this.x, this.z);
    this.swimming = this.level === 'ground' && depth > 1.3;
    const wade = this.level === 'ground' ? clamp(1 - Math.max(depth, 0) / 1.6, 0.4, 1) : 1;
    let tx = 0;
    let tz = 0;
    let speed = 0;
    if (fwd || side) {
      const yr = this.yaw * D2R;
      tx = Math.sin(yr) * fwd + Math.cos(yr) * side;
      tz = -Math.cos(yr) * fwd + Math.sin(yr) * side;
      const l = Math.hypot(tx, tz);
      tx /= l;
      tz /= l;
      speed = this.swimming ? (running ? 1.6 : SWIM) : (running ? RUN : WALK) * wade;
    } else if (this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.x;
      const dz = wp.z - this.z;
      const d = Math.hypot(dx, dz);
      let left = d;
      for (let i = 1; i < this.path.length; i++) left += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].z - this.path[i - 1].z);
      if (d < (this.path.length > 1 ? 0.45 : 0.2)) {
        this.path.shift();
        this.stuck = 0;
      } else {
        tx = dx / d;
        tz = dz / d;
        speed = this.swimming ? (left > 40 ? 1.6 : SWIM) : (left > 30 ? RUN : 1.6) * wade;
        speed = Math.min(speed, d * 3 + 0.3);
      }
    }
    const a = 1 - Math.exp(-dt * (speed > 0 ? 6 : 9));
    this.vx += (tx * speed - this.vx) * a;
    this.vz += (tz * speed - this.vz) * a;
    const ox = this.x;
    const oz = this.z;
    const [nx, nz, level] = this.resolve(this.x + this.vx * dt, this.z + this.vz * dt);
    this.level = level;
    const moved = Math.hypot(nx - ox, nz - oz);
    this.x = nx;
    this.z = nz;
    if (this.path.length && !(fwd || side)) {
      this.stuck = moved < speed * dt * 0.25 ? this.stuck + dt : 0;
      if (this.stuck > 1.2) this.path.length = 0;
    }
    if (moved > 1e-4) this.touch();
    if (this.place && Math.hypot(this.x - PLACES[this.place].x, this.z - PLACES[this.place].z) > 5) this.setPlace(null);

    // eye height: the floor, a stride's bob, and the swell when you are in the water
    const floor = this.floorAt(this.x, this.z, this.level);
    const v = moved / Math.max(dt, 1e-4);
    this.step += moved / 0.78;
    const bob = this.reduced || this.swimming ? 0 : 0.035 * Math.min(1, v / 1.4) * (0.5 - 0.5 * Math.cos(this.step * Math.PI * 2));
    let target = floor + EYE + bob;
    let stiff = 14;
    if (this.level === 'ground' && this.z - shoreZ(this.x) < 3) {
      const sea = seaHeight(this.x, this.z, t);
      if (sea + 0.32 > target) {
        target = sea + 0.32;
        stiff = 5;
      }
    }
    const acc = stiff * stiff * (target - this.eyeY) - 2 * stiff * this.eyeV;
    this.eyeV += acc * dt;
    this.eyeY += this.eyeV * dt;
    if (Math.abs(this.eyeY - target) > 3) {
      this.eyeY = target;
      this.eyeV = 0;
    }

    // left alone, the view drifts slowly
    if (idle && !this.reduced && this.pointers.size === 0 && moved < 1e-3 && !this.path.length) {
      if (this.yaw > this.home + 14) this.driftDir = -1;
      else if (this.yaw < this.home - 14) this.driftDir = 1;
      this.turn(this.driftDir * 0.35 * dt, this.pitch < 2 ? 0.2 * dt : 0);
    } else if (!idle) this.home = this.yaw;
  }

  setPlace(key) {
    if (this.place === key) return;
    this.place = key;
    this.onPlace(key);
  }
}

function clampToDeck(x, z, gap = false) {
  const nx = [clamp(x, PIER.x - PIER.half + (gap ? -0.2 : DECK_IN), PIER.x + PIER.half - DECK_IN), clamp(z, PIER.end + DECK_IN, PIER.land - 1)];
  const wide = [clamp(x, PIER.wide.south + DECK_IN, PIER.x), clamp(z, PIER.wide.z0 + DECK_IN, PIER.wide.z1 - DECK_IN)];
  const a = (nx[0] - x) ** 2 + (nx[1] - z) ** 2;
  const b = (wide[0] - x) ** 2 + (wide[1] - z) ** 2;
  return a <= b ? nx : wide;
}

function outOfBox(x, z, x0, x1, z0, z1) {
  const bx0 = x0 - BODY, bx1 = x1 + BODY, bz0 = z0 - BODY, bz1 = z1 + BODY;
  if (x <= bx0 || x >= bx1 || z <= bz0 || z >= bz1) return [x, z];
  const l = x - bx0, r = bx1 - x, n = z - bz0, f = bz1 - z;
  const m = Math.min(l, r, n, f);
  if (m === l) return [bx0, z];
  if (m === r) return [bx1, z];
  if (m === n) return [x, bz0];
  return [x, bz1];
}

function outOfPiles(x, z) {
  const inWide = z >= PIER.wide.z0 && z <= PIER.wide.z1;
  for (const row of [pileRowZ(z) - 6, pileRowZ(z), pileRowZ(z) + 6]) {
    if (Math.abs(row - z) > 1) continue;
    for (const list of inWide ? [PILE_XS_NARROW, PILE_XS_WIDE] : [PILE_XS_NARROW]) {
      for (const px of list) {
        const dx = x - px;
        const dz = z - row;
        const rr = 0.35 + BODY;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = px + (dx / d) * rr;
          z = row + (dz / d) * rr;
        }
      }
    }
  }
  return [x, z];
}
