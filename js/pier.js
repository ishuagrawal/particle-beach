// Santa Monica Pier: bents of pilings with cross-bracing, the deck's edge
// beams and railings, lamp posts, the shops and the restaurant at the far end,
// the Looff Hippodrome at the landward end, the bridge up to Ocean Avenue and
// the "Santa Monica Yacht Harbor" arch sign at its top.
import { solid, boxGeometry, stippled, QUALITY } from './core.js';
import { PIER, STAIRS, sandHeight } from './site.js';
import { Builder } from './build.js';
import { Field } from './field.js';
import { textPoints } from './text.js';

const WOOD = [0.36, 0.31, 0.26];
const BEAM = [0.42, 0.37, 0.31];
const RAIL = [0.78, 0.77, 0.72];
const POST = [0.16, 0.18, 0.17];
const GLASS = [0.82, 0.8, 0.72];

const { x: PX, half: H, land: LAND, end: END, deck: DECK, wide: WIDE } = PIER;
const inWide = (z) => z >= WIDE.z0 && z <= WIDE.z1;

function pileTint(y) {
  const t = Math.min(1, Math.max(0, (y - 0.6) / 1.8)); // darker, greener in the tide zone
  return [0.2 + 0.16 * t, 0.21 + 0.1 * t, 0.17 + 0.09 * t];
}

function substructure(b, piles) {
  const step = QUALITY < 1 ? 0.4 : 0.3;
  for (let z = LAND - 3; z >= END + 2; z -= 6) {
    const xs = [];
    for (let x = PX - H + 1; x <= PX + H - 1 + 1e-6; x += 4.5) xs.push(x);
    if (inWide(z)) for (let x = WIDE.south + 1; x < PX - H + 0.5; x += 4.5) xs.push(x);
    xs.sort((a, b2) => a - b2);
    const ground = (x) => Math.max(sandHeight(x, z), -1.4);
    for (const x of xs) {
      b.column(x, z, ground(x), DECK - 0.6, 0.2, step, 3, WOOD, 0.13, pileTint);
      piles.push([x, (ground(x) + DECK) / 2 - 0.3, z, 0.34, DECK - 0.6 - ground(x), 0.34]);
    }
    // X-bracing between neighbouring piles, above the waterline
    for (let i = 0; i < xs.length - 1; i++) {
      const lo = Math.max(ground(xs[i]) + 0.8, 1.4);
      const hi = DECK - 1.1;
      if (hi - lo < 1.5) continue;
      b.line([xs[i], lo, z], [xs[i + 1], hi, z], 0.35, [0, 0, 1], WOOD, 0.1);
      b.line([xs[i], hi, z], [xs[i + 1], lo, z], 0.35, [0, 0, 1], WOOD, 0.1);
    }
    b.line([xs[0] - 0.4, DECK - 0.75, z], [xs[xs.length - 1] + 0.4, DECK - 0.75, z], 0.22, [0, -1, 0], BEAM, 0.12);
  }
}

function edges(b) {
  // deck edge beams and railings along the south edge (with the Pacific Park bulge) and the north edge,
  // with a gap in the south rail where the stairs from the beach come up
  const south = [
    [[PX - H, LAND], [PX - H, STAIRS.landing]],
    [[PX - H, STAIRS.landing], [PX - H, STAIRS.z1], false],
    [[PX - H, STAIRS.z1], [PX - H, WIDE.z1]],
    [[PX - H, WIDE.z1], [WIDE.south, WIDE.z1]],
    [[WIDE.south, WIDE.z1], [WIDE.south, WIDE.z0]],
    [[WIDE.south, WIDE.z0], [PX - H, WIDE.z0]],
    [[PX - H, WIDE.z0], [PX - H, END]],
    [[PX - H, END], [PX + H, END]],
    [[PX + H, END], [PX + H, LAND]],
  ];
  for (const [[x0, z0], [x1, z1], rails = true] of south) {
    const nx = z0 === z1 ? 0 : x0 <= PX ? -1 : 1;
    const nz = z0 === z1 ? (z0 === END ? -1 : z0 === WIDE.z0 ? -1 : 1) : 0;
    const n = [nx, 0, nz];
    for (const dy of [-0.55, -0.3, -0.05]) b.line([x0, DECK + dy, z0], [x1, DECK + dy, z1], 0.16, n, BEAM, 0.12);
    if (!rails) continue;
    b.line([x0, DECK + 1.1, z0], [x1, DECK + 1.1, z1], 0.18, n, RAIL, 0.08);
    b.line([x0, DECK + 0.55, z0], [x1, DECK + 0.55, z1], 0.24, n, RAIL, 0.06);
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s <= len; s += 2.4) {
      const t = s / len;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      b.line([x, DECK, z], [x, DECK + 1.1, z], 0.14, n, RAIL, 0.06);
    }
    // lamp posts
    const lampStep = z0 === z1 ? 10 : 12;
    for (let s = 5; s < len; s += lampStep) {
      const t = s / len;
      const x = x0 + (x1 - x0) * t - nx * 0.6;
      const z = z0 + (z1 - z0) * t - nz * 0.6;
      b.line([x, DECK, z], [x, DECK + 4.0, z], 0.25, n, POST, 0.09);
      for (let k = 0; k < 9; k++) b.dot([x + (b.r() - 0.5) * 0.35, DECK + 4.2 + (b.r() - 0.5) * 0.35, z + (b.r() - 0.5) * 0.35], [0, 1, 0], GLASS, 0.16, 1);
    }
  }
}

