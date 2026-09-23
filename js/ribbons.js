// Ribbon strokes: flowing, twisting trails left behind moving figures. Each
// ribbon is a soft filament strip plus a scatter of specks shed along it.
import * as THREE from 'three';
import { U, rng, specks, smoothstep } from './core.js';

const VS = /* glsl */ `
uniform float uFogNear; uniform float uFogFar;
attribute vec2 aUv; attribute float aFade;
varying vec2 vUv; varying float vFade; varying float vFog;
void main() {
  vUv = aUv; vFade = aFade;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vFog = smoothstep(uFogNear, uFogFar, distance(wp.xyz, cameraPosition));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FS = /* glsl */ `
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uOpacity; uniform float uStrands;
uniform float uSeed; uniform float uDay;
varying vec2 vUv; varying float vFade; varying float vFog;
void main() {
  float across = vUv.y * 2.0 - 1.0;
  float body = 1.0 - across * across;
  body *= body;
  float fil = pow(abs(sin((vUv.y * uStrands + vUv.x * 2.0 + uSeed) * 3.14159)), 6.0);
  float head = smoothstep(0.0, 0.05, vUv.x);
  float tail = pow(1.0 - vUv.x, 1.4);
  float a = body * (0.3 + 0.7 * fil) * head * tail * vFade * uOpacity * (1.0 - vFog);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 1.0, vUv.x)) * (0.8 + 0.3 * uDay);
  gl_FragColor = vec4(col, a);
}`;

const UP = new THREE.Vector3(0, 1, 0);
const T = new THREE.Vector3();
const N0 = new THREE.Vector3();
const B0 = new THREE.Vector3();
const W = new THREE.Vector3();

class Ribbon {
  constructor(sys, opts) {
    this.o = {
      max: 70, width: 0.3, life: 2.4, minDist: 0.12, step: 0, drift: [0, 0.25, 0], billow: 0.35,
      twist: 1.1, flat: false, opacity: 0.85, strands: 3, spread: 0.3, specks: 36,
      colorA: '#ffffff', colorB: '#88aaff', seed: Math.random() * 100,
      ...opts,
    };
    const o = this.o;
    this.hist = []; // newest first
    this.anchor = new THREE.Vector3();
    this.bounds = new THREE.Sphere();
    this.live = false; // whether the anchor is being fed this frame
    this.fade = 1;
    const cap = o.max + 1;
    this.cap = cap;
    this.q = new Float32Array(cap * 3);
    this.age = new Float32Array(cap);
    this.len = new Float32Array(cap);
    this.pos = new Float32Array(cap * 6);
    this.uv = new Float32Array(cap * 4);
    this.alpha = new Float32Array(cap * 2);
    this.rows = new Float32Array(cap * 3); // width vector * half width, per row
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aFade', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < cap - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.colA = new THREE.Color(o.colorA);
    this.colB = new THREE.Color(o.colorB);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...U,
        uColorA: { value: this.colA },
        uColorB: { value: this.colB },
        uOpacity: { value: o.opacity },
        uStrands: { value: o.strands },
        uSeed: { value: o.seed },
      },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    sys.scene.add(this.mesh);
    [this.sOff, this.sN] = sys.allocSpecks(o.specks);
    const r = rng(Math.floor(o.seed * 1000) + 7);
    this.su = Float32Array.from({ length: this.sN }, () => Math.pow(r(), 1.5));
    this.sv = Float32Array.from({ length: this.sN }, () => r());
    this.sys = sys;
  }

  /** Feed the current anchor position; call every frame the owner is present. */
  follow(p) {
    this.anchor.copy(p);
    this.live = true;
  }

  reset() {
    this.hist.length = 0;
  }

  update(now, cam, frustum) {
    const o = this.o;
    const H = this.hist;
    const a = this.anchor;
    // far off or out of view: drop the trail rather than rebuild it
    if (cam && (this.fade * o.opacity < 0.002 || !this.live || cam.distanceToSquared(a) > 180 * 180 || (frustum && !frustum.intersectsSphere(this.bounds.set(a, 6 + o.life * 3))))) {
      if (this.fade * o.opacity < 0.002 || !this.live) H.length = 0;
      else if (this.live) {
        const h0 = H[0];
        if (!h0 || (a.x - h0.x) ** 2 + (a.y - h0.y) ** 2 + (a.z - h0.z) ** 2 > o.minDist * o.minDist) H.unshift({ x: a.x, y: a.y, z: a.z, t: now });
        while (H.length && (H.length > o.max || now - H[H.length - 1].t > o.life)) H.pop();
      }
      this.live = false;
      if (this.mesh.visible) {
        this.mesh.visible = false;
        this.sys.hideSpecks(this.sOff, this.sN);
      }
      return;
    }
    if (this.live) {
      const h0 = H[0];
      const d2 = h0 ? (a.x - h0.x) ** 2 + (a.y - h0.y) ** 2 + (a.z - h0.z) ** 2 : Infinity;
      const due = o.step > 0 && (!h0 || now - h0.t >= o.step);
      if (d2 > o.minDist * o.minDist || due) H.unshift({ x: a.x, y: a.y, z: a.z, t: now });
    }
    while (H.length && (H.length > o.max || now - H[H.length - 1].t > o.life)) H.pop();

    const q = this.q;
    let n = 0;
    if (this.live) {
      q[0] = a.x; q[1] = a.y; q[2] = a.z;
      this.age[0] = 0;
      n = 1;
    }
    const [dx, dy, dz] = o.drift;
    const s = o.seed;
    for (let i = 0; i < H.length && n < this.cap; i++) {
      const h = H[i];
      const age = now - h.t;
      if (n === 1 && i === 0 && age < 1e-4) continue; // same as the live anchor
      const bx = Math.sin(h.z * 0.8 + now * 1.3 + s);
      const by = Math.sin(h.x * 0.7 + now * 1.1 + s * 2);
      const bz = Math.cos(h.x * 0.6 + now * 1.2 + s * 3);
      q[n * 3] = h.x + (dx + bx * o.billow) * age;
      q[n * 3 + 1] = h.y + (dy + by * o.billow * 0.6) * age;
      q[n * 3 + 2] = h.z + (dz + bz * o.billow) * age;
      this.age[n] = age;
      n++;
    }
    this.live = false;

    const vis = this.fade * o.opacity;
    if (n < 2 || vis < 0.002) {
      this.mesh.visible = false;
      this.sys.hideSpecks(this.sOff, this.sN);
      return;
    }
    this.mesh.visible = true;

    const len = this.len;
    len[0] = 0;
    for (let i = 1; i < n; i++) {
      len[i] = len[i - 1] + Math.hypot(q[i * 3] - q[i * 3 - 3], q[i * 3 + 1] - q[i * 3 - 2], q[i * 3 + 2] - q[i * 3 - 1]);
    }
    const total = Math.max(len[n - 1], 1e-4);
    const P = this.pos, UV = this.uv, AL = this.alpha, rows = this.rows;
    T.set(1, 0, 0);
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const tx = q[i0 * 3] - q[i1 * 3], ty = q[i0 * 3 + 1] - q[i1 * 3 + 1], tz = q[i0 * 3 + 2] - q[i1 * 3 + 2];
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 1e-5) T.set(tx / tl, ty / tl, tz / tl);
      N0.crossVectors(T, UP);
      if (N0.lengthSq() < 1e-6) N0.set(1, 0, 0);
      N0.normalize();
      if (o.flat) W.copy(N0);
      else {
        B0.crossVectors(N0, T).normalize();
        const th = o.twist * Math.sin(len[i] * 0.55 - now * 1.7 + s);
        W.copy(N0).multiplyScalar(Math.cos(th)).addScaledVector(B0, Math.sin(th));
      }
      const u = len[i] / total;
      const age = this.age[i];
      const w = o.width * Math.pow(1 - u, 0.55) * Math.min(1, 0.3 + u * 7) * (1 + age * o.spread) * 0.5;
      rows[i * 3] = W.x * w; rows[i * 3 + 1] = W.y * w; rows[i * 3 + 2] = W.z * w;
      const x = q[i * 3], y = q[i * 3 + 1], z = q[i * 3 + 2];
      P[i * 6] = x + W.x * w; P[i * 6 + 1] = y + W.y * w; P[i * 6 + 2] = z + W.z * w;
      P[i * 6 + 3] = x - W.x * w; P[i * 6 + 4] = y - W.y * w; P[i * 6 + 5] = z - W.z * w;
      UV[i * 4] = u; UV[i * 4 + 1] = 0; UV[i * 4 + 2] = u; UV[i * 4 + 3] = 1;
      const fade = (1 - smoothstep(o.life * 0.5, o.life, age)) * this.fade;
      AL[i * 2] = fade; AL[i * 2 + 1] = fade;
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aUv.needsUpdate = true;
    this.geo.attributes.aFade.needsUpdate = true;

    // specks shed along the stroke
    const sys = this.sys;
    for (let k = 0; k < this.sN; k++) {
      const su = this.su[k];
      const f = su * (n - 1);
      const i = Math.min(n - 2, Math.floor(f));
      const t = f - i;
      const sv = this.sv[k] * 2 - 1;
      const j = this.sOff + k;
      const scatter = 1 + su * 1.8;
      for (let c = 0; c < 3; c++) {
        const base = q[i * 3 + c] * (1 - t) + q[i * 3 + 3 + c] * t;
        const wv = rows[i * 3 + c] * (1 - t) + rows[i * 3 + 3 + c] * t;
        sys.sPos[j * 3 + c] = base + wv * sv * scatter + (c === 1 ? su * 0.15 : 0);
      }
      const fade = AL[i * 2] * (1 - t) + AL[i * 2 + 2] * t;
      sys.sAlpha[j] = Math.pow(1 - su, 1.2) * fade * o.opacity * (0.55 + 0.45 * Math.sin(now * 3 + k * 1.7));
      sys.sCol[j * 3] = this.colA.r + (this.colB.r - this.colA.r) * su;
      sys.sCol[j * 3 + 1] = this.colA.g + (this.colB.g - this.colA.g) * su;
      sys.sCol[j * 3 + 2] = this.colA.b + (this.colB.b - this.colA.b) * su;
    }
  }
}

export class RibbonSystem {
  constructor(scene, capacity = 3000) {
    this.scene = scene;
    this.ribbons = [];
    this.cap = capacity;
    this.used = 0;
    this.sPos = new Float32Array(capacity * 3);
    this.sCol = new Float32Array(capacity * 3);
    this.sAlpha = new Float32Array(capacity);
    const r = rng(99);
    const size = Float32Array.from({ length: capacity }, () => 0.04 + r() * 0.05);
    const seed = Float32Array.from({ length: capacity }, () => r());
    this.points = specks({
      attributes: { position: this.sPos, aColor: [this.sCol, 3], aAlpha: this.sAlpha, aSize: size, aSeed: seed },
      decl: 'attribute vec3 aColor; attribute float aAlpha;',
      body: 'col = aColor * (1.2 + 0.3 * uDay); alpha = aAlpha;',
    });
    for (const name of ['position', 'aColor', 'aAlpha']) this.points.geometry.attributes[name].setUsage(THREE.DynamicDrawUsage);
    scene.add(this.points);
  }

  create(opts) {
    const rb = new Ribbon(this, opts);
    this.ribbons.push(rb);
    return rb;
  }

  allocSpecks(k) {
    const off = this.used;
    this.used = Math.min(this.cap, this.used + k);
    return [off, this.used - off];
  }

  hideSpecks(off, n) {
    this.sAlpha.fill(0, off, off + n);
  }

  update(now, cam, frustum) {
    for (const rb of this.ribbons) rb.update(now, cam, frustum);
    const at = this.points.geometry.attributes;
    at.position.needsUpdate = true;
    at.aColor.needsUpdate = true;
    at.aAlpha.needsUpdate = true;
  }
}
