// Figures built from specks: capsule skeletons for people, flat panels for
// wings, boards and sails. Poses are solved on the CPU and written into one
// shared dynamic cloud; each speck carries a normal so figures are lit by the
// sun, rimmed when backlit, and sink behind the water line when wading.
import * as THREE from 'three';
import { rng, specks } from './core.js';

const STRIDE = 11; // position 3, normal 3, colour 3, alpha, size
const _sphere = new THREE.Sphere();

/**
 * One shared stream of figure specks, rebuilt every frame: each figure that
 * is in view writes itself in, with fewer, larger specks the further away it
 * is, and only the part that was written is uploaded.
 */
export class FigureCloud {
  constructor(scene, capacity = 60000) {
    this.cap = capacity;
    this.n = 0;
    this.buf = new Float32Array(capacity * STRIDE);
    this.ib = new THREE.InterleavedBuffer(this.buf, STRIDE).setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(this.ib, 3, 0));
    geo.setAttribute('aNormal', new THREE.InterleavedBufferAttribute(this.ib, 3, 3));
    geo.setAttribute('aColor', new THREE.InterleavedBufferAttribute(this.ib, 3, 6));
    geo.setAttribute('aAlpha', new THREE.InterleavedBufferAttribute(this.ib, 1, 9));
    geo.setAttribute('aSize', new THREE.InterleavedBufferAttribute(this.ib, 1, 10));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.points = specks({ blend: 'normal',
      geometry: geo,
      decl: 'attribute vec3 aNormal; attribute vec3 aColor; attribute float aAlpha;',
      body: /* glsl */ `
        vec3 n = normalize(aNormal + vec3(0.0, 0.001, 0.0));
        vec3 V = normalize(position - cameraPosition);
        float rim = pow(1.0 - abs(dot(n, -V)), 2.5) * max(dot(V, uSunDir), 0.0);
        float sd = clamp((dot(n, uSunDir) + 0.3) / 1.3, 0.0, 1.0) * uSunVis;
        vec3 L = uSunColor * sd * 1.1 + uAmb * (0.2 + 0.22 * n.y) + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonVis * uMoonLit * 0.3;
        col = aColor * L + mix(uSunColor, aColor * 1.6, 0.5) * rim * uSunVis * 0.22 + aColor * pierGlow(position) * 0.5;
        alpha = aAlpha * 0.88;
        // below the water line, a wading figure fades out
        if (position.z < shoreZ(position.x) + 1.0) {
          vec2 g; float w = surf(position.xz, uTime).x + chop(position.xz, uTime, g);
          alpha *= smoothstep(w - 0.12, w + 0.06, position.y);
        }`,
      maxPx: 24,
    });
    scene.add(this.points);
    this.cam = new THREE.Vector3(0, 2, 30);
    this.frustum = null;
    this.near = 22; // a figure nearer than this many radii is drawn with every speck
  }

  /** Start a frame: figures write themselves in after this. */
  begin(ctx) {
    this.n = 0;
    this.cam.copy(ctx.camera.position);
    this.frustum = ctx.frustum;
    // zoomed in, a far figure fills more of the screen and needs more specks
    this.zoom = Math.tan((25 * Math.PI) / 180) / Math.tan((ctx.camera.fov * Math.PI) / 360);
  }

  /**
   * Share of its specks a figure of size `radius` at (x, y, z) should draw:
   * 0 when out of view, 1 up close, falling with the square of distance.
   */
  lod(x, y, z, radius, near = this.near * radius) {
    if (this.frustum) {
      _sphere.center.set(x, y, z);
      _sphere.radius = radius;
      if (!this.frustum.intersectsSphere(_sphere)) return 0;
    }
    const d = Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z) / (this.zoom || 1);
    const k = near / Math.max(d, 1e-3);
    return Math.min(1, Math.max(0.012, k * k));
  }

  /** Room for n more specks: the offset to write at, or -1 when full. */
  take(n) {
    if (this.n + n > this.cap) return -1;
    const o = this.n;
    this.n += n;
    return o;
  }

  commit() {
    this.geo.setDrawRange(0, this.n);
    this.ib.clearUpdateRanges();
    if (this.n > 0) {
      this.ib.addUpdateRange(0, this.n * STRIDE);
      this.ib.needsUpdate = true;
    }
  }
}

