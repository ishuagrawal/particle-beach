// The trailer's sound: a score and the beach's ambience, synthesised offline
// with Web Audio and cut to the edit in trailer-shots.js. The score is in D
// major at the edit's 100 BPM: a warm pad and a plucked piano for the opening
// at sunset, a pulse and drums under the flash montages and the pier, a
// breakdown for the pelicans, and a build into braams and a last hit under
// the title. Beneath it all, the surf, gulls, the crowd and the coaster
// follow the shots. renderScore() POSTs a 32-bit float WAV to `post`.

const SR = 48000;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// note names to MIDI numbers, e.g. 'F#4' → 66
const N = (name) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  return base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) + 1);
};
const chord = (s) => s.split(' ').map(N);

export async function renderScore(info, post) {
  const dur = info.duration + 0.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const BEAT = 60 / info.bpm;
  const shot = (id) => info.shots.find((s) => s.id === id) ?? { start: 0, dur: 0 };
  const starts = (prefix) => info.shots.filter((s) => s.id.startsWith(prefix)).map((s) => s.start);

  // seeded noise, so the render is the same every time
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const noiseBuf = (secs, color = 'white') => {
    const b = ctx.createBuffer(2, Math.ceil(secs * SR), SR);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let last = 0;
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = rnd();
        if (color === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else if (color === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099;
          b1 = 0.963 * b1 + w * 0.2965;
          b2 = 0.57 * b2 + w * 1.0526;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        } else d[i] = w;
      }
    }
    return b;
  };
  const WHITE = noiseBuf(4);
  const PINK = noiseBuf(6, 'pink');
  const BROWN = noiseBuf(8, 'brown');

  // ---- mix buses: music and ambience into a glue compressor, with a long hall ----
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  master.connect(comp).connect(ctx.destination);

  const hall = ctx.createConvolver();
  {
    const len = 4.2 * SR;
    const ir = ctx.createBuffer(2, len, SR);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        d[i] = rnd() * Math.pow(1 - i / len, 2.2) * Math.exp(-t * 1.1) * (t < 0.02 ? t / 0.02 : 1);
      }
    }
    hall.buffer = ir;
  }
  const hallIn = ctx.createGain();
  hallIn.gain.value = 0.5;
  hallIn.connect(hall).connect(master);
  const music = ctx.createGain();
  music.gain.value = 0.9;
  music.connect(master);
  const amb = ctx.createGain();
  amb.gain.value = 0.5;
  amb.connect(master);

  const out = (node, { gain = 1, pan = 0, wet = 0.3, bus = music } = {}) => {
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(g).connect(p);
    p.connect(bus);
    if (wet) {
      const w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(hallIn);
    }
    return g;
  };
  const env = (param, t, a, d, peak, sustain = 0, release = 0.3, hold = 0) => {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(sustain * peak, t + a + hold, d / 3);
    if (release) param.setTargetAtTime(0, t + a + hold + d, release / 3);
  };
  const noise = (buf, t, len, rate = 1) => {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, (Math.abs(rnd()) * buf.duration) % buf.duration);
    s.stop(t + len);
    return s;
  };

  // ---- instruments ----

  function pad(notes, t, len, { gain = 0.05, cutoff = 1400, attack = 1.6, release = 2.2, wet = 0.6 } = {}) {
    for (const n of notes) {
      const f = midi(n);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(cutoff * 0.4, t);
      lp.frequency.linearRampToValueAtTime(cutoff, t + attack + len * 0.4);
      lp.frequency.linearRampToValueAtTime(cutoff * 0.6, t + len + release);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.setValueAtTime(gain, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + release);
      for (const [det, pan] of [[-9, -0.6], [0, 0], [8, 0.6]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det + rnd() * 3;
        const p = ctx.createStereoPanner();
        p.pan.value = pan * 0.7;
        o.connect(p).connect(lp);
        o.start(t);
        o.stop(t + len + release + 0.1);
      }
      lp.connect(g);
      out(g, { wet, gain: 0.8 });
    }
  }

  function piano(n, t, { gain = 0.12, len = 3.2, pan = 0, wet = 0.45 } = {}) {
    const f = midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, len / 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
    lp.frequency.setTargetAtTime(f * 2.5, t, 0.4);
    for (const [h, a, type] of [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4, 0.06, 'sine']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * h * (1 + (h - 1) * 0.0006);
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + len + 0.5);
    }
    lp.connect(g);
    out(g, { pan, wet });
  }

  function pluck(n, t, { gain = 0.05, pan = 0, cutoff = 2400 } = {}) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(n);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, 0.07);
    o.connect(lp).connect(g);
    o.start(t);
    o.stop(t + 0.6);
    out(g, { pan, wet: 0.25 });
  }

  function kick(t, { gain = 0.9, f0 = 130, f1 = 42 } = {}) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setTargetAtTime(0, t + 0.02, 0.12);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.8);
    out(g, { wet: 0.08 });
  }

  function taiko(t, { gain = 0.6, pan = 0 } = {}) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setTargetAtTime(0, t + 0.01, 0.2);
    o.connect(g);
    o.start(t);
    o.stop(t + 1.2);
    const n = noise(PINK, t, 0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 180;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.9, t);
    ng.gain.setTargetAtTime(0, t, 0.05);
    n.connect(bp).connect(ng);
    out(g, { pan, wet: 0.35 });
    out(ng, { pan, wet: 0.35 });
  }

  function hat(t, { gain = 0.05, pan = 0.3 } = {}) {
    const n = noise(WHITE, t, 0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setTargetAtTime(0, t, 0.025);
    n.connect(hp).connect(g);
    out(g, { pan, wet: 0.15 });
  }

  // the trailer "braam": a stack of low brass-like saws with a swelling filter
  function braam(t, root = N('D1'), { gain = 0.16, len = 3.4 } = {}) {
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.35);
    lp.frequency.exponentialRampToValueAtTime(260, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.06);
    g.gain.setTargetAtTime(gain * 0.5, t + 0.3, 0.6);
    g.gain.setTargetAtTime(0, t + len * 0.7, len * 0.15);
    for (const [iv, det, type] of [[0, -6, 'sawtooth'], [0, 7, 'sawtooth'], [12, 0, 'square'], [19, 4, 'sawtooth'], [24, -3, 'sawtooth']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midi(root + iv);
      o.detune.value = det;
      o.connect(shaper);
      o.start(t);
      o.stop(t + len + 0.2);
    }
    shaper.connect(lp).connect(g);
    out(g, { wet: 0.5 });
    // sub
    const s = ctx.createOscillator();
    s.frequency.value = midi(root);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(gain * 2.4, t + 0.03);
    sg.gain.setTargetAtTime(0, t + 0.2, len / 4);
    s.connect(sg);
    s.start(t);
    s.stop(t + len);
    out(sg, { wet: 0 });
  }

  function impact(t, { gain = 1 } = {}) {
    kick(t, { gain: 1.1 * gain, f0: 160, f1: 35 });
    const n = noise(BROWN, t, 2.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * gain, t);
    g.gain.setTargetAtTime(0, t, 0.5);
    n.connect(lp).connect(g);
    out(g, { wet: 0.6 });
    const c = noise(WHITE, t, 2.5);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.09 * gain, t);
    cg.gain.setTargetAtTime(0, t, 0.6);
    c.connect(hp).connect(cg);
    out(cg, { wet: 0.5, pan: 0.1 });
  }

  function riser(t0, t1, { gain = 0.12 } = {}) {
    const n = noise(WHITE, t0, t1 - t0 + 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(9000, t1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t1 - 0.02);
    g.gain.linearRampToValueAtTime(0, t1 + 0.03);
    n.connect(bp).connect(g);
    out(g, { wet: 0.4 });
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(midi(N('D3')), t0);
    o.frequency.exponentialRampToValueAtTime(midi(N('D5')), t1);
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 2500;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(gain * 0.25, t1 - 0.02);
    og.gain.linearRampToValueAtTime(0, t1 + 0.03);
    o.connect(lp).connect(og);
    o.start(t0);
    o.stop(t1 + 0.1);
    out(og, { wet: 0.4 });
  }

  function whoosh(t, { gain = 0.14, len = 0.45, pan = 0 } = {}) {
    const n = noise(PINK, t - len * 0.7, len * 1.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t - len * 0.7);
    bp.frequency.exponentialRampToValueAtTime(3500, t);
    bp.frequency.exponentialRampToValueAtTime(600, t + len * 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t - len * 0.7);
    g.gain.exponentialRampToValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.5);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-pan, t - len * 0.7);
    p.pan.linearRampToValueAtTime(pan, t + len * 0.5);
    n.connect(bp).connect(g).connect(p);
    out(p, { wet: 0.2 });
  }

  function reverseSwell(t, len = 1.2, gain = 0.1) {
    const n = noise(WHITE, t - len, len);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t - len);
    g.gain.exponentialRampToValueAtTime(gain, t - 0.01);
    g.gain.linearRampToValueAtTime(0, t);
    n.connect(hp).connect(g);
    out(g, { wet: 0.6 });
  }

  function bell(n, t, gain = 0.035, pan = 0) {
    for (const [r, a] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) {
      const o = ctx.createOscillator();
      o.frequency.value = midi(n) * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * a, t + 0.005);
      g.gain.setTargetAtTime(0, t, 0.9 / r);
      o.connect(g);
      o.start(t);
      o.stop(t + 4);
      out(g, { pan, wet: 0.7 });
    }
  }

  // ---- the score ----

  const T = {
    open: 0,
    crowd: shot('crowd-dolly').start,
    wave: shot('set-wave').start,
    m1: shot('pier-day-0').start,
    rise: shot('pilings-rise').start,
    coaster: shot('coaster').start,
    m2: shot('day-volley').start,
    pelicans: shot('pelicans').start,
    lapse: shot('timelapse').start,
    finale: shot('finale').start,
    end: info.duration,
  };

  const CH = {
    D: chord('D2 D3 A3 C#4 E4 F#4'),
    Bm: chord('B1 B2 F#3 A3 D4 E4'),
    G: chord('G1 G2 D3 F#3 A3 B3'),
    A: chord('A1 A2 E3 A3 C#4 E4'),
    Asus: chord('A1 A2 E3 A3 B3 D4'),
    Em: chord('E2 E3 B3 D4 G4'),
    Fsm: chord('F#2 F#3 C#4 E4 A4'),
  };
  const BAR2 = 8 * BEAT; // chords change every two bars
  const prog = ['D', 'Bm', 'G', 'Asus', 'D', 'Bm', 'G', 'A', 'G', 'D', 'Em', 'Asus', 'D'];
  const padGain = (t) => (t < T.m1 ? 0.03 : t < T.pelicans ? 0.042 : t < T.lapse ? 0.034 : 0.05);
  prog.forEach((c, i) => {
    const t = i * BAR2;
    if (t >= T.end) return;
    const last = i === prog.length - 1;
    pad(CH[c], t, last ? T.end - t - 1 : BAR2, { gain: padGain(t), attack: i === 0 ? 3 : 1.2, release: last ? 3 : 1.6, cutoff: t < T.m1 ? 1100 : t > T.finale ? 2400 : 1700 });
  });

  // piano: a falling motif at sunset, answered in the breakdown
  const motif = [
    [0, 'F#5'], [1, 'E5'], [2, 'D5'], [3.5, 'A4'],
    [8, 'F#5'], [9, 'E5'], [10, 'B4'], [11.5, 'D5'],
    [16, 'D5'], [17, 'B4'], [18, 'A4'], [19.5, 'F#4'],
    [24, 'E5'], [25, 'C#5'], [26, 'A4'], [27.5, 'E4'],
  ];
  for (const [b, n] of motif) {
    const t = 0.6 + b * BEAT;
    if (t < T.m1 - 0.4) piano(N(n), t, { gain: 0.1, pan: -0.15 });
  }
  for (const [b, n] of motif.slice(0, 12)) {
    const t = T.pelicans + 0.3 + b * BEAT * 0.5;
    if (t < T.lapse) piano(N(n) + (b > 10 ? -12 : 0), t, { gain: 0.11, pan: 0.1 });
  }
  // low piano roots under the opening
  piano(N('D2'), 0.6, { gain: 0.14, len: 6 });
  piano(N('B1'), 0.6 + BAR2, { gain: 0.12, len: 6 });

  // the pulse: sixteenth-note arpeggios from the first montage to the pelicans, and again from the time-lapse
  const arp = (t0, t1, gain) => {
    for (let t = t0, i = 0; t < t1 - 0.01; t += BEAT / 2, i++) {
      const c = CH[prog[Math.min(prog.length - 1, Math.floor(t / BAR2))]];
      const tones = c.slice(-4);
      const n = tones[[0, 2, 1, 3, 2, 1, 3, 2][i % 8]] + 12;
      pluck(n, t, { gain: gain * (i % 2 ? 0.7 : 1), pan: i % 2 ? 0.35 : -0.35, cutoff: 1800 + 1400 * ((t - t0) / (t1 - t0)) });
    }
  };
  arp(T.m1, T.pelicans - BEAT, 0.045);
  arp(T.lapse + 4 * BEAT, T.end - 7.2, 0.05);

  // ---- hits, drums and transitions ----

  // opening: a sub swell under the fade from black
  braam(0.15, N('D1'), { gain: 0.07, len: 5 });
  bell(N('A5'), 1.9, 0.03, 0.3);
  bell(N('F#5'), 2.5, 0.025, -0.3);

  // the wave: a riser as it stands up, a braam where it throws
  riser(T.wave + 0.2, T.wave + 2.4, { gain: 0.09 });
  braam(T.wave + 2.4, N('D1'), { gain: 0.17, len: 3.2 });
  impact(T.wave + 2.4, { gain: 0.8 });

  // montage 1: a hit and a whoosh on every cut
  riser(T.m1 - 1.8, T.m1, { gain: 0.1 });
  starts('pier-day').forEach((t, i) => {
    kick(t, { gain: 0.9 });
    whoosh(t, { gain: 0.1, pan: i % 2 ? 0.6 : -0.6 });
    taiko(t + BEAT / 2, { gain: 0.35 });
    hat(t + BEAT / 4);
    hat(t + (3 * BEAT) / 4);
  });
  reverseSwell(T.rise, 1.4, 0.12);
  impact(T.rise, { gain: 0.9 });
  braam(T.rise, N('B0'), { gain: 0.13, len: 3.5 });

  // the build under the pier and the coaster
  for (let t = T.rise + 4 * BEAT; t < T.m2 - 0.05; t += BEAT) {
    const k = (t - T.rise) / (T.m2 - T.rise);
    if (Math.round((t - T.rise) / BEAT) % 2 === 0) taiko(t, { gain: 0.3 + 0.3 * k, pan: -0.2 });
    else kick(t, { gain: 0.35 + 0.3 * k });
    hat(t + BEAT / 2, { gain: 0.03 + 0.04 * k });
  }
  riser(T.coaster - 2.2, T.coaster, { gain: 0.08 });
  impact(T.coaster + 1.2, { gain: 0.6 });
  whoosh(T.coaster + 2.6, { gain: 0.22, len: 0.9, pan: -0.8 });

  // montage 2
  riser(T.m2 - 1.6, T.m2, { gain: 0.1 });
  starts('day-').forEach((t, i) => {
    kick(t, { gain: 1 });
    taiko(t, { gain: 0.45, pan: i % 2 ? 0.3 : -0.3 });
    whoosh(t, { gain: 0.11, pan: i % 2 ? -0.6 : 0.6 });
    hat(t + BEAT / 2, { gain: 0.05 });
  });
  // a breath before the pelicans: everything stops, then the piano
  reverseSwell(T.pelicans, 1.0, 0.08);
  bell(N('D6'), T.pelicans, 0.03);

  // the time-lapse builds again
  for (let t = T.lapse + 8 * BEAT; t < T.finale - 0.05; t += BEAT) {
    const k = (t - T.lapse) / (T.finale - T.lapse);
    kick(t, { gain: 0.3 + 0.5 * k });
    if (k > 0.5) taiko(t + BEAT / 2, { gain: 0.2 + 0.3 * k, pan: 0.25 });
    hat(t + BEAT / 2, { gain: 0.02 + 0.04 * k });
  }
  riser(T.finale - 3.2, T.finale, { gain: 0.15 });
  reverseSwell(T.finale, 2.0, 0.14);

  // the finale: the big hit, a taiko roll into the title, the last hit
  impact(T.finale, { gain: 1.1 });
  braam(T.finale, N('D1'), { gain: 0.2, len: 4.5 });
  for (let k = 0; k < 16; k++) {
    const t = T.finale + 2 * BEAT + k * (BEAT / 2);
    if (t < 52.4) taiko(t, { gain: 0.25 + 0.03 * k, pan: k % 2 ? 0.3 : -0.3 });
  }
  const titleHit = 52.6;
  reverseSwell(titleHit, 1.6, 0.13);
  impact(titleHit, { gain: 1.15 });
  braam(titleHit, N('D1'), { gain: 0.18, len: 6 });
  bell(N('D6'), titleHit + 0.02, 0.04, 0.2);
  bell(N('A5'), titleHit + 0.9, 0.03, -0.3);
  bell(N('F#5'), titleHit + 1.8, 0.025, 0.3);
  piano(N('D2'), titleHit, { gain: 0.16, len: 7 });
  piano(N('A3'), titleHit + 0.01, { gain: 0.07, len: 7 });
  piano(N('F#4'), titleHit + 0.02, { gain: 0.06, len: 7 });

  // ---- ambience ----

  const bed = (buf, t0, t1, { gain, lp = 800, hp = 30, rate = 1, pan = 0, fadeIn = 0.02, fadeOut = 0.02 }) => {
    const n = noise(buf, t0, t1 - t0 + 0.1, rate);
    const l = ctx.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.value = lp;
    const h = ctx.createBiquadFilter();
    h.type = 'highpass';
    h.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + fadeIn);
    g.gain.setValueAtTime(gain, Math.max(t0 + fadeIn, t1 - fadeOut));
    g.gain.linearRampToValueAtTime(0, t1);
    n.connect(l).connect(h).connect(g);
    out(g, { bus: amb, pan, wet: 0.05 });
    return g;
  };
  // surf rolling in: swells of filtered noise every ~5 s, with a crash on top
  const surf = (t0, t1, { gain = 0.3, near = 0.5 } = {}) => {
    bed(BROWN, t0, t1, { gain: gain * 0.6, lp: 500, fadeIn: 0.05, fadeOut: 0.05 });
    for (let t = t0 - 2.5 + Math.abs(rnd()) * 2; t < t1; t += 4.5 + Math.abs(rnd()) * 2.5) {
      const a = Math.max(t, t0);
      const b = Math.min(t + 4, t1);
      if (b - a < 0.2) continue;
      const n = noise(PINK, a, b - a);
      const l = ctx.createBiquadFilter();
      l.type = 'lowpass';
      l.frequency.setValueAtTime(700, a);
      l.frequency.linearRampToValueAtTime(2500 + 3000 * near, Math.min(b, Math.max(a + 0.04, t + 1.3)));
      l.frequency.linearRampToValueAtTime(900, b);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, a);
      g.gain.linearRampToValueAtTime(gain * (0.7 + 0.3 * Math.abs(rnd())), Math.min(b, Math.max(a + 0.05, t + 1.2)));
      g.gain.linearRampToValueAtTime(0, b);
      n.connect(l).connect(g);
      out(g, { bus: amb, pan: rnd() * 0.5, wet: 0.1 });
    }
  };
  const gull = (t, pan = 0, gain = 0.05) => {
    for (let k = 0; k < 3; k++) {
      const s = t + k * 0.24;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(2100, s);
      o.frequency.exponentialRampToValueAtTime(1250, s + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(gain * (1 - k * 0.2), s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22);
      o.connect(bp).connect(g);
      o.start(s);
      o.stop(s + 0.3);
      out(g, { bus: amb, pan, wet: 0.3 });
    }
  };
  const crowd = (t0, t1, gain) => {
    for (const [f, q] of [[450, 3], [1100, 4], [2300, 5]]) {
      const n = noise(PINK, t0, t1 - t0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.3);
      // voices come and go
      for (let t = t0 + 0.3; t < t1 - 0.3; t += 0.18) g.gain.linearRampToValueAtTime(gain * (0.5 + 0.5 * Math.abs(rnd())), t);
      g.gain.linearRampToValueAtTime(0, t1);
      n.connect(bp).connect(g);
      out(g, { bus: amb, pan: rnd() * 0.6, wet: 0.2 });
    }
  };

  surf(0, T.crowd, { gain: 0.16, near: 0 });
  gull(2.2, 0.5, 0.03);
  surf(T.crowd, T.wave, { gain: 0.2, near: 0.3 });
  crowd(T.crowd, T.wave, 0.05);
  gull(T.crowd + 1.4, -0.4, 0.045);
  gull(T.crowd + 3.3, 0.6, 0.035);
  // the set wave: the swell drawing up, then the crash and the bore
  bed(BROWN, T.wave, T.m1, { gain: 0.35, lp: 300, fadeIn: 1.8, fadeOut: 0.05 });
  {
    const t = T.wave + 2.4;
    const n = noise(PINK, t - 0.1, T.m1 - t + 0.1);
    const l = ctx.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.setValueAtTime(8000, t);
    l.frequency.exponentialRampToValueAtTime(1500, T.m1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t - 0.1);
    g.gain.linearRampToValueAtTime(0.42, t + 0.08);
    g.gain.setTargetAtTime(0.2, t + 0.3, 0.8);
    g.gain.linearRampToValueAtTime(0, T.m1);
    n.connect(l).connect(g);
    out(g, { bus: amb, wet: 0.2 });
  }
  surf(T.rise, T.coaster, { gain: 0.14, near: 0.6 });
  bed(BROWN, T.rise, T.coaster, { gain: 0.2, lp: 180, fadeIn: 0.5 }); // the hollow boom under the deck
  // the coaster: lift chain, then the rush and a rumble past the lens
  for (let t = T.coaster; t < T.coaster + 1.1; t += 0.11) {
    const n = noise(WHITE, t, 0.02);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, t);
    g.gain.setTargetAtTime(0, t, 0.008);
    n.connect(bp).connect(g);
    out(g, { bus: amb, pan: 0.3, wet: 0.1 });
  }
  {
    const t0 = T.coaster + 1.1;
    const n = noise(BROWN, t0, T.m2 - t0);
    const l = ctx.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.setValueAtTime(200, t0);
    l.frequency.linearRampToValueAtTime(900, t0 + 1.6);
    l.frequency.linearRampToValueAtTime(250, T.m2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.55, t0 + 1.6);
    g.gain.linearRampToValueAtTime(0, T.m2);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(0.5, t0);
    p.pan.linearRampToValueAtTime(-0.7, t0 + 2.5);
    n.connect(l).connect(g).connect(p);
    out(p, { bus: amb, wet: 0.15 });
  }
  crowd(T.coaster + 0.8, T.m2, 0.03);
  surf(T.pelicans, T.lapse, { gain: 0.2, near: 0.2 });
  bed(PINK, T.pelicans, T.lapse, { gain: 0.05, lp: 5000, hp: 1500, fadeIn: 0.8 }); // wind over the water
  surf(T.lapse, T.finale, { gain: 0.12, near: 0 });
  surf(T.finale, T.end, { gain: 0.1, near: 0 });
  bed(PINK, T.finale, T.end, { gain: 0.04, lp: 4000, hp: 900, fadeIn: 1, fadeOut: 3 });

  // ---- render and encode ----

  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = peak > 0 ? 0.89 / peak : 1; // −1 dBFS
  // fade the very end
  const fadeN = Math.round(0.4 * SR);
  const n = Math.round(info.duration * SR);
  const data = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const f = i > n - fadeN ? (n - i) / fadeN : 1;
    data[i * 2] = L[i] * norm * f;
    data[i * 2 + 1] = R[i] * norm * f;
  }
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + data.byteLength, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true); // IEEE float
  v.setUint16(22, 2, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 8, true);
  v.setUint16(32, 8, true);
  v.setUint16(34, 32, true);
  str(36, 'data');
  v.setUint32(40, data.byteLength, true);
  const r = await fetch(post, { method: 'POST', body: new Blob([header, data.buffer]) });
  if (!r.ok) throw new Error(`audio: ${r.status}`);
  return { peak };
}
