// Pulls the AstroBin gallery for a user and writes a slim data file the site can read.
// Run:  node scripts/harvest.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const USERNAME = 'AstraPharma';
const API = 'https://app.astrobin.com/api/v2';

const HASHES = [
  'llf5b4', 'n1kabk', 'k8i4z0', 'xt2sxl', '43yjix', 'bimae5', 'jbqy1w', '1bbokr', 'b6xo1i',
  '9rkrm2', 'ji0kku', '6khp7e', '8y05t1', 'qmwee8', 'luspyq', '3em1tm', '27ch1a',
  'mijfud', '6p3r82', 'ke7l8h', '85qrul', '914zv6', 'y00o5f', 'h4oack', 'fxf9s5',
  '6kpy1d', '244jac', 'de3hde', 'lydor6', 'w20wbw', 's3yz0f', 'n8wo8z', 'e13rgk',
  '8p3sfo', '2v3p21', '6ge38l', 'a00gvk', 's8r1qg', 's645dl', 'u5f1gz', 'apo951',
];

// AstroBin stores no constellation for these three; filled from their solved position.
const CONSTELLATION_OVERRIDES = {
  b6xo1i: 'Sgr', // IC 1284      18h 17m  -19deg 41'
  ji0kku: 'Oph', // LDN 43       16h 34m  -15deg 46'
  '85qrul': 'Gem', // IC 443     06h 17m  +22deg 41'
};

// The same desert site was typed a few different ways across uploads.
const LOCATION_ALIASES = {
  'Alsalmi Desert': 'Al Salmy Desert',
  'Al Salmy Deset': 'Al Salmy Desert',
};

// Corrections to the site records held on AstroBin, keyed by the site name
// after aliasing. Applied on every harvest, so fixing it there is optional.
const LOCATION_OVERRIDES = {
  Home: { state: 'Kuwait City', bortle: 9 },
};

// Recognition earned outside AstroBin, which the API knows nothing about.
// Kept here so it survives every re-harvest — add new entries as they happen.
const EXTERNAL_FEATURES = {
  w20wbw: [
    {
      kind: 'apod',
      short: 'NASA APOD',
      label: 'NASA Astronomy Picture of the Day',
      title: 'M106: A Spiral Galaxy with a Strange Center',
      date: '2024-10-09',
      url: 'https://apod.nasa.gov/apod/ap241009.html',
    },
  ],
};

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const thumbUrl = (thumbs, alias) => thumbs?.find((t) => t.alias === alias)?.url ?? null;

const gearName = (item) =>
  [item.brandName, item.name].filter(Boolean).join(' ').trim() || item.name || null;

const gearList = (arr) =>
  (arr ?? []).map((item) => ({
    name: gearName(item),
    type: item.type ?? null,
    website: item.website ?? null,
  }));

/** Rolls the per-night, per-filter subframe rows into a per-filter summary. */
function summariseAcquisitions(rows) {
  const byFilter = new Map();
  const nights = new Set();
  let totalSeconds = 0;
  let totalFrames = 0;

  for (const row of rows ?? []) {
    const frames = Number(row.number) || 0;
    const duration = Number(row.duration) || 0;
    const seconds = frames * duration;
    totalSeconds += seconds;
    totalFrames += frames;
    if (row.date) nights.add(row.date);

    const label =
      [row.filter2Brand, row.filter2Name].filter(Boolean).join(' ') || 'Unfiltered';
    const entry = byFilter.get(label) ?? {
      filter: label,
      filterType: row.filter2Type ?? null,
      frames: 0,
      seconds: 0,
      subLengths: new Set(),
    };
    entry.frames += frames;
    entry.seconds += seconds;
    if (duration) entry.subLengths.add(duration);
    byFilter.set(label, entry);
  }

  const dates = [...nights].sort();
  return {
    totalSeconds,
    totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
    totalFrames,
    nightCount: dates.length,
    nights: dates,
    firstNight: dates[0] ?? null,
    lastNight: dates.at(-1) ?? null,
    byFilter: [...byFilter.values()]
      .map((e) => ({
        filter: e.filter,
        filterType: e.filterType,
        frames: e.frames,
        seconds: e.seconds,
        hours: Math.round((e.seconds / 3600) * 100) / 100,
        subLengths: [...e.subLengths].sort((a, b) => a - b),
      }))
      .sort((a, b) => b.seconds - a.seconds),
  };
}

