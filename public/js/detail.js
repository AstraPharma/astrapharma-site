/* ---------------------------------------------------------------
   The slide-in panel that shows everything known about one image.
   Shared by the sky map and the gallery so both stay in step.
   --------------------------------------------------------------- */

import {
  apodFeature,
  descriptionParagraphs,
  filterColour,
  formatAngle,
  formatCount,
  formatDate,
  formatDec,
  formatFov,
  formatHours,
  formatNightRange,
  formatRa,
  subjectLabel,
  topAward,
} from './data.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

let constellationNames = new Map();
let locateHandler = null;
let dom = null;
let current = null;

/** Feeds in "Lac" -> "Lacerta" style names once the sky data has loaded. */
export function setConstellationNames(list) {
  constellationNames = new Map((list ?? []).map((c) => [c.id, c.name]));
}

/**
 * Registers the "show it on the atlas" action. The sky map passes a function
 * that flies the view to the image; the gallery passes one that navigates.
 */
export function setLocateHandler(fn) {
  locateHandler = fn;
}

function build() {
  const backdrop = document.createElement('div');
  backdrop.className = 'drawer-backdrop';

  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', 'Image details');
  drawer.innerHTML =
    '<button class="drawer__close" type="button" aria-label="Close details">&times;</button>' +
    '<div class="drawer__body"></div>';

  document.body.append(backdrop, drawer);

  backdrop.addEventListener('click', closeDetail);
  drawer.querySelector('.drawer__close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDetail();
  });

  return { backdrop, drawer, body: drawer.querySelector('.drawer__body') };
}

/* --- Section renderers -------------------------------------------- */

function chips(image) {
  const out = [];
  const apod = apodFeature(image);
  if (apod) out.push(`<span class="chip chip--apod">${esc(apod.short)}</span>`);

  // The APOD chip is added above, so only add an AstroBin award when it is not
  // the same chip repeated.
  const award = topAward(image);
  if (award && award.className !== 'chip--apod') {
    out.push(`<span class="chip ${award.className}">${esc(award.label)}</span>`);
  } else if (apod) {
    const a = image.awards;
    const astrobin = a.isIotd
      ? ['Image of the Day', 'chip--iotd']
      : a.isTopPick
        ? ['Top Pick', 'chip--tp']
        : a.isTopPickNomination
          ? ['Top Pick Nomination', 'chip--tpn']
          : null;
    if (astrobin) out.push(`<span class="chip ${astrobin[1]}">${esc(astrobin[0])}</span>`);
  }
  if (image.constellation) {
    const full = constellationNames.get(image.constellation) ?? image.constellation;
    out.push(`<span class="chip">${esc(full)}</span>`);
  }
  out.push(`<span class="chip">${esc(subjectLabel(image.subjectType))}</span>`);
  for (const theme of image.themes ?? []) {
    out.push(`<span class="chip">${esc(themeLabel(theme))}</span>`);
  }
  return out.join('');
}

// AstroBin's theme tags come through as raw constants; some are acronyms that
// should stay capitalised, the rest read better as ordinary words.
const THEME_LABELS = {
  LRGB: 'LRGB',
  RGB: 'RGB',
  HDR: 'HDR',
  NARROWBAND: 'Narrowband',
  BROADBAND: 'Broadband',
  MONOCHROME: 'Monochrome',
  WIDEFIELD: 'Wide field',
  MOSAIC: 'Mosaic',
};

const themeLabel = (theme) =>
  THEME_LABELS[theme] ??
  theme.replace(/_/g, ' ').replace(/\w\S*/g, (w) => w[0] + w.slice(1).toLowerCase());

const DATA_SOURCE_LABELS = {
  BACKYARD: 'Backyard',
  TRAVELLER: 'Travelled to a dark site',
  OWN_REMOTE: 'Own remote observatory',
  AMATEUR_HOSTING: 'Hosted remote rig',
  PUBLIC_AMATEUR_DATA: 'Public amateur data',
  PRO_DATA: 'Professional survey data',
  MIX: 'Mixed sources',
  OTHER: 'Other',
  UNKNOWN: 'Not recorded',
};

