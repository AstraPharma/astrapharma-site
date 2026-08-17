# AstraPharma — astrophotography site

The website for **AstraPharma** (Ali Alobaidly). Its centrepiece is an
interactive atlas of the real sky: pan and zoom anywhere on the celestial
sphere, and every photograph is painted into the exact patch of sky it was
taken from, at the right size and rotation, worked out from its plate solve.
Click a frame to open everything known about it.

No build step, no framework, nothing to install. Plain HTML, CSS and JavaScript
modules, a couple of JSON data files, and self-hosted fonts.

## Running it locally

```bash
npm start
```

Then open <http://localhost:4173>. The pages must be served over HTTP rather
than opened as `file://`, because they fetch the data files.

## What is where

**Everything deployable lives in `public/`.** Tooling lives outside it and is
never uploaded or reachable from the web.

```
public/
  index.html            Sky atlas — the main page
  pages/gallery.html    Every image as a grid
  pages/videos.html     The YouTube channel
  pages/about.html      Story, observing sites, full equipment list
  pages/_template.html  Copy this to start a new page

  css/fonts.css         Self-hosted Inter + Cormorant Garamond
  css/base.css          Design tokens and everything shared (nav, footer, drawer)
  css/skymap.css        The atlas
  css/gallery.css       The gallery grid
  css/videos.css        The videos grid
  css/about.css         The about page

  js/chrome.js          Nav + footer + scroll reveals. THE PAGE LIST LIVES HERE
  js/data.js            Loads the data files; all the formatting helpers
  js/detail.js          The slide-in image panel, shared by atlas and gallery
  js/sky-fields.js      Draws the photographs onto the sky, and hit-tests clicks
  js/skymap.js          Atlas controller — Aladin, overlays, rail, controls
  js/gallery.js         Gallery page
  js/videos.js          Videos page
  js/about.js           About page

  data/images.json      The catalogue: every image and everything about it
  data/sky-lines.json   Constellation figures, borders and label positions
  data/channel.json     Brand details, social links, bio and the video list

  assets/               Logo files, hero photograph, fonts, favicon

scripts/harvest.mjs             Rebuilds public/data/images.json from AstroBin
scripts/build-constellations.mjs  Builds public/data/sky-lines.json
scripts/build-brand.mjs         Builds the mark and favicon from the lockup
scripts/sources/                Raw d3-celestial files — build inputs only
scripts/serve.mjs               The local dev server (serves public/ only)
wrangler.jsonc                  Cloudflare config: which folder to deploy
```

## Adding a new page

1. Copy `public/pages/_template.html` and rename it.
2. Add one entry to the `PAGES` list at the top of `public/js/chrome.js` — the
   navigation and footer are generated from that list, so the page appears in
   both, everywhere, at once.
3. Add it to the `PAGES` list in `scripts/build-meta.mjs` and run:

```bash
node scripts/build-meta.mjs
```

That writes the share-preview tags and canonical URL into every page and
rebuilds `sitemap.xml`. It is safe to run repeatedly — it replaces its own
output rather than stacking up duplicates.

## Link previews

When the address is pasted into WhatsApp, X, Facebook or a group chat, the
preview comes from `public/assets/share-card.jpg` — a 1200×630 card built from
the M8 mosaic with the wordmark on it. To change which photograph it uses, edit
`scripts/build-meta.mjs`'s companion card build, or simply replace that file
with any 1200×630 image.

Social networks cache these hard. After changing the card, re-scrape it with
Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) and
X's [Card Validator](https://cards-dev.twitter.com/validator), or the old
preview will keep appearing for days.

## Refreshing the data

**Images.** Everything about the photographs comes from `data/images.json`.
After publishing new work on AstroBin, copy the new image hashes (the
`/i/xxxxxx` part of each image URL) into the `HASHES` list at the top of
`scripts/harvest.mjs`, then:

```bash
npm run harvest
```

That re-reads every image from AstroBin's public API and rewrites the
catalogue — titles, descriptions, plate solves, equipment, integration times,
locations, view and like counts. All three pages pick it up on reload.

**Videos, bio and links.** These live in `data/channel.json` and are edited by
hand. The video list and bio were taken from the channel; to refresh them, edit
that file.

