// "Audio →" links from a page to its subpages, shown under its intro.

import { el } from '../lib/dom.js';
import { childrenOf } from '../pages.js';

/** One "Title →" paragraph per subpage of `page` (none if it has none). */
export const subpageLinks = (page) => childrenOf(page).map((child) =>
  el('p', { className: 'subpage-link' }, el('a', { href: `#/${child.id}` }, `${child.title} →`)));
