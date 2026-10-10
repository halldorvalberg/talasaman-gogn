// Entry point: sets up the sidebar and theme, builds the page links and shows
// the page named in the URL hash (#/places etc.).

import { el } from './lib/dom.js';
import { PAGES, pageForHash } from './pages.js';
import { setupSidebar, closeSidebarIfNarrow } from './components/sidebar.js';
import { setupThemeToggle } from './components/theme-toggle.js';
import { endpointPage } from './views/endpoint.js';
import { logoPulse } from './components/logo-pulse.js';

const nav = document.getElementById('pages');
const main = document.getElementById('page');
const crumb = document.getElementById('crumb');

function buildNav() {
  nav.append(...PAGES.map((p) => el('a', { href: `#/${p.id}`, className: p.parent ? 'sub' : '' }, p.title)));
}

/** Mark the current page's link and set the crumb and document title. */
function markCurrent(page) {
  for (const a of nav.querySelectorAll('a')) {
    const current = a.hash === `#/${page.id}`;
    a.classList.toggle('active', current);
    if (current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const parent = PAGES.find((p) => p.id === page.parent);
  crumb.textContent = parent ? `${parent.title} / ${page.title}` : page.title;
  document.title = `${page.title} · Talasaman gögn`;
}

/** Show the page for the current URL hash. */
function route() {
  const page = pageForHash(location.hash);
  markCurrent(page);
  closeSidebarIfNarrow();
  main.replaceChildren(page.view ? page.view(page, PAGES) : endpointPage(page));
  window.scrollTo(0, 0);
}

setupSidebar();
document.getElementById('brand-mark').replaceWith(logoPulse({ className: 'brand-mark' }));
setupThemeToggle();
buildNav();
window.addEventListener('hashchange', route);
route();
