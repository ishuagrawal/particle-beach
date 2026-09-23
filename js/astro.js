// Sun and moon positions and the moon's phase, following Vladimir Agafonkin's
// SunCalc (BSD-2) and the Astronomy Answers formulas it is built on, plus the
// beach's own wall clock via Intl.
import { SITE } from './site.js';

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQ = RAD * 23.4397;

const toDays = (ms) => ms / DAY_MS - 0.5 + J1970 - J2000;
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBLIQ) - Math.tan(b) * Math.sin(OBLIQ), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBLIQ) + Math.cos(b) * Math.sin(OBLIQ) * Math.sin(l));
const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const sidereal = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

/** Atmospheric refraction lift (radians) for a true altitude h (radians). */
function refraction(h) {
  const x = Math.max(h, -0.01);
  return 0.0002967 / Math.tan(x + 0.00312536 / (x + 0.08901179));
}

function horizontal(ms, c) {
  const lw = RAD * -SITE.lon;
  const phi = RAD * SITE.lat;
  const H = sidereal(toDays(ms), lw) - c.ra;
  // SunCalc measures azimuth from south toward west; convert to a compass bearing.
  const az = ((azimuth(H, phi, c.dec) / RAD + 180) % 360 + 360) % 360;
  return { H, phi, az, alt: altitude(H, phi, c.dec) };
}

/** Sun bearing (deg), true altitude and apparent (refracted) altitude (deg). */
export function sunPosition(ms) {
  const p = horizontal(ms, sunCoords(toDays(ms)));
  return { az: p.az, alt: p.alt / RAD, apparent: (p.alt + (p.alt > -0.035 ? refraction(p.alt) : 0)) / RAD };
}

export function moonPosition(ms) {
  const c = moonCoords(toDays(ms));
  const p = horizontal(ms, c);
  const parallactic = Math.atan2(Math.sin(p.H), Math.tan(p.phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(p.H));
  return { az: p.az, alt: (p.alt + refraction(p.alt)) / RAD, parallactic };
}

/**
 * fraction lit (0–1), phase (0 new → 0.5 full → 1 new), the sun–moon–earth
 * angle, and the position angle of the bright limb measured from north.
 */
export function moonIllumination(ms) {
  const d = toDays(ms);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
  );
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI, inc, angle };
}

/** Local sidereal time at the beach, radians: how far the sky has turned. */
export const localSidereal = (ms) => sidereal(toDays(ms), RAD * -SITE.lon);

const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
export const moonPhaseName = (phase) => PHASES[Math.round(phase * 8) % 8];

// ---- The beach's wall clock -------------------------------------------------

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: SITE.tz,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  timeZoneName: 'short',
});

export function beachParts(ms) {
  const o = {};
  for (const p of PARTS.formatToParts(ms)) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, zone: o.timeZoneName };
}

export function beachHour(ms) {
  const p = beachParts(ms);
  return p.h + p.mi / 60 + p.s / 3600;
}

function offsetMs(ms) {
  const p = beachParts(ms);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms for beach-local `hour` on the beach's calendar day containing `dayMs`. */
export function atBeachHour(dayMs, hour) {
  const p = beachParts(dayMs);
  const wall = Date.UTC(p.y, p.mo - 1, p.d) + hour * 3600000;
  const first = wall - offsetMs(wall);
  return wall - offsetMs(first);
}

/**
 * Beach-local hours when today's sun crosses the altitudes that name the
 * light: astronomical, nautical and civil twilight, rise and set (−0.833°,
 * the upper limb with refraction), and the 6° edge of golden hour.
 */
export function sunEvents(dayMs) {
  const t0 = atBeachHour(dayMs, 0);
  const step = 2 / 60;
  const alts = [];
  let noon = 12;
  let best = -90;
  for (let i = 0; i * step <= 24 + 1e-9; i++) {
    const a = sunPosition(t0 + i * step * 3600000).alt;
    alts.push(a);
    if (a > best) {
      best = a;
      noon = i * step;
    }
  }
  const cross = (thr) => {
    let up = null;
    let down = null;
    for (let i = 1; i < alts.length; i++) {
      const a = alts[i - 1];
      const b = alts[i];
      if (a < thr && b >= thr && up === null) up = (i - 1 + (thr - a) / (b - a)) * step;
      if (a >= thr && b < thr) down = (i - 1 + (a - thr) / (a - b)) * step;
    }
    return [up, down];
  };
  const [astroDawn, astroDusk] = cross(-18);
  const [nauticalDawn, nauticalDusk] = cross(-12);
  const [civilDawn, civilDusk] = cross(-6);
  const [sunrise, sunset] = cross(-0.833);
  const [goldenEnd, goldenStart] = cross(6);
  return { astroDawn, nauticalDawn, civilDawn, sunrise, goldenEnd, noon, noonAlt: best, goldenStart, sunset, civilDusk, nauticalDusk, astroDusk };
}
