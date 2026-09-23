// Beach furniture as speck generators. Each maker calls add(position, normal,
// color, size) in world space; the caller decides which layer it lands in.

export const STRIPES = [
  [[0.92, 0.22, 0.22], [0.97, 0.95, 0.9]],
  [[0.12, 0.42, 0.82], [0.97, 0.95, 0.9]],
  [[0.98, 0.78, 0.12], [0.95, 0.36, 0.2]],
  [[0.1, 0.62, 0.62], [0.98, 0.92, 0.72]],
  [[0.95, 0.45, 0.62], [0.98, 0.9, 0.3]],
  [[0.28, 0.72, 0.36], [0.97, 0.95, 0.9]],
];

/** A beach umbrella: tilted pole and an eight-panel striped canopy. */
export function umbrella(add, r, x, y, z, { tilt = 0.12, dir = 0, radius = 1.1, height = 2.1, colors, dense = 1 }) {
  const tx = Math.sin(dir) * tilt;
  const tz = Math.cos(dir) * tilt;
  const top = [x + tx * height, y + height, z + tz * height];
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    add([x + tx * height * t, y + height * t, z + tz * height * t], [0, 0, -1], [0.85, 0.85, 0.82], 0.045);
  }
  const n = Math.round(560 * dense);
  const size = 0.075 / Math.sqrt(dense);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * radius;
    const panel = Math.floor((a / (Math.PI * 2)) * 8) % 2;
    const droop = (rr / radius) ** 1.5 * 0.4;
    const scallop = rr > radius * 0.92 ? Math.abs(Math.sin(a * 4)) * 0.06 : 0;
    add([top[0] + Math.cos(a) * rr, top[1] - droop + 0.05 - scallop, top[2] + Math.sin(a) * rr], [Math.cos(a) * 0.35, 0.93, Math.sin(a) * 0.35], colors[panel], size);
  }
  return top;
}

export const TOWELS = [
  [[0.9, 0.3, 0.45], [0.98, 0.72, 0.2]],
  [[0.15, 0.45, 0.8], [0.3, 0.75, 0.85]],
  [[0.95, 0.55, 0.2], [0.85, 0.2, 0.25]],
  [[0.3, 0.65, 0.4], [0.95, 0.85, 0.35]],
  [[0.55, 0.3, 0.7], [0.95, 0.5, 0.65]],
  [[0.12, 0.2, 0.4], [0.85, 0.85, 0.8]],
];

/** A towel lying flat, in two-colour stripes. */
export function towel(add, r, x, y, z, heading, colors) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  for (let i = 0; i < 180; i++) {
    const u = (r() - 0.5) * 0.9;
    const v = (r() - 0.5) * 1.75;
    const stripe = Math.floor((v + 0.875) / 0.25) % 2;
    add([x + u * c + v * s, y + 0.02, z - u * s + v * c], [0, 1, 0], colors[stripe], 0.055);
  }
}

/** A low sling chair facing `heading`. */
export function chair(add, r, x, y, z, heading, color) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const sx = -fz, sz = fx;
  const P = (a, b, c) => [x + sx * a + fx * c, y + b, z + sz * a + fz * c];
  for (let i = 0; i < 70; i++) {
    const a = (r() - 0.5) * 0.5;
    const t = r();
    const seat = t < 0.5;
    const b = seat ? 0.25 : 0.25 + (t - 0.5) * 1.3;
    const c = seat ? 0.15 - t * 0.8 : -0.25 - (t - 0.5) * 0.35;
    add(P(a, b, c), [fx * 0.3, 0.9, fz * 0.3], color, 0.05);
  }
  for (const side of [-0.27, 0.27]) for (let i = 0; i < 10; i++) add(P(side, 0.05 + i * 0.07, 0.1 - i * 0.04), [0, 1, 0], [0.8, 0.8, 0.78], 0.035);
}

export function cooler(add, r, x, y, z, color) {
  for (let i = 0; i < 45; i++) {
    const face = r();
    const p = face < 0.3 ? [x + (r() - 0.5) * 0.55, y + 0.36, z + (r() - 0.5) * 0.36] : [x + (r() < 0.5 ? -0.27 : 0.27), y + r() * 0.36, z + (r() - 0.5) * 0.36];
    add(p, face < 0.3 ? [0, 1, 0] : [1, 0, 0], face < 0.3 ? [0.95, 0.95, 0.93] : color, 0.05);
  }
}

