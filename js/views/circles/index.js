// The Circles page: members per postcode on a map, then event locations and
// their tables, then the raw rows.

import { el } from '../../lib/dom.js';
import { tableToggle } from '../../components/table.js';
import { renderPostcodeMap } from './postcode-map.js';
import { renderTablesMap } from './tables-map.js';

export async function renderCircles(rows) {
  const [postcodes, tables] = await Promise.all([renderPostcodeMap(rows), renderTablesMap()]);
  return el('div', {}, postcodes, tables, tableToggle(rows));
}
