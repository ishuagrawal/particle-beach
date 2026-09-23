// Water and sand. Every surface is a field of specks placed and lit in the
// vertex shader: the sea mirrors the sky and throws glitter from the sun, the
// moon, the wheel's LEDs and the pier lamps; whitewater and swash follow the
// shared surf model; the sand darkens where the swash has been, keeps
// footprints and rake lines, and takes shadows from umbrellas and people.
// Each is a world-anchored LOD field (field.js), so they hold up wherever you
// walk, wade or swim.
import * as THREE from 'three';
import { PIER, sandHeight } from './site.js';
import { Field } from './field.js';

// Shadow casters on the sand: (x, z, radius, height); negative height is a
// canopy (an umbrella top) floating at that height.
const MAX_CASTERS = 40;
export const casters = {
  uCasters: { value: Array.from({ length: MAX_CASTERS }, () => new THREE.Vector4()) },
  uCasterN: { value: 0 },
};

const LIGHTS_GLSL = /* glsl */ `
float lineGlint(vec3 P, vec3 R, float lx, float ly, float z0, float z1, float spacing) {
  vec2 d0 = vec2(P.x - lx, P.y - ly);
  float rr = dot(R.xy, R.xy);
  if (rr < 1e-5) return 0.0;
  float t = -dot(d0, R.xy) / rr;
  if (t <= 0.0) return 0.0;
  float along = P.z + R.z * t;
  if (along < z0 || along > z1) return 0.0;
  float ang = length(d0 + R.xy * t) / max(t, 1.0);
  float pat = pow(0.5 + 0.5 * cos(6.2831853 * along / spacing), 24.0);
  return exp(-ang * ang / 0.0006) * pat;
}
vec3 pierLampGlint(vec3 P, vec3 R) {
  float g = lineGlint(P, R, PIER_X - PIER_HALF + 0.6, PIER_DECK + 4.2, PIER_END, PIER_LAND, 12.0)
          + lineGlint(P, R, ${(PIER.wide.south + 0.6).toFixed(1)}, PIER_DECK + 4.2, ${PIER.wide.z0.toFixed(1)}, ${PIER.wide.z1.toFixed(1)}, 10.0);
  return vec3(1.0, 0.74, 0.45) * g * uLights * 2.2;
}
vec3 skyToward(vec3 R) {
  vec2 rh = normalize(R.xz + 1e-5);
  float toward = dot(rh, normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
  float lowSun = 1.0 - smoothstep(0.1, 0.5, uSunDir.y);
  vec3 h = mix(uSkyAnti, uSkyHorizon, mix(0.5, pow(toward, 2.0), lowSun));
  vec3 c = mix(h, uSkyTop, pow(smoothstep(0.0, 0.8, max(R.y, 0.0)), 0.55));
  float landward = smoothstep(0.15, -0.6, dot(rh, vec2(0.0, -1.0)));
  return c * uBg * 1.1 + uGlow * (0.3 + 0.7 * landward) * exp(-max(R.y, 0.0) / 0.1);
}`;

// Level radii (m): each level hands over to the next at its outer radius.
const NEAR = [2, 2.8, 4, 5.6, 8, 11.3, 16, 22.6, 32, 45, 64, 96, 144, 216, 324, 486];

