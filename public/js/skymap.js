/* ---------------------------------------------------------------
   Sky atlas controller.

   Boots Aladin Lite as the sky itself, draws the constellation
   figures over it, hands the captured fields to the fields layer,
   and wires up the rail, the map controls and the pointer.
   --------------------------------------------------------------- */

import {
  formatAngle,
  formatDec,
  formatHours,
  formatRa,
  loadCatalogue,
  loadSkyLines,
  searchIndex,
  topAward,
} from './data.js';
import { closeDetail, openDetail, setConstellationNames, setLocateHandler } from './detail.js';
import { createFieldsLayer } from './sky-fields.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const WHOLE_SKY_FOV = 240;
const MIN_FOV = 0.03;
const MAX_FOV = 320;

// Overlay colours. These sit on top of the Mellinger wide-field survey, whose
// Milky Way band is bright and warm, so they are pitched light and cool enough
// to stay legible over it as well as over empty sky.
const FIGURE_COLOUR = '#93bce6';
const BORDER_COLOUR = '#6d80a6';
const LABEL_COLOUR = '#dce8f7';
const GRID_COLOUR = '#7286ab';

// Direct CDS service URL. Using the short id instead makes Aladin probe
// mirrors, and one answers without CORS headers.
const DEFAULT_SURVEY = 'https://alasky.cds.unistra.fr/MellingerRGB';

// Keyed by the short label from topAward().
const AWARD_COLOUR = {
  'NASA APOD': 'var(--gold-bright)',
  IOTD: 'var(--gold)',
  'Top Pick': 'var(--ice)',
  Nominated: 'var(--violet)',
};

/** Aladin's option and layer names vary between builds; never let one kill the page. */
function attempt(label, fn) {
  try {
    return fn();
  } catch (err) {
    console.warn('[atlas] ' + label + ':', err);
    return null;
  }
}

function showError(html) {
  const box = $('sky-loading');
  box.classList.remove('is-done');
  box.innerHTML = '<p class="sky-loading--error">' + html + '</p>';
}

/* ================================================================= */

