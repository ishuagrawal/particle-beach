// The edit: one minute at 100 BPM (100 beats), mostly at sunset, with two
// flash montages that cut across the rest of the day. Each shot says how
// long it runs, what hour it is (or a time-lapse between two), where the sea
// clock starts (which picks the waves), and where the camera is at every
// moment u (0–1) through the shot. Positions are world metres (see site.js):
// +x up the coast toward the pier, -z out to sea, y up from mean sea level.
import { WHEEL, PIER, PLACES, shoreZ, sandHeight } from './site.js';
import { seaHeight } from './surf.js';

const BPM = 100;
const BEAT = 60 / BPM;
const D2R = Math.PI / 180;

const smooth = (k) => k * k * (3 - 2 * k);
const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const outCubic = (k) => 1 - Math.pow(1 - k, 3);
const inCubic = (k) => k * k * k;
const lerp = (a, b, k) => a + (b - a) * k;

export function buildEdit({ THREE, ev, sunDir, probes }) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const SUNSET = ev.sunset;
  const spline = (pts) => {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)), false, 'centripetal');
    return (k, out = V()) => c.getPoint(Math.min(1, Math.max(0, k)), out);
  };
  const lerpV = (a, b, k) => V(...a).lerp(V(...b), k);
  // a point far off toward the sun, `up` degrees above it
  const towardSun = (hour, from, dist = 800, up = 0) => {
    const d = sunDir(hour);
    const h = Math.hypot(d.x, d.z);
    return V(from.x + (d.x / h) * dist, from.y + Math.tan(Math.atan2(d.y, h) + up * D2R) * dist, from.z + (d.z / h) * dist);
  };
  // a place from the "Go to" row, as a camera with a look point
  const place = (key, { dy = 0, yawOff = 0, pitchOff = 0, fwd = 0 } = {}) => {
    const p = PLACES[key];
    const y0 = p.level === 'deck' ? PIER.deck + 1.65 : Math.max(sandHeight(p.x, p.z), 0) + 1.65;
    const yaw = (p.yaw + yawOff) * D2R;
    const pitch = (p.pitch + pitchOff) * D2R;
    const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const pos = V(p.x, y0 + dy, p.z).addScaledVector(dir, fwd);
    return { pos, look: pos.clone().addScaledVector(dir, 50) };
  };
  const wheelC = V(WHEEL.x, WHEEL.y, WHEEL.z);

  const shots = [];
  const shot = (beats, o) => shots.push({ dur: beats * BEAT, ...o });

  // ---- 1. The sun going down behind the Pacific Wheel, on a long lens ----
  {
    const h0 = SUNSET - 0.105;
    const h1 = SUNSET - 0.05;
    const d = sunDir((h0 + h1) / 2);
    const hz = Math.hypot(d.x, d.z);
    const L = 205;
    const el = Math.atan2(d.y, hz);
    const base = V(WHEEL.x - (d.x / hz) * L, WHEEL.y + 0.8 - Math.tan(el) * L, WHEEL.z - (d.z / hz) * L);
    const side = V(-d.z / hz, 0, d.x / hz);
    shot(9, {
      id: 'sun-wheel',
      hour: ({ u }) => lerp(h0, h1, u),
      seaT: 400,
      in: { type: 'black', dur: 1.8 },
      shake: 0.035,
      grade: { exposure: 1.02, warm: 0.6, streak: 0.9, vig: 0.45 },
      bloom: { strength: 0.75, radius: 0.55, threshold: 0.55 },
      bed: 'surf-far',
      cam: ({ u }) => {
        const pos = base.clone().addScaledVector(side, lerp(-6, 6, u));
        return { pos, look: wheelC.clone().add(V(0, -1.2, 0)), fov: lerp(8.2, 7.0, smooth(u)) };
      },
    });
  }

  // ---- 2. Through the crowd on the sand, the sun going under the pier ----
  shot(8, {
    id: 'crowd-dolly',
    hour: SUNSET - 0.075,
    seaT: 930,
    in: { type: 'cut' },
    shake: 0.22,
    grade: { warm: 0.45, streak: 0.7, exposure: 0.96 },
    bed: 'surf-close',
    cam: ({ u }) => {
      const k = u * 0.7 + inOut(u) * 0.3;
      const x = lerp(-16, 8, k);
      const z = lerp(40, 31, k);
      const pos = V(x, sandHeight(x, z) + lerp(1.0, 1.35, k), z);
      return { pos, look: V(lerp(88, 96, k), 3.2, lerp(-58, -52, k)), fov: 38 };
    },
  });

  // ---- 3. In the water: an overhead set wave throws out against the sun ----
  shot(9, {
    id: 'set-wave',
    hour: SUNSET - 0.16,
    seaT: 1486.1,
    in: { type: 'cut' },
    shake: 0.35,
    grade: { warm: 0.5, streak: 0.4, contrast: 1.12, exposure: 0.78 },
    bloom: { strength: 0.35, threshold: 0.85 },
    bed: 'wave',
    sfx: [{ at: 2.9, type: 'crash' }],
    cam: ({ u, seaT }) => {
      const k = smooth(u);
      const x = lerp(44, 50, k);
      const z = lerp(-79, -76, k);
      const sea = seaHeight(x, z, seaT);
      const pos = V(x, Math.max(1.3 + 1.0 * k, sea + 1.1), z);
      const look = V(lerp(46, 60, k), lerp(2.6, 1.8, k), lerp(-99, -96, k));
      return { pos, look, fov: lerp(40, 44, k) };
    },
  });

  // ---- 4. Flash montage: the pier and the wheel through the day ----
  {
    const hours = [22.6, ev.civilDawn + 0.12, 12.4, 16.6, ev.civilDusk + 0.02, 21.2];
    const grades = [{ exposure: 1.15 }, { exposure: 1.05 }, {}, { warm: 0.3 }, { exposure: 1.1 }, { exposure: 1.1 }];
    hours.forEach((h, i) =>
      shot(1, {
        id: `pier-day-${i}`,
        hour: h,
        seaT: 2000 + i * 37,
        in: { type: 'flash', amount: i === 0 ? 0.8 : 0.35, dur: 0.08 },
        shake: 0.1,
        grade: { streak: 0.6, ...grades[i] },
        bed: 'montage',
        cam: ({ u }) => ({ pos: lerpV([42 - i * 0.4, 2.3, 52], [44.5 - i * 0.4, 2.4, 49], u), look: V(126, 14.5, -38), fov: 30 }),
      })
    );
  }

  // ---- 5. Through the pilings and up: the park against the sun ----
  shot(10, {
    id: 'pilings-rise',
    hour: SUNSET - 0.13,
    seaT: 2500,
    in: { type: 'flash', amount: 0.7, dur: 0.14 },
    shake: 0.18,
    grade: (u) => ({ warm: 0.45, streak: 0.85, exposure: lerp(1.7, 1.0, smooth(Math.min(1, u * 1.6))), lift: lerp(0.04, 0, u) }),
    bloom: { strength: 0.7 },
    bed: 'under-pier',
    cam: ({ u }) => {
      const k = inOut(u);
      const pos = spline([
        [127, 1.6, 64],
        [112, 2.6, 58],
        [98, 9, 50],
        [84, 24, 40],
      ])(k);
      const look = spline([
        [150, 3.5, 20],
        [145, 6, -5],
        [128, 14, -30],
        [WHEEL.x + 2, WHEEL.y - 2, WHEEL.z],
      ])(k);
      return { pos, look, fov: lerp(46, 40, k) };
    },
  });

  // ---- 6. The West Coaster over the top and screaming past ----
  shot(8, {
    id: 'coaster',
    hour: SUNSET - 0.09,
    seaT: 2700,
    in: { type: 'cut' },
    shake: 0.3,
    grade: { warm: 0.4, streak: 0.7, contrast: 1.1, exposure: 0.9 },
    bed: 'coaster',
    sfx: [{ at: 1.4, type: 'coaster-drop' }],
    cue: (p) => p.park?.cue(0.196, 2.6), // tipping over the crest as the shot opens
    cam: ({ u, probes: pr }) => {
      const k = smooth(u);
      const pos = V(lerp(127, 125, k), lerp(19.5, 18.5, k), lerp(-6, -4, k));
      const crest = V(137, 24, -23);
      const train = pr.park ? pr.park.train.clone().add(V(0, 0.8, 0)) : crest;
      const w = smooth(Math.min(1, Math.max(0, (u - 0.06) / 0.25)));
      const look = crest.clone().lerp(train, w * 0.8);
      return { pos, look, fov: lerp(50, 56, k) };
    },
  });

  // ---- 7. Flash montage: the rest of the beach, the rest of the day ----
  {
    const clips = [
      { key: 'volley', hour: 12.6, o: { dy: -0.3, pitchOff: 1 } },
      { key: 'muscle', hour: 9.2, o: { pitchOff: -2, fwd: -3 } },
      { key: 'end', hour: 22.3, o: { yawOff: -80, pitchOff: 4 } },
      { key: 'under', hour: ev.sunrise + 0.3, o: { pitchOff: -2 } },
      { key: 'crowd', hour: 13.4 },
      { key: 'lineup', hour: 8.1, o: { dy: -1.1 } },
    ];
    clips.forEach((c, i) =>
      shot(1, {
        id: `day-${c.key}`,
        hour: c.hour,
        seaT: 3000 + i * 41,
        in: { type: 'flash', amount: 0.35, dur: 0.08 },
        shake: 0.12,
        grade: c.key === 'end' ? { exposure: 1.2 } : {},
        bed: 'montage',
        cam:
          c.key === 'crowd'
            ? ({ u }) => ({ pos: lerpV([-20, 38, 96], [-14, 37, 92], u), look: V(22, 0, 26), fov: 42 })
            : ({ u }) => {
                const p = place(c.key, c.o);
                const dir = p.look.clone().sub(p.pos).normalize();
                return { pos: p.pos.addScaledVector(dir, u * 1.2), look: p.look, fov: 44 };
              },
      })
    );
  }

  // ---- 8. Alongside the pelicans, gliding over the swells ----
  {
    // squadron 0 flies up the coast at 9.5 m/s; start it just south of home
    const L = 1300;
    const lead0 = -40;
    const seaT = (600 + lead0 + 2 * L) / 9.5;
    shot(10, {
      id: 'pelicans',
      hour: SUNSET - 0.05,
      seaT,
      in: { type: 'flash', amount: 0.6, dur: 0.12 },
      shake: 0.2,
      grade: { warm: 0.5, streak: 0.8 },
      bed: 'surf-far',
      cam: ({ u, probes: pr }) => {
        const birds = pr.pelicans?.[0];
        const mid = birds ? birds[2].clone() : V(0, 2, -55);
        const k = smooth(u);
        // ahead of the flock and inshore of it, so they come on side-lit with the sun out of frame
        const pos = mid.clone().add(V(lerp(16, 4, k), 0, lerp(20, 17, k)));
        pos.y = 0.8;
        const look = mid.clone().add(V(lerp(-1, 2, k), 0.5, 0));
        return { pos, look, fov: lerp(24, 20, k), roll: lerp(-1.5, 1, k) };
      },
    });
  }

  // ---- 9. Time-lapse: the sun goes, the wheel lights, the stars come out ----
  shot(12, {
    id: 'timelapse',
    hour: ({ u }) => lerp(SUNSET - 0.03, ev.astroDusk + 0.25, inOut(u)),
    seaT: 3600,
    in: { type: 'cut' },
    shake: 0.04,
    grade: (u) => ({ exposure: lerp(1, 1.25, u), streak: 0.75, warm: lerp(0.4, 0, u) }),
    bloom: { strength: 0.72 },
    bed: 'dusk',
    cam: ({ u }) => ({ pos: lerpV([28, 4.5, 66], [40, 5, 56], u), look: V(128, 16, -46), fov: lerp(36, 32, u) }),
  });

  // ---- 10. Rising over the pier into the afterglow; the title ----
  shot(22, {
    id: 'finale',
    hour: ({ u }) => lerp(SUNSET + 0.1, SUNSET + 0.24, u),
    seaT: 4214.3, // the wheel's rainbow LED program runs through the whole shot
    in: { type: 'flash', amount: 0.45, dur: 0.2 },
    out: { type: 'black', dur: 3.6 },
    shake: 0.06,
    grade: { exposure: 1.0, warm: 0.35, streak: 0.6 },
    bloom: { strength: 0.55, threshold: 0.7 },
    bed: 'finale',
    cam: ({ u }) => {
      const k = outCubic(u);
      const pos = spline([
        [66, 10, 40],
        [44, 30, 70],
        [10, 75, 118],
      ])(k);
      const look = spline([
        [WHEEL.x, WHEEL.y - 2, WHEEL.z],
        [130, 8, -80],
        [150, 0, -230],
      ])(k);
      return { pos, look, fov: lerp(40, 50, k) };
    },
  });

  const t = (b) => b * BEAT;
  const titles = [
    {
      from: 1.9,
      to: 5.2,
      fadeIn: 1.2,
      fadeOut: 0.6,
      lines: [
        { text: 'Santa Monica', style: 'italic', size: 84, y: 232, track: 0.02, trackGrow: 0.04 },
        { text: 'STATE BEACH · CALIFORNIA', font: 'mono', size: 14, y: 272, track: 0.42, alpha: 0.75 },
      ],
    },
    {
      from: t(80) + 0.8,
      to: t(80) + 4.4,
      fadeIn: 1.0,
      lines: [{ text: 'Lit by the real sun and moon', style: 'italic', size: 54, y: -236, track: 0.02, alpha: 0.9 }],
    },
    {
      from: 52.6,
      to: 59.6,
      fadeIn: 1.6,
      fadeOut: 1.2,
      lines: [
        { text: 'Particle Beach', style: 'italic', size: 150, y: -6, track: 0.0, trackGrow: 0.03 },
        { text: 'SANTA MONICA, LIVE ON ITS OWN CLOCK', font: 'mono', size: 16, y: 62, track: 0.4, alpha: 0.8 },
        { text: 'particle-beach.vercel.app', font: 'mono', size: 15, y: 330, track: 0.18, alpha: 0.62 },
      ],
    },
  ];

  return { FPS: 30, BPM, BEAT, shots, titles };
}