// ---- Outfits ------------------------------------------------------------------

export const SKIN = [[0.96, 0.82, 0.7], [0.9, 0.7, 0.55], [0.76, 0.54, 0.4], [0.58, 0.39, 0.27], [0.42, 0.28, 0.2], [0.93, 0.76, 0.62]];
export const HAIR = [[0.08, 0.06, 0.05], [0.2, 0.13, 0.08], [0.38, 0.25, 0.14], [0.78, 0.64, 0.4], [0.55, 0.5, 0.46], [0.5, 0.2, 0.1]];
const BRIGHT = [[0.9, 0.2, 0.25], [0.15, 0.45, 0.85], [0.95, 0.75, 0.15], [0.1, 0.65, 0.6], [0.95, 0.45, 0.6], [0.2, 0.2, 0.22], [0.95, 0.95, 0.92], [0.55, 0.3, 0.75], [0.95, 0.5, 0.2]];

/** A random beachgoer's outfit. kind: trunks, bikini, onepiece, casual, jogger, wetsuit, lifeguard */
export function outfit(r, kind) {
  kind ??= r.pick(['trunks', 'trunks', 'bikini', 'bikini', 'onepiece', 'casual', 'casual']);
  const skin = r.pick(SKIN);
  const hair = r.pick(HAIR);
  const a = r.pick(BRIGHT);
  const b = r.pick(BRIGHT);
  if (kind === 'wetsuit') return { kind, skin, hair, top: [0.06, 0.06, 0.07], bottom: [0.06, 0.06, 0.07], sleeves: 1, legs: 'pants' };
  if (kind === 'lifeguard') return { kind, skin, hair, top: [0.85, 0.12, 0.12], bottom: [0.85, 0.12, 0.12], sleeves: 1, legs: 'shorts' };
  if (kind === 'trunks') return { kind, skin, hair, top: skin, bottom: a, sleeves: 0, legs: 'shorts' };
  if (kind === 'bikini') return { kind, skin, hair, top: a, bottom: a, sleeves: 0, legs: 'bare', band: true };
  if (kind === 'onepiece') return { kind, skin, hair, top: a, bottom: a, sleeves: 0, legs: 'bare' };
  if (kind === 'jogger') return { kind, skin, hair, top: a, bottom: [0.12, 0.12, 0.14], sleeves: 0, legs: 'shorts' };
  return { kind: 'casual', skin, hair, top: a, bottom: r() < 0.5 ? [0.2, 0.28, 0.45] : b, sleeves: 1, legs: r() < 0.7 ? 'shorts' : 'pants' };
}

function colorFor(o, role, t, dirY) {
  switch (role) {
    case 'torso':
      if (o.band) return t > 0.62 && t < 0.86 ? o.top : t < 0.18 ? o.bottom : o.skin;
      return t < 0.22 ? o.bottom : o.top;
    case 'hips':
      return o.bottom;
    case 'shoulders':
      return o.band ? o.skin : o.top;
    case 'upper':
      return o.sleeves && t < 0.55 ? o.top : o.skin;
    case 'thigh':
      return o.legs === 'pants' || (o.legs === 'shorts' && t < 0.55) ? o.bottom : o.skin;
    case 'shin':
      return o.legs === 'pants' ? o.bottom : o.skin;
    case 'head':
      return dirY > 0.25 ? o.hair : o.skin;
    default:
      return o.skin;
  }
}

// ---- Capsule bodies ------------------------------------------------------------

export const ROLE_IDS = { torso: 0, hips: 1, shoulders: 2, upper: 3, thigh: 4, shin: 5, head: 6, neck: 7, fore: 8 };