// Stairs from the sand to the deck: open treads on two stringers, handrails,
// and a landing at deck height by the gap in the rail.
function stairs(b, solids) {
  const { x0, x1, z0, z1, landing } = STAIRS;
  const base = sandHeight((x0 + x1) / 2, z0);
  const n = Math.round((DECK - base) / 0.19);
  const run = (z1 - z0) / n;
  const rise = (DECK - base) / n;
  const TREAD = [0.52, 0.46, 0.38];
  for (let i = 0; i < n; i++) {
    const za = z0 + i * run;
    const y = base + (i + 1) * rise;
    solids.push([(x0 + x1) / 2, y - 0.04, za + run / 2, x1 - x0, 0.08, run * 0.92]);
    for (let k = 0; k < 26; k++) b.dot([x0 + b.r() * (x1 - x0), y + 0.01, za + b.r() * run * 0.9], [0, 1, 0], TREAD, 0.05);
    b.line([x0 + 0.05, y + 0.005, za + run * 0.92], [x1 - 0.05, y + 0.005, za + run * 0.92], 0.06, [0, 0, 1], [0.3, 0.26, 0.22], 0.04);
  }
  solids.push([(x0 + x1) / 2, DECK - 0.1, (z1 + landing) / 2, x1 - x0 + 0.4, 0.2, landing - z1]);
  for (let k = 0; k < 160; k++) b.dot([x0 + b.r() * (PX - H - x0), DECK + 0.01, z1 + b.r() * (landing - z1)], [0, 1, 0], TREAD, 0.05);
  for (const x of [x0, x1]) {
    const n2 = [x < PX - H - 2 ? -1 : 1, 0, 0];
    b.line([x, base - 0.2, z0], [x, DECK - 0.2, z1], 0.1, n2, BEAM, 0.1);
    b.line([x, base - 0.45, z0], [x, DECK - 0.45, z1], 0.1, n2, BEAM, 0.1);
    b.line([x, base + 0.95, z0 - 0.2], [x, DECK + 0.95, z1], 0.14, n2, RAIL, 0.06);
    for (let s = 0; s <= 1.0001; s += 1 / 8) b.line([x, base + (DECK - base) * s, z0 + (z1 - z0) * s], [x, base + (DECK - base) * s + 0.95, z0 + (z1 - z0) * s], 0.12, n2, RAIL, 0.05);
  }
  // the landing's outer rail and its posts down to the sand
  b.line([x0, DECK + 1.1, z1], [x0, DECK + 1.1, landing], 0.16, [-1, 0, 0], RAIL, 0.07);
  b.line([x0, DECK + 1.1, landing], [PX - H, DECK + 1.1, landing], 0.16, [0, 0, 1], RAIL, 0.07);
  for (const [x, z] of [[x0, z1], [x0, landing], [x1, z1], [x1, landing]]) b.column(x, z, sandHeight(x, z), DECK - 0.2, 0.12, 0.3, 3, WOOD, 0.1, pileTint);
}

