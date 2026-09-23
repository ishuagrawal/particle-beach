// A small toolkit for building solid things out of specks: lines, columns,
// walls with windows, boxes. Every speck carries a normal, an albedo and an
// emissive code, and one shared shader lights them all.
//   aEmit: 0 none · 1 lamp · 2.x window (x = window id) · 3.x neon (x = hue) · 4 red marker light
import { rng, specks, Pack, stippled } from './core.js';
import { VIEW } from './site.js';

const STRUCT_BODY = /* glsl */ `
  if (aLine > 0.5) {
    // lines are laid down finer than needed from afar, in a nested order,
    // and thinned back with distance: fine up close, as before far off
    float keep = clamp(uLineNear / distance(position, cameraPosition), 1.0 / uFine, 1.0);
    float v = clamp((keep - (aLine - 1.0)) * uFine, 0.0, 1.0);
    if (v <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    alpha *= v;
  }
  vec3 n = aNormal;
  float sh = deckShadow(position);
  float sd = clamp((dot(n, uSunDir) + 0.25) / 1.25, 0.0, 1.0) * uSunVis * (1.0 - sh);
  vec3 L = uSunColor * sd + uAmb * (0.5 + 0.35 * n.y) + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonVis * uMoonLit * 0.25;
  col = aAlbedo * L * 0.9 + aAlbedo * pierGlow(position) * 0.22;
  alpha *= ALPHA;
  if (aEmit > 0.5) {
    float on = uLights;
    if (aEmit < 1.5) {
      col += vec3(1.0, 0.76, 0.46) * 2.8 * on;
      alpha += on * 0.35;
      size *= 1.0 + on * 0.9;
    } else if (aEmit < 2.5) {
      float id = fract(aEmit);
      float lit = step(hash11(id * 97.0 + floor(uHour * 0.6 + id * 5.0)), 0.32) * on;
      vec3 warm = mix(vec3(1.0, 0.74, 0.45), vec3(0.8, 0.9, 1.0), step(0.75, hash11(id * 31.0)));
      col = mix(col * (0.6 + 0.4 * uDay) + uAmb * 0.08, warm * 0.85, lit);
      alpha += lit * 0.15;
    } else if (aEmit < 3.5) {
      float h = fract(aEmit) * 6.0;
      vec3 hue = clamp(vec3(abs(h - 3.0) - 1.0, 2.0 - abs(h - 2.0), 2.0 - abs(h - 4.0)), 0.0, 1.0);
      col += hue * 2.4 * on * (0.9 + 0.1 * sin(uTime * 40.0 + aSeed * 9.0));
      alpha += on * 0.3;
    } else {
      float blink = step(0.5, fract(uTime * 0.5 + aSeed * 0.2));
      col += vec3(1.0, 0.12, 0.08) * 3.0 * blink * (0.3 + 0.7 * on);
      alpha += blink * 0.4;
    }
  }`;

// Nested thinning order for a line's specks: every `fine`-th speck is always
// drawn, the ones halfway between join next, and so on.
const rank = (i, fine) => {
  const k = i % fine;
  if (fine === 4) return [0, 2, 1, 3][k];
  if (fine === 2) return k;
  return k;
};

export class Builder {
  /** fine: how many times denser lines are laid than they need to be from afar. */
  constructor(seed = 1, { fine = 1, lineNear = 40 } = {}) {
    this.r = rng(seed);
    this.fine = fine;
    this.lineNear = lineNear;
    this.pk = new Pack({ position: 3, aSize: 1, aSeed: 1, aNormal: 3, aAlbedo: 3, aEmit: 1, aLine: 1 });
    this.boxes = [];
    this.records = []; // stippled boxes
  }

  dot(p, n, albedo, size, emit = 0, line = 0) {
    this.pk.push({ position: p, aSize: size, aSeed: this.r(), aNormal: n, aAlbedo: albedo, aEmit: emit, aLine: line });
  }