export class Body {
  // spec: { joints, bones: [[a, b, r0, r1, weight, role]], balls: [[joint, r, weight, role]], center?, radius? }
  constructor(cloud, spec, { outfit: o, color, palette, size = 0.072, density = 80, seed = 1, scale = 1, radius }) {
    const r = rng(seed * 97 + 5);
    this.cloud = cloud;
    this.scale = scale;
    this.center = spec.center ?? 0;
    this.radius = radius ?? (spec.radius ?? 1.1) * scale;
    this.J = new Float32Array(spec.joints * 3);
    this.groups = [];
    let n = 0;
    for (const [a, b, r0, r1, w, role] of spec.bones) {
      const k = Math.max(3, Math.round(w * density));
      this.groups.push({ a, b, r0, r1, n: k, ball: false, role, k });
      n += k;
    }
    for (const [j, rad, w, role] of spec.balls || []) {
      const k = Math.max(3, Math.round(w * density));
      this.groups.push({ a: j, b: j, r0: rad, r1: rad, n: k, ball: true, role, k });
      n += k;
    }
    this.n = n;
    this.p = new Float32Array(n * 4);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    // what each speck is, so a crowd can re-dress a baked pose on the GPU
    this.role = new Float32Array(n);
    this.rt = new Float32Array(n);
    this.shade = new Float32Array(n);
    const tint = color ? new THREE.Color(color) : null;
    let i = 0;
    for (const g of this.groups) {
      for (let k = 0; k < g.n; k++, i++) {
        let c;
        let t = 0;
        let dirY = 0;
        if (g.ball) {
          const v = new THREE.Vector3(r.gauss(), r.gauss(), r.gauss()).normalize();
          this.p.set([v.x, v.y, v.z, 0.6 + 0.4 * r()], i * 4);
          dirY = v.y;
          c = o ? colorFor(o, g.role, 0, v.y) : null;
        } else {
          t = r();
          const ang = r() * Math.PI * 2;
          this.p.set([t, Math.cos(ang), Math.sin(ang), 0.55 + 0.45 * r()], i * 4);
          c = o ? colorFor(o, g.role, t, 0) : null;
        }
        const v = 0.88 + r() * 0.24;
        const base = c || palette?.[g.role] || (tint ? [tint.r, tint.g, tint.b] : [1, 1, 1]);
        this.col.set([base[0] * v, base[1] * v, base[2] * v], i * 3);
        this.size[i] = size * scale * (0.75 + r() * 0.5);
        this.role[i] = ROLE_IDS[g.role] ?? 9;
        this.rt[i] = g.ball ? dirY : t;
        this.shade[i] = v;
      }
    }
  }

  hide() {}

  /** Write the posed body into its cloud (skipped when out of view). */
  write(alpha = 1) {
    const cloud = this.cloud;
    if (!cloud || alpha < 0.005) return;
    const { J, p, scale, col, size } = this;
    const c = this.center * 3;
    const f = cloud.lod(J[c], J[c + 1], J[c + 2], this.radius);
    if (f <= 0) return;
    let total = 0;
    for (const g of this.groups) total += (g.k = g.n <= 3 ? g.n : Math.max(2, Math.ceil(g.n * f)));
    let w = cloud.take(total);
    if (w < 0) return;
    w *= STRIDE;
    const B = cloud.buf;
    let i = 0;
    for (const g of this.groups) {
      const grow = Math.sqrt(g.n / g.k);
      const ax = J[g.a * 3], ay = J[g.a * 3 + 1], az = J[g.a * 3 + 2];
      if (g.ball) {
        const rad = g.r0 * scale;
        for (let k = 0; k < g.k; k++) {
          const q = (i + k) * 4;
          const f4 = p[q + 3] * rad;
          const ci = (i + k) * 3;
          B[w] = ax + p[q] * f4; B[w + 1] = ay + p[q + 1] * f4; B[w + 2] = az + p[q + 2] * f4;
          B[w + 3] = p[q]; B[w + 4] = p[q + 1]; B[w + 5] = p[q + 2];
          B[w + 6] = col[ci]; B[w + 7] = col[ci + 1]; B[w + 8] = col[ci + 2];
          B[w + 9] = alpha; B[w + 10] = size[i + k] * grow;
          w += STRIDE;
        }
        i += g.n;
        continue;
      }
      const dx = J[g.b * 3] - ax, dy = J[g.b * 3 + 1] - ay, dz = J[g.b * 3 + 2] - az;
      const l = Math.hypot(dx, dy, dz) || 1e-5;
      const nx = dx / l, ny = dy / l, nz = dz / l;
      let ux, uy, uz;
      if (Math.abs(ny) < 0.95) { ux = -nz; uy = 0; uz = nx; } else { ux = 0; uy = nz; uz = -ny; }
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
      const r0 = g.r0 * scale, dr = (g.r1 - g.r0) * scale;
      for (let k = 0; k < g.k; k++) {
        const q = (i + k) * 4;
        const t = p[q], cc = p[q + 1], s = p[q + 2];
        const rad = (r0 + dr * t) * p[q + 3];
        const rx = ux * cc + vx * s, ry = uy * cc + vy * s, rz = uz * cc + vz * s;
        const ci = (i + k) * 3;
        B[w] = ax + dx * t + rx * rad; B[w + 1] = ay + dy * t + ry * rad; B[w + 2] = az + dz * t + rz * rad;
        B[w + 3] = rx; B[w + 4] = ry; B[w + 5] = rz;
        B[w + 6] = col[ci]; B[w + 7] = col[ci + 1]; B[w + 8] = col[ci + 2];
        B[w + 9] = alpha; B[w + 10] = size[i + k] * grow;
        w += STRIDE;
      }
      i += g.n;
    }
  }