function buildings(b) {
  const WIN = { cols: 0.35, rows: 2, margin: 0.18 };
  // the restaurant at the far end, with walkways round it to the end rail
  b.box(PX - 6.5, PX + 6.5, END + 8, END + 30, DECK, DECK + 7.5, { albedo: [0.86, 0.82, 0.74], roof: [0.5, 0.45, 0.4], win: WIN });
  b.box(PX - 4, PX + 4, END + 9, END + 17, DECK + 7.5, DECK + 9.5, { albedo: [0.84, 0.8, 0.7], win: { cols: 0.5, rows: 1, margin: 0.2 } });
  // bait shop and harbour office midway
  b.box(PX + 2, PX + H - 0.5, -176, -160, DECK, DECK + 4.2, { albedo: [0.62, 0.72, 0.78], roof: [0.4, 0.4, 0.42], win: { cols: 0.4, rows: 1, margin: 0.22 } });
  b.box(PX - H + 0.5, PX - 4, -236, -226, DECK, DECK + 3.6, { albedo: [0.9, 0.86, 0.72], win: { cols: 0.4, rows: 1, margin: 0.22 } });
  // arcades and restaurants along the north side of the wide section
  b.box(PX + 1, PX + H - 0.5, -50, -22, DECK, DECK + 6, { albedo: [0.9, 0.78, 0.6], roof: [0.55, 0.3, 0.25], win: WIN });
  b.box(PX + 1, PX + H - 0.5, -16, 22, DECK, DECK + 7.5, { albedo: [0.72, 0.84, 0.9], roof: [0.4, 0.45, 0.5], win: WIN });
  b.box(PX + 1, PX + H - 0.5, 28, 64, DECK, DECK + 5.5, { albedo: [0.92, 0.9, 0.84], roof: [0.5, 0.5, 0.48], win: WIN });
  // Pacific Park's low ride buildings and booths toward land
  b.box(WIDE.south + 2, WIDE.south + 16, 52, 68, DECK, DECK + 4, { albedo: [0.95, 0.72, 0.3], roof: [0.3, 0.55, 0.7], win: { cols: 0.3, rows: 1, margin: 0.25 } });
  // the Looff Hippodrome: two storeys, hipped roof, corner turrets, arched windows
  const hx0 = PX + 2;
  const hx1 = PX + 24;
  const hz0 = 100;
  const hz1 = 138;
  b.box(hx0, hx1, hz0, hz1, DECK, DECK + 10, { albedo: [0.9, 0.84, 0.72], roof: [0.52, 0.28, 0.22], win: { cols: 0.25, rows: 2, margin: 0.22, glass: [0.3, 0.26, 0.2] } });
  const roofH = 4.5;
  for (let i = 0; i < 1800 * QUALITY; i++) {
    const u = b.r();
    const v = b.r();
    const x = hx0 + u * (hx1 - hx0);
    const z = hz0 + v * (hz1 - hz0);
    const edge = Math.min(u, 1 - u, v, 1 - v) * 2;
    b.dot([x, DECK + 10 + edge * roofH, z], [0, 0.8, (v < 0.5 ? -1 : 1) * 0.6], [0.52, 0.28, 0.22], 0.14);
  }
  for (const [x, z] of [[hx0, hz0], [hx1, hz0], [hx0, hz1], [hx1, hz1]]) {
    b.column(x, z, DECK + 10, DECK + 14, 1.2, 0.3, 8, [0.9, 0.84, 0.72], 0.12);
    for (let k = 0; k < 40; k++) {
      const a = b.r() * Math.PI * 2;
      const rr = Math.sqrt(b.r()) * 1.4;
      b.dot([x + Math.cos(a) * rr, DECK + 14 + (1.4 - rr) * 1.2, z + Math.sin(a) * rr], [0, 1, 0], [0.52, 0.28, 0.22], 0.12);
    }
  }
}

function bridge(b) {
  // the bridge rising from the pier to Ocean Avenue, and the arch sign at its top
  const z0 = LAND;
  const z1 = 232;
  const y1 = 18;
  const yAt = (z) => DECK + ((y1 - DECK) * (z - z0)) / (z1 - z0);
  for (const side of [-1, 1]) {
    const x = PX + side * 6;
    const n = [side, 0, 0];
    for (const dy of [-0.5, -0.2]) b.line([x, yAt(z0) + dy, z0], [x, yAt(z1) + dy, z1], 0.18, n, BEAM, 0.12);
    b.line([x, yAt(z0) + 1.1, z0], [x, yAt(z1) + 1.1, z1], 0.2, n, RAIL, 0.08);
    for (let z = z0 + 6; z < z1; z += 12) {
      b.line([x, yAt(z), z], [x, yAt(z) + 4, z], 0.25, n, POST, 0.09);
      for (let k = 0; k < 8; k++) b.dot([x + (b.r() - 0.5) * 0.3, yAt(z) + 4.2, z + (b.r() - 0.5) * 0.3], [0, 1, 0], GLASS, 0.16, 1);
    }
  }
  for (let z = z0 + 10; z < z1 - 20; z += 10) {
    const g = Math.max(sandHeight(PX, z), 2.4);
    b.column(PX - 3, z, g, yAt(z) - 0.6, 0.35, 0.35, 4, [0.62, 0.6, 0.56], 0.12);
    b.column(PX + 3, z, g, yAt(z) - 0.6, 0.35, 0.35, 4, [0.62, 0.6, 0.56], 0.12);
  }
  // the sign: an arch over the roadway carrying three lines of lettering
  const zs = 228;
  const base = y1;
  const span = 12;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const x = PX - span / 2 + span * t;
    const y = base + 5.6 + Math.sin(Math.PI * t) * 1.8;
    b.dot([x, y, zs], [0, 0, -1], [0.18, 0.26, 0.42], 0.16, 3 + 0.62);
    b.dot([x, y - 3.6, zs], [0, 0, -1], [0.18, 0.26, 0.42], 0.14);
  }
  for (const side of [-1, 1]) b.line([PX + (side * span) / 2, base, zs], [PX + (side * span) / 2, base + 5.6, zs], 0.2, [0, 0, -1], [0.2, 0.26, 0.4], 0.14);
  const letters = textPoints(['SANTA MONICA', { text: 'YACHT HARBOR', scale: 0.8 }, { text: 'SPORT FISHING · BOATING · CAFES', scale: 0.52 }], { height: 1.25, step: 3 });
  // read from the sea side (looking toward +z), so world +x is the reader's left
  for (const [x, y, line] of letters) {
    const arch = Math.sin(Math.PI * (0.5 + x / span)) * 1.4 * (line === 0 ? 1 : 0.2);
    b.dot([PX - x, base + 1.2 + y * 0.85 + arch, zs - 0.05], [0, 0, -1], [0.96, 0.94, 0.86], 0.07, 3 + (line === 0 ? 0.52 : 0.08));
  }
}

