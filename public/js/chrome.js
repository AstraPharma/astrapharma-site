/* ---------------------------------------------------------------
   Page chrome: the navigation, the footer and the scroll reveals.

   Every page carries <header data-nav></header> and
   <footer data-footer></footer>; this fills them in. To add a page to
   the site, add one entry to PAGES below — nothing else needs editing.
   --------------------------------------------------------------- */

/* Site root, worked out from this file's own URL, so the links are
   correct whether the page sits at / or /pages/. */
const ROOT = new URL('../', import.meta.url).pathname;

export const PAGES = [
  { href: 'index.html', label: 'Sky Atlas' },
  { href: 'pages/gallery.html', label: 'Gallery' },
  { href: 'pages/videos.html', label: 'Videos' },
  { href: 'pages/about.html', label: 'About' },
];

export const LINKS = {
  astrobin: 'https://app.astrobin.com/u/AstraPharma',
  youtube: 'https://www.youtube.com/@AstraPharmaq8',
  instagram: 'https://www.instagram.com/astrapharma_q8',
};

const ICONS = {
  youtube:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.5 3.9 12 3.9 12 3.9s-7.5 0-9.4.5A3 3 0 0 0 .5 6.5C0 8.4 0 12 0 12s0 3.6.5 5.5a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.5.5-5.5s0-3.6-.5-5.5ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z"/></svg>',
  instagram:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.8-.1Zm0 3.8A6 6 0 1 0 18 12a6 6 0 0 0-6-6Zm0 9.9A3.9 3.9 0 1 1 15.9 12 3.9 3.9 0 0 1 12 15.9Zm7.6-10.1a1.4 1.4 0 1 1-1.4-1.4 1.4 1.4 0 0 1 1.4 1.4Z"/></svg>',
};

const isActive = (href, path) => {
  const page = href.split('/').pop();
  if (page === 'index.html') return path === ROOT || path.endsWith('/index.html');
  return path.endsWith('/' + page);
};

function navHtml() {
  const path = window.location.pathname;

  const links = PAGES.map(
    (p) =>
      `<a class="nav__link" href="${ROOT}${p.href}"${
        isActive(p.href, path) ? ' aria-current="page"' : ''
      }>${p.label}</a>`,
  ).join('');

  // YouTube and Instagram use their own marks. AstroBin is where the
  // AstraPharma profile lives, so it is represented by the AstraPharma mark
  // itself rather than an invented icon.
  const socials =
    [
      ['youtube', 'YouTube'],
      ['instagram', 'Instagram'],
    ]
      .map(
        ([key, label]) =>
          `<a class="nav__social" href="${LINKS[key]}" target="_blank" rel="noopener"
              aria-label="${label}" title="${label}">${ICONS[key]}</a>`,
      )
      .join('') +
    `<a class="nav__social nav__social--brand" href="${LINKS.astrobin}" target="_blank"
        rel="noopener" aria-label="AstraPharma on AstroBin" title="AstraPharma on AstroBin">
        <span class="brand-mark" aria-hidden="true"></span>
      </a>`;

  return `<nav class="nav">
      <a class="nav__brand" href="${ROOT}index.html" aria-label="AstraPharma, home">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>
          <span class="nav__wordmark">AstraPharma</span>
          <span class="nav__person">Ali Alobaidly</span>
        </span>
      </a>
      <div class="nav__links">${links}</div>
      <div class="nav__socials">${socials}</div>
    </nav>`;
}

function footerHtml() {
  const pages = PAGES.map(
    (p) => `<li><a href="${ROOT}${p.href}">${p.label}</a></li>`,
  ).join('');

  return `<div class="footer__inner">
      <div>
        <span class="brand-lockup footer__lockup" aria-label="AstraPharma"></span>
        <p class="footer__tag">
          Deep sky photography from the Kuwaiti desert, and an atlas of exactly where
          each frame was taken.
        </p>
      </div>
      <div class="footer__cols">
        <div>
          <div class="footer__h">Explore</div>
          <ul class="footer__list">${pages}</ul>
        </div>
        <div>
          <div class="footer__h">Elsewhere</div>
          <ul class="footer__list">
            <li><a href="${LINKS.youtube}" target="_blank" rel="noopener">YouTube</a></li>
            <li><a href="${LINKS.instagram}" target="_blank" rel="noopener">Instagram</a></li>
            <li><a href="${LINKS.astrobin}" target="_blank" rel="noopener">AstroBin</a></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="footer__base">
      <span>© <span data-year></span> Ali Alobaidly · AstraPharma</span>
      <span>Images all rights reserved</span>
    </div>`;
}

/** Fades elements in as they scroll into view. Opt in with data-reveal. */
export function watchReveals(root = document) {
  const targets = root.querySelectorAll('[data-reveal]:not(.is-in)');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    for (const el of targets) el.classList.add('is-in');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        // Stagger siblings slightly so a grid arrives as a wave, not a slab.
        const delay = Number(entry.target.dataset.revealDelay ?? 0);
        setTimeout(() => entry.target.classList.add('is-in'), delay);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );

  for (const el of targets) observer.observe(el);
}

export function mountChrome() {
  const header = document.querySelector('[data-nav]');
  if (header) header.innerHTML = navHtml();

  const footer = document.querySelector('[data-footer]');
  if (footer) {
    footer.className = 'footer';
    footer.innerHTML = footerHtml();
  }

  for (const el of document.querySelectorAll('[data-year]')) {
    el.textContent = String(new Date().getFullYear());
  }

  watchReveals();
}

mountChrome();