function makeOcean(scene) {
  return new Field(scene, {
    name: 'ocean',
    coords: 'shore',
    x: [-2600, 2600],
    d: [-2600, 0.6],
    y: [-1.3, 4.6],
    K: 362500,
    cap: 450,
    hRef: 2.7,
    hMin: 0.6,
    surfY: '0.0',
    radii: [...NEAR, 900, 1600, 2600],
    salt: 31,
    maxPx: 14,
    decl: LIGHTS_GLSL,
    body: /* glsl */ `
      vec2 p = vec2(fx, fz);
      float off = -fd;
      vec3 sf = surf(p, uTime);
      vec2 g; float ch = chop(p, uTime, g);
      pos = vec3(fx, sf.x + ch, fz);
      alpha = smoothstep(-0.6, 0.8, off);
      vec3 n = normalize(vec3(-g.x, 1.0, -(g.y + sf.z)));
      vec3 V = normalize(pos - cameraPosition);
      vec3 R = reflect(V, n);
      R.y = abs(R.y);
      float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, -V), 0.0, 1.0), 5.0);
      float shallow = smoothstep(18.0, 1.0, off);
      vec3 body = mix(uWaterDeep, mix(uWaterLit, uSand * 0.8, 0.35), 0.12 + shallow * 0.4) * (0.6 + 0.5 * uDay);
      vec3 base = mix(body, skyToward(R) * 0.8, fres * 0.65);
      float shade = 1.0 - deckShadow(pos) * 0.9;
      float tw = step(0.55, hash11(aSeed * 91.0 + floor(uTime * 8.0 + aSeed * 13.0)));
      float sdot = max(dot(R, uSunDir), 0.0);
      float sunS = pow(sdot, 420.0) * uSunVis * shade;
      float sunB = pow(sdot, 16.0) * uSunVis * shade;
      float mdot = max(dot(R, uMoonDir), 0.0);
      float moonS = pow(mdot, 320.0) * uMoonVis * uMoonLit;
      float moonB = pow(mdot, 20.0) * uMoonVis * uMoonLit;
      float wS = pow(max(dot(R, normalize(WHEEL_C - pos)), 0.0), 30.0) * 2.5;
      vec3 lamps = pierLampGlint(pos, R);
      float white = sf.y * (0.5 + 0.5 * noise2(p * vec2(0.9, 1.4) + vec2(0.0, uTime * 0.25)));
      // a standing crest is thin enough to see light through: glassy teal, gold-rimmed with the sun behind it
      float thin = smoothstep(0.5, 1.8, sf.x) * clamp(-sf.z * 1.1, 0.0, 1.0) * (1.0 - sf.y);
      float behind = pow(max(dot(V, uSunDir), 0.0), 5.0) * uSunVis;
      vec3 glass = vec3(0.1, 0.62, 0.5) * (uAmb * 1.6 + uSunColor * (0.2 * uSunVis + behind * 2.4)) + uSunColor * behind * 0.35;
      base = mix(base, base * 0.6 + glass, thin * 0.85);
      base = mix(base, uFoam * (0.3 + 0.6 * lightAt(n, 0.4)), white * 0.7);
      float bio = uBio * sf.y * (0.55 + 0.45 * sin(uTime * 2.3 + aSeed * 40.0));
      col = base + pierGlow(pos) * 0.1
          + uSunColor * (sunB * 0.3 + sunS * 6.0 * tw)
          + uMoonColor * (moonB * 0.3 + moonS * 5.0 * tw)
          + uWheelCol * wS * (0.4 + 1.6 * tw) + lamps * (0.5 + tw)
          + vec3(0.1, 0.8, 1.0) * bio * 1.4;
      float glints = (sunS + moonS) * tw;
      alpha *= (0.34 + 0.12 * fres + white * 0.4 + thin * 0.2 + glints * 1.1 + wS * tw * 0.4 + length(lamps) * 0.4) * fLod;
      size = (0.02 + distance(pos, cameraPosition) * 0.0027) * (0.85 + 0.3 * aSize) * fGrow * (1.0 + glints * 1.6 + white * 0.3);`,
  });
}

