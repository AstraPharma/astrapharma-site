/* ---------------------------------------------------------------
   About page. The numbers, sites and equipment list are generated
   from the catalogue so they never drift out of date; the story is
   Ali's own words, taken from the channel data.
   --------------------------------------------------------------- */

import { formatDate, loadCatalogue, loadChannel } from './data.js';
import { watchReveals } from './chrome.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const COUNTRIES = { KW: 'Kuwait' };

// Hardware only — software is harvested but deliberately not listed here.
const GEAR_GROUPS = [
  ['telescopes', 'Telescopes'],
  ['cameras', 'Cameras'],
  ['mounts', 'Mounts'],
  ['filters', 'Filters'],
  ['accessories', 'Accessories'],
  ['guidingTelescopes', 'Guiding optics'],
  ['guidingCameras', 'Guiding cameras'],
];

const listSentence = (parts) =>
  parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

async function main() {
  const [catalogue, channel] = await Promise.all([loadCatalogue(), loadChannel()]);
  const { totals, equipment, sites } = catalogue;

  /* --- Story ------------------------------------------------------- */

  // A line he opened with quotation marks reads better pulled out as a quote.
  // The punctuation is left exactly as written — the closing quote sits mid
  // sentence ("… like this," he said), so stripping it would mangle the line.
  $('bio').innerHTML = channel.youtube.bio
    .map((paragraph) =>
      /^["“]/.test(paragraph.trim())
        ? `<blockquote>${esc(paragraph.trim())}</blockquote>`
        : `<p>${esc(paragraph)}</p>`,
    )
    .join('');

  // Close the layout up rather than show a broken frame if no portrait is set.
  const portrait = $('portrait');
  portrait.addEventListener('error', () => {
    portrait.closest('.story').classList.add('no-portrait');
  });
  if (portrait.complete && portrait.naturalWidth === 0) {
    portrait.closest('.story').classList.add('no-portrait');
  }

  /* --- Stat band --------------------------------------------------- */

  const stats = [
    [String(totals.images), 'Published images'],
    [Math.round(totals.integrationHours).toLocaleString(), 'Hours of integration'],
    [totals.frames.toLocaleString(), 'Subframes stacked'],
    [String(totals.constellations.length), 'Constellations'],
    [String(totals.iotd + totals.topPicks), 'Editor awards'],
    [String(totals.apod), 'NASA APOD'],
  ];
  $('stats').innerHTML = stats
    .map(
      ([value, label]) =>
        `<div class="stat"><div class="stat__v">${esc(value)}</div>` +
        `<div class="stat__k">${esc(label)}</div></div>`,
    )
    .join('');

  /* --- Observing sites --------------------------------------------- */

  $('sites').innerHTML = sites
    .map((site) => {
      const where = [site.state, COUNTRIES[site.country] ?? site.country]
        .filter(Boolean)
        .join(', ');
      const bortle =
        site.bortle != null ? `<span class="chip">Bortle ${esc(site.bortle)}</span>` : '';
      return `<div class="site">
          <div class="site__name">${esc(site.name)}</div>
          <div class="site__where">${esc(where)}</div>
          <div class="site__meta">
            <span class="chip">${site.images} image${site.images === 1 ? '' : 's'}</span>
            ${bortle}
          </div>
        </div>`;
    })
    .join('');

  /* --- Equipment ---------------------------------------------------- */

  // Every column shows the same number of items so the grid reads evenly;
  // anything past that folds away behind a toggle.
  const VISIBLE_GEAR = 5;

  const gearLine = (g) =>
    `<div class="gear-line"><span>${esc(g.name)}</span>
      <span class="gear-line__count">${g.images}×</span>
    </div>`;

  $('gear').innerHTML = GEAR_GROUPS.map(([key, label]) => {
    const items = equipment.filter((g) => g.category === key);
    if (!items.length) return '';

    const shown = items.slice(0, VISIBLE_GEAR).map(gearLine).join('');
    const rest = items.slice(VISIBLE_GEAR);
    const more = rest.length
      ? `<div class="gear-more"><div>${rest.map(gearLine).join('')}</div></div>
         <button class="gear-toggle" type="button" aria-expanded="false"
                 data-count="${rest.length}">Show ${rest.length} more</button>`
      : '';

    return `<div class="gear-group">
        <h3 class="gear-group__title">${esc(label)}</h3>${shown}${more}
      </div>`;
  }).join('');

  $('gear').addEventListener('click', (event) => {
    const toggle = event.target.closest('.gear-toggle');
    if (!toggle) return;
    const group = toggle.closest('.gear-group');
    const open = group.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Show less' : `Show ${toggle.dataset.count} more`;
  });

  /* --- Recognition --------------------------------------------------- */

  const awards = [];
  if (totals.iotd) awards.push(`${totals.iotd} Image of the Day`);
  if (totals.topPicks) awards.push(`${totals.topPicks} Top Picks`);
  if (totals.topPickNominations)
    awards.push(`${totals.topPickNominations} Top Pick nominations`);

  $('awards-text').textContent = awards.length
    ? `AstroBin's editors have awarded this collection ${listSentence(awards)}.`
    : '';

  // The two honours that deserve more than a line in a paragraph: a NASA
  // Astronomy Picture of the Day, and an AstroBin Image of the Day.
  const honours = [];

  for (const image of catalogue.images) {
    const apod = (image.features ?? []).find((f) => f.kind === 'apod');
    if (!apod) continue;
    honours.push({
      image,
      modifier: 'honour--apod',
      eyebrow: 'NASA Astronomy Picture of the Day',
      title: apod.title,
      date: apod.date,
      url: apod.url,
      cta: 'Read it on apod.nasa.gov',
    });
  }

  for (const image of catalogue.images) {
    if (!image.awards.isIotd) continue;
    honours.push({
      image,
      modifier: 'honour--iotd',
      eyebrow: 'AstroBin Image of the Day',
      title: image.title,
      date: image.awards.iotdDate ?? image.published,
      url: image.astrobinUrl,
      cta: 'View it on AstroBin',
    });
  }

  const host = $('honours');
  if (host && honours.length) {
    host.innerHTML = honours
      .map((h) => {
        const thumb = h.image.thumbnails.card || h.image.thumbnails.regular || '';
        // The APOD title already differs from the image title; the IOTD title
        // is the image itself, so there is nothing to repeat underneath.
        const subject = h.title === h.image.title ? '' : ` · ${h.image.title}`;
        return `<a class="honour ${h.modifier}" href="${esc(h.url)}" target="_blank" rel="noopener">
            <img class="honour__img" src="${esc(thumb)}" alt="${esc(h.image.title)}" loading="lazy">
            <span class="honour__body">
              <span class="honour__eyebrow">${esc(h.eyebrow)}</span>
              <strong class="honour__title">${esc(h.title)}</strong>
              <span class="honour__meta">${esc(formatDate(h.date))}${esc(subject)}</span>
              <span class="honour__link">${esc(h.cta)} ↗</span>
            </span>
          </a>`;
      })
      .join('');
  }

  watchReveals();
}

main().catch((err) => {
  console.error(err);
  const awards = $('awards-text');
  if (awards) awards.textContent = 'The collection data could not be loaded.';
});
