// A row of legend entries: a colour chip followed by its label.

import { el } from '../lib/dom.js';

/**
 * @param {{ swatch: string, label: string, mark?: string }[]} items
 *   swatch: class(es) that colour the chip; mark: optional text inside the chip
 */
export function legend(items) {
  return el('div', { className: 'legend' }, ...items.map(({ swatch, label, mark = '' }) =>
    el('span', {}, el('span', { className: `swatch ${swatch}`, ariaHidden: 'true' }, mark), label)));
}
