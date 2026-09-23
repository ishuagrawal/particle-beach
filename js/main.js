// Renderer, camera, bloom, the beach clock, controls and the frame loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { U } from './core.js';
import { SITE, VIEW, PLACES, sandHeight } from './site.js';
import { sunPosition, moonPosition, moonIllumination, moonPhaseName, localSidereal, beachParts, beachHour, atBeachHour, sunEvents } from './astro.js';
import { applySky, samplePalette, phaseName, fmtClock, fmt12 } from './palette.js';
import { WalkControls } from './walk.js';
import { createSky } from './sky.js';
import { createSea, setCasters } from './sea.js';
import { createBreakers } from './breakers.js';
import { RibbonSystem } from './ribbons.js';
import { createPier } from './pier.js';
import { createPark } from './park.js';
import { createDistance } from './distance.js';
import { createShore } from './shore.js';
import { createBeach } from './beach.js';
import { createCrowd } from './crowd.js';
import { createPeople } from './people.js';
import { createPlay } from './play.js';
import { createWater } from './water.js';
import { createPierLife } from './pierlife.js';
import { createWildlife } from './wildlife.js';
import { createTraffic } from './traffic.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  document.body.classList.add('no-webgl');
  throw err;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.12, 4000);
camera.position.set(VIEW.x, sandHeight(VIEW.x, VIEW.z) + VIEW.eye, VIEW.z);
const portrait = window.innerWidth < window.innerHeight;
const controls = new WalkControls(camera, canvas, {
  yaw: portrait ? VIEW.yawPortrait : VIEW.yaw,
  pitch: VIEW.pitch,
  fov: portrait ? 68 : 50,
  fovMax: portrait ? 78 : 64,
});
controls.onInteract = () => $('hint').classList.add('used');
const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();

const sky = createSky(scene);
const sea = createSea(scene);
const breakers = createBreakers(scene);
const ribbons = new RibbonSystem(scene, 8000);
// each layer: { update?(t, dt, ctx), casters?(out), obstacles? }
const layers = [sea, breakers, createDistance(scene), createShore(scene), createPier(scene), createPark(scene, ribbons), createBeach(scene)];
const crowd = createCrowd(scene);
layers.push(crowd);
const play = createPlay(scene, ribbons);
layers.push(createPeople(scene, ribbons, { crowd }), play, createWater(scene, ribbons), createPierLife(scene), createWildlife(scene, ribbons));
layers.push(createTraffic(scene, ribbons, { sunsetLabel: `SUNSET TONIGHT ${fmt12(sunEvents(Date.now()).sunset).toUpperCase()}` }));
for (const l of layers) controls.addObstacles(l.obstacles);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  U.uPR.value = renderer.getPixelRatio();
  updateScale();
  drawStrip();
}
function updateScale() {
  U.uScale.value = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

// ---- The beach clock --------------------------------------------------------

const CYCLE_SECONDS = 150;
const wrap = (h) => ((h % 24) + 24) % 24;
const state = { mode: 'live', hour: beachHour(Date.now()), tween: null, dragging: false };
let dayRef = Date.now();
let dayKey = '';
let events = null;
let presets = {};

function refreshDay(ms) {
  const p = beachParts(ms);
  const key = `${p.y}-${p.mo}-${p.d}`;
  if (key === dayKey) return;
  dayKey = key;
  dayRef = ms;
  events = sunEvents(ms);
  presets = {
    firstlight: events.civilDawn + 0.1,
    sunrise: events.sunrise + 0.05,
    midday: events.noon,
    golden: (events.goldenStart + events.sunset) / 2,
    sunset: events.sunset - 0.06,
    bluehour: events.civilDusk - 0.12,
    night: 22.5,
  };
  document.querySelectorAll('[data-preset]').forEach((b) => (b.title = fmt12(presets[b.dataset.preset])));
  $('times').textContent = `Sunrise ${fmt12(events.sunrise)} · Sunset ${fmt12(events.sunset)}`;
  drawStrip();
}

const ui = {
  clock: $('clock'), zone: $('zone'), phase: $('phase'), sun: $('sun'), moon: $('moon'),
  source: $('source'), yours: $('yours'), live: $('live'), cycle: $('cycle'), time: $('time'), strip: $('strip'), boot: $('boot'),
};

function setMode(mode) {
  state.mode = mode;
  ui.live.setAttribute('aria-pressed', String(mode === 'live'));
  ui.cycle.setAttribute('aria-pressed', String(mode === 'cycle'));
  ui.cycle.textContent = mode === 'cycle' ? 'Pause cycle' : 'Cycle the day';
}

function tweenTo(target, dur = 2.2) {
  const delta = ((((target - state.hour) % 24) + 36) % 24) - 12;
  state.tween = { from: state.hour, delta, t: 0, dur: reduceMotion ? 0.01 : dur };
}

ui.live.addEventListener('click', () => {
  setMode('live');
  tweenTo(beachHour(Date.now()));
});
ui.cycle.addEventListener('click', () => {
  state.tween = null;
  setMode(state.mode === 'cycle' ? 'manual' : 'cycle');
});
ui.time.addEventListener('input', () => {
  setMode('manual');
  state.tween = null;
  state.hour = Number(ui.time.value) / 60;
});
ui.time.addEventListener('pointerdown', () => (state.dragging = true));
window.addEventListener('pointerup', () => (state.dragging = false));
document.querySelectorAll('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    setMode('manual');
    tweenTo(presets[b.dataset.preset]);
  })
);
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('button, input')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    ui.cycle.click();
  } else if (e.key === '[' || e.key === ']') {
    setMode('manual');
    state.tween = null;
    state.hour = wrap(state.hour + (e.key === '[' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 6));
  } else if (e.key.toLowerCase() === 'l') ui.live.click();
});

