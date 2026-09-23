// The crowd on the sand: groups of beachgoers under umbrellas, on towels, in
// chairs or standing about talking, each group with its own arrival and
// departure hours. People are GPU instances of a few baked poses, and each
// eases now and then into a second pose: hands behind the head, feet kicking,
// leaning back on their hands, a drink to the lips, a hand shading the eyes.
// Umbrella canopies stir in the sea breeze.
import { rng, specks, Pack, QUALITY, presence } from './core.js';
import { shoreZ, sandHeight, strandZ, VIEW } from './site.js';
import * as G from './gear.js';
import { Body, HUMAN, frame, outfit } from './rigs.js';
import { Instanced } from './inst.js';
import { COURTS, TOWERS, RINGS, PLAY_CLEAR } from './beach.js';

// ---- Poses, each with a second version to ease into ----

function lieBack(J, alt) {
  const set = frame(0, 0, 0, 0, 1);
  const h = 0.12;
  set(J, 0, 0, h, 0);
  set(J, 1, 0, h, 0.46);
  set(J, 2, 0, h, 0.58);
  set(J, 3, 0, h + 0.02 + (alt ? 0.05 : 0), 0.72);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, h, -0.02);
    const bent = alt && side > 0;
    set(J, hip + 1, side * 0.13, bent ? h + 0.36 : h - 0.02, bent ? -0.3 : -0.48);
    set(J, hip + 2, side * 0.15, h - 0.04, bent ? -0.58 : -0.92);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, h, 0.44);
    if (alt) {
      set(J, sh + 1, side * 0.36, h + 0.05, 0.66); // hands behind the head
      set(J, sh + 2, side * 0.07, h + 0.06, 0.8);
    } else {
      set(J, sh + 1, side * 0.26, h - 0.02, 0.2);
      set(J, sh + 2, side * 0.28, h - 0.03, -0.05);
    }
  }
}

function lieFront(J, alt) {
  const set = frame(0, 0, 0, 0, 1);
  const h = 0.12;
  const prop = 0.18;
  set(J, 0, 0, h, 0);
  set(J, 1, 0, h + prop * 0.6, 0.46);
  set(J, 2, 0, h + prop, 0.58);
  set(J, 3, 0, h + 0.02 + prop * 1.3, 0.72);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, h, -0.02);
    set(J, hip + 1, side * 0.13, h - 0.02, -0.48);
    const kick = alt ? (side > 0 ? 0.42 : 0.2) : 0;
    set(J, hip + 2, side * 0.15, h - 0.04 + kick, -0.92 + kick * 0.75);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, h + prop * 0.8, 0.44);
    set(J, sh + 1, side * 0.2, h - 0.02, 0.62);
    set(J, sh + 2, side * 0.1, h + 0.02, 0.85);
  }
}

function sit(J, alt) {
  const set = frame(0, 0, 0, 0, 1);
  const py = 0.12;
  const back = alt ? -0.14 : 0.12;
  set(J, 0, 0, py, 0);
  set(J, 1, 0, py + 0.44, back);
  set(J, 2, 0, py + 0.56, back + 0.02);
  set(J, 3, 0, py + 0.69, back + 0.06);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, py, 0);
    set(J, hip + 1, side * 0.14, py + (alt ? 0.16 : 0.36), alt ? 0.4 : 0.3);
    set(J, hip + 2, side * 0.16, 0.04, alt ? 0.78 : 0.55);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, py + 0.41, back);
    if (alt) {
      set(J, sh + 1, side * 0.25, py + 0.2, back - 0.14); // leaning back on their hands
      set(J, sh + 2, side * 0.27, 0.03, back - 0.26);
    } else {
      set(J, sh + 1, side * 0.22, py + 0.3, back + 0.22);
      set(J, sh + 2, side * 0.16, py + 0.34, 0.42);
    }
  }
}