  /** Every speck of the current pose, for baking: { pos, nrm } arrays. */
  bake() {
    const { J, p, scale } = this;
    const pos = new Float32Array(this.n * 3);
    const nrm = new Float32Array(this.n * 3);
    let i = 0;
    for (const g of this.groups) {
      const ax = J[g.a * 3], ay = J[g.a * 3 + 1], az = J[g.a * 3 + 2];
      if (g.ball) {
        for (let k = 0; k < g.n; k++, i++) {
          const f4 = p[i * 4 + 3] * g.r0 * scale;
          pos.set([ax + p[i * 4] * f4, ay + p[i * 4 + 1] * f4, az + p[i * 4 + 2] * f4], i * 3);
          nrm.set([p[i * 4], p[i * 4 + 1], p[i * 4 + 2]], i * 3);
        }
        continue;
      }
      const dx = J[g.b * 3] - ax, dy = J[g.b * 3 + 1] - ay, dz = J[g.b * 3 + 2] - az;
      const l = Math.hypot(dx, dy, dz) || 1e-5;
      const nx = dx / l, ny = dy / l, nz = dz / l;
      let ux, uy, uz;
      if (Math.abs(ny) < 0.95) { ux = -nz; uy = 0; uz = nx; } else { ux = 0; uy = nz; uz = -ny; }
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
      for (let k = 0; k < g.n; k++, i++) {
        const t = p[i * 4], cc = p[i * 4 + 1], s = p[i * 4 + 2];
        const rad = (g.r0 + (g.r1 - g.r0) * t) * p[i * 4 + 3] * scale;
        const rx = ux * cc + vx * s, ry = uy * cc + vy * s, rz = uz * cc + vz * s;
        pos.set([ax + dx * t + rx * rad, ay + dy * t + ry * rad, az + dz * t + rz * rad], i * 3);
        nrm.set([rx, ry, rz], i * 3);
      }
    }
    return { pos, nrm };
  }
}

export const HUMAN = {
  joints: 16, // pelvis chest neck head | shL elL hdL | shR elR hdR | hipL knL ftL | hipR knR ftR
  bones: [
    [0, 1, 0.13, 0.155, 1.4, 'torso'], [1, 2, 0.055, 0.05, 0.25, 'neck'], [4, 7, 0.06, 0.06, 0.45, 'shoulders'], [10, 13, 0.09, 0.09, 0.4, 'hips'],
    [4, 5, 0.052, 0.044, 0.55, 'upper'], [5, 6, 0.042, 0.034, 0.5, 'fore'], [7, 8, 0.052, 0.044, 0.55, 'upper'], [8, 9, 0.042, 0.034, 0.5, 'fore'],
    [10, 11, 0.075, 0.058, 0.85, 'thigh'], [11, 12, 0.056, 0.042, 0.75, 'shin'], [13, 14, 0.075, 0.058, 0.85, 'thigh'], [14, 15, 0.056, 0.042, 0.75, 'shin'],
  ],
  balls: [[3, 0.115, 0.9, 'head']],
};

