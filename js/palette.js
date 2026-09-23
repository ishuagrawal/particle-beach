// Light and colour, keyed to the sun's elevation rather than the clock hour, so
// the palette follows the real sky at Santa Monica on any date. Mornings run
// cooler and hazier (marine layer); evenings warmer and pinker.
import * as THREE from 'three';
import { U, smoothstep } from './core.js';
import { worldDir } from './site.js';

const NIGHT = {
  top: '#060a17', hor: '#0e1530', anti: '#0d1430', sun: '#ff6a3a', amb: '#1a2138', glow: '#5a3a26',
  deep: '#050a1c', lit: '#1b2a55', sand: '#3a4262', foam: '#a6b8e6', leaf: '#1c2740',
  day: 0, stars: 1, lights: 1, bg: 1, haze: 0.25, bio: 0.12,
};
const HIGH = {
  top: '#2468c8', hor: '#a4c8e8', anti: '#9cc2e6', sun: '#ffffff', amb: '#bcd2ea', glow: '#202020',
  deep: '#0a5890', lit: '#5ad0ec', sand: '#ecd2a4', foam: '#ffffff', leaf: '#5aae7c',
  day: 1, stars: 0, lights: 0, bg: 0.7, haze: 0.3, bio: 0,
};
const DAY = {
  top: '#2c72ce', hor: '#b2cfe6', anti: '#a8c8e6', sun: '#fff2de', amb: '#bccce0', glow: '#202020',
  deep: '#0d5488', lit: '#78c6dc', sand: '#eccfa0', foam: '#ffffff', leaf: '#6aaa76',
  day: 1, stars: 0, lights: 0, bg: 0.72, haze: 0.35, bio: 0,
};
const ASTRO = {
  ...NIGHT, top: '#081030', hor: '#16204a', anti: '#0f1636', amb: '#1e2644', glow: '#523826',
  deep: '#08112a', lit: '#223366', sand: '#434a6c', foam: '#b0c0ea', leaf: '#222c48', day: 0.02, stars: 0.8, bio: 0.1,
};
const NAUTICAL = {
  ...NIGHT, top: '#0e1c4c', hor: '#2e3470', anti: '#16204a', amb: '#283060', glow: '#4a3628',
  deep: '#0e1a3e', lit: '#34458a', sand: '#555a80', foam: '#c0cbf0', leaf: '#2c3656', day: 0.06, stars: 0.4, haze: 0.3, bio: 0.06,
};

const EVENING = [
  [-90, NIGHT],
  [-18, NIGHT],
  [-12, ASTRO],
  [-8, NAUTICAL],
  [-4, { ...NIGHT, top: '#1a2c68', hor: '#a45276', anti: '#2a3674', amb: '#434e88', glow: '#3e3028', deep: '#18245a', lit: '#6a64a8', sand: '#76698e', foam: '#dcd4ff', leaf: '#3a4466', day: 0.14, stars: 0.12, lights: 0.95, bg: 0.98, haze: 0.35, bio: 0.08 }],
  [-1.5, { ...NIGHT, top: '#24407c', hor: '#ff7244', anti: '#5a5496', amb: '#6e6494', glow: '#302826', deep: '#222c5c', lit: '#c8747a', sand: '#a8848c', foam: '#ffddd2', leaf: '#54506c', day: 0.28, stars: 0.02, lights: 0.75, bg: 0.92, haze: 0.4, bio: 0 }],
  [0.5, { ...DAY, top: '#30549a', hor: '#ff6224', anti: '#9a86b4', sun: '#ff5a1c', amb: '#a8849a', glow: '#262422', deep: '#2a3868', lit: '#ff8a4e', sand: '#e08c68', foam: '#ffd6bc', leaf: '#806260', day: 0.46, lights: 0.35, bg: 0.85, haze: 0.45 }],
  [3, { ...DAY, top: '#3462aa', hor: '#ff9a44', anti: '#a6b2d2', sun: '#ff9438', amb: '#bcaca4', deep: '#1e4674', lit: '#ffae6c', sand: '#f0ac78', foam: '#fff0da', leaf: '#94a060', day: 0.7, lights: 0.05, bg: 0.82, haze: 0.45 }],
  [7, { ...DAY, top: '#2f6cc0', hor: '#ffc98a', anti: '#a8c4e0', sun: '#ffd49a', amb: '#c4c4c6', deep: '#124e80', lit: '#d8c4a0', sand: '#f2c89e', foam: '#fff6ea', leaf: '#86ac70', day: 0.9, bg: 0.76, haze: 0.4 }],
  [15, DAY],
  [30, HIGH],
  [90, HIGH],
];