function chair(J, alt) {
  const set = frame(0, 0, 0, 0, 1);
  const py = 0.3;
  set(J, 0, 0, py, 0);
  set(J, 1, 0, py + 0.42, -0.22);
  set(J, 2, 0, py + 0.53, -0.26);
  set(J, 3, 0, py + 0.66, -0.27);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, py, 0.02);
    set(J, hip + 1, side * 0.13, py + 0.12, 0.46);
    set(J, hip + 2, side * 0.15, 0.05, 0.86);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, py + 0.4, -0.2);
    if (alt && side > 0) {
      set(J, sh + 1, 0.27, py + 0.26, -0.02); // a drink to the lips
      set(J, sh + 2, 0.07, py + 0.6, -0.14);
    } else {
      set(J, sh + 1, side * 0.28, py + 0.2, -0.05);
      set(J, sh + 2, side * 0.26, py + 0.18, 0.2);
    }
  }
}

function stand(J, alt, talk) {
  const set = frame(0, 0, 0, 0, 1);
  const py = 0.94;
  const lean = alt ? 0.03 : 0.0;
  set(J, 0, alt ? 0.03 : 0, py, 0);
  set(J, 1, 0, py + 0.46, lean);
  set(J, 2, 0, py + 0.58, lean + 0.01);
  set(J, 3, 0, py + 0.71, lean + 0.02);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, py - 0.03, 0);
    const wt = alt && side < 0 ? 0.05 : 0;
    set(J, hip + 1, side * (0.11 + wt), py - 0.49, 0.02);
    set(J, hip + 2, side * (0.12 + wt * 1.6), 0.04, 0);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.19, py + 0.43, lean);
    if (alt && side > 0 && !talk) {
      set(J, sh + 1, 0.33, py + 0.6, 0.12); // shading the eyes
      set(J, sh + 2, 0.07, py + 0.73, 0.15);
    } else if (alt && side > 0 && talk) {
      set(J, sh + 1, 0.24, py + 0.18, 0.12); // talking with a hand
      set(J, sh + 2, 0.17, py + 0.36, 0.36);
    } else if (talk && side < 0) {
      set(J, sh + 1, -0.24, py + 0.16, 0.02); // hand on hip
      set(J, sh + 2, -0.12, py - 0.02, 0.04);
    } else {
      set(J, sh + 1, side * 0.22, py + 0.14, 0.01);
      set(J, sh + 2, side * 0.23, py - 0.13, 0.04);
    }
  }
}

function dig(J, alt) {
  // a kid on their knees at a sandcastle, reaching in to dig
  const set = frame(0, 0, 0, 0, 1);
  const py = 0.42;
  const fwd = alt ? 0.32 : 0.08;
  set(J, 0, 0, py, -0.05);
  set(J, 1, 0, py + 0.42 - fwd * 0.4, fwd);
  set(J, 2, 0, py + 0.52 - fwd * 0.5, fwd + 0.06);
  set(J, 3, 0, py + 0.63 - fwd * 0.6, fwd + 0.12);
  for (const side of [-1, 1]) {
    const hip = side < 0 ? 10 : 13;
    set(J, hip, side * 0.1, py, -0.05);
    set(J, hip + 1, side * 0.13, 0.05, 0.02);
    set(J, hip + 2, side * 0.13, 0.04, -0.42);
    const sh = side < 0 ? 4 : 7;
    set(J, sh, side * 0.18, py + 0.4 - fwd * 0.4, fwd);
    set(J, sh + 1, side * 0.2, py + (alt ? 0.08 : 0.18), fwd + 0.2);
    set(J, sh + 2, side * 0.14, alt ? 0.04 : py - 0.05, fwd + (alt ? 0.42 : 0.32));
  }
}

const POSES = {
  lieBack,
  lieFront,
  sit,
  chair,
  standShade: (J, alt) => stand(J, alt, false),
  standTalk: (J, alt) => stand(J, alt, true),
  dig,
};

/** Bake a pose and its second version into a model. */
function poseModel(name) {
  const body = new Body(null, HUMAN, { outfit: outfit(rng(3), 'casual'), density: 150, size: 0.056, seed: 77 });
  POSES[name](body.J, false);
  const a = body.bake();
  POSES[name](body.J, true);
  const b = body.bake();
  return {
    count: body.n,
    attrs: {
      position: [a.pos, 3],
      aPosB: [b.pos, 3],
      aNrm: [a.nrm, 3],
      aNrmB: [b.nrm, 3],
      aInfo: [Float32Array.from({ length: body.n * 4 }, (_, k) => [body.role, body.rt, body.shade][k % 4]?.[Math.floor(k / 4)] ?? 0), 4],
      aSize: [body.size, 1],
    },
  };
}

