// Places that couldn't go on the map, listed under it with the reason why.

import { el } from '../../lib/dom.js';
import { contains } from '../../lib/geo.js';
import { formatCoord } from '../../lib/format.js';
import { collapsible } from '../../components/collapsible.js';

// Roughly Iceland and its waters: a point in here that missed the map has bad
// coordinates rather than being abroad.
const ICELAND_WATERS = { west: -26, east: -12, south: 62, north: 67.5 };

const whyMissing = (row) => (contains(ICELAND_WATERS, row) ? 'Coordinates in the sea' : 'Outside Iceland');

function offMapRow(row) {
  return collapsible([
    el('span', { className: 'offmap-name' }, row.place),
    el('span', { className: 'offmap-coord' }, formatCoord(row)),
    el('span', { className: 'offmap-why' }, whyMissing(row)),
  ], el('p', {}, row.reason || '—'));
}

export function offMapList(rows) {
  return el('section', { className: 'offmap-section' },
    el('h2', {}, `Not on the map · ${rows.length}`),
    el('div', { className: 'offmap-list' }, ...rows.map(offMapRow)));
}