/** A surfboard standing nose-up in the sand. */
export function surfboardUpright(add, r, x, y, z, heading, color) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  for (let i = 0; i < 90; i++) {
    const v = r();
    const w = 0.26 * Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2)) * (r() * 2 - 1);
    const stringer = Math.abs(w) < 0.015;
    add([x + w * c, y + v * 2.1, z - w * s], [s, 0, c], stringer ? [0.5, 0.4, 0.3] : color, 0.05);
  }
}

export function sandcastle(add, r, x, y, z, sand) {
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * 0.7;
    add([x + Math.cos(a) * rr, y + (0.7 - rr) * 0.35, z + Math.sin(a) * rr], [Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5], sand, 0.05);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const cx = x + Math.cos(a) * 0.38;
    const cz = z + Math.sin(a) * 0.38;
    for (let i = 0; i < 22; i++) {
      const b = r() * Math.PI * 2;
      add([cx + Math.cos(b) * 0.1, y + 0.18 + r() * 0.26, cz + Math.sin(b) * 0.1], [Math.cos(b), 0, Math.sin(b)], sand, 0.04);
    }
  }
}

/**
 * An LA County lifeguard tower: a pale blue hut on stilts with windows to the
 * sea, a deck, a ramp down to the sand and a red rescue can on the rail.
 * Returns the hut's box for a solid fill.
 */
export function lifeguardTower(add, r, x, y, z) {
  const blue = [0.56, 0.74, 0.86];
  const trim = [0.95, 0.95, 0.92];
  const glass = [0.14, 0.18, 0.22];
  const legH = 1.6;
  const y0 = y + legH;
  const h = 2.3;
  const w = 3.2;
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    for (let i = 0; i < 14; i++) add([x + dx, y + (i / 14) * legH, z + dz], [0, 0, -1], [0.7, 0.7, 0.68], 0.06);
  }
  const wall = (u0, v0, ux, uz, n, windows) => {
    for (let i = 0; i < 170; i++) {
      const a = r();
      const b = r();
      const isWin = windows && b > 0.4 && b < 0.85 && (a * 3) % 1 > 0.12 && (a * 3) % 1 < 0.88;
      const trimBand = b > 0.93 || b < 0.05;
      add([u0 + ux * a * w, y0 + b * h, v0 + uz * a * w], n, isWin ? glass : trimBand ? trim : blue, 0.06);
    }
  };
  wall(x - w / 2, z - w / 2, 1, 0, [0, 0, -1], true); // sea side
  wall(x - w / 2, z - w / 2, 0, 1, [-1, 0, 0], true);
  wall(x + w / 2, z - w / 2, 0, 1, [1, 0, 0], true);
  wall(x - w / 2, z + w / 2, 1, 0, [0, 0, 1], false);
  for (let i = 0; i < 160; i++) add([x + (r() - 0.5) * (w + 0.6), y0 + h + 0.12, z + (r() - 0.5) * (w + 0.6)], [0, 1, 0], trim, 0.06);
  // deck in front, rail with the rescue can, ramp to the sand behind
  for (let i = 0; i < 60; i++) add([x + (r() - 0.5) * w, y0, z - w / 2 - r() * 1.1], [0, 1, 0], [0.7, 0.66, 0.6], 0.05);
  for (let i = 0; i < 30; i++) add([x - w / 2 + (i / 30) * w, y0 + 0.95, z - w / 2 - 1.1], [0, 0, -1], trim, 0.04);
  for (let i = 0; i < 12; i++) add([x + 0.9 + (r() - 0.5) * 0.12, y0 + 0.45 + r() * 0.35, z - w / 2 - 1.15], [0, 0, -1], [0.9, 0.12, 0.1], 0.05);
  for (let i = 0; i < 90; i++) {
    const t = r();
    add([x + (r() - 0.5) * 1.1, y0 - t * legH, z + w / 2 + t * 4.2], [0, 0.9, 0.4], [0.72, 0.68, 0.6], 0.05);
  }
  return [x, y0 + h / 2, z, w - 0.2, h - 0.1, w - 0.2];
}