// ---- Go to: glide to a named spot ----
const placeNav = $('places');
for (const [key, p] of Object.entries(PLACES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mode';
  b.dataset.place = key;
  b.textContent = p.label;
  placeNav.append(b);
}
const placeButtons = [...placeNav.querySelectorAll('[data-place]')];
$('placesToggle').addEventListener('click', (e) => {
  const open = placeNav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
placeButtons.forEach((b) =>
  b.addEventListener('click', () => {
    controls.goTo(b.dataset.place, window.innerWidth < window.innerHeight);
    placeNav.classList.remove('open');
    $('placesToggle').setAttribute('aria-expanded', 'false');
  })
);
controls.onPlace = (key) => placeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === key)));
controls.onPlace('home');

// ---- Day strip: today's sky as specks, with the sun's and moon's arcs ----

const stripPal = {};
const stripCol = new THREE.Color();
function drawStrip() {
  const c = ui.strip;
  if (!events) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const pitch = 3.4;
  const cols = Math.floor(w / pitch);
  const rows = Math.max(4, Math.floor(h / pitch));
  const top = Math.max(events.noonAlt, 40) + 8;
  const yOf = (alt) => h / 2 - (alt / top) * (h / 2 - 3);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < cols; i++) {
    const hour = ((i + 0.5) / cols) * 24;
    const ms = atBeachHour(dayRef, hour);
    const s = sunPosition(ms);
    samplePalette(s.apparent, s.az < 180, stripPal);
    const x = (i + 0.5) * pitch;
    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      stripCol.copy(stripPal.top).lerp(stripPal.hor, Math.min(1, v * 1.6));
      if (v > 0.5) stripCol.copy(stripPal.deep).lerp(stripPal.lit, 1 - v);
      stripCol.multiplyScalar(0.7 + 0.9 * stripPal.bg);
      g.globalAlpha = 0.28 + 0.4 * rnd();
      g.fillStyle = stripCol.getStyle();
      g.beginPath();
      g.arc(x + (rnd() - 0.5), (j + 0.5) * pitch, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = s.alt > -1 ? 0.95 : 0.25;
    g.fillStyle = stripPal.sun.getStyle();
    g.beginPath();
    g.arc(x, yOf(s.alt), s.alt > -1 ? 1.5 : 0.9, 0, Math.PI * 2);
    g.fill();
    const m = moonPosition(ms);
    if (m.alt > 0) {
      g.globalAlpha = 0.75 * (1 - stripPal.day * 0.6);
      g.fillStyle = '#c4d0ff';
      g.beginPath();
      g.arc(x, yOf(m.alt), 1.1, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 0.35;
  g.fillStyle = '#eef3f5';
  for (let x = 1; x < w; x += 6) g.fillRect(x, h / 2, 1.5, 1);
  g.globalAlpha = 1;
}

// ---- Readout ------------------------------------------------------------------

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (az) => COMPASS[Math.round(az / 22.5) % 16];
const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const tint = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const tintPal = {};
let sky0 = null;

function updateUI(ms) {
  const { sun, moon, illum } = sky0;
  const p = beachParts(ms);
  ui.clock.textContent = fmtClock(state.hour);
  ui.zone.textContent = p.zone;
  const rising = sun.az < 180;
  ui.phase.textContent = phaseName(sun.apparent, rising);
  ui.sun.textContent = `Sun ${sun.apparent >= 0 ? '+' : '−'}${Math.abs(sun.apparent).toFixed(1)}° ${compass(sun.az)}`;
  ui.moon.textContent = `${moonPhaseName(illum.phase)} ${Math.round(illum.fraction * 100)}%${moon.alt > 0 ? '' : ', set'}`;
  ui.source.textContent = state.mode === 'live' ? 'Live' : state.mode === 'cycle' ? `A day every ${CYCLE_SECONDS / 60} min` : 'Set by hand';
  if (viewerTz !== SITE.tz) {
    const yours = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    ui.yours.textContent = `Your time ${yours}`;
  }
  if (!state.dragging) ui.time.value = String(Math.round(state.hour * 60) % 1440);
  ui.time.setAttribute('aria-valuetext', `${fmtClock(state.hour)} ${p.zone}, ${phaseName(sun.apparent, rising)}`);
  samplePalette(sun.apparent, rising, tintPal);
  tint.copy(tintPal.sun).lerp(tintPal.hor, 0.3).lerp(WHITE, 0.4);
  document.documentElement.style.setProperty('--tint', tint.getStyle());
}

// ---- Adaptive resolution ------------------------------------------------------

let slow = 0;
function adapt(dt) {
  slow = dt > 1 / 36 ? slow + dt : Math.max(0, slow - dt * 0.5);
  if (slow > 2.5 && pixelRatio > 0.8) {
    pixelRatio = Math.max(0.75, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    resize();
    slow = 0;
  }
}

// ---- Loop -----------------------------------------------------------------------

const clock = new THREE.Clock();
let t = 0;
let uiAcc = 1;
let first = true;
const castList = [];

function step(dt) {
  t += dt;
  const tw = state.tween;
  if (tw) {
    tw.t += dt;
    const p = Math.min(1, tw.t / tw.dur);
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    state.hour = wrap(tw.from + tw.delta * e);
    if (p >= 1) state.tween = null;
  } else if (state.mode === 'live') state.hour = beachHour(Date.now());
  else if (state.mode === 'cycle') state.hour = wrap(state.hour + (dt * 24) / CYCLE_SECONDS);

  const ms = state.mode === 'live' && !tw ? Date.now() : atBeachHour(dayRef, state.hour);
  refreshDay(state.mode === 'live' ? Date.now() : dayRef);
  const sun = sunPosition(ms);
  const moon = moonPosition(ms);
  const illum = moonIllumination(ms);
  sky0 = { sun, moon, illum };

  U.uTime.value = t;
  applySky({ sun, moon, illum, hour: state.hour });
  if (controls.update(dt, t)) updateScale();
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  sky.update(camera, { lst: localSidereal(ms), illum, moonPos: moon });
  const ctx = { hour: state.hour, sun, moon, camera, frustum, t };
  castList.length = 0;
  for (const l of layers) {
    l.update?.(t, dt, ctx);
    l.casters?.(castList);
  }
  setCasters(castList, camera.position);
  ribbons.update(t, camera.position, frustum);
  composer.render();

  uiAcc += dt;
  if (uiAcc > 0.1) {
    uiAcc = 0;
    updateUI(ms);
  }
  if (first) {
    first = false;
    ui.boot.hidden = true;
  }
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  step(dt);
  adapt(dt);
  requestAnimationFrame(frame);
}

if (location.hash === '#debug') window.__beach = { state, step, renderer, setMode, controls, layers, scene, camera, U, sea, crowd, breakers, play };

window.addEventListener('resize', resize);
setMode('live');
refreshDay(Date.now());
resize();
requestAnimationFrame(frame);

export { scene, layers, ribbons };
