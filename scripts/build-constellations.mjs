// Turns the d3-celestial GeoJSON constellation files into one compact file the
// sky map can draw directly. Source data: github.com/ofrohn/d3-celestial (BSD-3).
// Run:  node scripts/build-constellations.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// The raw d3-celestial files are build inputs only — the browser never fetches
// them — so they live beside this script rather than in the deployed data/.
const SOURCES = resolve(HERE, 'sources');
const DATA = resolve(ROOT, 'data');

// d3-celestial stores right ascension as a longitude in -180..180. Aladin wants 0..360.
const toRa = (lon) => (lon < 0 ? lon + 360 : lon);
const round = (n) => Math.round(n * 1000) / 1000;
const toRaDec = ([lon, lat]) => [round(toRa(lon)), round(lat)];

/** Every segment of a MultiLineString / LineString geometry, as [[ra,dec],...] runs. */
function segments(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates.map(toRaDec)];
  if (geometry.type === 'MultiLineString') return geometry.coordinates.map((s) => s.map(toRaDec));
  return [];
}

/**
 * A run of points may straddle RA 0h/360deg. Drawn naively that produces a line
 * clean across the sky, so split the run wherever it wraps.
 */
function splitAtWrap(points) {
  const runs = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const [prevRa] = points[i - 1];
    const [ra] = points[i];
    if (Math.abs(ra - prevRa) > 180) {
      if (current.length > 1) runs.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  if (current.length > 1) runs.push(current);
  return runs;
}

async function readJson(name) {
  return JSON.parse(await readFile(resolve(SOURCES, name), 'utf8'));
}

async function main() {
  const [lineData, nameData, borderData] = await Promise.all([
    readJson('constellations.lines.json'),
    readJson('constellations.json'),
    readJson('constellations.borders.json').catch(() => null),
  ]);

  const meta = new Map();
  for (const f of nameData.features) {
    // Serpens is split across two features; keep the first, they share a name.
    if (meta.has(f.id)) continue;
    meta.set(f.id, {
      id: f.id,
      name: f.properties.name,
      genitive: f.properties.gen ?? null,
      ra: round(toRa(f.geometry.coordinates[0])),
      dec: round(f.geometry.coordinates[1]),
    });
  }

  const figures = [];
  for (const f of lineData.features) {
    const runs = segments(f.geometry).flatMap(splitAtWrap);
    if (!runs.length) continue;
    const existing = figures.find((x) => x.id === f.id);
    if (existing) existing.lines.push(...runs);
    else figures.push({ id: f.id, name: meta.get(f.id)?.name ?? f.id, lines: runs });
  }

  const borders = borderData
    ? borderData.features.flatMap((f) => segments(f.geometry).flatMap(splitAtWrap))
    : [];

  const out = {
    source: 'https://github.com/ofrohn/d3-celestial (BSD-3-Clause)',
    epoch: 'J2000',
    constellations: [...meta.values()].sort((a, b) => a.name.localeCompare(b.name)),
    figures,
    borders,
  };

  await writeFile(resolve(DATA, 'sky-lines.json'), JSON.stringify(out), 'utf8');
  console.log(
    `Wrote data/sky-lines.json — ${out.constellations.length} constellations, ` +
      `${figures.reduce((n, f) => n + f.lines.length, 0)} figure segments, ` +
      `${borders.length} border segments.`,
  );
}

main();
