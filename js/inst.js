// Many copies of one speck model (a pose, an umbrella, a towel) drawn as GPU
// instances. The model's specks are shuffled so that any leading share of
// them is an even sample, and every frame each copy is binned by distance:
// near ones draw every speck, farther ones a quarter or a sixteenth of them,
// larger. Copies out of view, or away at this hour, aren't drawn at all.
import * as THREE from 'three';
import { rng, specks, presence } from './core.js';

const BUCKETS = [1, 1 / 4, 1 / 16];
const _sphere = new THREE.Sphere();

export class Instanced {
  /**
   * model: { attrs: { name: [Float32Array, itemSize] }, count }
   * o: { slots: number of vec4 per copy, body, decl, maxPx, near, radius, seed }
   */
  constructor(scene, model, o) {
    this.o = { near: 22, radius: 1, maxPx: 6, ...o };
    this.slots = o.slots;
    this.stride = o.slots * 4;
    this.copies = []; // { x, y, z, win: [a, b] | null, data: Float32Array(stride) }
    // shuffle the model so a prefix is an even sample of it
    const n = model.count;
    const r = rng(o.seed ?? 5);
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const shared = {};
    for (const [name, [arr, size]] of Object.entries(model.attrs)) {
      const out = new Float32Array(n * size);
      order.forEach((src, i) => {
        for (let k = 0; k < size; k++) out[i * size + k] = arr[src * size + k];
      });
      shared[name] = new THREE.BufferAttribute(out, size);
    }
    this.n = n;
    const names = ['iA', 'iB', 'iC', 'iD', 'iE', 'iF'].slice(0, o.slots);
    this.buckets = BUCKETS.map((frac, b) => {
      const geo = new THREE.InstancedBufferGeometry();
      for (const [name, attr] of Object.entries(shared)) geo.setAttribute(name, attr);
      const cap = 64;
      const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(cap * this.stride), this.stride, 1).setUsage(THREE.DynamicDrawUsage);
      names.forEach((nm, k) => geo.setAttribute(nm, new THREE.InterleavedBufferAttribute(ib, 4, k * 4)));
      geo.instanceCount = 0;
      geo.setDrawRange(0, Math.max(1, Math.ceil(n * frac)));
      const pts = specks({
        geometry: geo,
        blend: 'normal',
        uniforms: { uGrow: { value: Math.sqrt(1 / frac) } },
        decl: `${names.map((nm) => `attribute vec4 ${nm};`).join(' ')} uniform float uGrow;\n${o.decl || ''}`,
        body: o.body,
        maxPx: this.o.maxPx,
      });
      pts.visible = false;
      scene.add(pts);
      return { frac, geo, ib, pts, names, count: 0 };
    });
  }

  /** Add a copy: its anchor, its daily window (or null) and its per-copy data. */
  add(x, y, z, win, data) {
    const d = new Float32Array(this.stride);
    d.set(data);
    const c = { x, y, z, win, data: d };
    this.copies.push(c);
    return c;
  }

  update(camera, frustum, hour, alphaSlot = -1) {
    const cam = camera.position;
    const R = this.o.radius;
    const zoom = Math.tan((25 * Math.PI) / 180) / Math.tan((camera.fov * Math.PI) / 360);
    for (const b of this.buckets) b.count = 0;
    for (const c of this.copies) {
      const here = c.win ? presence(hour, c.win[0], c.win[1], 0.35) : 1;
      if (here < 0.01) continue;
      _sphere.center.set(c.x, c.y + R * 0.5, c.z);
      _sphere.radius = R;
      if (!frustum.intersectsSphere(_sphere)) continue;
      const d = Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z) / zoom;
      const k = (this.o.near * R) / Math.max(d, 1e-3);
      const f = k * k;
      const b = this.buckets[f > 0.5 ? 0 : f > 0.1 ? 1 : 2];
      if (alphaSlot >= 0) c.data[alphaSlot] = here;
      if ((b.count + 1) * this.stride > b.ib.array.length) {
        const bigger = new Float32Array(b.ib.array.length * 2);
        bigger.set(b.ib.array);
        const ib = new THREE.InstancedInterleavedBuffer(bigger, this.stride, 1).setUsage(THREE.DynamicDrawUsage);
        b.names.forEach((nm, k2) => b.geo.setAttribute(nm, new THREE.InterleavedBufferAttribute(ib, 4, k2 * 4)));
        b.ib = ib;
      }
      b.ib.array.set(c.data, b.count * this.stride);
      b.count++;
    }
    for (const b of this.buckets) {
      b.geo.instanceCount = b.count;
      b.pts.visible = b.count > 0;
      if (b.count) {
        b.ib.clearUpdateRanges();
        b.ib.addUpdateRange(0, b.count * this.stride);
        b.ib.needsUpdate = true;
      }
    }
  }
}