const MORNING = [
  [-90, NIGHT],
  [-18, NIGHT],
  [-12, ASTRO],
  [-8, NAUTICAL],
  [-4, { ...NIGHT, top: '#1c2e6a', hor: '#6e5a98', anti: '#2a3470', amb: '#40508a', glow: '#342a2a', deep: '#1a2658', lit: '#5a64a8', sand: '#6c6a8e', foam: '#d4d6ff', leaf: '#384468', day: 0.14, stars: 0.12, lights: 0.9, bg: 0.98, haze: 0.5, bio: 0.05 }],
  [-1.5, { ...NIGHT, top: '#2a4480', hor: '#f4a490', anti: '#6a6aa0', amb: '#76749c', glow: '#2a2626', deep: '#243060', lit: '#b88a98', sand: '#a8909a', foam: '#ffe4dc', leaf: '#58566e', day: 0.28, stars: 0.02, lights: 0.6, bg: 0.92, haze: 0.55, bio: 0 }],
  [0.5, { ...DAY, top: '#3c5fa4', hor: '#ffb07c', anti: '#a8a6c8', sun: '#ffa060', amb: '#b0a4b4', deep: '#2c4274', lit: '#e8a488', sand: '#dea888', foam: '#fff0e6', leaf: '#7c7a78', day: 0.46, lights: 0.2, bg: 0.85, haze: 0.65 }],
  [3, { ...DAY, top: '#3c6cb4', hor: '#ffd0a4', anti: '#aebfdc', sun: '#ffc488', amb: '#cfc6c4', deep: '#1e4a7a', lit: '#e8c8ae', sand: '#f2caa2', foam: '#fff4ec', leaf: '#88a47a', day: 0.7, bg: 0.82, haze: 0.6 }],
  [7, { ...DAY, top: '#3070c4', hor: '#e6dccc', anti: '#aec6e0', sun: '#ffe2b8', amb: '#c6ccd4', deep: '#125284', lit: '#b8ccd0', sand: '#f0d2b0', foam: '#fffaf4', leaf: '#7eaa7e', day: 0.9, bg: 0.76, haze: 0.55 }],
  [15, DAY],
  [30, HIGH],
  [90, HIGH],
];

const COLOR_KEYS = ['top', 'hor', 'anti', 'sun', 'amb', 'glow', 'deep', 'lit', 'sand', 'foam', 'leaf'];
const NUM_KEYS = ['day', 'stars', 'lights', 'bg', 'haze', 'bio'];

const compile = (keys) =>
  keys.map(([e, k]) => {
    const out = { e };
    for (const c of COLOR_KEYS) out[c] = new THREE.Color(k[c]);
    for (const n of NUM_KEYS) out[n] = k[n];
    return out;
  });
const SETS = { morning: compile(MORNING), evening: compile(EVENING) };

/** Interpolated palette for a sun elevation (degrees). Writes into `out`. */
export function samplePalette(elev, rising, out = {}) {
  const keys = rising ? SETS.morning : SETS.evening;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].e <= elev) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = smoothstep(0, 1, (elev - a.e) / (b.e - a.e));
  for (const k of COLOR_KEYS) (out[k] ??= new THREE.Color()).lerpColors(a[k], b[k], t);
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

const P = {};
const moonTint = new THREE.Color(0.66, 0.74, 1.0);

/** Push the palette and the sky's geometry into the shared uniforms. */
export function applySky({ sun, moon, illum, hour }) {
  const rising = sun.az < 180;
  samplePalette(sun.apparent, rising, P);
  // A bright moon lifts the night: brighter ambient, sand and water.
  const moonUp = smoothstep(-2, 12, moon.alt) * illum.fraction * (1 - P.day);
  P.amb.lerp(moonTint, moonUp * 0.12);
  P.sand.multiplyScalar(1 + moonUp * 0.35);
  P.lit.lerp(moonTint, moonUp * 0.2);

  U.uSkyTop.value.copy(P.top);
  U.uSkyHorizon.value.copy(P.hor);
  U.uSkyAnti.value.copy(P.anti);
  U.uSunColor.value.copy(P.sun);
  U.uAmb.value.copy(P.amb);
  U.uGlow.value.copy(P.glow).multiplyScalar(P.lights);
  U.uWaterDeep.value.copy(P.deep);
  U.uWaterLit.value.copy(P.lit);
  U.uSand.value.copy(P.sand);
  U.uFoam.value.copy(P.foam);
  U.uLeaf.value.copy(P.leaf);
  U.uDay.value = P.day;
  U.uStars.value = P.stars;
  U.uBio.value = P.bio;
  U.uLights.value = P.lights;
  U.uHaze.value = P.haze;
  U.uBg.value = P.bg;
  U.uHour.value = hour;
  worldDir(sun.az, sun.apparent, U.uSunDir.value);
  worldDir(moon.az, moon.alt, U.uMoonDir.value);
  U.uSunVis.value = smoothstep(-1.2, 0.8, sun.apparent);
  U.uMoonVis.value = smoothstep(-1.5, 3, moon.alt) * (1 - P.day * 0.85);
  U.uMoonLit.value = illum.fraction;
  U.uFogColor.value.copy(P.hor).lerp(P.anti, 0.5).multiplyScalar(P.bg * 0.6);
  return P;
}

// Twilight names follow the sun's altitude, as photographers and sailors use them.
export function phaseName(elev, rising) {
  if (elev < -18) return 'Night';
  if (elev < -12) return 'Astronomical twilight';
  if (elev < -8) return 'Nautical twilight';
  if (elev < -4) return 'Blue hour';
  if (elev < -0.833) return 'Civil twilight';
  if (elev < 1) return rising ? 'Sunrise' : 'Sunset';
  if (elev < 6) return 'Golden hour';
  return rising ? 'Morning' : 'Afternoon';
}

export function fmtClock(hour) {
  const m = Math.floor((((hour % 24) + 24) % 24) * 60 + 1e-6) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function fmt12(hour) {
  const m = Math.round((((hour % 24) + 24) % 24) * 60) % 1440;
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
