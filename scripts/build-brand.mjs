// Builds every derived brand file from one source of truth: the AstraPharma
// lockup. Run after replacing assets/astrapharma-lockup.svg.
//
//   node scripts/build-brand.mjs
//
// Produces:
//   assets/astrapharma-mark.svg       emblem only, inherits CSS colour
//   assets/astrapharma-mark-gold.svg  emblem only, gold, transparent
//   assets/favicon.svg                emblem in gold on a dark tile
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const GOLD = '#d9b26a';
const TILE = '#05070e';

/**
 * The lockup is the calligraphic Saturn emblem above the word AstraPharma
 * and its two divider arrows. Measured from the rendered geometry, every
 * emblem path ends by y=558 and every wordmark path starts at y=597, so
 * cropping the viewBox below that line leaves the emblem alone — SVG clips
 * to its viewBox, so no path surgery is needed.
 */
const EMBLEM_VIEWBOX = { x: 0, y: -8, width: 1147, height: 572 };

const source = await readFile(resolve(ASSETS, 'astrapharma-lockup.svg'), 'utf8');

const paths = [...source.matchAll(/<path\b[^>]*\bd="[^"]+"[^>]*\/>/g)].map((m) => m[0]);
if (paths.length < 10) throw new Error(`only found ${paths.length} paths — is the lockup intact?`);

// Trim the coordinate precision: the source carries eight decimal places, which
// is invisible at any size these files are used at and doubles their weight.
const trim = (svg) => svg.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10));

const { x, y, width, height } = EMBLEM_VIEWBOX;
const emblem = trim(paths.join(''));
const viewBox = `${x} ${y} ${width} ${height}`;

const markSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">` +
  emblem +
  `</svg>`;
await writeFile(resolve(ASSETS, 'astrapharma-mark.svg'), markSvg, 'utf8');

const goldSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${GOLD}">` +
  emblem.replace(/fill="currentColor"/g, `fill="${GOLD}"`) +
  `</svg>`;
await writeFile(resolve(ASSETS, 'astrapharma-mark-gold.svg'), goldSvg, 'utf8');

// Square tile for the browser tab. The emblem is about 2:1, so it can only
// ever fill the middle band of a square; keep the side margins tight.
//
// The emblem is placed in a nested <svg> rather than a transformed <g>: a
// nested viewport clips to its own viewBox, which is what keeps the wordmark
// out. A <g> would carry the whole lockup into the tile.
const SIZE = 512;
const MARGIN = 0.03;
const innerWidth = SIZE * (1 - MARGIN * 2);
const innerHeight = (innerWidth * height) / width;
const innerX = (SIZE - innerWidth) / 2;
const innerY = (SIZE - innerHeight) / 2;

const faviconSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">` +
  `<rect width="${SIZE}" height="${SIZE}" rx="112" fill="${TILE}"/>` +
  `<svg x="${innerX.toFixed(1)}" y="${innerY.toFixed(1)}" width="${innerWidth.toFixed(1)}" ` +
  `height="${innerHeight.toFixed(1)}" viewBox="${viewBox}" fill="${GOLD}">` +
  emblem.replace(/fill="currentColor"/g, `fill="${GOLD}"`) +
  `</svg></svg>`;
await writeFile(resolve(ASSETS, 'favicon.svg'), faviconSvg, 'utf8');

const kb = (s) => `${(s.length / 1024).toFixed(0)} KB`;
console.log(`paths kept: ${paths.length}   emblem viewBox: ${viewBox}`);
console.log(`astrapharma-mark.svg       ${kb(markSvg)}`);
console.log(`astrapharma-mark-gold.svg  ${kb(goldSvg)}`);
console.log(`favicon.svg                ${kb(faviconSvg)}`);
