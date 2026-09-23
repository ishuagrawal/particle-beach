// Santa Monica State Beach, just south of the pier: where everything is.
// World frame: metres, y up, mean sea level at y = 0. The beach faces 230°
// (south-west), so world -z points out to sea along that bearing, +x runs up
// the coast (north-west) toward the pier and Malibu, and +z runs inland.
import * as THREE from 'three';

export const SITE = {
  name: 'Santa Monica',
  place: 'Santa Monica State Beach · California',
  lat: 34.0094,
  lon: -118.4973,
  tz: 'America/Los_Angeles',
  seaward: 230,
};

const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** World unit vector for a compass bearing and elevation, both in degrees. */
export function worldDir(az, el, out = new THREE.Vector3()) {
  const r = (az - SITE.seaward) * D2R;
  const e = el * D2R;
  return out.set(Math.sin(r) * Math.cos(e), Math.sin(e), -Math.cos(r) * Math.cos(e));
}

/** Compass bearing (degrees) of a horizontal world direction. */
export function bearingOf(dx, dz) {
  const r = Math.atan2(dx, -dz) / D2R;
  return (((r + SITE.seaward) % 360) + 360) % 360;
}

// The viewer stands on dry sand 30 m up from the waterline, 150 m south of
// the pier. Yaw is measured from seaward (world -z) toward the pier (+x).
export const VIEW = { x: 0, z: 30, eye: 1.65, yaw: 57, yawPortrait: 50, pitch: 2, yawMin: -48, yawMax: 167 };

// ---- Beach profile -------------------------------------------------------

// Waterline, with beach cusps about 27 m apart.
export const shoreZ = (x) => 1.1 * Math.sin(x * 0.019 + 0.6) + 0.55 * Math.sin(x * 0.071 + 1.7) + 0.4 * Math.sin(x * 0.233 + 0.3);

export function sandHeight(x, z) {
  const d = z - shoreZ(x);
  if (d < 0) return d * 0.03;
  const face = Math.min(d, 14) * 0.052; // beach face, about 1 in 19
  const berm = 0.18 * smoothstep(12, 17, d);
  const back = Math.max(0, d - 17) * 0.011; // backshore rising toward the walk
  const lumps = 0.12 * smoothstep(20, 40, d) * Math.sin(x * 0.09 + z * 0.05) * Math.sin(z * 0.13 - x * 0.03);
  return face + berm + back + lumps;
}

export const SAND_GLSL = /* glsl */ `
float shoreZ(float x) { return 1.1 * sin(x * 0.019 + 0.6) + 0.55 * sin(x * 0.071 + 1.7) + 0.4 * sin(x * 0.233 + 0.3); }
float sandHeight(float x, float z) {
  float d = z - shoreZ(x);
  if (d < 0.0) return d * 0.03;
  return min(d, 14.0) * 0.052 + 0.18 * smoothstep(12.0, 17.0, d) + max(0.0, d - 17.0) * 0.011
    + 0.12 * smoothstep(20.0, 40.0, d) * sin(x * 0.09 + z * 0.05) * sin(z * 0.13 - x * 0.03);
}`;

// The Strand: the concrete bike path winding through the upper beach.
export const strandZ = (x) => 104 + 9 * Math.sin(x * 0.011 + 0.4) + 4 * Math.sin(x * 0.031 + 2.0);

// ---- The pier --------------------------------------------------------------

export const PIER = {
  x: 150, // axis of the long, narrow municipal pier
  half: 10,
  land: 152, // deck runs from the foot of the bridge…
  end: -330, // …to the far end, about 480 m out
  deck: 8.2, // deck surface above mean sea level
  wide: { south: 113, z0: -60, z1: 70 }, // Newcomb Pier section, where Pacific Park sits
};

export const WHEEL = { x: 118.5, y: PIER.deck + 13.2, z: -42, r: 11.4 };

/** Whether (x, z) lies under the deck. */
export function underDeck(x, z) {
  const narrow = Math.abs(x - PIER.x) <= PIER.half && z <= PIER.land && z >= PIER.end;
  const wide = x >= PIER.wide.south && x <= PIER.x && z >= PIER.wide.z0 && z <= PIER.wide.z1;
  return narrow || wide;
}

