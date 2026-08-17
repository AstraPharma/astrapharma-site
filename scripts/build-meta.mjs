// Keeps the share-preview tags, canonical URLs and sitemap in step with the
// pages. Run after adding a page or changing a title.
//
//   node scripts/build-meta.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'public');

export const SITE = 'https://astrapharmaq8.com';
const CARD = `${SITE}/assets/share-card.jpg`;

// path on disk -> URL it is served at
const PAGES = [
  ['index.html', '/'],
  ['pages/gallery.html', '/pages/gallery.html'],
  ['pages/videos.html', '/pages/videos.html'],
  ['pages/about.html', '/pages/about.html'],
];

const MARK_OPEN = '<!-- social:start -->';
const MARK_CLOSE = '<!-- social:end -->';

const grab = (html, re) => (html.match(re) ?? [])[1] ?? '';

function block(html, url) {
  const title = grab(html, /<title>(.*?)<\/title>/s).trim();
  const description = grab(html, /<meta\s+name="description"\s+content="([^"]*)"/).trim();
  const absolute = url === '/' ? `${SITE}/` : SITE + url;

  return [
    MARK_OPEN,
    `    <link rel="canonical" href="${absolute}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:site_name" content="AstraPharma" />`,
    `    <meta property="og:url" content="${absolute}" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${description}" />`,
    `    <meta property="og:image" content="${CARD}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta property="og:image:alt" content="The Lagoon and Trifid nebulae, photographed by Ali Alobaidly" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${description}" />`,
    `    <meta name="twitter:image" content="${CARD}" />`,
    `    ${MARK_CLOSE}`,
  ].join('\n');
}

let changed = 0;
for (const [file, url] of PAGES) {
  const path = resolve(PUBLIC, file);
  let html = await readFile(path, 'utf8');
  const fresh = block(html, url);

  // Start from a clean slate every run: drop the previous generated block, then
  // any stray og/twitter/canonical tags the page carries. The tags may be
  // written across several lines, so match through to the closing slash rather
  // than to the end of the line.
  html = html.replace(new RegExp(`[ \\t]*${MARK_OPEN}[\\s\\S]*?${MARK_CLOSE}\\n?`), '');
  html = html.replace(
    /[ \t]*<meta\b(?=[^>]*(?:property="og:|name="twitter:))[\s\S]*?\/>\n?/g,
    '',
  );
  html = html.replace(/[ \t]*<link\b(?=[^>]*rel="canonical")[\s\S]*?\/>\n?/g, '');

  html = html.replace(/(\n[ \t]*<link rel="icon")/, `\n    ${fresh}$1`);
  await writeFile(path, html, 'utf8');
  changed += 1;
  console.log(`meta -> ${file}`);
}

/* --- Sitemap and robots ------------------------------------------------- */

const today = new Date().toISOString().slice(0, 10);
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  PAGES.map(
    ([, url]) =>
      `  <url>\n    <loc>${url === '/' ? SITE + '/' : SITE + url}</loc>\n` +
      `    <lastmod>${today}</lastmod>\n  </url>\n`,
  ).join('') +
  `</urlset>\n`;
await writeFile(resolve(PUBLIC, 'sitemap.xml'), sitemap, 'utf8');

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
await writeFile(resolve(PUBLIC, 'robots.txt'), robots, 'utf8');

console.log(`sitemap.xml -> ${PAGES.length} URLs`);
console.log(`robots.txt  -> allow all + sitemap`);
console.log(`${changed} pages updated`);
