// Entry point: sets up the sidebar, the theme and the style (Minimal |
// Samtal), builds the page links and shows the page named in the URL hash
// (#/places etc.). A page may take part of the address for itself
// (#/listen/7?t=90); while the address stays on that page, the page follows
// it in place instead of being built again.

import { el } from './lib/dom.js';
import { PAGES, pageForHash, ancestorsOf, depthClass } from './pages.js';
import { setupSidebar, closeSidebarIfNarrow, followStyle } from './components/sidebar.js';
import { setupThemeToggle, setupStyleToggle } from './components/theme-toggle.js';
import { endpointPage } from './views/endpoint.js';
import { logoPulse } from './components/logo-pulse.js';
import { showAudioDebug } from './components/audio-debug.js';
import { splitHash } from './lib/hash.js';

const nav = document.getElementById('pages');
const main = document.getElementById('page');
const crumb = document.getElementById('crumb');

/** What is on screen: its page, the hash it was opened at, and its route hooks. */
let shown = null;

/** The sidebar links; hidden pages (the full-screen listening view) are left out. */
function buildNav() {
  nav.append(...PAGES.filter((p) => !p.hidden).map((p) =>
    el('a', { href: `#/${p.id}`, className: depthClass(p) }, p.title)));
}

/** Mark the current page's link and set the crumb and document title. */
function markCurrent(page) {
  for (const a of nav.querySelectorAll('a')) {
    const current = a.hash === `#/${page.id}`;
    a.classList.toggle('active', current);
    if (current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  crumb.textContent = [...ancestorsOf(page), page].map((p) => p.title).join(' / ');
  document.title = `${page.title} · Talasaman gögn`;
}

/**
 * What a view is told about its address: the hash, the hash of the page
 * shown before it (null on the first page of the visit), and hooks to follow
 * later changes to the address in place and to tidy up when left.
 */
function routeContext(hash, from) {
  const context = { hash, from, change: null, leave: null };
  context.onChange = (fn) => { context.change = fn; };
  context.onLeave = (fn) => { context.leave = fn; };
  return context;
}

/** Leave the shown page: stop its players and let it tidy up. */
function leaveShown() {
  main.querySelectorAll('audio').forEach((audio) => audio.pause());
  shown?.context.leave?.();
}

/** Show the page for the current URL hash, or let the shown page follow it. */
function route() {
  const page = pageForHash(location.hash);
  if (shown?.page === page && shown.context.change) {
    shown.context.change(location.hash);
    return;
  }
  leaveShown();
  const context = routeContext(location.hash, shown?.context.hash ?? null);
  shown = { page, context };
  markCurrent(page);
  closeSidebarIfNarrow();
  main.replaceChildren(page.view ? page.view(page, PAGES, context) : endpointPage(page));
  window.scrollTo(0, 0);
}

setupSidebar();
document.getElementById('brand-mark').replaceWith(logoPulse({ className: 'brand-mark' }));
setupThemeToggle();
setupStyleToggle(followStyle);
buildNav();
window.addEventListener('hashchange', route);
route();
if (splitHash(location.hash).query.has('debug')) showAudioDebug(); // e.g. #/listen?debug=1
