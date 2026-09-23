// Local preview: `node serve.mjs` then open http://127.0.0.1:8437
// index.html is a page fragment (the artifact host adds the document shell),
// so this wraps it in the same shell before serving.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 8437);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const shell = (body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${body}</body></html>`;

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('not found');
      const ext = path.extname(file);
      res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(ext === '.html' ? shell(data.toString()) : data);
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`Particle Beach on http://127.0.0.1:${port}`));
