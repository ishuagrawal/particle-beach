// Fixtures on the sand: lifeguard towers, volleyball courts, the Muscle
// Beach rings and the Strand bike path, drawn once. The people on the sand
// are in crowd.js; the lifeguard truck patrols in people.js.
import { rng, specks, Pack, QUALITY, solid, boxGeometry } from './core.js';
import { shoreZ, sandHeight, strandZ, VIEW } from './site.js';
import * as G from './gear.js';

export const COURT = { x: 48, z: 25, w: 8, l: 16 };
export const COURTS = [[COURT.x, COURT.z], [12, shoreZ(12) + 62], [-40, shoreZ(-40) + 58], [-104, shoreZ(-104) + 60]];
export const TOWERS = [[92, 30], [-70, 36], [-330, 36], [330, 34]];
export const RINGS = { x: 70 };

// Where the games in play.js happen, as (x, metres up from the waterline).
export const PLAY = {
  spike: [[14, 12.5], [-35, 16.5]],
  keepups: [62, 12],
  cartwheel: { x0: 22, x1: 34, d: 9.5 },
  tag: { x0: 2, x1: 26, d0: 16, d1: 28 },
  bubbles: [84, 19],
  umbrella: [36, 16.5],
  skim: [8, 30, 66, -30],
};
// kept clear of towels and umbrellas: [x, d, radius]
export const PLAY_CLEAR = [
  ...PLAY.spike.map(([x, d]) => [x, d, 4.5]),
  [...PLAY.keepups, 5],
  [...PLAY.bubbles, 5],
  [...PLAY.umbrella, 3],
  [30, 20.5, 3], [25, 24.5, 3], // where the umbrella blows to
];

export function createBeach(scene) {
  const r = rng(501);
  const pk = new Pack({ position: 3, aNormal: 3, aColor: 3, aSize: 1, aSeed: 1, aWin: 2 });
  const win = [-1, 0];
  const add = (p, n, c, size) => pk.push({ position: p, aNormal: n, aColor: c, aSize: size, aSeed: r(), aWin: win });
  const ground = (x, z) => sandHeight(x, z);
  const casters = []; // [x, z, radius, height]
  const solids = [];

  // ---- fixtures ----
  for (const [tx, d] of TOWERS) {
    const tz = shoreZ(tx) + d;
    solids.push(G.lifeguardTower(add, r, tx, ground(tx, tz), tz));
    casters.push([tx, tz, 1.8, 3.9]);
  }
  for (const [cx, cz] of COURTS) {
    const y = ground(cx, cz);
    G.courtLines(add, cx, y, cz, COURT.w, COURT.l);
    G.volleyNet(add, r, cx, y, cz, COURT.w + 0.4);
    casters.push([cx - 4.2, cz, 0.1, 2.5], [cx + 4.2, cz, 0.1, 2.5]);
  }
  RINGS.z = strandZ(RINGS.x) - 12;
  G.ringsFrame(add, RINGS.x, ground(RINGS.x, RINGS.z), RINGS.z);

  // the Strand: concrete, with a dashed yellow centre line
  const nPath = Math.floor(60000 * QUALITY);
  for (let i = 0; i < nPath; i++) {
    const u = r();
    const x = VIEW.x + Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 1.6) * (u < 0.5 ? 900 : 450);
    const w = (r() - 0.5) * 4.4;
    const z = strandZ(x) + w;
    const centre = Math.abs(w) < 0.08 && (x * 0.5) % 1 < 0.55;
    const edge = Math.abs(Math.abs(w) - 2.2) < 0.05;
    add([x, ground(x, z) + 0.04, z], [0, 1, 0], centre ? [0.95, 0.78, 0.2] : edge ? [0.6, 0.58, 0.55] : [0.74, 0.72, 0.68], 0.07);
  }

  const pts = specks({ blend: 'normal',
    attributes: pk.attributes(),
    decl: 'attribute vec3 aNormal; attribute vec3 aColor; attribute vec2 aWin;',
    body: /* glsl */ `
      vec3 n = normalize(aNormal + vec3(0.0, 1e-3, 0.0));
      vec3 V = normalize(position - cameraPosition);
      float rim = pow(1.0 - abs(dot(n, -V)), 2.5) * max(dot(V, uSunDir), 0.0);
      float sd = clamp((dot(n, uSunDir) + 0.3) / 1.3, 0.0, 1.0) * uSunVis * (1.0 - deckShadow(position));
      vec3 L = uSunColor * sd * 1.1 + uAmb * (0.2 + 0.22 * n.y) + uMoonColor * max(dot(n, uMoonDir), 0.0) * uMoonVis * uMoonLit * 0.3;
      col = aColor * L + mix(uSunColor, aColor * 1.6, 0.5) * rim * uSunVis * 0.2 + aColor * pierGlow(position) * 0.5;
      alpha = 0.88;`,
    maxPx: 8,
  });
  scene.add(pts);
  scene.add(solid(boxGeometry(solids), { albedo: [0.56, 0.72, 0.84], tone: 0.4 }));

  // what you walk round: towers, nets and the rings
  const obstacles = [];
  for (const [tx, d] of TOWERS) {
    const tz = shoreZ(tx) + d;
    obstacles.push({ x0: tx - 1.8, x1: tx + 1.8, z0: tz - 2.9, z1: tz + 5.9 });
  }
  for (const [cx, cz] of COURTS) obstacles.push({ x0: cx - 4.3, x1: cx + 4.3, z0: cz - 0.06, z1: cz + 0.06 });
  obstacles.push({ x: RINGS.x - 2.4, z: RINGS.z, r: 0.15 }, { x: RINGS.x + 2.4, z: RINGS.z, r: 0.15 }, { x0: RINGS.x + 3.9, x1: RINGS.x + 7.1, z0: RINGS.z - 0.35, z1: RINGS.z + 0.35 });

  return {
    obstacles,
    casters(out) {
      for (const c of casters) out.push(c);
    },
  };
}