export const GAITS = {
  walk: { stride: 0.42, knee0: 0.08, knee: 0.55, arm: 0.35, elbow: 0.25, lean: 0.04, bob: 0.03, crouch: 0 },
  run: { stride: 0.72, knee0: 0.3, knee: 1.35, arm: 0.85, elbow: 1.45, lean: 0.2, bob: 0.07, crouch: 0.06 },
  skate: { stride: 0.5, knee0: 0.35, knee: 0.5, arm: 0.6, elbow: 0.4, lean: 0.25, bob: 0.03, crouch: 0.12 },
  stand: { stride: 0, knee0: 0.04, knee: 0, arm: 0, elbow: 0.15, lean: 0.02, bob: 0, crouch: 0 },
  ready: { stride: 0, knee0: 0.55, knee: 0, arm: 0.3, elbow: 0.9, lean: 0.35, bob: 0, crouch: 0.2 },
};

/** Local frame: (side, up, forward) → world, scaled. */
export function frame(x, y, z, heading, scale) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const sx = -fz, sz = fx;
  return (J, j, a, b, c) => {
    J[j * 3] = x + (sx * a + fx * c) * scale;
    J[j * 3 + 1] = y + b * scale;
    J[j * 3 + 2] = z + (sz * a + fz * c) * scale;
  };
}

/** Walking, running, skating or standing. `reach` raises the right arm toward a world point; `arms` overrides arm angles. */
export function poseGait(body, { x, y, z, heading, phase, gait, reach = null, armsUp = 0 }) {
  const J = body.J;
  const set = frame(x, y, z, heading, body.scale);
  const g = gait;
  const bob = g.bob * (0.5 + 0.5 * Math.cos(2 * phase));
  const py = 0.94 + bob - g.crouch;
  const lf = Math.sin(g.lean), lu = Math.cos(g.lean);
  set(J, 0, 0, py, 0);
  set(J, 1, 0, py + 0.46 * lu, 0.46 * lf);
  set(J, 2, 0, py + 0.58 * lu, 0.58 * lf);
  set(J, 3, 0, py + 0.71 * lu, 0.71 * lf);
  for (const side of [-1, 1]) {
    const ph = phase + (side > 0 ? Math.PI : 0);
    const th = g.stride * Math.sin(ph);
    const kn = g.knee0 + g.knee * Math.max(0, Math.cos(ph));
    const hip = side < 0 ? 10 : 13;
    const hx = side * (0.1 + g.crouch * 0.4), hy = py - 0.03;
    set(J, hip, hx, hy, 0);
    const kx = hx, ky = hy - Math.cos(th) * 0.46, kz = Math.sin(th) * 0.46;
    set(J, hip + 1, kx, ky, kz);
    set(J, hip + 2, kx, Math.max(0.03, ky - Math.cos(th - kn) * 0.45), kz + Math.sin(th - kn) * 0.45);
    const sh = side < 0 ? 4 : 7;
    const sa = side * 0.19, sb = py + 0.43 * lu, sc = 0.43 * lf;
    set(J, sh, sa, sb, sc);
    if (reach && side > 0) {
      const s = body.scale;
      const wx = J[sh * 3], wy = J[sh * 3 + 1], wz = J[sh * 3 + 2];
      let dx = reach.x - wx, dy = reach.y - wy, dz = reach.z - wz;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      J[(sh + 1) * 3] = wx + dx * 0.29 * s; J[(sh + 1) * 3 + 1] = wy + dy * 0.29 * s - 0.03 * s; J[(sh + 1) * 3 + 2] = wz + dz * 0.29 * s;
      J[(sh + 2) * 3] = wx + dx * 0.56 * s; J[(sh + 2) * 3 + 1] = wy + dy * 0.56 * s; J[(sh + 2) * 3 + 2] = wz + dz * 0.56 * s;
      continue;
    }
    const aa = armsUp ? Math.PI * armsUp : g.arm * Math.sin(phase + (side < 0 ? Math.PI : 0));
    const ea = aa + (armsUp ? 0.1 : g.elbow);
    const ex = sa + side * 0.03, ey = sb - Math.cos(aa) * 0.29, ez = sc + Math.sin(aa) * 0.29;
    set(J, sh + 1, ex, ey, ez);
    set(J, sh + 2, ex + side * 0.01, ey - Math.cos(ea) * 0.27, ez + Math.sin(ea) * 0.27);
  }
}