function factsSection(image) {
  const sky = image.sky;
  const rows = [
    ['Right ascension', sky ? `<span class="mono">${esc(formatRa(sky.ra))}</span>` : 'Not recorded'],
    ['Declination', sky ? `<span class="mono">${esc(formatDec(sky.dec))}</span>` : 'Not recorded'],
    ['Field of view', sky ? esc(formatFov(sky)) : 'Not recorded'],
    ['Pixel scale', sky?.pixscale ? `<span class="mono">${sky.pixscale.toFixed(2)}″/px</span>` : 'Not recorded'],
    [
      'Rotation',
      sky?.orientation != null ? `<span class="mono">${sky.orientation.toFixed(1)}°</span>` : 'Not recorded',
    ],
    ['Resolution', `<span class="mono">${image.width} × ${image.height}</span>`],
  ];
  return section(
    'Position in the sky',
    `<div class="facts">${rows
      .map(
        ([k, v]) =>
          `<div class="fact"><div class="fact__k">${esc(k)}</div><div class="fact__v">${v}</div></div>`,
      )
      .join('')}</div>`,
  );
}

function objectsSection(image) {
  const objects = image.sky?.objectsInField ?? [];
  if (!objects.length) return '';
  return section(
    'Catalogued in this field',
    `<div class="drawer__chips" style="margin:0">${objects
      .map((o) => `<span class="chip">${esc(o)}</span>`)
      .join('')}</div>`,
  );
}

function integrationSection(image) {
  const acq = image.acquisitions;
  if (!acq?.totalSeconds) return '';

  const bar = acq.byFilter
    .map(
      (f) =>
        `<div class="integration__seg" style="width:${(
          (f.seconds / acq.totalSeconds) * 100
        ).toFixed(3)}%;background:${filterColour(f.filterType)}" title="${esc(f.filter)}"></div>`,
    )
    .join('');

  const rows = acq.byFilter
    .map(
      (f) => `<div class="integration__row">
        <span class="integration__dot" style="background:${filterColour(f.filterType)}"></span>
        <span class="integration__name">${esc(f.filter)}</span>
        <span class="integration__subs">${f.frames} × ${f.subLengths
          .map((s) => `${s}s`)
          .join(' / ')}</span>
        <span class="integration__time">${esc(formatHours(f.hours))}</span>
      </div>`,
    )
    .join('');

  const summary = `<div class="facts" style="margin-bottom:16px">
      <div class="fact"><div class="fact__k">Total integration</div>
        <div class="fact__v"><span class="mono">${esc(formatHours(acq.totalHours))}</span></div></div>
      <div class="fact"><div class="fact__k">Subframes</div>
        <div class="fact__v"><span class="mono">${acq.totalFrames}</span></div></div>
      <div class="fact"><div class="fact__k">Collected over</div>
        <div class="fact__v">${esc(formatNightRange(acq))}</div></div>
    </div>`;

  return section(
    'Integration',
    `${summary}<div class="integration__bar">${bar}</div><div class="integration__rows">${rows}</div>`,
  );
}

// Hardware only — software is harvested but deliberately not listed here.
const GEAR_LABELS = {
  telescopes: 'Optics',
  cameras: 'Camera',
  mounts: 'Mount',
  filters: 'Filters',
  accessories: 'Accessories',
  guidingTelescopes: 'Guide scope',
  guidingCameras: 'Guide camera',
};

function equipmentSection(image) {
  const rows = Object.entries(GEAR_LABELS)
    .map(([key, label]) => [label, image.equipment[key] ?? []])
    .filter(([, items]) => items.length)
    .map(
      ([label, items]) => `<div class="gear__row">
        <div class="gear__k">${esc(label)}</div>
        <div class="gear__v">${items.map((i) => `<span>${esc(i.name)}</span>`).join('')}</div>
      </div>`,
    )
    .join('');
  return rows ? section('Equipment', `<div class="gear">${rows}</div>`) : '';
}

function conditionsSection(image) {
  const rows = [];
  if (image.location) {
    const place = [image.location.name, image.location.state].filter(Boolean).join(', ');
    rows.push(['Location', esc(place)]);
    if (image.location.bortle != null) rows.push(['Bortle class', `<span class="mono">${image.location.bortle}</span>`]);
  }
  if (image.moon?.averageIllumination != null) {
    rows.push([
      'Mean moon',
      `<span class="mono">${Math.round(image.moon.averageIllumination * 100)}% lit</span>`,
    ]);
  }
  if (image.dataSource) {
    rows.push(['Captured from', esc(DATA_SOURCE_LABELS[image.dataSource] ?? image.dataSource)]);
  }
  if (!rows.length) return '';
  return section(
    'Conditions',
    `<div class="facts">${rows
      .map(
        ([k, v]) =>
          `<div class="fact"><div class="fact__k">${esc(k)}</div><div class="fact__v">${v}</div></div>`,
      )
      .join('')}</div>`,
  );
}