export const PIER_GLSL = /* glsl */ `
const float PIER_X = ${PIER.x.toFixed(1)};
const float PIER_HALF = ${PIER.half.toFixed(1)};
const float PIER_LAND = ${PIER.land.toFixed(1)};
const float PIER_END = ${PIER.end.toFixed(1)};
const float PIER_DECK = ${PIER.deck.toFixed(2)};
const vec3 WHEEL_C = vec3(${WHEEL.x.toFixed(2)}, ${WHEEL.y.toFixed(2)}, ${WHEEL.z.toFixed(2)});
bool underDeck(vec2 p) {
  bool narrow = abs(p.x - PIER_X) <= PIER_HALF && p.y <= PIER_LAND && p.y >= PIER_END;
  bool wide = p.x >= ${PIER.wide.south.toFixed(1)} && p.x <= PIER_X && p.y >= ${PIER.wide.z0.toFixed(1)} && p.y <= ${PIER.wide.z1.toFixed(1)};
  return narrow || wide;
}`;

// ---- Walking: where you can go ------------------------------------------------

// Stairs from the sand up to the deck, along the pier's south edge by its
// landward end: they climb inland to a landing and a gap in the rail.
export const STAIRS = { x0: 136.4, x1: 139.6, z0: 84, z1: 97, landing: 100.4 };

// Deck-level blocks: buildings on the pier and Pacific Park's rides.
// [x0, x1, z0, z1]
export const DECK_BLOCKS = [
  [143.5, 156.5, -322, -300], // restaurant at the end
  [152, 159.6, -176, -160], // bait shop
  [140.4, 146, -236, -226], // harbour office
  [151, 159.6, -50, -22], // arcades along the north side
  [151, 159.6, -16, 22],
  [151, 159.6, 28, 64],
  [115, 129, 52, 68], // Pacific Park's booths
  [152, 174, 100, 138], // the Looff Hippodrome
  [114.8, 122.2, -54.5, -27.5], // Pacific Wheel and its platform
  [115.5, 140.2, -34, 21], // West Coaster
  [124.5, 131.5, 21, 45], // Sea Dragon
  [123.5, 138.5, -52.5, -37.5], // Inkie's Scrambler
  [115.5, 121.5, 33, 39], // Pacific Plunge
  [132.5, 139, 26.5, 37.5], // Seaside Swing
];

// Pacific Park's newer rides, where they stand on the deck.
export const RIDES = {
  scrambler: { x: 131, z: -45 },
  plunge: { x: 118.5, z: 36, height: 16 },
  swing: { x: 135.75, z: 32, pivot: 6.6, arm: 4.4 },
};

// The named spots of the "Go to" row. yaw is measured from seaward toward the pier.
export const PLACES = {
  home: { label: 'Your spot', x: VIEW.x, z: VIEW.z, level: 'ground', yaw: VIEW.yaw, pitch: VIEW.pitch },
  edge: { label: 'Water’s edge', x: 22, z: shoreZ(22) + 4.5, level: 'ground', yaw: 34, pitch: -3 },
  volley: { label: 'Volleyball', x: 41, z: 30, level: 'ground', yaw: 84, pitch: -2 },
  muscle: { label: 'Muscle Beach', x: 70, z: 88, level: 'ground', yaw: 180, pitch: 8 },
  under: { label: 'Under the pier', x: 147.75, z: 14, level: 'ground', yaw: 0, pitch: 4 },
  park: { label: 'Pacific Park', x: 143, z: -30, level: 'deck', yaw: -64, pitch: 16 },
  end: { label: 'Pier end', x: 150, z: -326.5, level: 'deck', yaw: 25, pitch: 1 },
  lineup: { label: 'The lineup', x: 85, z: shoreZ(85) - 78, level: 'ground', yaw: 150, pitch: 1 },
};

/** Whether (x, z) is on the deck's surface. */
export function onDeck(x, z, inset = 0) {
  const narrow = x >= PIER.x - PIER.half + inset && x <= PIER.x + PIER.half - inset && z >= PIER.end + inset && z <= PIER.land - inset;
  const wide = x >= PIER.wide.south + inset && x <= PIER.x && z >= PIER.wide.z0 + inset && z <= PIER.wide.z1 - inset;
  return narrow || wide;
}

// Pilings under the deck stand on a lattice of bents every 6 m.
export const PILE_XS_NARROW = [141, 145.5, 150, 154.5, 159];
export const PILE_XS_WIDE = [114, 118.5, 123, 127.5, 132, 136.5];
export const pileRowZ = (z) => PIER.land - 3 - 6 * Math.round((PIER.land - 3 - z) / 6);