/** Seated on the ground or a board, knees up, forearms on knees. */
export function poseSit(body, { x, y, z, heading, t, lean = 0.12 }) {
  const J = body.J;
  const set = frame(x, y, z, heading, body.scale);
  const br = Math.sin(t * 1.3) * 0.01;
  const py = 0.12;
  set(J, 0, 0, py, 0);
  set(J, 1, 0, py + 0.45 + br, lean);
  set(J, 2, 0, py + 0.57 + br, lean + 0.04);
  set(J, 3, 0, py + 0.7 + br, lean + 0.08 + Math.sin(t * 0.4) * 0.02);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, py, 0);
    set(J, hip + 1, side * 0.14, py + 0.36, 0.3);
    set(J, hip + 2, side * 0.16, 0.04, 0.55);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, py + 0.42 + br, lean);
    set(J, sh + 1, side * 0.22, py + 0.3, lean + 0.22);
    set(J, sh + 2, side * 0.16, py + 0.34, 0.42 + Math.sin(t * 0.7 + side) * 0.03);
  }
}

/** Lying on a towel: on the back (face up) or front (propped on elbows). */
export function poseLie(body, { x, y, z, heading, front = false, t = 0 }) {
  const J = body.J;
  const set = frame(x, y, z, heading, body.scale);
  const h = 0.12;
  const prop = front ? 0.18 : 0;
  set(J, 0, 0, h, 0);
  set(J, 1, 0, h + prop * 0.6, 0.46);
  set(J, 2, 0, h + prop, 0.58);
  set(J, 3, 0, h + 0.02 + prop * 1.3, 0.72);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, h, -0.02);
    set(J, hip + 1, side * 0.13, h - 0.02, -0.48);
    const kick = front ? Math.max(0, Math.sin(t * 1.5 + side)) * 0.35 : 0;
    set(J, hip + 2, side * 0.15, h - 0.04 + kick, -0.92 + kick * 0.3);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, h + prop * 0.8, 0.44);
    if (front) {
      set(J, sh + 1, side * 0.2, h - 0.02, 0.62);
      set(J, sh + 2, side * 0.1, h + 0.02, 0.85);
    } else {
      set(J, sh + 1, side * 0.26, h - 0.02, 0.2);
      set(J, sh + 2, side * 0.28, h - 0.03, -0.05);
    }
  }
}

/** In a low beach chair: reclined back, legs out. */
export function poseChair(body, { x, y, z, heading, t }) {
  const J = body.J;
  const set = frame(x, y, z, heading, body.scale);
  const py = 0.3;
  set(J, 0, 0, py, 0);
  set(J, 1, 0, py + 0.42, -0.22);
  set(J, 2, 0, py + 0.53, -0.26);
  set(J, 3, 0, py + 0.66, -0.27 + Math.sin(t * 0.3) * 0.02);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, py, 0.02);
    set(J, hip + 1, side * 0.13, py + 0.12, 0.46);
    set(J, hip + 2, side * 0.15, 0.05, 0.86);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, py + 0.4, -0.2);
    set(J, sh + 1, side * 0.28, py + 0.2, -0.05);
    set(J, sh + 2, side * 0.26, py + 0.18, 0.2);
  }
}

/** Surf stance: sideways on the board, knees bent, arms out for balance. */
export function poseSurf(body, { x, y, z, heading, t }) {
  const J = body.J;
  const set = frame(x, y, z, heading, body.scale);
  const sw = Math.sin(t * 1.7) * 0.08;
  const py = 0.78;
  set(J, 0, sw * 0.5, py, 0);
  set(J, 1, sw, py + 0.44, 0.14);
  set(J, 2, sw * 1.2, py + 0.55, 0.18);
  set(J, 3, sw * 1.3, py + 0.67, 0.2);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.12 + sw * 0.5, py, 0);
    set(J, hip + 1, side * 0.32, 0.42, 0.14);
    set(J, hip + 2, side * 0.44, 0.04, 0);
    const sh = side < 0 ? 4 : 7;
    const lift = Math.sin(t * 1.3 + side) * 0.08;
    set(J, sh, side * 0.19 + sw, py + 0.41, 0.12);
    set(J, sh + 1, side * 0.46 + sw, py + 0.34 + lift, 0.12);
    set(J, sh + 2, side * 0.72 + sw, py + 0.36 + lift * 1.6, 0.06);
  }
}

