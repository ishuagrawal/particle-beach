
https://github.com/user-attachments/assets/85e4512a-ca0d-4b35-b9f5-29c01a3813b0

# Particle Beach

Santa Monica Beach and Pier drawn in thousands of glowing specks and flowing ribbon strokes, lit by the real sun and moon for the current time of day.

**Live:** https://particle-beach.vercel.app

## How it was made

Built with **Claude Opus 5.5 (max effort)** in Claude Code, using this prompt as the starting base:

> Create a stylistic 3D environment of a busy Santa Monica beach that adapts to the time of day. The art style must be a particle illustration, which uses thousands of tiny glowing specks rather than solid fills with flowing ribbon strokes behind figures to suggest motion.

## Run locally

```bash
node serve.mjs
```

Then open http://127.0.0.1:8437. No install step; Three.js loads from a CDN.

## Controls

- Drag / arrow keys / WASD to look and walk
- `Space` cycles the day, `[` `]` scrub time, `L` returns to live time
- "Go to" menu glides to named spots on the beach and pier

## Trailer

A one-minute cinematic trailer is built into the scene at `/#trailer`: scripted camera moves across the beach and pier, mostly at sunset with flash cuts through the rest of the day, graded and letterboxed to 2.39:1, with a synthesised score. The shots are in `js/trailer-shots.js`, the render pipeline in `js/trailer.js` and the score in `js/trailer-audio.js`.

```bash
node record.mjs render
```

This renders it frame by frame in headless Chrome (8 motion-blur sub-frames per frame) and writes a 4K and a 1080p MP4 to `trailer/`. It needs Google Chrome and ffmpeg. `node record.mjs still 12 30 --scale 0.5` renders single frames for quick previews.

## Deploy

`node build.mjs` writes a static site to `dist/` (used by Vercel).

## License

[MIT](LICENSE)