/** A featured-elsewhere panel, currently only NASA's Astronomy Picture of the Day. */
function featureSection(image) {
  const apod = apodFeature(image);
  if (!apod) return '';
  return section(
    'Featured by NASA',
    `<a class="feature" href="${esc(apod.url)}" target="_blank" rel="noopener">
        <span class="feature__badge">APOD</span>
        <span class="feature__text">
          <strong>${esc(apod.label)}</strong>
          <span>${esc(apod.title)} · ${esc(formatDate(apod.date))}</span>
        </span>
        <span class="feature__go" aria-hidden="true">↗</span>
      </a>`,
  );
}

function receptionSection(image) {
  const s = image.stats;
  const rows = [
    ['Likes', formatCount(s.likes)],
    ['Bookmarks', formatCount(s.bookmarks)],
    ['Comments', formatCount(s.comments)],
    ['Published', formatDate(image.published)],
  ];
  return section(
    'On AstroBin',
    `<div class="facts">${rows
      .map(
        ([k, v]) =>
          `<div class="fact"><div class="fact__k">${esc(k)}</div><div class="fact__v"><span class="mono">${esc(
            v,
          )}</span></div></div>`,
      )
      .join('')}
      <div class="fact"><div class="fact__k">Full resolution</div><div class="fact__v">
        <a href="${esc(image.astrobinUrl)}" target="_blank" rel="noopener">Open on AstroBin ↗</a>
      </div></div>
    </div>`,
  );
}

const section = (title, html) =>
  `<section class="section"><h3 class="section__title">${esc(title)}</h3>${html}</section>`;

/* --- Public API ---------------------------------------------------- */

export function openDetail(image) {
  dom ??= build();
  current = image;

  const hero = image.thumbnails.hd ?? image.thumbnails.regular ?? image.thumbnails.card;
  const paragraphs = descriptionParagraphs(image.descriptionHtml);
  const locateButton = locateHandler
    ? `<button class="btn btn--primary" type="button" data-locate>Centre on the sky map</button>`
    : '';
  const unsolvedNote = image.sky
    ? ''
    : `<p class="muted" style="font-size:13px">This one is a solar system subject, so it has no fixed
       place among the stars and does not appear on the atlas.</p>`;

  dom.body.innerHTML = `
    <div class="drawer__hero">
      <img src="${esc(hero)}" alt="${esc(image.title)}" loading="lazy">
      <a class="drawer__hero-link" href="${esc(image.astrobinUrl)}" target="_blank" rel="noopener">
        View full size ↗
      </a>
    </div>
    <div class="drawer__content">
      <h2 class="drawer__title">${esc(image.title)}</h2>
      <div class="drawer__chips">${chips(image)}</div>
      ${
        paragraphs.length
          ? `<div class="drawer__desc">${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`
          : ''
      }
      ${unsolvedNote}
      ${locateButton ? `<div style="margin-bottom:24px">${locateButton}</div>` : ''}
      ${featureSection(image)}
      ${objectsSection(image)}
      ${factsSection(image)}
      ${integrationSection(image)}
      ${equipmentSection(image)}
      ${conditionsSection(image)}
      ${receptionSection(image)}
    </div>`;

  const locate = dom.body.querySelector('[data-locate]');
  if (locate) {
    locate.addEventListener('click', () => {
      locateHandler(current);
    });
    locate.disabled = !image.sky;
  }

  dom.body.scrollTop = 0;
  dom.backdrop.classList.add('is-open');
  dom.drawer.classList.add('is-open');
  document.dispatchEvent(new CustomEvent('detail:open', { detail: image }));
}

export function closeDetail() {
  if (!dom) return;
  dom.backdrop.classList.remove('is-open');
  dom.drawer.classList.remove('is-open');
  current = null;
  document.dispatchEvent(new CustomEvent('detail:close'));
}

export const currentImage = () => current;
