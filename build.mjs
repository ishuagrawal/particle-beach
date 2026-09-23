// Vercel build: index.html is a page fragment, so wrap it in the document
// shell (same as serve.mjs) and copy js/ into dist/.
import fs from 'node:fs';

const shell = (body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${body}</body></html>`;

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist');
fs.writeFileSync('dist/index.html', shell(fs.readFileSync('index.html', 'utf8')));
fs.cpSync('js', 'dist/js', { recursive: true });
console.log('built dist/');