/**
 * Corner coordinates of the frame, ordered top-left, top-right, bottom-right,
 * bottom-left as the image's own pixels run.
 *
 * AstroBin hands these over directly whenever the advanced (PixInsight) solve
 * ran, which is the case for nearly everything. Otherwise they are derived
 * from the centre, pixel scale and rotation.
 *
 * The derived branch's sign convention was fitted against the 38 images that
 * carry true solved corners: with pixel offsets measured from the centre with
 * x running right and y running down, east and north both come out negated.
 * Getting this wrong is not subtle — the wrong convention placed a frame more
 * than a degree from where it belongs. See scripts/README for the check.
 */
function footprint(solution, width, height) {
  if (!solution) return { corners: null, source: null };

  const corners = [
    [num(solution.advancedRaTopLeft), num(solution.advancedDecTopLeft)],
    [num(solution.advancedRaTopRight), num(solution.advancedDecTopRight)],
    [num(solution.advancedRaBottomRight), num(solution.advancedDecBottomRight)],
    [num(solution.advancedRaBottomLeft), num(solution.advancedDecBottomLeft)],
  ];
  if (corners.every(([ra, dec]) => ra !== null && dec !== null)) {
    return { corners, source: 'solved' };
  }

  const ra = num(solution.ra);
  const dec = num(solution.dec);
  const pixscale = num(solution.pixscale);
  if (ra === null || dec === null || !pixscale || !width || !height) {
    return { corners: null, source: null };
  }

  const halfW = (width * pixscale) / 3600 / 2;
  const halfH = (height * pixscale) / 3600 / 2;
  const theta = ((num(solution.orientation) ?? 0) * Math.PI) / 180;
  const cosDec = Math.max(Math.cos((dec * Math.PI) / 180), 1e-6);

  const derived = [
    [-halfW, -halfH], // top-left
    [+halfW, -halfH], // top-right
    [+halfW, +halfH], // bottom-right
    [-halfW, +halfH], // bottom-left
  ].map(([dx, dy]) => {
    const east = -(dx * Math.cos(theta) - dy * Math.sin(theta));
    const north = -(dx * Math.sin(theta) + dy * Math.cos(theta));
    return [ra + east / cosDec, dec + north];
  });

  return { corners: derived, source: 'derived' };
}

function slim(image) {
  const s = image.solution ?? null;
  const acquisitions = summariseAcquisitions(image.deepSkyAcquisitions);
  const location = image.locationObjects?.[0] ?? null;
  const pixscale = num(s?.advancedPixscale) ?? num(s?.pixscale);
  const frame = footprint(s, image.w, image.h);

  return {
    hash: image.hash,
    pk: image.pk,
    title: image.title,
    astrobinUrl: `https://app.astrobin.com/i/${image.hash}`,
    published: image.published,
    uploaded: image.uploaded,
    descriptionHtml: image.descriptionHtml ?? null,
    width: image.w,
    height: image.h,
    constellation: image.constellation || CONSTELLATION_OVERRIDES[image.hash] || null,
    subjectType: image.subjectType ?? null,
    acquisitionType: image.acquisitionType ?? null,
    dataSource: image.dataSource ?? null,
    themes: image.explorationThemes ?? [],

    stats: {
      views: image.viewCount ?? 0,
      likes: image.likeCount ?? 0,
      bookmarks: image.bookmarkCount ?? 0,
      comments: image.commentCount ?? 0,
    },
    awards: {
      isIotd: !!image.isIotd,
      iotdDate: image.iotdDate ?? null,
      isTopPick: !!image.isTopPick,
      isTopPickNomination: !!image.isTopPickNomination,
    },
    features: EXTERNAL_FEATURES[image.hash] ?? [],

    sky: s
      ? {
          ra: num(s.advancedRa) ?? num(s.ra),
          dec: num(s.advancedDec) ?? num(s.dec),
          pixscale,
          orientation: num(s.advancedOrientation) ?? num(s.orientation),
          radius: num(s.radius),
          fovWidth: pixscale && image.w ? (image.w * pixscale) / 3600 : null,
          fovHeight: pixscale && image.h ? (image.h * pixscale) / 3600 : null,
          objectsInField: s.objectsInField
            ? s.objectsInField.split(',').map((o) => o.trim()).filter(Boolean)
            : [],
          footprint: frame.corners,
          footprintSource: frame.source,
          annotationSvg: s.pixinsightSvgAnnotationRegular ?? null,
          skyPlot: s.skyplotZoom1 ?? null,
        }
      : null,

    thumbnails: {
      small: thumbUrl(image.thumbnails, 'gallery'),
      card: thumbUrl(image.thumbnails, 'story'),
      regular: thumbUrl(image.thumbnails, 'regular'),
      hd: thumbUrl(image.thumbnails, 'hd'),
      qhd: thumbUrl(image.thumbnails, 'qhd'),
    },

    equipment: {
      telescopes: gearList(image.imagingTelescopes2),
      cameras: gearList(image.imagingCameras2),
      mounts: gearList(image.mounts2),
      filters: gearList(image.filters2),
      accessories: gearList(image.accessories2),
      software: gearList(image.software2),
      guidingTelescopes: gearList(image.guidingTelescopes2),
      guidingCameras: gearList(image.guidingCameras2),
    },

    acquisitions,
    moon: {
      averageAge: num(image.averageMoonAge),
      averageIllumination: num(image.averageMoonIllumination),
    },
    location: location ? site(location) : null,
  };
}