**Recognition earned outside AstroBin** — a NASA APOD, a magazine feature, a
competition — cannot be harvested, so it is declared in the `EXTERNAL_FEATURES`
map at the top of `scripts/harvest.mjs`, keyed by image hash. Entries there
survive every re-harvest. The M106 image already has its APOD entry; add
another the same way and it appears automatically as a chip on the gallery
card, a panel in the detail drawer, and a panel on the About page.

## The brand

The logo files are single-colour vector paths, used as CSS masks rather than
`<img>`, so the mark takes whatever colour its container carries — gold in the
navigation, white in the hero and footer — from one cached file:

**`assets/astrapharma-lockup.svg` is the single source of truth** — the Saturn
emblem above the AstraPharma wordmark. Everything else is generated from it:

- `assets/astrapharma-mark.svg` — emblem only, inherits CSS colour
- `assets/astrapharma-mark-gold.svg` — emblem only, gold, transparent
- `assets/favicon.svg` — emblem in gold on a dark tile

Use the lockup and the mark in markup with the `.brand-lockup` and
`.brand-mark` classes. After replacing the lockup, regenerate the rest:

```bash
node scripts/build-brand.mjs
```

The script crops the emblem out of the lockup by viewBox (every emblem path
ends above the wordmark, so no path surgery is needed) and rounds the
coordinates, which halves the file size for no visible difference.

One caution: the folder these came from also holds logos for other, unrelated
brands. The AstraPharma logo is the calligraphy wrapped in Saturn's rings — not
the one with the soldering iron and gears.

### The portrait

The About page has a portrait frame that looks for **`assets/ali-portrait.jpg`**.
That file is not in the repository yet. Save a portrait there and it appears
automatically; until then the story section simply closes up around the gap, so
nothing looks broken.

## How the sky atlas works

The background sky is [Aladin Lite v3](https://aladin.cds.unistra.fr/AladinLite/)
from the Strasbourg astronomical data centre, showing real survey imagery
(DSS2 by default, with infrared, H-alpha and wide-field options in the Layers
panel). It handles all the panning, zooming and projection.

Everything of yours is drawn on a canvas over the top by `js/sky-fields.js`:

- Zoomed out, each image is a small gold diamond, so the whole collection is
  visible across the sky at once.
- Zoom in and each diamond becomes the photograph itself, clipped to its real
  four-corner outline.
- Hovering shows a card; clicking opens the detail panel.

The corner positions come from AstroBin's plate solve, so the frames line up
with the survey underneath — placement was checked against SIMBAD catalogue
positions and lands within about 0.1 arcminutes.

Things worth knowing:

- All-sky projections have a seam. A frame lying across it projects to opposite
  edges of the map, which would smear the photograph right across the sky, so
  any frame that lands far larger than its true angular size can account for is
  reduced to a marker instead.
- One image (the lunar mosaic) has no fixed position among the stars, so it
  appears in the gallery but not on the atlas.
- Photographs load straight from AstroBin's CDN rather than being copied into
  this repository, so the site needs an internet connection and stays in step
  with any re-processing you upload.
- Aladin Lite pings a usage counter at CDS on startup, sending the page URL and
  referrer. That is built into the library and cannot be switched off with an
  option. Worth knowing if you ever publish a privacy notice.
- The videos page links out to YouTube rather than embedding a player, so no
  third-party player loads and no tracking cookies are set.

## Publishing it

Hosted on Cloudflare, deployed straight from the GitHub repository: push to
`main` and it goes live a minute later. No build step runs.

`wrangler.jsonc` is what makes that work — it names `./public` as the assets
directory. Without it Cloudflare auto-detects and serves the repository root,
which sweeps in `node_modules` (Wrangler alone is ~144 MiB, far past the 25 MiB
per-asset limit) and the deploy fails. If you ever move the site files, update
that path.

Any other static host works the same way: point it at `public/`, no build
command.

## Credits

- Sky rendering: [Aladin Lite v3](https://aladin.cds.unistra.fr/AladinLite/),
  CDS Strasbourg (GPL-3.0). Survey imagery via CDS HiPS services.
- Constellation figures and borders:
  [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn
  (BSD-3-Clause).
- Typefaces: Inter and Cormorant Garamond, both SIL Open Font License 1.1.
- Image data: [AstroBin](https://app.astrobin.com/u/AstraPharma).
  All photographs © Ali Alobaidly, all rights reserved.