async function boot() {
  const [catalogue, skyLines] = await Promise.all([loadCatalogue(), loadSkyLines()]);
  setConstellationNames(skyLines.constellations);

  const constellationName = new Map(skyLines.constellations.map((c) => [c.id, c.name]));
  const images = catalogue.images;
  const mapped = images.filter((i) => i.sky && i.sky.footprint);
  const index = new Map(images.map((i) => [i.hash, searchIndex(i)]));

  if (typeof A === 'undefined') {
    showError(
      'The sky engine (Aladin Lite, from the Strasbourg astronomical data centre) could not be ' +
        'loaded. Check the connection and reload — the gallery and about pages work without it.',
    );
    return;
  }

  await A.init;

  const wrap = document.querySelector('.sky-wrap');
  const aladin = A.aladin($('sky'), {
    survey: DEFAULT_SURVEY,
    fov: WHOLE_SKY_FOV,
    projection: 'AIT',
    cooFrame: 'ICRS',
    target: '6 +10',
    backgroundColor: '#04060c',
    showReticle: false,
    showZoomControl: false,
    showLayersControl: false,
    showFullscreenControl: false,
    showGotoControl: false,
    showShareControl: false,
    showSimbadPointerControl: false,
    showSettingsControl: false,
    showProjectionControl: false,
    showFrame: false,
    showCooGrid: false,
    showStatusBar: false,
    showContextMenu: false,
    realFullscreen: false,
  });

  /* --- Constellation figures, borders and names ------------------- */

  const figuresOverlay = attempt('figures', () => {
    const overlay = A.graphicOverlay({ name: 'Constellation figures', color: FIGURE_COLOUR, lineWidth: 1.4 });
    aladin.addOverlay(overlay);
    for (const figure of skyLines.figures) {
      for (const line of figure.lines) overlay.add(A.polyline(line));
    }
    // Off by default: the first view should be the sky and the photographs,
    // with the reference layers there for whoever wants them.
    overlay.hide();
    return overlay;
  });

  const bordersOverlay = attempt('borders', () => {
    const overlay = A.graphicOverlay({ name: 'Constellation borders', color: BORDER_COLOUR, lineWidth: 1 });
    aladin.addOverlay(overlay);
    for (const line of skyLines.borders) overlay.add(A.polyline(line));
    overlay.hide();
    return overlay;
  });

  const namesCatalog = attempt('names', () => {
    const catalog = A.catalog({
      name: 'Constellation names',
      sourceSize: 8,
      color: 'rgba(0,0,0,0)',
      shape: 'square',
      displayLabel: true,
      labelColumn: 'name',
      labelColor: LABEL_COLOUR,
      labelFont: '600 13px "Inter", "Segoe UI", sans-serif',
    });
    aladin.addCatalog(catalog);
    catalog.addSources(
      skyLines.constellations.map((c) => A.source(c.ra, c.dec, { name: c.name })),
    );
    catalog.hide();
    return catalog;
  });

  /* --- The captured fields ---------------------------------------- */

  const fields = createFieldsLayer({ canvas: $('sky-thumbs'), container: wrap, aladin });
  fields.setImages(mapped);

  /* --- View helpers ----------------------------------------------- */

  // Aitoff throughout. The projection only changes when the visitor picks a
  // different one — nothing switches under them as they zoom.
  let activeProjection = 'AIT';
  let introDismissed = false;

  /** Clears the opening panel the first time the visitor engages with the map. */
  function dismissIntro() {
    if (introDismissed) return;
    introDismissed = true;
    const intro = $('intro');
    if (intro) intro.classList.add('is-gone');
  }

  const currentFov = () => {
    const fov = attempt('getFov', () => aladin.getFov());
    return Array.isArray(fov) ? fov[0] : WHOLE_SKY_FOV;
  };

  function setProjection(name) {
    if (name === activeProjection) return;
    activeProjection = name;
    attempt('setProjection', () => aladin.setProjection(name));
  }

  function setFov(value) {
    const clamped = Math.min(MAX_FOV, Math.max(MIN_FOV, value));
    attempt('setFoV', () => aladin.setFoV(clamped));
  }

  /** Frames one image: centred, with room around it to see the context. */
  function flyTo(image) {
    if (!image.sky) return;
    const extent = Math.max(image.sky.fovWidth || 1, image.sky.fovHeight || 1);
    setFov(extent * 2.4);
    attempt('gotoRaDec', () => aladin.gotoRaDec(image.sky.ra, image.sky.dec));
    dismissIntro();
  }

  function resetView() {
    attempt('gotoRaDec', () => aladin.gotoRaDec(90, 10));
    attempt('setFoV', () => aladin.setFoV(WHOLE_SKY_FOV));
  }

  /* --- Selection --------------------------------------------------- */

  let selected = null;

  function select(image, { fly = false } = {}) {
    selected = image;
    fields.setSelected(image ? image.hash : null);
    markRailActive(image ? image.hash : null);
    if (!image) return;
    if (fly) flyTo(image);
    openDetail(image);
    history.replaceState(null, '', '#' + image.hash);
  }

  function clearSelection() {
    selected = null;
    fields.setSelected(null);
    markRailActive(null);
    history.replaceState(null, '', location.pathname + location.search);
  }

  document.addEventListener('detail:close', clearSelection);
  setLocateHandler((image) => {
    flyTo(image);
    if (window.matchMedia('(max-width: 900px)').matches) closeDetail();
  });

  /* --- The rail ---------------------------------------------------- */

  const listEl = $('rail-list');
  const countEl = $('rail-count');
  const searchEl = $('search');
  const constellationEl = $('filter-constellation');
  const sortEl = $('sort');

  for (const id of catalogue.totals.constellations) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = constellationName.get(id) || id;
    constellationEl.append(option);
  }

  const SORTS = {
    published: (a, b) => (b.published || '').localeCompare(a.published || ''),
    integration: (a, b) => b.acquisitions.totalHours - a.acquisitions.totalHours,
    likes: (a, b) => b.stats.likes - a.stats.likes,
    ra: (a, b) => (a.sky ? a.sky.ra : 999) - (b.sky ? b.sky.ra : 999),
    title: (a, b) => a.title.localeCompare(b.title),
  };

  function visibleImages() {
    const query = searchEl.value.trim().toLowerCase();
    const constellation = constellationEl.value;
    return images
      .filter((i) => !constellation || i.constellation === constellation)
      .filter((i) => !query || (index.get(i.hash) || '').includes(query))
      .sort(SORTS[sortEl.value] || SORTS.published);
  }

  function railItem(image) {
    const award = topAward(image);
    const dot = award
      ? '<span class="rail-item__award" style="background:' +
        (AWARD_COLOUR[award.short] || 'var(--text-faint)') +
        '" title="' +
        esc(award.label) +
        '"></span>'
      : '';
    const place = image.constellation
      ? esc(constellationName.get(image.constellation) || image.constellation)
      : 'Solar system';
    const hours = image.acquisitions.totalHours
      ? ' · ' + esc(formatHours(image.acquisitions.totalHours))
      : '';

    return (
      '<li class="rail-item" data-hash="' +
      esc(image.hash) +
      '" tabindex="0" role="button">' +
      '<img class="rail-item__thumb" loading="lazy" alt="" src="' +
      esc(image.thumbnails.small || '') +
      '" onload="this.classList.add(\'is-loaded\')">' +
      '<div><div class="rail-item__title">' +
      esc(image.title) +
      '</div><div class="rail-item__meta">' +
      dot +
      '<span>' +
      place +
      hours +
      '</span></div></div></li>'
    );
  }

  function renderRail() {
    const list = visibleImages();
    listEl.innerHTML = list.length
      ? list.map(railItem).join('')
      : '<li class="rail__empty">Nothing matches that search.</li>';

    const total = images.length;
    countEl.textContent =
      list.length === total
        ? total + ' images · ' + mapped.length + ' plotted on the sky'
        : list.length + ' of ' + total + ' images';

    markRailActive(selected ? selected.hash : null);
  }

  function markRailActive(hash) {
    for (const el of listEl.querySelectorAll('.rail-item')) {
      el.classList.toggle('is-active', el.dataset.hash === hash);
    }
    if (!hash) return;
    const active = listEl.querySelector('.rail-item.is-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  const imageFor = (hash) => images.find((i) => i.hash === hash) || null;

  listEl.addEventListener('click', (event) => {
    const item = event.target.closest('.rail-item');
    if (!item) return;
    const image = imageFor(item.dataset.hash);
    if (image) select(image, { fly: true });
  });

  listEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = event.target.closest('.rail-item');
    if (!item) return;
    event.preventDefault();
    const image = imageFor(item.dataset.hash);
    if (image) select(image, { fly: true });
  });

  listEl.addEventListener('pointerover', (event) => {
    const item = event.target.closest('.rail-item');
    fields.setHovered(item ? item.dataset.hash : null);
  });
  listEl.addEventListener('pointerleave', () => fields.setHovered(null));

  searchEl.addEventListener('input', renderRail);
  constellationEl.addEventListener('change', renderRail);
  sortEl.addEventListener('change', renderRail);
  renderRail();

  /* --- Map controls ------------------------------------------------ */

  for (const button of document.querySelectorAll('[data-zoom]')) {
    button.addEventListener('click', () => {
      const factor = button.dataset.zoom === 'in' ? 1 / 1.7 : 1.7;
      setFov(currentFov() * factor);
      dismissIntro();
    });
  }

  $('reset-view').addEventListener('click', resetView);

  const bindToggle = (id, handler) => {
    const el = $(id);
    el.addEventListener('change', () => handler(el.checked));
  };

  bindToggle('t-figures', (on) =>
    attempt('toggle figures', () => (on ? figuresOverlay.show() : figuresOverlay.hide())),
  );
  bindToggle('t-borders', (on) =>
    attempt('toggle borders', () => (on ? bordersOverlay.show() : bordersOverlay.hide())),
  );
  bindToggle('t-names', (on) =>
    attempt('toggle names', () => (on ? namesCatalog.show() : namesCatalog.hide())),
  );
  bindToggle('t-grid', (on) =>
    attempt('toggle grid', () => {
      if (aladin.setCooGrid) aladin.setCooGrid({ enabled: on, color: GRID_COLOUR });
      else if (on) aladin.showCooGrid();
      else aladin.hideCooGrid();
    }),
  );
  bindToggle('t-fields', (on) => fields.setShowFields(on));
  bindToggle('t-photos', (on) => fields.setShowPhotos(on));

  $('survey').addEventListener('change', (event) => {
    attempt('setBaseImageLayer', () => aladin.setBaseImageLayer(event.target.value));
  });

  $('projection').addEventListener('change', (event) => setProjection(event.target.value));

  const railEl = $('rail');
  const closeRail = () => railEl.classList.remove('is-open');
  $('rail-toggle').addEventListener('click', () => railEl.classList.toggle('is-open'));
  $('rail-close').addEventListener('click', closeRail);

  // On a narrow screen the rail covers the map, so picking an image should
  // hand the map back rather than leave the list in the way.
  const narrow = () => window.matchMedia('(max-width: 980px)').matches;
  listEl.addEventListener('click', () => {
    if (narrow()) closeRail();
  });

  /* --- Pointer ------------------------------------------------------
     Aladin stops propagation on its own canvas, so these listen in the
     capture phase and never call preventDefault. Panning and zooming
     stay entirely Aladin's; this only decides what was clicked.       */

  const tip = $('sky-tip');
  const tipImg = $('sky-tip-img');
  const tipTitle = $('sky-tip-title');
  const tipSub = $('sky-tip-sub');
  let press = null;

  // Proximity radius for the hit test. Fingertips need a far larger target
  // than a cursor.
  const HIT_TOLERANCE = { mouse: 15, pen: 18, touch: 30 };
  const toleranceFor = (type) => HIT_TOLERANCE[type] ?? HIT_TOLERANCE.touch;

  // Which image the tap-preview card is currently showing, so a second tap on
  // the same frame can open it rather than just re-previewing it.
  let previewed = null;

  function hideTip() {
    tip.hidden = true;
    tip.classList.remove('is-pinned');
    previewed = null;
    fields.setHovered(null);
    wrap.style.cursor = '';
  }

  // Anything drawn over the map that should absorb its own clicks rather than
  // selecting whatever frame happens to sit behind it.
  const isChrome = (target) =>
    target.closest('.sky-controls, .sky-readout, .rail-toggle, .rail, .intro');

  const localPoint = (event) => {
    const rect = wrap.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, rect };
  };

  /**
   * Fills the card. `pinned` is the touch presentation: the card sits at the
   * bottom of the map, takes taps of its own, and stays until dismissed.
   * Otherwise it trails the cursor and ignores the pointer.
   */
  function showTip(image, x, y, rect, pinned) {
    tipImg.src = image.thumbnails.small || '';
    tipTitle.textContent = image.title;
    const place = image.constellation
      ? constellationName.get(image.constellation) || image.constellation
      : 'Solar system';
    tipSub.textContent = place + ' · ' + formatHours(image.acquisitions.totalHours);
    tip.hidden = false;
    tip.classList.toggle('is-pinned', !!pinned);

    if (pinned) {
      tip.style.left = '';
      tip.style.top = '';
      return;
    }
    const width = tip.offsetWidth || 260;
    const height = tip.offsetHeight || 74;
    tip.style.left = Math.min(Math.max(8, x + 16), rect.width - width - 8) + 'px';
    tip.style.top = Math.min(Math.max(8, y + 16), rect.height - height - 8) + 'px';
  }

  /**
   * What a completed tap or click on the map means.
   *
   * With a cursor there is already a hover card, so a click goes straight to
   * the full details. With a finger there is no hover, so the first tap raises
   * the card and a second tap on the same frame opens it — which also gives
   * somewhere to aim when frames overlap.
   */
  function handleTap(image, type) {
    dismissIntro();
    if (type === 'mouse') {
      hideTip();
      select(image);
      return;
    }
    if (previewed === image.hash) {
      hideTip();
      select(image);
      return;
    }
    previewed = image.hash;
    fields.setHovered(image.hash);
    showTip(image, 0, 0, null, true);
  }

  wrap.addEventListener(
    'pointerdown',
    (event) => {
      if (isChrome(event.target) || tip.contains(event.target)) return;
      press = { type: event.pointerType };
    },
    true,
  );

  wrap.addEventListener(
    'pointermove',
    (event) => {
      // Moving onto the controls must clear the card too, or it is left
      // stranded over the map with nothing under the pointer.
      if (isChrome(event.target)) {
        if (!tip.classList.contains('is-pinned')) hideTip();
        return;
      }

      // Hover only exists for a cursor. On touch the card is raised by a tap
      // instead, further down.
      if (event.pointerType !== 'mouse') return;

      const { x, y, rect } = localPoint(event);
      const hit = fields.hitTest(x, y, toleranceFor('mouse'));
      fields.setHovered(hit ? hit.hash : null);
      wrap.style.cursor = hit ? 'pointer' : '';
      if (hit) showTip(hit, x, y, rect, false);
      else tip.hidden = true;
    },
    true,
  );

  /*
     Taps come from the click event rather than being reconstructed from
     pointerdown/pointerup. The browser already distinguishes a tap from a pan
     using the platform's own thresholds and its knowledge of the gesture the
     touch was consumed by — hand-rolling that from raw coordinates got it
     wrong on real hardware.
  */
  wrap.addEventListener(
    'click',
    (event) => {
      const type = press ? press.type : 'mouse';
      press = null;
      if (isChrome(event.target) || tip.contains(event.target)) return;

      const { x, y } = localPoint(event);
      const hit = fields.hitTest(x, y, toleranceFor(type));
      if (hit) handleTap(hit, type);
      else if (tip.classList.contains('is-pinned')) hideTip();
    },
    true,
  );

  // The card itself: tapping it opens the image, the cross dismisses it.
  tip.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target.closest('.sky-tip__close')) {
      hideTip();
      return;
    }
    const image = previewed ? imageFor(previewed) : null;
    hideTip();
    if (image) select(image);
  });

  // A cancelled gesture (scroll takeover, call interruption) must not leave a
  // half-finished press behind.
  wrap.addEventListener('pointercancel', () => {
    press = null;
  }, true);

  wrap.addEventListener('pointerleave', () => {
    if (!tip.classList.contains('is-pinned')) hideTip();
  });
  // Opening the detail panel covers the map; the card underneath is just clutter.
  document.addEventListener('detail:open', hideTip);

  /* --- Readout and redraw loop -------------------------------------- */

  const roRa = $('ro-ra');
  const roDec = $('ro-dec');
  const roFov = $('ro-fov');
  let last = { ra: null, dec: null, fov: null };

  function tick() {
    const centre = attempt('getRaDec', () => aladin.getRaDec());
    const fov = currentFov();
    if (centre && (centre[0] !== last.ra || centre[1] !== last.dec || fov !== last.fov)) {
      last = { ra: centre[0], dec: centre[1], fov };
      fields.draw();
      roRa.textContent = formatRa(centre[0]);
      roDec.textContent = formatDec(centre[1]);
      roFov.textContent = formatAngle(fov);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* --- Introduction, deep link, reveal -------------------------------- */

  const intro = $('intro');
  $('intro-stats').innerHTML = [
    [String(catalogue.totals.images), 'Images'],
    [String(Math.round(catalogue.totals.integrationHours)), 'Hours'],
    [String(catalogue.totals.constellations.length), 'Constellations'],
  ]
    .map(([value, label]) => `<div class="intro__stat"><b>${value}</b><span>${label}</span></div>`)
    .join('');

  $('intro-go').addEventListener('click', dismissIntro);
  intro.addEventListener('click', (event) => {
    if (event.target === intro) dismissIntro();
  });

  $('sky-loading').classList.add('is-done');

  const deepLink = decodeURIComponent(location.hash.replace('#', ''));
  if (deepLink) {
    const image = imageFor(deepLink);
    if (image) {
      dismissIntro();
      select(image, { fly: true });
    }
  }
}

boot().catch((err) => {
  console.error(err);
  showError(
    'Something went wrong loading the atlas: ' +
      esc(err && err.message ? err.message : String(err)) +
      '. Try reloading the page.',
  );
});
