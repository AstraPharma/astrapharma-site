/* ---------------------------------------------------------------
   Loads the harvested catalogue and provides the formatting helpers
   the pages share. Paths resolve relative to this file, so the same
   module works from the site root and from /pages.
   --------------------------------------------------------------- */

const url = (path) => new URL(path, import.meta.url).href;

let cataloguePromise = null;
let skyLinesPromise = null;
let channelPromise = null;

export function loadCatalogue() {
  cataloguePromise ??= fetch(url('../data/images.json')).then((r) => {
    if (!r.ok) throw new Error(`Could not load the image catalogue (${r.status})`);
    return r.json();
  });
  return cataloguePromise;
}

export function loadSkyLines() {
  skyLinesPromise ??= fetch(url('../data/sky-lines.json')).then((r) => {
    if (!r.ok) throw new Error(`Could not load the constellation data (${r.status})`);
    return r.json();
  });
  return skyLinesPromise;
}

export function loadChannel() {
  channelPromise ??= fetch(url('../data/channel.json')).then((r) => {
    if (!r.ok) throw new Error(`Could not load the channel data (${r.status})`);
    return r.json();
  });
  return channelPromise;
}

/* --- Coordinates ------------------------------------------------- */

/** Right ascension in degrees to sexagesimal hours, e.g. "22h 32m 17.0s". */
export function formatRa(deg) {
  if (deg == null) return '—';
  const hours = ((deg % 360) + 360) % 360 / 15;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = ((hours - h) * 60 - m) * 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${s.toFixed(1).padStart(4, '0')}s`;
}

/** Declination in degrees to sexagesimal, e.g. "+40° 37′ 12″". */
export function formatDec(deg) {
  if (deg == null) return '—';
  const sign = deg < 0 ? '−' : '+';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60);
  return `${sign}${d}° ${String(m).padStart(2, '0')}′ ${String(s).padStart(2, '0')}″`;
}

/** Angle in degrees, switched to arcminutes below a degree. */
export function formatAngle(deg) {
  if (deg == null) return '—';
  if (deg < 1) return `${(deg * 60).toFixed(1)}′`;
  return `${deg.toFixed(2)}°`;
}

export function formatFov(sky) {
  if (!sky?.fovWidth || !sky?.fovHeight) return '—';
  return `${formatAngle(sky.fovWidth)} × ${formatAngle(sky.fovHeight)}`;
}

/* --- Numbers, times, dates --------------------------------------- */

export function formatHours(hours) {
  if (!hours) return '—';
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 60) return `${whole + 1}h`;
  return minutes ? `${whole}h ${minutes}m` : `${whole}h`;
}

export function formatCount(n) {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatNightRange(acquisitions) {
  const { firstNight, lastNight, nightCount } = acquisitions ?? {};
  if (!firstNight) return '—';
  const nights = `${nightCount} night${nightCount === 1 ? '' : 's'}`;
  if (firstNight === lastNight) return `${nights} · ${formatDate(firstNight)}`;
  return `${nights} · ${formatDate(firstNight)} – ${formatDate(lastNight)}`;
}

/* --- Presentation ------------------------------------------------ */

const FILTER_COLOURS = {
  L: 'var(--f-l)',
  R: 'var(--f-r)',
  G: 'var(--f-g)',
  B: 'var(--f-b)',
  H_ALPHA: 'var(--f-ha)',
  O_III: 'var(--f-oiii)',
  S_II: 'var(--f-sii)',
};

export const filterColour = (type) => FILTER_COLOURS[type] ?? 'var(--f-other)';

/** The APOD entry for an image, if it has one. */
export const apodFeature = (image) =>
  (image.features ?? []).find((f) => f.kind === 'apod') ?? null;

/**
 * The single most significant honour on an image. A NASA Astronomy Picture of
 * the Day outranks anything AstroBin awards, so it comes first.
 */
export function topAward(image) {
  const apod = apodFeature(image);
  if (apod) {
    return { label: 'NASA APOD', short: 'NASA APOD', className: 'chip--apod', url: apod.url };
  }
  const a = image.awards;
  if (a.isIotd) return { label: 'Image of the Day', short: 'IOTD', className: 'chip--iotd' };
  if (a.isTopPick) return { label: 'Top Pick', short: 'Top Pick', className: 'chip--tp' };
  if (a.isTopPickNomination)
    return { label: 'Top Pick Nomination', short: 'Nominated', className: 'chip--tpn' };
  return null;
}

const SUBJECT_LABELS = {
  DEEP_SKY: 'Deep sky',
  SOLAR_SYSTEM: 'Solar system',
  WIDE_FIELD: 'Wide field',
  STAR_TRAILS: 'Star trails',
  NORTHERN_LIGHTS: 'Aurora',
  OTHER: 'Other',
};

export const subjectLabel = (type) => SUBJECT_LABELS[type] ?? 'Deep sky';

/** Strips AstroBin's description HTML down to safe text paragraphs. */
export function descriptionParagraphs(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = [...doc.body.querySelectorAll('p, div, li')]
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (blocks.length) return blocks;
  const flat = doc.body.textContent.replace(/\s+/g, ' ').trim();
  return flat ? [flat] : [];
}

/** Everything the search box should match against. */
export function searchIndex(image) {
  return [
    image.title,
    image.constellation,
    ...(image.sky?.objectsInField ?? []),
    ...Object.values(image.equipment).flat().map((g) => g.name),
    image.location?.name,
    ...descriptionParagraphs(image.descriptionHtml),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