  /** Specks every `spacing` metres from a to b (finer when the builder is fine). */
  line(a, b, spacing, n, albedo, size, emit = 0, jitter = 0) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const f = emit ? 1 : this.fine;
    const k = Math.max(1, Math.round(len / spacing)) * f;
    for (let i = 0; i <= k; i++) {
      const t = (i + (jitter ? (this.r() - 0.5) * jitter : 0)) / k;
      this.dot([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], n, albedo, size, emit, f > 1 ? 1 + rank(i, f) / f : 0);
    }
  }

  /** A vertical cylinder of specks: rings every `spacing`, `per` specks a ring. */
  column(x, z, y0, y1, radius, spacing, per, albedo, size, tint) {
    const rings = Math.max(1, Math.round((y1 - y0) / spacing));
    for (let i = 0; i <= rings; i++) {
      const y = y0 + ((y1 - y0) * i) / rings;
      const a0 = this.r() * Math.PI * 2;
      for (let k = 0; k < per; k++) {
        const a = a0 + (k / per) * Math.PI * 2;
        const c = tint ? tint(y) : albedo;
        this.dot([x + Math.cos(a) * radius, y, z + Math.sin(a) * radius], [Math.cos(a), 0, Math.sin(a)], c, size);
      }
    }
  }

  /**
   * A rectangle of specks from corner p spanned by unit vectors u (width w)
   * and v (height h), facing n. `win` lays out windows: { cols, rows, margin }.
   */
  wall(p, u, v, w, h, n, spacing, albedo, size, win = null) {
    const nu = Math.max(1, Math.round(w / spacing));
    const nv = Math.max(1, Math.round(h / spacing));
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const a = (i + (this.r() - 0.5) * 0.6) / nu;
        const b = (j + (this.r() - 0.5) * 0.6) / nv;
        let emit = 0;
        let col = albedo;
        if (win) {
          const cx = a * win.cols;
          const cy = b * win.rows;
          const fx = cx - Math.floor(cx);
          const fy = cy - Math.floor(cy);
          if (fx > win.margin && fx < 1 - win.margin && fy > win.margin * 1.4 && fy < 1 - win.margin && cy < win.rows) {
            const id = Math.floor(cx) * 17.13 + Math.floor(cy) * 3.71 + (win.seed || 0);
            emit = 2 + ((Math.abs(Math.sin(id * 12.9898)) * 43758.5453) % 1) * 0.998;
            col = win.glass || [0.16, 0.2, 0.26];
          }
        }
        this.dot([p[0] + u[0] * a * w + v[0] * b * h, p[1] + u[1] * a * w + v[1] * b * h, p[2] + u[2] * a * w + v[2] * b * h], n, col, size, emit);
      }
    }
  }

  /**
   * Axis-aligned building. By default a stippled solid (its specks drawn in
   * the fragment shader, fine at any distance); `specks: true` lays real
   * specks on four walls and a roof over a dim solid fill instead.
   */
  box(x0, x1, z0, z1, y0, y1, { spacing, albedo, roof, size, win = null, solid = true, specks: asSpecks = false } = {}) {
    if (!asSpecks) {
      this.records.push({ box: [x0, x1, z0, z1, y0, y1], albedo, roof, win: win && { ...win, seed: this.r() * 100 } });
      return;
    }
    // specks sized to the viewer's distance, so far walls still read as stipple
    size ??= 0.1 + Math.hypot((x0 + x1) / 2 - VIEW.x, (z0 + z1) / 2 - VIEW.z) * 0.0022;
    spacing ??= size * 1.7;
    const w = x1 - x0;
    const d = z1 - z0;
    const h = y1 - y0;
    const W = (s) => (win ? { ...win, cols: Math.max(1, Math.round((win.cols || 0.5) * s)), seed: this.r() * 100 } : null);
    this.wall([x0, y0, z0], [1, 0, 0], [0, 1, 0], w, h, [0, 0, -1], spacing, albedo, size, W(w));
    this.wall([x0, y0, z1], [1, 0, 0], [0, 1, 0], w, h, [0, 0, 1], spacing, albedo, size, W(w));
    this.wall([x0, y0, z0], [0, 0, 1], [0, 1, 0], d, h, [-1, 0, 0], spacing, albedo, size, W(d));
    this.wall([x1, y0, z0], [0, 0, 1], [0, 1, 0], d, h, [1, 0, 0], spacing, albedo, size, W(d));
    this.wall([x0, y1, z0], [1, 0, 0], [0, 0, 1], w, d, [0, 1, 0], spacing * 1.3, roof || albedo, size);
    if (solid) this.boxes.push([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, w - 0.3, h - 0.3, d - 0.3]);
  }

  /** The stippled boxes as one mesh. */
  stippled(opts) {
    return stippled(this.records, opts);
  }

  points({ alpha = 0.8, maxPx = 5 } = {}) {
    return specks({ blend: 'normal',
      attributes: this.pk.attributes(),
      uniforms: { uFine: { value: this.fine }, uLineNear: { value: this.lineNear } },
      decl: 'attribute vec3 aNormal; attribute vec3 aAlbedo; attribute float aEmit; attribute float aLine; uniform float uFine; uniform float uLineNear;',
      body: STRUCT_BODY.replace('ALPHA', alpha.toFixed(3)),
      maxPx,
    });
  }
}