const LIT = /* glsl */ `
  vec3 V = normalize(pos - cameraPosition);
  float rim = pow(1.0 - abs(dot(n, -V)), 2.5) * max(dot(V, uSunDir), 0.0);
  float sd = clamp((dot(n, uSunDir) + 0.3) / 1.3, 0.0, 1.0) * uSunVis * (1.0 - deckShadow(pos));
  vec3 L = uSunColor * sd * 1.1 + uAmb * (0.2 + 0.22 * n.y) + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonVis * uMoonLit * 0.3;
  col = base * L + mix(uSunColor, base * 1.6, 0.5) * rim * uSunVis * 0.2 + base * pierGlow(pos) * 0.5;`;

// iA: x, y, z, heading · iB: scale, phase, rate, kicks · iC: skin, band · iD: hair, sleeves · iE: top, legs · iF: bottom, alpha
const PERSON_BODY = /* glsl */ `
  float s = fract(uTime * iB.z + iB.y);
  float bl = iB.w > 0.5 ? 0.5 + 0.5 * sin(uTime * 1.9 + iB.y * 6.2831) : smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.3, 0.36, s));
  vec3 lp = mix(position, aPosB, bl) * iB.x;
  vec3 ln = normalize(mix(aNrm, aNrmB, bl) + vec3(0.0, 1e-3, 0.0));
  float ch = cos(iA.w), sh = sin(iA.w);
  pos = vec3(iA.x + ch * lp.x + sh * lp.z, iA.y + lp.y, iA.z - sh * lp.x + ch * lp.z);
  vec3 n = vec3(ch * ln.x + sh * ln.z, ln.y, -sh * ln.x + ch * ln.z);
  float t = aInfo.y;
  float aRole = aInfo.x;
  bool band = iC.w > 0.5;
  vec3 base = iC.rgb;
  if (aRole < 0.5) base = band ? ((t > 0.62 && t < 0.86) ? iE.rgb : (t < 0.18 ? iF.rgb : iC.rgb)) : (t < 0.22 ? iF.rgb : iE.rgb);
  else if (aRole < 1.5) base = iF.rgb;
  else if (aRole < 2.5) base = band ? iC.rgb : iE.rgb;
  else if (aRole < 3.5) base = (iD.w > 0.5 && t < 0.55) ? iE.rgb : iC.rgb;
  else if (aRole < 4.5) base = (iE.w > 1.5 || (iE.w > 0.5 && t < 0.55)) ? iF.rgb : iC.rgb;
  else if (aRole < 5.5) base = iE.w > 1.5 ? iF.rgb : iC.rgb;
  else if (aRole < 6.5) base = t > 0.25 ? iD.rgb : iC.rgb;
  base *= aInfo.z;
  ${LIT}
  alpha = 0.88 * iF.w;
  size = aSize * iB.x * uGrow;`;

// iA: x, y, z, tilt direction · iB: tilt, phase, _, _ · iC: colour 0 · iD: colour 1, alpha
const UMBRELLA_BODY = /* glsl */ `
  float tx = sin(iA.w) * iB.x, tz = cos(iA.w) * iB.x;
  vec3 n = aNrm;
  vec3 base;
  if (aKind < 0.5) {
    pos = vec3(iA.x + tx * 2.1 * position.y, iA.y + 2.1 * position.y, iA.z + tz * 2.1 * position.y);
    base = vec3(0.85, 0.85, 0.82);
  } else {
    pos = vec3(iA.x + tx * 2.1, iA.y + 2.1, iA.z + tz * 2.1) + position;
    pos.y += 0.035 * aRim * aRim * sin(uTime * 3.4 + aAng * 4.0 + iB.y * 6.2831) + 0.015 * sin(uTime * 1.3 + iB.y * 3.0) * aRim;
    base = aPanel > 0.5 ? iD.rgb : iC.rgb;
  }
  base *= aShade;
  ${LIT}
  alpha = 0.88 * iD.w;
  size = aSize * uGrow;`;

