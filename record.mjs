// Renders the trailer (#trailer, see js/trailer.js) to video.
//
//   node record.mjs render [--scale 2] [--sub 8] [--from 0] [--to 60] [--out trailer/particle-beach-trailer]
//   node record.mjs still 3.5 12 40 [--scale 0.5] [--sub 1] [--dir trailer/stills]
//   node record.mjs audio [--out trailer/score.wav]
//   node record.mjs eval "__trailer.info()"
//
// It serves the site locally, drives headless Chrome (Metal GPU) over the
// DevTools protocol at a 1920×804 viewport (2.39:1) with the device pixel
// ratio set to --scale, and pipes raw frames into ffmpeg. `render` then muxes
// the score and writes a 4K master plus a 1080p copy. Needs Google Chrome and
// ffmpeg; nothing to install.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = path.dirname(fileURLToPath(import.meta.url));
const [cmd = 'render', ...rest] = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || rest[i + 1] === undefined ? true : rest[++i];
  else args.push(rest[i]);
}
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const scale = Number(flags.scale ?? (cmd === 'render' ? 2 : 0.5));
const sub = Number(flags.sub ?? (cmd === 'render' ? 8 : 1));

// ---- local server: the site, plus sinks for frames and audio ----

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const shell = (body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${body}</body></html>`;
let onFrame = null;
let onAudio = null;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const buf = Buffer.concat(chunks);
      try {
        if (url.pathname === '/frame' && onFrame) await onFrame(buf);
        else if (url.pathname === '/audio' && onAudio) await onAudio(buf);
        res.writeHead(200).end('ok');
      } catch (e) {
        res.writeHead(500).end(String(e));
      }
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end('not found');
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(ext === '.html' ? shell(data.toString()) : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---- headless Chrome over CDP ----
//
// A session is one Chrome with the trailer loaded. If Chrome goes away in the
// middle of a render, `render` opens a new session and carries on from the
// frame it was on.

const CHROME_ARGS = [
  '--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1920,1080',
  // keep a long render quiet: no updater, no background networking, no throttling
  '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions',
  '--no-first-run', '--no-default-browser-check', '--metrics-recording-only', '--disable-breakpad', '--disable-domain-reliability',
  '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,AutofillServerCommunication',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required',
];

async function openSession() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'beach-rec-'));
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, [...CHROME_ARGS, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const log = [];
  chrome.stderr.on('data', (d) => log.push(d.toString()) > 200 && log.shift());
  const pending = new Map();
  let closing = false;
  let dead = null;
  const exited = new Promise((r) => chrome.on('exit', r));
  chrome.on('exit', (code, signal) => {
    dead = new Error(`Chrome exited (${code ?? signal})`);
    if (closing) return;
    console.error(`\n${dead.message}. Last output:\n${log.join('').slice(-1500)}`);
    for (const { rej } of pending.values()) rej(dead);
    pending.clear();
  });
  const close = async () => {
    closing = true;
    try {
      chrome.kill();
    } catch {}
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };

  let target;
  for (let k = 0; k < 60 && !target; k++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      target = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let seq = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning' || flags.verbose)) {
      console.log(`[page ${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      console.log('[page exception]', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    }
  };
  ws.onclose = () => {
    for (const { rej } of pending.values()) rej(dead ?? new Error('DevTools connection closed'));
    pending.clear();
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      if (dead) return rej(dead);
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 804, deviceScaleFactor: scale, mobile: false });
  await send('Page.navigate', { url: `${origin}/#trailer` });
  const t0 = Date.now();
  while (!(await evaluate('!!window.__trailer').catch(() => false))) {
    if (Date.now() - t0 > 60000) throw new Error('trailer did not load');
    await new Promise((r) => setTimeout(r, 200));
  }
  const info = await evaluate('__trailer.info()');
  console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${info.width}×${info.height} · ${info.frames} frames @ ${info.fps} fps`);
  return { evaluate, info, close, alive: () => !dead, born: Date.now() };
}

let session = await openSession();
const info = session.info;
const evaluate = (x) => session.evaluate(x);
// Chrome here can quit partway through a long headless session (its updater
// does it), so a render opens a fresh page for every shot. Each shot then
// starts from the same state, and one resumed partway comes out identical.
const renew = async (maxAge = 0) => {
  if (session.alive() && Date.now() - session.born < maxAge) return;
  await session.close();
  session = await openSession();
};
const cleanup = async () => {
  await session.close();
  server.close();
};
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(130);
});

const ffmpeg = (argv) =>
  new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (c) => (c ? rej(new Error(`ffmpeg exited ${c}`)) : res()));
  });

async function renderAudio(file) {
  await renew(20000);
  const wav = new Promise((r) => (onAudio = (buf) => (fs.writeFileSync(file, buf), r())));
  await evaluate(`import('./js/trailer-audio.js').then((m) => m.renderScore(__trailer.info(), '/audio'))`);
  await wav;
  console.log(`audio → ${path.relative(root, file)}`);
}

try {
  if (cmd === 'eval') {
    console.log(JSON.stringify(await evaluate(args.join(' ')), null, 1));
  } else if (cmd === 'still') {
    const dir = path.resolve(flags.dir ?? 'trailer/stills');
    fs.mkdirSync(dir, { recursive: true });
    const times = args.map(Number).sort((a, b) => a - b);
    for (const T of times) {
      const i = Math.min(info.frames - 1, Math.round(T * info.fps));
      const s = Date.now();
      const url = await evaluate(`__trailer.frame(${i}, { sub: ${sub} })`);
      const f = path.join(dir, `${String(T.toFixed(2)).padStart(6, '0')}.jpg`);
      fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      console.log(`${f}  (${Date.now() - s} ms)`);
    }
  } else if (cmd === 'audio') {
    const file = path.resolve(flags.out ?? 'trailer/score.wav');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await renderAudio(file);
  } else if (cmd === 'render') {
    const base = path.resolve(flags.out ?? 'trailer/particle-beach-trailer');
    fs.mkdirSync(path.dirname(base), { recursive: true });
    const from = Math.round(Number(flags.from ?? 0) * info.fps);
    const to = Math.min(info.frames, Math.round(Number(flags.to ?? info.duration) * info.fps));
    const master = `${base}-master.mkv`;
    const wav = `${base}-score.wav`;
    if (!flags['no-audio']) await renderAudio(wav);
    // pipe raw RGBA into a near-lossless master; the deliverables are cut from it
    const enc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${info.width}x${info.height}`, '-r', String(info.fps), '-i', 'pipe:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '8', '-pix_fmt', 'yuv444p', master], { stdio: ['pipe', 'inherit', 'inherit'] });
    const encDone = new Promise((r, j) => enc.on('exit', (c) => (c ? j(new Error(`ffmpeg exited ${c}`)) : r())));
    let written = 0;
    onFrame = (buf) => new Promise((r) => (written++, enc.stdin.write(buf) ? r() : enc.stdin.once('drain', r)));
    const s0 = Date.now();
    let restarts = 0;
    const cuts = new Set(info.shots.map((sh) => Math.round(sh.start * info.fps)));
    for (let i = from; i < to; i++) {
      // a new session can only start on a cut, where each shot runs its own pre-roll
      if (cuts.has(i) && i !== from) await renew();
      try {
        await evaluate(`__trailer.frame(${i}, { sub: ${sub}, post: '/frame' })`);
      } catch (e) {
        if (!/Chrome exited|connection closed/.test(e.message) || ++restarts > 20) throw e;
        // resume from the frames ffmpeg actually has, so none is doubled or dropped
        i = from + written;
        console.log(`\nrestarting Chrome at frame ${i}`);
        await session.close();
        session = await openSession();
        i--;
        continue;
      }
      if ((i - from) % 15 === 0 || i === to - 1) {
        const el = (Date.now() - s0) / 1000;
        const per = el / (i - from + 1);
        process.stdout.write(`\rframe ${i + 1}/${to}  ${(per * 1000).toFixed(0)} ms/frame  eta ${Math.round(per * (to - i - 1))} s   `);
      }
    }
    enc.stdin.end();
    await encDone;
    console.log(`\nmaster → ${path.relative(root, master)}`);
    const audioIn = flags['no-audio'] ? [] : ['-i', wav];
    const audioOut = flags['no-audio'] ? [] : ['-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '320k', '-shortest'];
    const W = info.width;
    const vf = (w) => (w === W ? 'format=yuv420p' : `scale=${w}:-2:flags=lanczos,format=yuv420p`);
    const outs = W >= 3840 ? [[3840, '4k', ['-crf', '15', '-maxrate', '80M', '-bufsize', '160M']], [1920, '1080p', ['-crf', '17']]] : [[W, 'draft', ['-crf', '20']]];
    for (const [w, tag, q] of outs) {
      const file = `${base}-${tag}.mp4`;
      await ffmpeg(['-i', master, ...audioIn, '-map', '0:v', ...(audioIn.length ? ['-map', '1:a'] : []), '-vf', vf(w), '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', ...q, '-movflags', '+faststart', ...audioOut, file]);
      console.log(`${tag} → ${path.relative(root, file)}`);
    }
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {

  await cleanup();
}
