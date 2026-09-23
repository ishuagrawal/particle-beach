# Particle Beach

Santa Monica Beach and Pier drawn in thousands of glowing specks and flowing ribbon strokes, lit by the real sun and moon for the current time of day.

**Live:** https://particle-beach.vercel.app

## How it was made

Built with **Claude Opus 5.5 (max effort)** in Claude Code, using this prompt as the starting base:

> Create a stylistic 3D environment of a beach that adapts to the time of day. the art style must be a particle illustration, which uses thousands of tiny glowing specks rather than solid fills with flowing ribbon strokes behind figures to suggest motion.

## Run locally

```bash
node serve.mjs
```

Then open http://127.0.0.1:8437. No install step; Three.js loads from a CDN.

## Controls

- Drag / arrow keys / WASD to look and walk
- `Space` cycles the day, `[` `]` scrub time, `L` returns to live time
- "Go to" menu glides to named spots on the beach and pier

## Deploy

`node build.mjs` writes a static site to `dist/` (used by Vercel).

## License

[MIT](LICENSE)