// iA: x, y, z, heading · iC: colour 0 · iD: colour 1, alpha
const FLAT_BODY = /* glsl */ `
  float ch = cos(iA.w), sh = sin(iA.w);
  pos = vec3(iA.x + ch * position.x + sh * position.z, iA.y + position.y, iA.z - sh * position.x + ch * position.z);
  vec3 n = vec3(ch * aNrm.x + sh * aNrm.z, aNrm.y, -sh * aNrm.x + ch * aNrm.z);
  vec3 base = (aPanel > 1.5 ? vec3(0.8, 0.8, 0.78) : aPanel > 0.5 ? iD.rgb : iC.rgb) * aShade;
  ${LIT}
  alpha = 0.88 * iD.w;
  size = aSize * uGrow;`;

function umbrellaModel() {
  const r = rng(91);
  const pos = [], nrm = [], kind = [], panel = [], rim = [], ang = [], shade = [], size = [];
  for (let i = 0; i < 24; i++) {
    pos.push(0, i / 24, 0);
    nrm.push(0, 0, -1);
    kind.push(0); panel.push(0); rim.push(0); ang.push(0);
    shade.push(1); size.push(0.045);
  }
  const R = 1.1;
  for (let i = 0; i < 900; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * R;
    const droop = (rr / R) ** 1.5 * 0.4;
    const scallop = rr > R * 0.92 ? Math.abs(Math.sin(a * 4)) * 0.06 : 0;
    pos.push(Math.cos(a) * rr, -droop + 0.05 - scallop, Math.sin(a) * rr);
    nrm.push(Math.cos(a) * 0.35, 0.93, Math.sin(a) * 0.35);
    kind.push(1);
    panel.push(Math.floor((a / (Math.PI * 2)) * 8) % 2);
    rim.push(rr / R);
    ang.push(a);
    shade.push(0.88 + r() * 0.24);
    size.push(0.058 * (0.8 + r() * 0.4));
  }
  const F = (a) => Float32Array.from(a);
  return { count: kind.length, attrs: { position: [F(pos), 3], aNrm: [F(nrm), 3], aKind: [F(kind), 1], aPanel: [F(panel), 1], aRim: [F(rim), 1], aAng: [F(ang), 1], aShade: [F(shade), 1], aSize: [F(size), 1], aSeed: [F(kind.map(() => r())), 1] } };
}

/** A speck model from one of gear.js's makers, drawn at the origin facing +z. */
function gearModel(make, count = 1) {
  const r = rng(17);
  const pos = [], nrm = [], panel = [], shade = [], size = [];
  const add = (p, n, c, s) => {
    pos.push(...p);
    nrm.push(...n);
    panel.push(c === 'A' ? 0 : c === 'B' ? 1 : 2);
    shade.push(0.88 + r() * 0.24);
    size.push(s);
  };
  for (let i = 0; i < count; i++) make(add, r);
  const F = (a) => Float32Array.from(a);
  return { count: panel.length, attrs: { position: [F(pos), 3], aNrm: [F(nrm), 3], aPanel: [F(panel), 1], aShade: [F(shade), 1], aSize: [F(size), 1], aSeed: [F(panel.map(() => r())), 1] } };
}

// ---- The crowd ----

