// World-anchored level of detail for the big speck surfaces: sand, sea, surf.
// A field is a stack of levels. Each level tiles the ground in square chunks
// that share one random pattern of specks, shifted differently in every
// chunk, and draws only the chunks near the viewer and in view, as
// instances. Each speck keeps itself with the probability that thins its
// level to the density its distance from the camera calls for, so specks
// stay fixed to the world as you walk, and every spot on the beach is as
// fine-grained as the one the scene was first drawn from.
import * as THREE from 'three';
import { rng, specks, QUALITY } from './core.js';
import { shoreZ } from './site.js';

const SHORE_LO = -2.1; // bounds of shoreZ, for chunks laid out along the waterline
const SHORE_HI = 2.1;
const FADE = 0.12; // levels hand over across ±12% of their boundary radius
const box = new THREE.Box3();

/**
 * Density law: specks per m² at horizontal distance d for a camera h metres
 * above the surface. K·h/D³ keeps specks evenly spaced on screen when the
 * ground is seen at a grazing angle; `cap` bounds it under your feet.
 */
const densityAt = (K, cap, d, h) => Math.min(cap, (K * h) / Math.pow(d * d + h * h, 1.5));

export class Field {
  /**
   * o: { name, coords: 'shore' | 'world', x: [x0, x1], d: [d0, d1], y: [y0, y1],
   *      K, cap, hRef, hMin, surfY (GLSL, of fx fz), radii, body, decl, uniforms,
   *      maxPx, salt, when(camera) }
   * In 'shore' coords d is metres up the beach from the waterline (negative
   * offshore) and z = shoreZ(x) + d; in 'world' coords z = d.
   */
  constructor(scene, o) {
    this.o = o;
    const shore = o.coords !== 'world';
    this.zlo = shore ? SHORE_LO : 0;
    this.zhi = shore ? SHORE_HI : 0;
    const q = Math.max(0.35, QUALITY);
    const K = o.K * q;
    const [x0, x1] = o.x;
    const [d0, d1] = o.d;
    const span = d1 - d0;
    const r = rng(o.salt * 131 + 7);
    const prelude = /* glsl */ `
      vec2 fCell = floor((aChunk - uOrigin) / uCell + 0.5);
      vec2 fSh = vec2(hash21(fCell + uSalt), hash21(fCell.yx * 1.37 + uSalt + 11.0));
      vec2 fUV = fract(position.xy + fSh);
      float fx = aChunk.x + fUV.x * uCell.x;
      float fd = aChunk.y + fUV.y * uCell.y;
      float fz = ${shore ? 'shoreZ(fx) + fd' : 'fd'};
      float fSeed = fract(aSeed + fSh.x * 0.7548 + fSh.y * 0.5698);
      float fLod = 0.0;
      float fGrow = 1.0;
      if (fx >= ${x0.toFixed(2)} && fx <= ${x1.toFixed(2)} && fd >= ${d0.toFixed(2)} && fd <= ${d1.toFixed(2)}) {
        float fDh = length(vec2(fx, fz) - cameraPosition.xz);
        float fW = smoothstep(uBand.x, uBand.y, fDh) * (1.0 - smoothstep(uBand.z, uBand.w, fDh));
        float fH = max(cameraPosition.y - (${o.surfY}), ${o.hMin.toFixed(2)});
        float fD2 = fDh * fDh + fH * fH;
        float fRho = min(${K.toFixed(2)} * fH / (fD2 * sqrt(fD2)), ${o.cap.toFixed(2)});
        fLod = smoothstep(-0.06, 0.06, fW * fRho / uRhoL - fract(position.z + fSh.x * 7.13));
        fGrow = sqrt(max(1.0, fRho / uRhoL)) * ${Math.pow(q, -0.4).toFixed(3)};
      }
      if (fLod < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
      #define aSeed fSeed
    `;
    this.levels = [];
    let rin = 0;
    o.radii.forEach((rout, i) => {
      const last = i === o.radii.length - 1;
      const c = i === 0 ? rout / 2 : rout / (rout <= 16 ? 5 : 4); // finer chunks up close, where culling pays most
      const cx = c;
      const cd = Math.min(c, span);
      const rhoL = i === 0 ? o.cap : densityAt(K, o.cap, rin * (1 - FADE), o.hRef);
      const n = Math.max(12, Math.round(rhoL * cx * cd));
      const geo = new THREE.InstancedBufferGeometry();
      const base = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      const size = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        base[k * 3] = r();
        base[k * 3 + 1] = r();
        base[k * 3 + 2] = r(); // keep threshold
        seed[k] = r();
        size[k] = r();
      }
      geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      const capChunks = 192;
      const chunk = new THREE.InstancedBufferAttribute(new Float32Array(capChunks * 2), 2).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aChunk', chunk);
      geo.instanceCount = 0;
      const band = i === 0 ? [-2, -1] : [rin * (1 - FADE), rin * (1 + FADE)];
      const reach = last ? 1e6 : rout * (1 + FADE);
      band.push(last ? 1e9 : rout * (1 - FADE), last ? 1e9 + 1 : reach);
      const pts = specks({
        geometry: geo,
        blend: o.blend ?? 'normal',
        uniforms: {
          ...(o.uniforms || {}),
          uCell: { value: new THREE.Vector2(cx, cd) },
          uOrigin: { value: new THREE.Vector2(0, d0) },
          uBand: { value: new THREE.Vector4(...band) },
          uRhoL: { value: rhoL },
          uSalt: { value: o.salt + i * 3.17 },
        },
        decl: `attribute vec2 aChunk; uniform vec2 uCell; uniform vec2 uOrigin; uniform vec4 uBand; uniform float uRhoL; uniform float uSalt;\n${o.decl || ''}`,
        body: prelude + o.body,
        maxPx: o.maxPx ?? 5,
      });
      pts.visible = false;
      scene.add(pts);
      this.levels.push({ pts, geo, chunk, cx, cd, hole: i === 0 ? -1 : band[0], reach, n, heights: new Map() });
      rin = rout;
    });
  }

  /** Pick the chunks around the camera that are in view. */
  update(camera, frustum) {
    const o = this.o;
    const on = !o.when || o.when(camera);
    const cxp = camera.position.x;
    const czp = camera.position.z;
    const cdp = o.coords === 'world' ? czp : czp - shoreZ(cxp);
    const [x0, x1] = o.x;
    const [d0, d1] = o.d;
    const [y0, y1] = o.y;
    for (const L of this.levels) {
      if (!on) {
        L.pts.visible = false;
        continue;
      }
      const R = L.reach;
      const ia = Math.floor(Math.max(x0, cxp - R) / L.cx);
      const ib = Math.floor(Math.min(x1, cxp + R) / L.cx);
      const ja = Math.floor((Math.max(d0, cdp - R - 2.2) - d0) / L.cd);
      const jb = Math.floor((Math.min(d1, cdp + R + 2.2) - d0) / L.cd);
      let n = 0;
      let arr = L.chunk.array;
      for (let i = ia; i <= ib; i++) {
        const X0 = i * L.cx;
        const X1 = X0 + L.cx;
        const dx = Math.max(X0 - cxp, 0, cxp - X1);
        const fx = Math.max(Math.abs(X0 - cxp), Math.abs(X1 - cxp));
        for (let j = ja; j <= jb; j++) {
          const D0 = d0 + j * L.cd;
          const Z0 = D0 + this.zlo;
          const Z1 = D0 + L.cd + this.zhi;
          const dz = Math.max(Z0 - czp, 0, czp - Z1);
          if (dx * dx + dz * dz > R * R) continue;
          const fz = Math.max(Math.abs(Z0 - czp), Math.abs(Z1 - czp));
          if (fx * fx + fz * fz < L.hole * L.hole) continue;
          if (o.yAt) {
            // the surface's own height over this chunk, sampled at its corners and middle, once
            const key = i * 100003 + j;
            let span = L.heights.get(key);
            if (!span) {
              let lo = Infinity;
              let hi = -Infinity;
              for (const [sx, sz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1], [(X0 + X1) / 2, (Z0 + Z1) / 2]]) {
                const h = o.yAt(sx, sz);
                lo = Math.min(lo, h);
                hi = Math.max(hi, h);
              }
              span = [lo, hi];
              L.heights.set(key, span);
            }
            box.min.set(X0, Math.max(y0, span[0] - 0.3), Z0);
            box.max.set(X1, Math.min(y1, span[1] + 0.35), Z1);
          } else {
            box.min.set(X0, y0, Z0);
            box.max.set(X1, y1, Z1);
          }
          if (!frustum.intersectsBox(box)) continue;
          if (n * 2 >= arr.length) {
            // grow the instance buffer
            const bigger = new THREE.InstancedBufferAttribute(new Float32Array(arr.length * 2), 2).setUsage(THREE.DynamicDrawUsage);
            bigger.array.set(arr);
            L.geo.setAttribute('aChunk', bigger);
            L.chunk = bigger;
            arr = bigger.array;
          }
          arr[n * 2] = X0;
          arr[n * 2 + 1] = D0;
          n++;
        }
      }
      L.geo.instanceCount = n;
      L.pts.visible = n > 0;
      if (n > 0) {
        L.chunk.clearUpdateRanges();
        L.chunk.addUpdateRange(0, n * 2);
        L.chunk.needsUpdate = true;
      }
    }
  }

  /** Specks the GPU walks through this frame, for tuning. */
  stats() {
    return this.levels.map((L) => ({ n: L.n, chunks: L.geo.instanceCount, verts: L.n * L.geo.instanceCount }));
  }

  /** Roughly how many specks survive the thinning this frame (sampled at chunk centres). */
  kept(camera) {
    const o = this.o;
    const q = Math.max(0.35, QUALITY);
    let sum = 0;
    for (const L of this.levels) {
      if (!L.pts.visible) continue;
      const u = L.pts.material.uniforms;
      const [a, b, c, d] = u.uBand.value.toArray();
      const rhoL = u.uRhoL.value;
      const arr = L.chunk.array;
      for (let i = 0; i < L.geo.instanceCount; i++) {
        for (const [fu, fv] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const x = arr[i * 2] + fu * L.cx;
          const dd = arr[i * 2 + 1] + fv * L.cd;
          if (x < o.x[0] || x > o.x[1] || dd < o.d[0] || dd > o.d[1]) continue;
          const z = o.coords === 'world' ? dd : shoreZ(x) + dd;
          const dh = Math.hypot(x - camera.position.x, z - camera.position.z);
          const ss = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
          const w = (b > 0 ? ss(a, b, dh) : 1) * (1 - ss(c, d, dh));
          const h = Math.max(camera.position.y - (o.yAt ? o.yAt(x, z) : 0), o.hMin);
          const rho = densityAt(o.K * q, o.cap, dh, h);
          sum += Math.min(1, (w * rho) / rhoL) * L.n * 0.25;
        }
      }
    }
    return Math.round(sum);
  }

  /** Total specks processed this frame. */
  verts() {
    return this.levels.reduce((s, L) => s + (L.pts.visible ? L.n * L.geo.instanceCount : 0), 0);
  }
}