export function createPier(scene) {
  const b = new Builder(101, { fine: 4, lineNear: 36 });
  const piles = [];
  const steps = [];
  substructure(b, piles);
  edges(b);
  buildings(b);
  bridge(b);
  stairs(b, steps);
  scene.add(b.points({ alpha: 0.8, maxPx: 18 }));

  // the deck slab (narrow pier and the Pacific Park bulge) as a dim fill, its
  // boards drawn by a speck field when you are up on it; the buildings
  // stippled; the pilings and the stairs as dim fills
  const slabs = [
    [PX, DECK - 0.4, (LAND + END) / 2, H * 2, 0.8, LAND - END],
    [(WIDE.south + PX - H) / 2, DECK - 0.4, (WIDE.z0 + WIDE.z1) / 2, PX - H - WIDE.south, 0.8, WIDE.z1 - WIDE.z0],
  ];
  scene.add(solid(boxGeometry(slabs), { albedo: [0.46, 0.41, 0.35], tone: 0.42 }));
  const boards = new Field(scene, {
    name: 'deck',
    coords: 'world',
    x: [WIDE.south, PX + H],
    d: [END, LAND],
    y: [DECK - 0.1, DECK + 0.1],
    K: 87800,
    cap: 1100,
    hRef: 1.65,
    hMin: 0.8,
    surfY: 'PIER_DECK',
    radii: [2, 2.8, 4, 5.6, 8, 11.3, 16, 22.6, 32, 45, 64, 96, 144, 216, 324, 500],
    salt: 61,
    maxPx: 6,
    when: (camera) => camera.position.y > DECK + 0.4,
    body: /* glsl */ `
      if (!underDeck(vec2(fx, fz))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
      pos = vec3(fx, PIER_DECK + 0.01, fz);
      float camD = distance(pos, cameraPosition);
      // boards run across the pier, about 16 cm wide, weathered unevenly
      float board = floor(fz / 0.16);
      float seam = smoothstep(0.0, 0.06, fract(fz / 0.16)) * (1.0 - smoothstep(0.94, 1.0, fract(fz / 0.16)));
      float butt = step(0.03, fract(fx / (3.6 + hash11(board) * 2.4) + hash11(board * 3.1)));
      vec3 albedo = vec3(0.5, 0.45, 0.39) * (0.78 + 0.36 * hash11(board * 1.73)) * (0.5 + 0.5 * seam * butt) * (0.85 + 0.3 * hash11(aSeed * 7.0));
      vec3 n = vec3(0.0, 1.0, 0.0);
      float sd = clamp(uSunDir.y, 0.0, 1.0) * uSunVis;
      vec3 light = uSunColor * sd + uAmb * 0.85 + uMoonColor * max(uMoonDir.y, 0.0) * uMoonVis * uMoonLit * 0.7;
      col = albedo * light * 0.62 + albedo * pierGlow(pos) * 0.8;
      alpha = 0.7 * fLod;
      size = (0.012 + camD * 0.0031) * (0.85 + 0.3 * aSize) * fGrow;`,
  });
  scene.add(b.stippled({ tone: 0.42 }));
  scene.add(stippled(piles.map(([x, y, z, sx, sy, sz]) => ({ box: [x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2, y - sy / 2, y + sy / 2], albedo: [0.34, 0.31, 0.26] })), { tone: 0.42 }));
  scene.add(solid(boxGeometry(steps), { albedo: [0.5, 0.45, 0.38], tone: 0.45 }));
  return {
    update(t, dt, { camera, frustum }) {
      boards.update(camera, frustum);
    },
  };
}