function makeWhitewater(scene) {
  return new Field(scene, {
    name: 'whitewater',
    coords: 'shore',
    x: [-900, 1100],
    d: [-135, 1],
    y: [-1.1, 5.8],
    K: 190000,
    cap: 400,
    hRef: 2.7,
    hMin: 0.6,
    surfY: '0.0',
    radii: NEAR,
    salt: 41,
    maxPx: 12,
    body: /* glsl */ `
      float off = -fd;
      vec2 p = vec2(fx, fz);
      vec3 sf = surf(p, uTime);
      vec2 g; float ch = chop(p, uTime, g);
      pos = vec3(p.x, sf.x + ch + 0.05, p.y);
      float lace = noise2(p * vec2(0.55, 0.9) + vec2(uTime * 0.05, uTime * 0.18)) * 0.65 + noise2(p * 2.3 - uTime * 0.3) * 0.35;
      float cover = sf.y;
      float residual = 0.16 * smoothstep(60.0, 5.0, off) * smoothstep(0.66, 0.88, lace);
      float a = max(cover * smoothstep(0.35, 0.8, lace + cover * 0.3), residual);
      // spray thrown off the lip of a breaking crest
      float spray = step(0.82, hash11(aSeed * 9.3)) * cover * smoothstep(0.35, 0.9, sf.x);
      pos.y += spray * (0.3 + 1.4 * hash11(aSeed * 4.4));
      vec3 n = normalize(vec3(-g.x, 1.0, -(g.y + sf.z)));
      col = uFoam * (0.25 + 0.7 * lightAt(n, 0.5)) + pierGlow(pos) * 0.5
          + vec3(0.1, 0.85, 1.0) * uBio * cover * 1.3 * (0.6 + 0.4 * sin(uTime * 3.0 + aSeed * 30.0));
      alpha = a * (0.4 + 0.3 * hash11(aSeed * 2.0)) * (1.0 - deckShadow(pos) * 0.3) * fLod;
      size = max(0.02, distance(pos, cameraPosition) * 0.0026 * (0.65 + 0.7 * aSize)) * fGrow;`,
  });
}

function makeSwash(scene) {
  return new Field(scene, {
    name: 'swash',
    coords: 'shore',
    x: [-900, 1100],
    d: [-1.2, 19.5],
    y: [-0.6, 1.8],
    K: 200000,
    cap: 700,
    hRef: 2.0,
    hMin: 0.6,
    surfY: 'sandHeight(fx, fz)',
    yAt: (x, z) => sandHeight(x, z),
    radii: NEAR,
    salt: 43,
    maxPx: 10,
    decl: LIGHTS_GLSL,
    body: /* glsl */ `
      float x = fx;
      float d = fd;
      float z = fz;
      float nS = floor((uTime - SURF_LIFE) / SURF_P);
      float cover = 0.0; float edge = 0.0; float drain = 0.0;
      for (int k = -1; k < 3; k++) {
        vec2 sw = swashOf(x, nS - float(k), uTime);
        if (sw.y < 0.0 || sw.y > 10.0) continue;
        float c = step(d, sw.x) * (1.0 - smoothstep(6.5, 9.8, sw.y));
        float e = exp(-pow((d - sw.x) / 0.28, 2.0)) * (1.0 - smoothstep(3.0, 7.5, sw.y));
        cover = max(cover, c);
        edge = max(edge, e);
        drain = max(drain, c * smoothstep(3.2, 6.0, sw.y));
      }
      if (d < 0.0) cover = max(cover, 0.6);
      pos = vec3(x, sandHeight(x, z) + 0.035, z);
      float lace = noise2(vec2(x * 0.7, d * 1.5 + uTime * 0.5 * drain)) * 0.6 + noise2(vec2(x * 2.1, d * 3.7)) * 0.4;
      vec3 V = normalize(pos - cameraPosition);
      vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
      vec3 sheet = skyToward(R) * 0.8 + uSunColor * pow(max(dot(R, uSunDir), 0.0), 60.0) * uSunVis * 2.5
                 + uWheelCol * pow(max(dot(R, normalize(WHEEL_C - pos)), 0.0), 30.0) * 1.5 + pierLampGlint(pos, R);
      float foam = max(edge, cover * smoothstep(0.55, 0.8, lace) * (1.0 - drain * 0.5));
      vec3 foamC = uFoam * (0.3 + 0.65 * lightAt(vec3(0.0, 1.0, 0.0), 0.3)) + vec3(0.1, 0.85, 1.0) * uBio * edge;
      col = mix(sheet, foamC, foam) + pierGlow(pos) * 0.3;
      alpha = (cover * 0.22 + foam * 0.6) * fLod;
      size = max(0.015, distance(pos, cameraPosition) * 0.0022 * (0.7 + 0.6 * aSize)) * fGrow * (1.0 + edge * 0.6);`,
  });
}

