/* ---------------------------------------------------------------
   Gallery page: filterable masonry of every published image, sharing
   the same detail drawer as the sky atlas.
   --------------------------------------------------------------- */

import {
  formatCount,
  formatHours,
  loadCatalogue,
  loadSkyLines,
  searchIndex,
  topAward,
} from './data.js';
import { openDetail, setConstellationNames, setLocateHandler } from './detail.js';
import { watchReveals } from './chrome.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const SORTS = {
  published: (a, b) => (b.published || '').localeCompare(a.published || ''),
  oldest: (a, b) => (a.published || '').localeCompare(b.published || ''),
  integration: (a, b) => b.acquisitions.totalHours - a.acquisitions.totalHours,
  likes: (a, b) => b.stats.likes - a.stats.likes,
  title: (a, b) => a.title.localeCompare(b.title),
};

const AWARD_MATCH = {
  iotd: (i) => i.awards.isIotd,
  tp: (i) => i.awards.isTopPick,
  tpn: (i) => i.awards.isTopPickNomination,
};

async function main() {
  const [catalogue, skyLines] = await Promise.all([loadCatalogue(), loadSkyLines()]);
  setConstellationNames(skyLines.constellations);
  setLocateHandler((image) => {
    window.location.href = '../index.html#' + image.hash;
  });

  const constellationName = new Map(skyLines.constellations.map((c) => [c.id, c.name]));
  const images = catalogue.images;
  const index = new Map(images.map((i) => [i.hash, searchIndex(i)]));
  const totals = catalogue.totals;

  $('gallery-lede').textContent =
    `${totals.images} published images, ${formatHours(totals.integrationHours)} of total ` +
    `integration across ${totals.frames.toLocaleString()} subframes and ` +
    `${totals.constellations.length} constellations.`;

  const constellationSelect = $('filter-constellation');
  for (const id of totals.constellations) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = constellationName.get(id) || id;
    constellationSelect.append(option);
  }

  function card(image, position) {
    const award = topAward(image);
    const badge = award
      ? `<span class="chip ${award.className} card__badge">${esc(award.short)}</span>`
      : '';
    const place = image.constellation
      ? esc(constellationName.get(image.constellation) || image.constellation)
      : 'Solar system';
    const hours = image.acquisitions.totalHours
      ? `<span>${esc(formatHours(image.acquisitions.totalHours))}</span>`
      : '';
    // Reserving the real aspect ratio stops the masonry from reflowing as images arrive.
    const ratio = image.width && image.height ? `${image.width} / ${image.height}` : '3 / 2';

    return `<article class="card" data-hash="${esc(image.hash)}" tabindex="0" role="button"
        aria-label="${esc(image.title)}" data-reveal data-reveal-delay="${(position % 3) * 80}">
        <div class="card__frame" style="aspect-ratio:${ratio}">
          <img class="card__img" loading="lazy"
               src="${esc(image.thumbnails.regular || image.thumbnails.card || '')}"
               alt="${esc(image.title)}" onload="this.classList.add('is-loaded')">
        </div>
        ${badge}
        <div class="card__body">
          <h2 class="card__title">${esc(image.title)}</h2>
          <div class="card__meta">
            <span>${place}</span>
            ${hours}
            <span>${esc(formatCount(image.stats.likes))} likes</span>
          </div>
        </div>
      </article>`;
  }

  const grid = $('grid');

  function render() {
    const query = $('search').value.trim().toLowerCase();
    const constellation = constellationSelect.value;
    const award = $('filter-award').value;

    const list = images
      .filter((i) => !constellation || i.constellation === constellation)
      .filter((i) => !award || AWARD_MATCH[award](i))
      .filter((i) => !query || (index.get(i.hash) || '').includes(query))
      .sort(SORTS[$('sort').value] || SORTS.published);

    grid.innerHTML = list.length
      ? list.map(card).join('')
      : '<p class="gallery__empty">Nothing matches those filters.</p>';

    $('count').textContent =
      list.length === images.length
        ? `${images.length} images`
        : `${list.length} of ${images.length} images`;

    watchReveals();
  }

  const open = (hash) => {
    const image = images.find((i) => i.hash === hash);
    if (image) openDetail(image);
  };

  grid.addEventListener('click', (event) => {
    const el = event.target.closest('.card');
    if (el) open(el.dataset.hash);
  });

  grid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const el = event.target.closest('.card');
    if (!el) return;
    event.preventDefault();
    open(el.dataset.hash);
  });

  for (const id of ['search', 'filter-constellation', 'filter-award', 'sort']) {
    $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
  }

  render();

  // Allow /pages/gallery.html#hash to open one straight away.
  const deepLink = decodeURIComponent(location.hash.replace('#', ''));
  if (deepLink) open(deepLink);
}

main().catch((err) => {
  console.error(err);
  $('gallery-lede').textContent =
    'The collection could not be loaded: ' + (err && err.message ? err.message : String(err));
});
