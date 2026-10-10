// A count list as a table with a bar per row: name, a bar as long as its
// share of the largest count, and the number. A real <table>, so screen
// readers get the names and numbers; the bars are decoration.

import { el } from '../lib/dom.js';
import { formatNumber } from '../lib/format.js';

/**
 * @param {Array<{ name: string, count: number }>} items in the order to show
 * @param {{ caption: string, nameHeading: string, countHeading: string }} labels
 * @param {number} [max] the count a full bar stands for (default: the largest here),
 *   so several lists can share one scale
 */
export function countBars(items, { caption, nameHeading, countHeading }, max = Math.max(...items.map((i) => i.count))) {
  const row = ({ name, count }) => el('tr', {},
    el('th', { scope: 'row' }, name),
    el('td', { className: 'count-bar-cell', ariaHidden: 'true' },
      el('span', { className: 'count-bar', style: `--share: ${count / max}` })),
    el('td', { className: 'num' }, formatNumber(count)));
  return el('table', { className: 'count-bars' },
    el('caption', {}, caption),
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, nameHeading),
      el('th', { scope: 'col' }, el('span', { className: 'visually-hidden' }, 'Share')),
      el('th', { scope: 'col', className: 'num' }, countHeading))),
    el('tbody', {}, ...items.map(row)));
}