/** Prone on a board, arms windmilling. */
export function posePaddle(body, { x, y, z, heading, phase }) {
  const J = body.J;
  const set = frame(x, y, z, heading, body.scale);
  const h = 0.16;
  set(J, 0, 0, h, 0);
  set(J, 1, 0, h + 0.08, 0.46);
  set(J, 2, 0, h + 0.14, 0.58);
  set(J, 3, 0, h + 0.22, 0.7);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, h, -0.02);
    set(J, hip + 1, side * 0.12, h, -0.48);
    set(J, hip + 2, side * 0.12, h + 0.02, -0.92);
    const sh = side < 0 ? 4 : 7;
    const a = phase + (side > 0 ? Math.PI : 0);
    set(J, sh, side * 0.2, h + 0.1, 0.44);
    set(J, sh + 1, side * 0.3, h + 0.05 + Math.max(0, Math.sin(a)) * 0.25 - 0.15, 0.44 + Math.cos(a) * 0.25);
    set(J, sh + 2, side * 0.34, h + Math.sin(a) * 0.35 - 0.2, 0.44 + Math.cos(a) * 0.52);
  }
}

/** Riding a bicycle: seated, hands on the bars, legs pedalling. */
export function poseCycle(body, { x, y, z, heading, phase }) {
  const J = body.J;
  const set = frame(x, y, z, heading, body.scale);
  const py = 0.98;
  set(J, 0, 0, py, -0.1);
  set(J, 1, 0, py + 0.4, 0.18);
  set(J, 2, 0, py + 0.5, 0.26);
  set(J, 3, 0, py + 0.62, 0.32);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    const a = phase + (side > 0 ? Math.PI : 0);
    const px = side * 0.1, pyy = 0.34 + Math.sin(a) * 0.17, pz = 0.1 + Math.cos(a) * 0.17;
    set(J, hip, side * 0.1, py - 0.02, -0.1);
    const kx = side * 0.13, ky = (py + pyy) / 2 + 0.2, kz = (pz - 0.1) / 2 + 0.2;
    set(J, hip + 1, kx, ky, kz);
    set(J, hip + 2, px, pyy, pz);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, py + 0.38, 0.16);
    set(J, sh + 1, side * 0.24, py + 0.2, 0.36);
    set(J, sh + 2, side * 0.24, py + 0.12, 0.58);
  }
}

/** Hanging from gymnastic rings, swinging. */
export function poseHang(body, { x, y, z, heading, swing }) {
  const J = body.J;
  const set = frame(x, y, z, heading, body.scale);
  const L = 1.95;
  const s = Math.sin(swing), c = Math.cos(swing);
  const at = (a, d) => [a, 2.2 - d * c, d * s]; // hanging below the hands at y ≈ 2.2
  const pts = { 0: at(0, 1.3), 1: at(0, 0.85), 2: at(0, 0.72), 3: at(0, 0.6), 4: at(-0.2, 0.62), 7: at(0.2, 0.62), 5: at(-0.24, 0.32), 8: at(0.24, 0.32), 6: at(-0.25, 0.02), 9: at(0.25, 0.02), 10: at(-0.1, 1.33), 13: at(0.1, 1.33), 11: at(-0.1, 1.8), 14: at(0.1, 1.8), 12: at(-0.1, L + 0.3), 15: at(0.1, L + 0.3) };
  for (const [j, [a, b, cc]] of Object.entries(pts)) set(J, +j, a, b, cc);
}

// ---- Flat shapes: local points placed by a basis each frame --------------------

