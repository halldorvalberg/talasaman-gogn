// A data table for any endpoint's rows, with a filter under each column
// header where one makes sense (see table-filters.js), and the "Show table"
// fold-out the map views put under their visualisation.

import { el } from '../lib/dom.js';
import { formatNumber } from '../lib/format.js';
import { collapsible } from './collapsible.js';
import { filterKind, filterControl, rowPasses } from './table-filters.js';

const MIN_ROWS_FOR_FILTERS = 10;

/** Fill a table cell with a value: links for URLs, right-aligned numbers, '—' for empty. */
function fillCell(td, value) {
  if (value === null || value === undefined) {
    td.textContent = '—';
    td.className = 'empty';
  } else if (typeof value === 'string' && value.startsWith('https://')) {
    td.append(el('a', { href: value, target: '_blank', rel: 'noopener' }, 'link'));
  } else if (typeof value === 'number') {
    td.textContent = formatNumber(value);
    td.className = 'num';
  } else {
    td.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/** One <tr> per row, remembering which row it shows. */
function bodyRows(rows, columns) {
  return rows.map((row) => {
    const tr = el('tr');
    for (const col of columns) fillCell(tr.insertCell(), row[col]);
    return { row, tr };
  });
}

/** The header row of filters, wired to re-filter the body on every change. */
function filterRow(rows, columns, onFilter) {
  const filters = [];
  const cells = columns.map((column) => {
    const values = rows.map((r) => r[column]);
    const kind = filterKind(values);
    if (!kind) return el('th', { className: 'filter-cell' });
    const filter = { column, kind, query: '' };
    filters.push(filter);
    return el('th', { className: 'filter-cell' },
      filterControl(column, kind, values, (query) => { filter.query = query; onFilter(filters); }));
  });
  return { tr: el('tr', {}, ...cells), hasFilters: filters.length > 0 };
}

/** A scrollable table, one column per key of the first row, filterable when long. */
export function buildTable(rows) {
  if (!rows.length) return el('p', {}, 'No rows.');

  const columns = Object.keys(rows[0]);
  const lines = bodyRows(rows, columns);
  const status = el('p', { className: 'table-status', role: 'status' });
  const showCount = (shown) => {
    status.textContent = shown === rows.length ? `${formatNumber(rows.length)} rows` : `Showing ${formatNumber(shown)} of ${formatNumber(rows.length)} rows`;
  };

  function applyFilters(filters) {
    let shown = 0;
    for (const { row, tr } of lines) {
      tr.hidden = !rowPasses(row, filters);
      if (!tr.hidden) shown++;
    }
    showCount(shown);
  }

  const head = el('thead', {}, el('tr', {}, ...columns.map((col) => el('th', { scope: 'col' }, col))));
  if (rows.length >= MIN_ROWS_FOR_FILTERS) {
    const filters = filterRow(rows, columns, applyFilters);
    if (filters.hasFilters) head.append(filters.tr);
  }
  showCount(rows.length);

  const table = el('table', {}, head, el('tbody', {}, ...lines.map((l) => l.tr)));
  return el('div', { className: 'data-table' }, status, el('div', { className: 'table-wrap' }, table));
}

/** The rows as a table, folded away under "Show table". */
export const tableToggle = (rows) => collapsible('Show table', buildTable(rows), { className: 'table-toggle' });
