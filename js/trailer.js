// The trailer (#trailer): a one-minute cut across the beach's day, mostly at
// sunset, rendered frame by frame for record.mjs. It takes over the camera
// and the clock from main.js, renders every output frame as several
// sub-frames spread over a half-open shutter (motion blur) with a jittered
// projection (anti-aliasing), grades the result like a film (anamorphic
// streaks, split toning, vignette, grain, a little lens fringing), letterboxes
// it to 2.39:1 and sets the titles over it on a 2D canvas.
//
// window.__trailer is the recorder's handle:
//   info()                    frame rate, frame count, output size, cue sheet
//   frame(i, { sub, post })   render output frame i; POSTs raw RGBA to `post`
//                             or resolves with a JPEG data URL
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { worldDir } from './site.js';
import { sunPosition, atBeachHour } from './astro.js';
import { buildEdit } from './trailer-shots.js';

const SHUTTER = 0.5; // 180°
const PREROLL = 3; // seconds of simulation before a shot's first frame
const HALTON = (i, b) => {
  let f = 1;
  let r = 0;
  for (; i > 0; i = Math.floor(i / b)) {
    f /= b;
    r += f * (i % b);
  }
  return r;
};

export async function start(api) {
  const { THREE, renderer, composer, camera, state, step } = api;
  const D2R = Math.PI / 180;

  // the equinox, the day the edit is cut for: the sun sets near Point Dume
  const DAY = Date.UTC(2026, 8, 23, 19, 0);
  api.setDay(DAY);
  api.setMode('manual');
  state.tween = null;
  const ev = api.events();
  const sunDir = (hour, out = new THREE.Vector3()) => {
    const s = sunPosition(atBeachHour(DAY, hour));
    return worldDir(s.az, s.apparent, out);
  };
  const probes = {
    pelicans: api.layers.find((l) => l.probe?.pelicans)?.probe.pelicans,
    park: api.layers.find((l) => l.probe?.train)?.probe,
    play: api.play.probe,
  };
  const edit = buildEdit({ THREE, ev, sunDir, probes });
  const { FPS, shots, titles } = edit;
  let at = 0;
  for (const s of shots) {
    s.start = at;
    at += s.dur;
  }
  const DURATION = at;
  const FRAMES = Math.round(DURATION * FPS);

  // ---- camera direction ----

  const pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, roll: 0 };
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  let lastFov = -1;
  api.direct({
    update() {
      camera.position.copy(pose.pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(pose.look);
      if (pose.roll) camera.rotateZ(pose.roll * D2R);
      if (pose.fov !== lastFov) {
        lastFov = pose.fov;
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
        return true;
      }
      return false;
    },
  });

  const shotAt = (T) => {
    for (let i = shots.length - 1; i >= 0; i--) if (T >= shots[i].start - 1e-6) return shots[i];
    return shots[0];
  };
  // handheld / drone float: a few incommensurate sines per axis
  const float = (seed, T, f) =>
    Math.sin(T * 1.13 * f + seed) * 0.5 + Math.sin(T * 2.71 * f + seed * 2.3) * 0.3 + Math.sin(T * 5.9 * f + seed * 4.1) * 0.2;

  function aim(shot, T) {
    const u = Math.min(1, Math.max(0, (T - shot.start) / shot.dur));
    const env = { u, T, local: T - shot.start, dur: shot.dur, probes, ev, sunDir, THREE, seaT: api.getTime() };
    const hour = typeof shot.hour === 'function' ? shot.hour(env) : shot.hour;
    env.hour = hour;
    const c = shot.cam(env);
    pose.pos.copy(c.pos);
    pose.look.copy(c.look);
    pose.fov = c.fov ?? 40;
    pose.roll = c.roll ?? 0;
    const sh = shot.shake ?? 0.15;
    if (sh) {
      // turn the look point about the camera by a small angle, as a hand or a gimbal would
      const d = tmpA.subVectors(pose.look, pose.pos);
      const len = d.length();
      const k = sh * D2R * len * (pose.fov / 40);
      const right = tmpB.set(-d.z, 0, d.x).normalize();
      pose.look.addScaledVector(right, float(1.7, T, 0.6) * k);
      pose.look.y += float(4.2, T, 0.55) * k * 0.8;
      pose.roll += float(7.1, T, 0.4) * sh * 0.6;
    }
    return hour;
  }

  // ---- the clock: every step goes through here ----

  let clock = -1; // trailer time of the last simulated step
  let current = null;

  function advance(T, render) {
    const shot = shotAt(T);
    const hour = aim(shot, T);
    state.hour = ((hour % 24) + 24) % 24;
    const dt = Math.max(1e-4, T - clock);
    clock = T;
    step(dt, render);
  }

  // Cut to `shot`: set its sea clock, then run the world for a few seconds
  // with the camera parked at the shot's first frame so ribbons, waves and
  // people are all in motion when it opens.
  function enter(shot) {
    current = shot;
    const t0 = shot.seaT ?? api.getTime() + 10;
    api.setTime(t0 - PREROLL);
    shot.cue?.(probes);
    const T0 = shot.start;
    clock = T0 - PREROLL;
    for (let k = PREROLL * FPS - 1; k >= 0; k--) {
      const T = T0 - k / FPS;
      const shotT = Math.max(T, T0);
      const hour = aim(shot, shotT);
      state.hour = ((hour % 24) + 24) % 24;
      const dt = T - clock || 1 / FPS;
      clock = T;
      step(dt, false);
    }
    clock = T0;
  }

  // The sub-frame times of output frame i. The world steps through exactly
  // these whether the frame is drawn or skipped, so a shot comes out the same
  // however it is reached: rendered from its first frame, or resumed partway
  // in a fresh page after the recorder restarts Chrome.
  const SHUT = SHUTTER / FPS;
  const subTimes = (i, sub) => Array.from({ length: sub }, (_, s) => (sub === 1 ? i / FPS : i / FPS + ((s + 0.5) / sub) * SHUT));
  let done = -1; // the last output frame of the current shot the world has stepped through

  function seek(i, sub) {
    const shot = shotAt(i / FPS);
    if (shot !== current || i <= done) {
      enter(shot);
      done = Math.ceil(shot.start * FPS - 1e-6) - 1;
    }
    for (let j = done + 1; j < i; j++) subSteps(j, sub, false);
    done = i - 1;
  }

  // Step the world through frame i's sub-frames, each with its own sub-pixel
  // jitter (culling sees the same camera whether or not the frame is drawn),
  // and hand each drawn sub-frame to `each`.
  function subSteps(i, sub, render, each) {
    const times = subTimes(i, sub);
    for (let s = 0; s < sub; s++) {
      const n = i * sub + s + 1;
      camera.setViewOffset(W, H, sub === 1 ? 0 : HALTON(n, 2) - 0.5, sub === 1 ? 0 : HALTON(n, 3) - 0.5, W, H);
      if (render) applyGrade(current, times[s]);
      advance(times[s], render);
      each?.(s);
    }
    camera.clearViewOffset();
  }

  // ---- render targets and passes ----

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const W = size.x;
  const H = size.y;
  const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const acc = rt(W, H);
  const sw = Math.max(64, Math.round(W / 4));
  const shh = Math.max(32, Math.round(H / 4));
  const streakA = rt(sw, shh);
  const streakB = rt(sw, shh);
  composer.renderToScreen = false;

  const accQuad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uW: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tSrc; uniform float uW; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uW, 1.0); }',
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
  );

  // anamorphic streaks: bright spots smeared sideways, in widening passes
  const streakPre = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: acc.texture }, uThr: { value: 0.72 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform float uThr; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb;
          float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(uThr, uThr + 0.25, l), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
  );
  const streakBlur = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uStep: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform float uStep; varying vec2 vUv;
        void main() {
          vec3 s = vec3(0.0); float wsum = 0.0;
          for (int i = -6; i <= 6; i++) {
            float w = exp(-float(i * i) / 18.0);
            s += texture2D(tSrc, vUv + vec2(float(i) * uStep, 0.0)).rgb * w;
            wsum += w;
          }
          gl_FragColor = vec4(s / wsum, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
  );

  const grade = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: acc.texture },
        tStreak: { value: streakA.texture },
        uRes: { value: new THREE.Vector2(W, H) },
        uExposure: { value: 1 },
        uContrast: { value: 1 },
        uSat: { value: 1 },
        uSplit: { value: 0.5 },
        uWarm: { value: 0 },
        uStreak: { value: 0.6 },
        uStreakTint: { value: new THREE.Color(0.55, 0.75, 1.0) },
        uVig: { value: 0.35 },
        uGrain: { value: 0.03 },
        uCA: { value: 0.0015 },
        uLift: { value: 0 },
        uFlash: { value: 0 },
        uBlack: { value: 0 },
        uSeed: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform sampler2D tStreak; uniform vec2 uRes;
        uniform float uExposure, uContrast, uSat, uSplit, uWarm, uStreak, uVig, uGrain, uCA, uLift, uFlash, uBlack, uSeed;
        uniform vec3 uStreakTint;
        varying vec2 vUv;
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          vec2 d = vUv - 0.5;
          float r2 = dot(d * vec2(uRes.x / uRes.y, 1.0), d * vec2(uRes.x / uRes.y, 1.0));
          // lens fringing, growing toward the edges
          vec2 ca = d * uCA * (0.4 + 2.0 * r2);
          vec3 c = vec3(texture2D(tSrc, vUv - ca).r, texture2D(tSrc, vUv).g, texture2D(tSrc, vUv + ca).b);
          vec3 st = texture2D(tStreak, vUv).rgb;
          c += st * uStreak * mix(vec3(1.0), uStreakTint, 0.6);
          c *= uExposure;
          // split toning: teal shadows, warm highlights
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec3 shadowTint = vec3(-0.018, 0.006, 0.03);
          vec3 hiTint = vec3(0.035, 0.008, -0.03);
          c += shadowTint * (1.0 - smoothstep(0.0, 0.45, l)) * uSplit + hiTint * smoothstep(0.35, 1.0, l) * uSplit;
          c += vec3(0.03, 0.005, -0.03) * uWarm;
          // filmic contrast about mid-grey, then saturation
          c = max(c, 0.0);
          c = pow(c, vec3(1.0 / 2.2));
          c = (c - 0.5) * uContrast + 0.5;
          c = pow(max(c, 0.0), vec3(2.2));
          l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          c = c * (1.0 - uLift) + uLift * vec3(0.02, 0.028, 0.04);
          // vignette
          c *= 1.0 - uVig * smoothstep(0.1, 0.9, r2);
          // flash and fade
          c = mix(c, vec3(1.0, 0.94, 0.86), uFlash);
          c *= 1.0 - uBlack;
          // grain, strongest in the mids and shadows
          float g = hash(vUv * uRes + uSeed * 91.7) + hash(vUv * uRes * 1.37 + uSeed * 53.1) - 1.0;
          c += g * uGrain * (0.35 + 0.65 * (1.0 - smoothstep(0.1, 0.8, l)));
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
  );
  const G = grade.material.uniforms;
  const DEF = { exposure: 1, contrast: 1.06, sat: 1.06, split: 0.6, warm: 0, streak: 0.55, vig: 0.38, grain: 0.028, ca: 0.0016, lift: 0 };
  const lerp = (a, b, k) => a + (b - a) * k;

  function applyGrade(shot, T) {
    const g = { ...DEF, ...(typeof shot.grade === 'function' ? shot.grade((T - shot.start) / shot.dur) : shot.grade) };
    G.uExposure.value = g.exposure;
    G.uContrast.value = g.contrast;
    G.uSat.value = g.sat;
    G.uSplit.value = g.split;
    G.uWarm.value = g.warm;
    G.uStreak.value = g.streak;
    G.uVig.value = g.vig;
    G.uGrain.value = g.grain;
    G.uCA.value = g.ca;
    G.uLift.value = g.lift;
    // transitions: a flash that decays after a cut, fades from and to black
    let flash = 0;
    let black = 0;
    const local = T - shot.start;
    const tin = shot.in;
    if (tin?.type === 'flash') flash = Math.max(flash, (tin.amount ?? 0.85) * Math.exp(-local / (tin.dur ?? 0.12)));
    if (tin?.type === 'black') black = Math.max(black, 1 - Math.min(1, local / tin.dur));
    const tout = shot.out;
    const left = shot.start + shot.dur - T;
    if (tout?.type === 'black') black = Math.max(black, 1 - Math.min(1, left / tout.dur));
    if (tout?.type === 'flash') flash = Math.max(flash, (tout.amount ?? 0.6) * Math.pow(1 - Math.min(1, left / (tout.dur ?? 0.1)), 2));
    for (const f of edit.fades ?? []) {
      if (T >= f.from && T <= f.to) black = Math.max(black, lerp(f.a, f.b, (T - f.from) / (f.to - f.from)));
    }
    G.uFlash.value = Math.min(1, flash);
    G.uBlack.value = Math.min(1, black);
    const bl = shot.bloom ?? {};
    api.bloom.strength = bl.strength ?? 0.55;
    api.bloom.radius = bl.radius ?? 0.45;
    api.bloom.threshold = bl.threshold ?? 0.6;
  }

  // ---- compositing: letterbox bars and titles on a 2D canvas ----

  const FULL_H = Math.round((W * 9) / 16 / 2) * 2;
  const bar = Math.round((FULL_H - H) / 2);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = FULL_H;
  const g2 = out.getContext('2d', { willReadFrequently: true });
  const px = W / 1920; // titles are laid out on a 1920-wide frame
  await Promise.all([
    document.fonts.load(`italic 100px "Instrument Serif"`),
    document.fonts.load(`100px "Instrument Serif"`),
    document.fonts.load(`20px "Fragment Mono"`),
  ]).catch(() => {});

  const ease = (k) => k * k * (3 - 2 * k);
  function drawTitles(T) {
    for (const ti of titles) {
      if (T < ti.from || T > ti.to) continue;
      const fin = ti.fadeIn ?? 0.8;
      const fout = ti.fadeOut ?? 0.8;
      const a = ease(Math.min(1, (T - ti.from) / fin)) * ease(Math.min(1, (ti.to - T) / fout));
      const k = (T - ti.from) / (ti.to - ti.from);
      for (const line of ti.lines) {
        g2.save();
        g2.globalAlpha = a * (line.alpha ?? 1);
        g2.font = `${line.style ?? ''} ${line.size * px}px ${line.font === 'mono' ? '"Fragment Mono", monospace' : '"Instrument Serif", serif'}`;
        const track = (line.track ?? 0) + (line.trackGrow ?? 0) * k;
        g2.letterSpacing = `${track * line.size * px}px`;
        g2.textAlign = 'center';
        g2.textBaseline = 'alphabetic';
        g2.fillStyle = line.color ?? '#f4efe6';
        g2.shadowColor = line.glow ?? 'rgba(255, 200, 150, 0.35)';
        g2.shadowBlur = 24 * px;
        const blur = (1 - Math.min(1, (T - ti.from) / fin)) * 10 * px;
        if (blur > 0.3) g2.filter = `blur(${blur}px)`;
        const y = FULL_H / 2 + line.y * px;
        // tracking adds space after the last letter too; nudge it back to centre
        g2.fillText(line.text, W / 2 + (line.x ?? 0) * px + (track * line.size * px) / 2, y);
        g2.restore();
      }
    }
  }

  // ---- one output frame ----

  async function frame(i, { sub = 8, post = null, quality = 0.9 } = {}) {
    const T0 = i / FPS;
    seek(i, sub);
    const shot = current;
    const open = SHUT;
    subSteps(i, sub, true, (s) => {
      accQuad.material.uniforms.tSrc.value = composer.readBuffer.texture;
      accQuad.material.uniforms.uW.value = 1 / sub;
      renderer.setRenderTarget(acc);
      if (s === 0) {
        renderer.setClearColor(0x000000, 1);
        renderer.clear(true, false, false);
      }
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      accQuad.render(renderer);
      renderer.autoClear = autoClear;
    });
    done = i;
    const Tm = T0 + (sub === 1 ? 0 : open / 2);
    applyGrade(shot, Tm);
    renderer.setRenderTarget(streakA);
    streakPre.render(renderer);
    let src = streakA;
    let dst = streakB;
    for (const k of [1, 3, 9]) {
      streakBlur.material.uniforms.tSrc.value = src.texture;
      streakBlur.material.uniforms.uStep.value = (k * 1.4) / sw;
      renderer.setRenderTarget(dst);
      streakBlur.render(renderer);
      [src, dst] = [dst, src];
    }
    G.tStreak.value = src.texture;
    G.uSeed.value = i % 97;
    renderer.setRenderTarget(null);
    grade.render(renderer);

    g2.fillStyle = '#000';
    g2.fillRect(0, 0, W, FULL_H);
    g2.drawImage(renderer.domElement, 0, bar);
    drawTitles(Tm);
    if (edit.overlay) edit.overlay(g2, Tm, { W, H: FULL_H, px, bar });

    if (post) {
      const img = g2.getImageData(0, 0, W, FULL_H);
      const r = await fetch(post, { method: 'POST', body: img.data.buffer });
      if (!r.ok) throw new Error(`frame ${i}: ${r.status}`);
      return i;
    }
    return out.toDataURL('image/jpeg', quality);
  }

  window.__trailer = {
    info: () => ({
      fps: FPS,
      frames: FRAMES,
      duration: DURATION,
      width: W,
      height: FULL_H,
      bpm: edit.BPM,
      shots: shots.map((s) => ({ id: s.id, start: s.start, dur: s.dur, hour: typeof s.hour === 'function' ? null : s.hour, sfx: s.sfx ?? null, bed: s.bed ?? null })),
      cues: edit.cues ?? [],
      events: ev,
    }),
    frame,
    seek: (T) => seek(Math.round(T * FPS), 1),
    api,
    edit,
  };
  window.dispatchEvent(new Event('trailer-ready'));
}