export class Shape {
  constructor(cloud, pts, { color, size = 0.05, seed = 1, colors = null }) {
    this.cloud = cloud;
    this.n = pts.length;
    const r = rng(seed);
    // shuffled, so that drawing only the first k specks still covers the shape
    const order = pts.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.local = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 3);
    this.size = new Float32Array(this.n);
    const base = new THREE.Color(color);
    let rad = 0;
    order.forEach((src, i) => {
      const [a, b, c] = pts[src];
      this.local.set([a, b, c], i * 3);
      rad = Math.max(rad, Math.hypot(a, b, c));
      const cc = colors?.[src] ? new THREE.Color(...(Array.isArray(colors[src]) ? colors[src] : [colors[src]])) : base;
      const v = 0.85 + r() * 0.3;
      this.col.set([cc.r * v, cc.g * v, cc.b * v], i * 3);
      this.size[i] = size * (0.75 + r() * 0.5);
    });
    this.radius = Math.max(rad, 0.2);
  }

  hide() {}

  /** Place the shape by a basis; N overrides the normal (Y) it is lit by, for two-sided things. */
  write(O, X, Y, Z, alpha = 1, N = Y) {
    const cloud = this.cloud;
    if (alpha < 0.005) return;
    const f = cloud.lod(O.x, O.y, O.z, this.radius, 18 * this.radius);
    if (f <= 0) return;
    const k = Math.min(this.n, Math.max(Math.min(this.n, 8), Math.ceil(this.n * f)));
    let w = cloud.take(k);
    if (w < 0) return;
    w *= STRIDE;
    const grow = Math.sqrt(this.n / k);
    const L = this.local, B = cloud.buf, C = this.col, S = this.size;
    for (let i = 0; i < k; i++) {
      const a = L[i * 3], b = L[i * 3 + 1], c = L[i * 3 + 2];
      B[w] = O.x + X.x * a + Y.x * b + Z.x * c;
      B[w + 1] = O.y + X.y * a + Y.y * b + Z.y * c;
      B[w + 2] = O.z + X.z * a + Y.z * b + Z.z * c;
      B[w + 3] = N.x; B[w + 4] = N.y; B[w + 5] = N.z;
      B[w + 6] = C[i * 3]; B[w + 7] = C[i * 3 + 1]; B[w + 8] = C[i * 3 + 2];
      B[w + 9] = alpha; B[w + 10] = S[i] * grow;
      w += STRIDE;
    }
  }
}

/** Points filling a 2D polygon (x, y), edges traced denser. */
export function fillPolygon(r, poly, fill, edge, z = 0) {
  const pts = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let guard = 0;
  while (pts.length < fill && guard++ < fill * 20) {
    const x = minX + r() * (maxX - minX), y = minY + r() * (maxY - minY);
    if (inside(x, y)) pts.push([x, y, z]);
  }
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    for (let k = 0; k < edge; k++) { const t = r(); pts.push([ax + (bx - ax) * t, ay + (by - ay) * t, z]); }
  }
  return pts;
}

/** Specks strung along a quadratic curve (a kite line, a fishing line). */
export class Line {
  constructor(cloud, n, { color, size = 0.03, seed = 1 }) {
    this.cloud = cloud;
    this.n = n;
    this.c = new THREE.Color(color);
    this.s = size;
  }

  hide() {}

  write(a, m, b, alpha = 1) {
    const cloud = this.cloud;
    if (alpha < 0.005) return;
    const rad = Math.max(a.distanceTo(m), b.distanceTo(m)) + 0.5;
    if (cloud.lod(m.x, m.y, m.z, rad) <= 0) return;
    const len = a.distanceTo(m) + m.distanceTo(b);
    const d = Math.max(1, m.distanceTo(cloud.cam) / (cloud.zoom || 1));
    const k = Math.max(4, Math.min(this.n, Math.ceil(len / (d * 0.0024))));
    let w = cloud.take(k);
    if (w < 0) return;
    w *= STRIDE;
    const B = cloud.buf;
    const { r, g, b: bl } = this.c;
    const size = this.s * Math.max(1, (d * 0.0012) / this.s);
    for (let i = 0; i < k; i++) {
      const t = i / (k - 1), s = 1 - t;
      B[w] = s * s * a.x + 2 * s * t * m.x + t * t * b.x;
      B[w + 1] = s * s * a.y + 2 * s * t * m.y + t * t * b.y;
      B[w + 2] = s * s * a.z + 2 * s * t * m.z + t * t * b.z;
      B[w + 3] = 0; B[w + 4] = 1; B[w + 5] = 0;
      B[w + 6] = r; B[w + 7] = g; B[w + 8] = bl;
      B[w + 9] = alpha; B[w + 10] = size;
      w += STRIDE;
    }
  }
}