function makeSand(scene) {
  return new Field(scene, {
    name: 'sand',
    coords: 'shore',
    x: [-900, 900],
    d: [-1.2, 150],
    y: [-0.6, 3.6],
    K: 87800,
    cap: 1100,
    hRef: 2.0,
    hMin: 0.8,
    surfY: 'sandHeight(fx, fz)',
    yAt: (x, z) => sandHeight(x, z),
    radii: [...NEAR, 800],
    salt: 51,
    maxPx: 6,
    uniforms: casters,
    decl: /* glsl */ `
      uniform vec4 uCasters[${MAX_CASTERS}];
      uniform int uCasterN;
      ${LIGHTS_GLSL}
      float casterShadow(vec3 p) {
        if (uSunDir.y < 0.03) return 0.0;
        vec2 sd = -normalize(uSunDir.xz);
        float k = length(uSunDir.xz) / uSunDir.y; // shadow length per metre of height
        float s = 0.0;
        for (int i = 0; i < ${MAX_CASTERS}; i++) {
          if (i >= uCasterN) break;
          vec4 c = uCasters[i];
          vec2 rel = p.xz - c.xy;
          if (c.w < 0.0) {
            float dist = length(rel - sd * (-c.w) * k);
            s = max(s, 1.0 - smoothstep(c.z * 0.75, c.z, dist));
          } else {
            float t = clamp(dot(rel, sd), 0.0, c.w * k);
            float dist = length(rel - sd * t);
            s = max(s, (1.0 - smoothstep(c.z * 0.5, c.z, dist)) * (1.0 - 0.4 * t / max(c.w * k, 0.01)));
          }
        }
        return s;
      }
      float footprints(vec2 p) {
        float m = 0.0;
        for (int i = 0; i < 5; i++) {
          float fi = float(i);
          float zc = shoreZ(p.x) + 2.5 + fi * 3.4 + 1.3 * sin(p.x * (0.05 + 0.013 * fi) + fi * 2.1);
          float dz = p.y - zc;
          if (abs(dz) > 0.45) continue;
          float s = p.x / 0.68 + fi * 0.37;
          float side = mod(floor(s), 2.0) * 2.0 - 1.0;
          vec2 q = vec2((fract(s) - 0.5) * 0.68 / 0.13, (dz - side * 0.11) / 0.055);
          m = max(m, 1.0 - smoothstep(0.7, 1.0, length(q)));
        }
        return m;
      }`,
    body: /* glsl */ `
      if (fz > 150.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
      float x = fx; float z = fz;
      float d = fd;
      float e = 0.25;
      float hx = (sandHeight(x + e, z) - sandHeight(x - e, z)) / (2.0 * e);
      float hz = (sandHeight(x, z + e) - sandHeight(x, z - e)) / (2.0 * e);
      vec3 spos = vec3(x, sandHeight(x, z) + 0.015, z);
      pos = spos;
      float camD = distance(spos, cameraPosition);
      // wet sand: the saturated lower face plus the last few swashes, drying
      float wet = 1.0 - smoothstep(0.4, 2.4, d);
      if (d < 20.0) {
        float nS = floor((uTime - SURF_LIFE) / SURF_P);
        for (int k = -1; k < 5; k++) {
          float n = nS - float(k);
          vec2 sw = swashOf(x, n, uTime);
          if (sw.y < 0.0) continue;
          wet = max(wet, step(d, swashReach(x, n)) * exp(-max(sw.y - 3.2, 0.0) / 32.0) * 0.85);
        }
      }
      float v = hash11(aSeed * 13.0);
      vec3 albedo = uSand * (0.5 + 0.45 * v);
      vec3 nrm = normalize(vec3(-hx, 1.0, -hz));
      if (camD < 90.0) {
        // footprints near the water, trampled sand above, rake lines on the groomed upper beach
        float fp = footprints(spos.xz) * (1.0 - smoothstep(60.0, 90.0, camD));
        float trample = smoothstep(0.55, 0.8, noise2(spos.xz * 1.7)) * smoothstep(10.0, 18.0, d);
        float groomed = smoothstep(26.0, 34.0, d) * (1.0 - smoothstep(0.35, 0.6, noise2(spos.xz * 0.06)));
        nrm = normalize(nrm + vec3(0.0, 0.0, 0.3 * sin(z * 15.7 + noise2(spos.xz * 0.5) * 2.0)) * groomed * (1.0 - trample));
        albedo *= 1.0 - 0.32 * fp - 0.12 * trample * (hash11(aSeed * 5.0) - 0.3);
        // tyre tracks from the lifeguard trucks
        float tz = 44.0 + 1.5 * sin(x * 0.01);
        float tyre = step(abs(abs(z - tz) - 0.95), 0.16) * (0.75 + 0.25 * step(0.5, fract(x * 3.0)));
        albedo *= 1.0 - 0.18 * tyre;
      }
      float shadow = max(deckShadow(spos), camD < 160.0 ? casterShadow(spos) : 0.0);
      float sd = clamp(dot(nrm, uSunDir), 0.0, 1.0) * uSunVis * (1.0 - shadow);
      vec3 light = uSunColor * sd + uAmb * (0.5 + 0.35 * nrm.y) + uMoonColor * clamp(dot(nrm, uMoonDir), 0.0, 1.0) * uMoonVis * uMoonLit * 0.7;
      col = albedo * light * 0.62 + albedo * pierGlow(spos) * 0.7;
      vec3 V = normalize(spos - cameraPosition);
      vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
      float fres = pow(1.0 - clamp(-V.y, 0.0, 1.0), 4.0);
      vec3 gloss = skyToward(R) * (0.25 + 0.6 * fres)
                 + uSunColor * pow(max(dot(R, uSunDir), 0.0), 90.0) * uSunVis * (1.0 - shadow) * 2.2
                 + uWheelCol * pow(max(dot(R, normalize(WHEEL_C - spos)), 0.0), 25.0) * 1.4 + pierLampGlint(spos, R) * 0.8;
      col = mix(col, col * 0.45 + gloss, wet);
      float glint = step(0.9975, hash11(aSeed * 77.0 + floor(uTime * 3.0 + aSeed * 11.0))) * (0.15 + uDay) * (1.0 - wet) * (1.0 - shadow);
      col += vec3(1.0) * glint * 0.8;
      alpha = (0.5 + 0.2 * v) * fLod;
      size = (0.012 + camD * 0.0031) * (0.85 + 0.3 * aSize) * fGrow * (1.0 + glint * 0.6);`,
  });
}

export function createSea(scene) {
  // drawn in this order: sea, surf, swash, then the sand over them
  const fields = [makeOcean(scene), makeWhitewater(scene), makeSwash(scene), makeSand(scene)];
  return {
    fields,
    update(t, dt, { camera, frustum }) {
      for (const f of fields) f.update(camera, frustum);
    },
  };
}

/** Upload the nearest shadow casters to the sand shader. */
export function setCasters(list, cam) {
  const d = (c) => (c[0] - cam.x) ** 2 + (c[1] - cam.z) ** 2;
  list.sort((a, b) => d(a) - d(b));
  const n = Math.min(list.length, MAX_CASTERS);
  for (let i = 0; i < n; i++) casters.uCasters.value[i].fromArray(list[i]);
  casters.uCasterN.value = n;
}