export function createCrowd(scene) {
  const r = rng(1905);
  const q = Math.max(QUALITY, 0.6);
  const people = {};
  for (const name of Object.keys(POSES)) {
    people[name] = new Instanced(scene, poseModel(name), {
      slots: 6,
      seed: name.length * 7,
      radius: 1.0,
      near: 22,
      maxPx: 24,
      decl: 'attribute vec3 aPosB; attribute vec3 aNrm; attribute vec3 aNrmB; attribute vec4 aInfo;',
      body: PERSON_BODY,
    });
  }
  const umbrellas = new Instanced(scene, umbrellaModel(), {
    slots: 4,
    seed: 3,
    radius: 1.6,
    near: 26,
    decl: 'attribute vec3 aNrm; attribute float aKind; attribute float aPanel; attribute float aRim; attribute float aAng; attribute float aShade;',
    body: UMBRELLA_BODY,
  });
  const towels = new Instanced(
    scene,
    gearModel((add, rr) => {
      for (let i = 0; i < 320; i++) {
        const u = (rr() - 0.5) * 0.9;
        const v = (rr() - 0.5) * 1.75;
        add([u, 0.02, v], [0, 1, 0], Math.floor((v + 0.875) / 0.25) % 2 ? 'B' : 'A', 0.05);
      }
    }),
    { slots: 4, seed: 4, radius: 1.0, near: 20, decl: 'attribute vec3 aNrm; attribute float aPanel; attribute float aShade;', body: FLAT_BODY }
  );
  const chairs = new Instanced(
    scene,
    gearModel((add, rr) => {
      G.chair((p, n, c, s) => add(p, n, Array.isArray(c) ? 'F' : 'A', s), rr, 0, 0, 0, 0, 'fabric');
      G.chair((p, n, c, s) => add(p, n, Array.isArray(c) ? 'F' : 'A', s), rr, 0, 0, 0, 0, 'fabric');
    }),
    { slots: 4, seed: 5, radius: 0.8, near: 18, decl: 'attribute vec3 aNrm; attribute float aPanel; attribute float aShade;', body: FLAT_BODY }
  );

  // coolers, boards stood in the sand and sandcastles: few enough to draw once
  const pk = new Pack({ position: 3, aNormal: 3, aColor: 3, aSize: 1, aSeed: 1, aWin: 2 });
  let win = [-1, 0];
  const addStatic = (p, n, c, size) => pk.push({ position: p, aNormal: n, aColor: c, aSize: size, aSeed: r(), aWin: win });

  const groups = []; // { x, z, win, umbrella, members: [{ x, z, pose, stand }], castle }
  const spots = [];
  const blocked = (x, z) => {
    const d = z - shoreZ(x);
    if (x > 104 && x < 167) return true; // under and beside the pier
    if (Math.abs(z - strandZ(x)) < 6) return true;
    for (const [cx, cz] of COURTS) if (Math.abs(x - cx) < 7 && Math.abs(z - cz) < 11) return true;
    for (const [tx, td] of TOWERS) if (Math.abs(x - tx) < 6 && Math.abs(d - td) < 8) return true;
    if (Math.abs(z - 44) < 2.5 && d > 20) return true; // the lifeguard trucks' lane
    if (Math.abs(x - RINGS.x) < 10 && Math.abs(z - RINGS.z) < 5) return true;
    if (Math.abs(x - VIEW.x) < 4 && Math.abs(z - VIEW.z) < 4) return true;
    for (const [px, pd, pr] of PLAY_CLEAR) if (Math.hypot(x - px, d - pd) < pr) return true;
    for (const [sx, sz] of spots) if (Math.abs(sx - x) < 5 && Math.abs(sz - z) < 5 && Math.hypot(sx - x, sz - z) < 5) return true;
    return false;
  };
  const zones = [
    { x0: 7, x1: 24, d0: 17, d1: 25, n: 2, family: true }, // a family close by, in view
    { x0: -260, x1: 104, d0: 15, d1: 38, n: 150 },
    { x0: -260, x1: 104, d0: 38, d1: 92, n: 105 },
    { x0: 168, x1: 330, d0: 15, d1: 70, n: 70 },
    { x0: -850, x1: -260, d0: 15, d1: 85, n: 70 },
    { x0: 330, x1: 520, d0: 15, d1: 70, n: 28 },
  ];
  const SUNSET = 2.47; // facing Point Dume
  for (const zn of zones) {
    const n = zn.family ? zn.n : Math.round(zn.n * q);
    for (let g = 0, tries = 0; g < n && tries < n * 60; tries++) {
      const x = zn.x0 + r() * (zn.x1 - zn.x0);
      const z = shoreZ(x) + zn.d0 + r() * (zn.d1 - zn.d0);
      if (blocked(x, z)) continue;
      spots.push([x, z]);
      g++;
      const kind = r();
      // early birds, sunset watchers, and day-trippers (some of whom stay for the sunset)
      win = kind < 0.1 ? [7 + r(), 11 + r() * 1.5] : kind < 0.34 ? [16.2 + r() * 1.2, 19.1 + r() * 0.8] : [9.3 + r() * 3, 15.2 + r() * 4.3];
      if (zn.family) win = [9.4 + r(), 19.3 + r() * 0.4]; // the family nearby stays all day
      const evening = !zn.family && kind >= 0.1 && kind < 0.34;
      const y = sandHeight(x, z);
      const type = zn.family ? 'family' : evening ? 'sunset' : r.pick(['family', 'couple', 'couple', 'friends', 'friends', 'solo', 'solo', 'talkers']);
      const group = { x, z, win: [...win], umbrella: null, members: [], castle: null };
      groups.push(group);
      if (!evening && type !== 'talkers' && r() < (type === 'family' ? 0.85 : type === 'solo' ? 0.4 : 0.6)) {
        const colors = r.pick(G.STRIPES);
        const tilt = 0.1 + r() * 0.12;
        const dir = r() * 6.28;
        umbrellas.add(x, y, z, group.win, [x, y, z, dir, tilt, r(), 0, 0, ...colors[0], 0, ...colors[1], 1]);
        group.umbrella = [x + Math.sin(dir) * tilt * 2.1, y + 2.1, z + Math.cos(dir) * tilt * 2.1];
      }
      const adults = type === 'solo' ? 1 : type === 'couple' ? 2 : type === 'family' ? 2 : type === 'friends' ? 3 + Math.floor(r() * 2) : type === 'talkers' ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
      const kids = type === 'family' ? 1 + Math.floor(r() * 2) : 0;
      const place = (i, count, ring) => {
        const a = (i / count) * Math.PI * 2 + r() * 0.8;
        const rad = ring * (0.9 + r() * 0.5);
        return [x + Math.cos(a) * rad, z + Math.sin(a) * rad];
      };
      for (let m = 0; m < adults; m++) {
        let pose;
        let heading;
        let [px, pz] = place(m, adults, 1.4);
        if (type === 'talkers') {
          pose = 'standTalk';
          [px, pz] = place(m, adults, 0.75);
          heading = Math.atan2(x - px, z - pz); // facing each other
        } else if (evening) {
          pose = r() < 0.75 ? 'sit' : 'standShade';
          heading = SUNSET + (r() - 0.5) * 0.5;
        } else {
          pose = r.pick(['lieBack', 'lieBack', 'lieFront', 'sit', 'sit', 'chair', type === 'friends' ? 'standTalk' : 'lieBack']);
          heading = Math.PI + (r() - 0.5) * 0.9; // mostly toward the sea
        }
        const py = sandHeight(px, pz);
        if (pose === 'lieBack' || pose === 'lieFront') {
          heading += Math.PI + (r() - 0.5) * 1.2;
          towels.add(px, py, pz, group.win, [px, py, pz, heading, 0, 0, 0, 0, ...r.pick(G.TOWELS)[0], 0, ...r.pick(G.TOWELS)[1], 1]);
        } else if (pose === 'chair') {
          chairs.add(px, py, pz, group.win, [px, py, pz, heading, 0, 0, 0, 0, ...r.pick(G.STRIPES)[0], 0, 0, 0, 0, 1]);
        } else if (pose === 'sit' && r() < 0.6) {
          towels.add(px, py, pz - 0.2, group.win, [px, py, pz, heading, 0, 0, 0, 0, ...r.pick(G.TOWELS)[0], 0, ...r.pick(G.TOWELS)[1], 1]);
        }
        addPerson(people[pose], px, py, pz, heading, 0.92 + r() * 0.16, pose === 'lieFront' && r() < 0.5, outfit(r, evening ? r.pick(['casual', 'casual', 'bikini', 'trunks']) : undefined), group.win);
        group.members.push({ x: px, z: pz, stand: pose.startsWith('stand'), sit: pose === 'sit' || pose === 'chair' });
      }
      for (let k = 0; k < kids; k++) {
        const [px, pz] = place(k + 0.5, kids, 2.2);
        const py = sandHeight(px, pz);
        const digging = r() < 0.55;
        if (digging && !group.castle) {
          const cx = px + 0.5;
          const cz = pz - 0.45;
          win = group.win;
          G.sandcastle(addStatic, r, cx, sandHeight(cx, cz), cz, [0.72, 0.6, 0.44]);
          group.castle = [cx, cz];
        }
        addPerson(people[digging ? 'dig' : 'sit'], px, py, pz, digging ? Math.PI - 0.6 : Math.PI + (r() - 0.5), 0.58 + r() * 0.12, digging, outfit(r, r() < 0.5 ? 'trunks' : 'onepiece'), group.win);
        group.members.push({ x: px, z: pz, kid: true });
      }
      win = group.win;
      if (!evening && r() < 0.45) G.cooler(addStatic, r, x + (r() - 0.5) * 3, y, z + (r() - 0.5) * 3, r.pick(G.STRIPES)[0]);
      if (r() < 0.14) G.surfboardUpright(addStatic, r, x + 2.2, y, z + 0.8, r() * 3, r.pick(G.STRIPES)[r() < 0.5 ? 0 : 1]);
    }
  }

  function addPerson(inst, x, y, z, heading, scale, kicks, o, w, pace = 1) {
    const legs = o.legs === 'pants' ? 2 : o.legs === 'shorts' ? 1 : 0;
    const rate = pace / (16 + r() * 34);
    inst.add(x, y, z, w, [x, y, z, heading, scale, r(), rate, kicks ? 1 : 0, ...o.skin, o.band ? 1 : 0, ...o.hair, o.sleeves ? 1 : 0, ...o.top, legs, ...o.bottom, 1]);
  }

  const misc = specks({
    blend: 'normal',
    attributes: pk.attributes(),
    decl: 'attribute vec3 aNormal; attribute vec3 aColor; attribute vec2 aWin;',
    body: /* glsl */ `
      float here = aWin.x < 0.0 ? 1.0 : presence(uHour, aWin.x, aWin.y, 0.35);
      vec3 n = normalize(aNormal + vec3(0.0, 1e-3, 0.0));
      float sd = clamp((dot(n, uSunDir) + 0.3) / 1.3, 0.0, 1.0) * uSunVis * (1.0 - deckShadow(position));
      vec3 L = uSunColor * sd * 1.1 + uAmb * (0.2 + 0.22 * n.y) + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonVis * uMoonLit * 0.3;
      col = aColor * L + aColor * pierGlow(position) * 0.5;
      alpha = 0.88 * here;`,
    maxPx: 6,
  });
  scene.add(misc);

  const layers = [...Object.values(people), umbrellas, towels, chairs];
  const obstacles = groups.map((g) => ({ x: g.x, z: g.z, r: g.umbrella ? 1.7 : 1.3 }));
  const cam = { x: 0, z: 0 };
  return {
    groups,
    obstacles,
    update(t, dt, { camera, frustum, hour }) {
      cam.x = camera.position.x;
      cam.z = camera.position.z;
      for (const l of layers) l.update(camera, frustum, hour, l === umbrellas || l === towels || l === chairs ? 15 : 23);
      this.hour = hour;
    },
    casters(out) {
      for (const g of groups) {
        if (Math.abs(g.x - cam.x) > 70 || Math.abs(g.z - cam.z) > 70) continue;
        if (presence(this.hour ?? 12, g.win[0], g.win[1], 0.35) < 0.5) continue;
        if (g.umbrella) out.push([g.umbrella[0], g.umbrella[2], 1.05, -(g.umbrella[1] - sandHeight(g.x, g.z)) + 0.3]);
        for (const m of g.members) if (m.stand) out.push([m.x, m.z, 0.28, 1.7]);
        else if (m.sit) out.push([m.x, m.z, 0.3, 0.8]);
      }
    },
  };
}
