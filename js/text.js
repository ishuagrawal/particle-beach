// Lettering as specks: draw text on a 2D canvas and keep the inked pixels.

/**
 * Returns [x, y] points in metres, centred on x and baselined at y = 0, for
 * lines of text drawn `height` metres tall. `step` is the pixel pitch sampled.
 */
export function textPoints(lines, { height = 1, font = '700 72px "Arial Narrow", Arial, sans-serif', step = 3, lineGap = 1.25, jitter = 0.35 } = {}) {
  const px = 72;
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = font;
  const widths = lines.map((l) => g.measureText(typeof l === 'string' ? l : l.text).width);
  c.width = Math.ceil(Math.max(...widths)) + 8;
  c.height = Math.ceil(px * lineGap * lines.length) + 8;
  g.font = font;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  lines.forEach((l, i) => {
    const text = typeof l === 'string' ? l : l.text;
    const scale = typeof l === 'string' ? 1 : l.scale ?? 1;
    g.save();
    g.translate(c.width / 2, px * lineGap * (i + 1) - 4);
    g.scale(scale, scale);
    g.textAlign = 'center';
    g.fillText(text, 0, 0);
    g.restore();
  });
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const k = height / px;
  const out = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      if (data[(y * c.width + x) * 4 + 3] > 128) {
        const line = Math.floor(y / (px * lineGap));
        out.push([(x - c.width / 2 + (rnd() - 0.5) * step * jitter) * k, (c.height - y) * k, line]);
      }
    }
  }
  return out;
}