/**
 * One observing site, with the name normalised and any correction applied.
 * Precise coordinates are deliberately left out: AstroBin only exposes them to
 * signed-in viewers, and they do not belong on a public page.
 */
function site(location) {
  const name = LOCATION_ALIASES[location.name] ?? location.name;
  return {
    name,
    state: location.state,
    country: location.country,
    bortle: location.bortle,
    ...LOCATION_OVERRIDES[name],
  };
}

async function main() {
  const images = [];
  for (const [i, hash] of HASHES.entries()) {
    process.stdout.write(`[${i + 1}/${HASHES.length}] ${hash} `);
    try {
      const payload = await getJson(`${API}/images/image/?hash=${hash}`);
      const image = payload.results?.[0];
      if (!image) throw new Error('no result');
      images.push(slim(image));
      console.log(`ok  ${image.title}`);
    } catch (err) {
      console.log(`FAILED  ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  images.sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''));

  // A site's Bortle rating is a property of the site, not the upload, but it was
  // only filled in on some of them. Carry it across matching location names.
  const bortleBySite = new Map();
  for (const i of images) {
    if (i.location?.bortle != null) bortleBySite.set(i.location.name, i.location.bortle);
  }
  for (const i of images) {
    if (i.location && i.location.bortle == null) {
      i.location.bortle = bortleBySite.get(i.location.name) ?? null;
    }
  }

  const solved = images.filter((i) => i.sky?.ra !== null && i.sky?.ra !== undefined);
  const gearTally = new Map();
  for (const i of images) {
    for (const [category, items] of Object.entries(i.equipment)) {
      for (const item of items) {
        const key = `${category} ${item.name}`;
        const entry = gearTally.get(key) ?? { category, name: item.name, type: item.type, images: 0 };
        entry.images += 1;
        gearTally.set(key, entry);
      }
    }
  }

  const siteTally = new Map();
  for (const i of images) {
    if (!i.location) continue;
    const entry = siteTally.get(i.location.name) ?? { ...i.location, images: 0 };
    entry.images += 1;
    siteTally.set(i.location.name, entry);
  }

  const catalogue = {
    generated: new Date().toISOString(),
    profile: {
      username: USERNAME,
      displayName: 'Ali Alobaidly',
      astrobinUrl: `https://app.astrobin.com/u/${USERNAME}`,
    },
    totals: {
      images: images.length,
      solved: solved.length,
      integrationHours:
        Math.round(images.reduce((sum, i) => sum + i.acquisitions.totalHours, 0) * 10) / 10,
      frames: images.reduce((sum, i) => sum + i.acquisitions.totalFrames, 0),
      views: images.reduce((sum, i) => sum + i.stats.views, 0),
      likes: images.reduce((sum, i) => sum + i.stats.likes, 0),
      nights: new Set(images.flatMap((i) => i.acquisitions.nights)).size,
      constellations: [...new Set(images.map((i) => i.constellation).filter(Boolean))].sort(),
      apod: images.filter((i) => i.features.some((f) => f.kind === 'apod')).length,
      iotd: images.filter((i) => i.awards.isIotd).length,
      topPicks: images.filter((i) => i.awards.isTopPick).length,
      topPickNominations: images.filter((i) => i.awards.isTopPickNomination).length,
    },
    equipment: [...gearTally.values()].sort(
      (a, b) => b.images - a.images || a.name.localeCompare(b.name),
    ),
    sites: [...siteTally.values()].sort((a, b) => b.images - a.images),
    images,
  };

  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  await writeFile(
    resolve(ROOT, 'data', 'images.json'),
    JSON.stringify(catalogue, null, 2),
    'utf8',
  );

  console.log(
    `\nWrote data/images.json — ${images.length} images, ${solved.length} plate solved, ` +
      `${catalogue.totals.integrationHours} h integration.`,
  );
}

main();
