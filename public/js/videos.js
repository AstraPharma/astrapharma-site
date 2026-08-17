/* ---------------------------------------------------------------
   Videos page. Reads data/channel.json and links out to YouTube;
   nothing is embedded, so no third-party player loads on this site.
   --------------------------------------------------------------- */

import { loadChannel } from './data.js';
import { watchReveals } from './chrome.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const PLAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13l11-6.5L3 1.5Z"/></svg>';

function card(video, position) {
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
  // YouTube serves these thumbnails straight from its image CDN.
  const thumb = `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;
  return `<a class="video" href="${watch}" target="_blank" rel="noopener"
        data-reveal data-reveal-delay="${(position % 3) * 70}">
      <div class="video__frame">
        <img src="${thumb}" alt="" loading="lazy" onload="this.classList.add('is-loaded')">
        <div class="video__play"><span>${PLAY_ICON}</span></div>
        ${video.length ? `<span class="video__length">${esc(video.length)}</span>` : ''}
      </div>
      <h2 class="video__title">${esc(video.title)}</h2>
    </a>`;
}

async function main() {
  const channel = await loadChannel();
  const { handle, videos } = channel.youtube;

  $('videos-lede').textContent =
    `Equipment reviews, desert imaging vlogs and tutorials on ${handle}.`;

  $('subscribe').href = channel.links.youtube;
  $('videos').innerHTML = videos.map(card).join('');

  watchReveals();
}

main().catch((err) => {
  console.error(err);
  $('videos-lede').textContent =
    'The channel list could not be loaded: ' + (err && err.message ? err.message : String(err));
});