/** A volleyball net across the court, poles either end. */
export function volleyNet(add, r, x, y, z, width = 8.4) {
  for (const side of [-1, 1]) for (let i = 0; i < 26; i++) add([x + (side * width) / 2, y + (i / 26) * 2.5, z], [0, 0, -1], [0.85, 0.85, 0.82], 0.05);
  for (let i = 0; i < 260; i++) {
    const u = r() - 0.5;
    const band = r();
    const yy = band < 0.25 ? 2.43 : 1.55 + r() * 0.85;
    const mesh = band < 0.25 || ((u * 60) % 1 < 0.2) || (((yy - 1.55) * 10) % 1 < 0.2);
    if (mesh) add([x + u * width, y + yy, z], [0, 0, -1], band < 0.25 ? [0.95, 0.95, 0.93] : [0.2, 0.2, 0.22], 0.035);
  }
}

/** Court boundary tape on the sand: a rectangle of blue specks. */
export function courtLines(add, x, y, z, w, l) {
  const edge = (x0, z0, x1, z1) => {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.12);
    for (let i = 0; i <= n; i++) add([x0 + ((x1 - x0) * i) / n, y + 0.02, z0 + ((z1 - z0) * i) / n], [0, 1, 0], [0.15, 0.4, 0.85], 0.045);
  };
  edge(x - w / 2, z - l / 2, x + w / 2, z - l / 2);
  edge(x + w / 2, z - l / 2, x + w / 2, z + l / 2);
  edge(x + w / 2, z + l / 2, x - w / 2, z + l / 2);
  edge(x - w / 2, z + l / 2, x - w / 2, z - l / 2);
}

/** Gymnastic rings on a tall frame, as at the Original Muscle Beach. */
export function ringsFrame(add, x, y, z) {
  const steel = [0.75, 0.75, 0.74];
  for (const side of [-2.4, 2.4]) {
    for (let i = 0; i < 50; i++) add([x + side, y + (i / 50) * 5.2, z], [1, 0, 0], steel, 0.06);
  }
  for (let i = 0; i < 60; i++) add([x - 2.4 + (i / 60) * 4.8, y + 5.2, z], [0, 1, 0], steel, 0.06);
  for (const rx of [-1.2, -0.7, 0.7, 1.2]) {
    for (let i = 0; i < 20; i++) add([x + rx, y + 5.2 - (i / 20) * 2.6, z], [1, 0, 0], [0.5, 0.45, 0.4], 0.03);
  }
  for (let i = 0; i < 40; i++) add([x + 4 + (i / 40) * 3, y + 1.6, z + 0.25], [0, 1, 0], steel, 0.05);
  for (let i = 0; i < 40; i++) add([x + 4 + (i / 40) * 3, y + 1.6, z - 0.25], [0, 1, 0], steel, 0.05);
}

/** A lifeguard pickup with a light bar. */
export function truck(add, r, x, y, z, heading) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const sx = -fz, sz = fx;
  const P = (a, b, c) => [x + sx * a + fx * c, y + b, z + sz * a + fz * c];
  for (let i = 0; i < 420; i++) {
    const c = (r() - 0.5) * 5.2;
    const cab = c > 0.2 && c < 2.0;
    const top = cab ? 1.85 : 1.1;
    const a = (r() - 0.5) * 1.9;
    const b = 0.45 + r() * (top - 0.45);
    const side = r() < 0.5;
    const p = side ? P(Math.sign(a) * 0.95, b, c) : P(a, top, c);
    const win = cab && b > 1.25 && side;
    add(p, side ? [sx * Math.sign(a), 0, sz * Math.sign(a)] : [0, 1, 0], win ? [0.15, 0.18, 0.22] : [0.94, 0.94, 0.92], 0.06);
  }
  for (const c of [-1.6, 1.6]) for (const a of [-0.95, 0.95]) for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    add(P(a, 0.38 + Math.sin(t) * 0.36, c + Math.cos(t) * 0.36), [sx, 0, sz], [0.08, 0.08, 0.09], 0.05);
  }
  for (let i = 0; i < 14; i++) add(P(-0.6 + (i / 14) * 1.2, 1.95, 1.1), [0, 1, 0], i % 2 ? [0.95, 0.15, 0.1] : [0.95, 0.75, 0.1], 0.05);
}
