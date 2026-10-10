// Column filters for data tables. Each column gets the filter that suits its
// values, decided from the data itself:
//   select   – a dropdown, for columns with a few repeated values (topic, location)
//   search   – a text box, for free text (summary, reason)
//   presence – with/without, for links that are often missing (audio)
//   null     – nothing, for ids, coordinates and large numbers

import { el } from '../lib/dom.js';

const MAX_OPTIONS = 40;      // more distinct values than this → search, not a dropdown
const MAX_NUMBER_OPTIONS = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const collator = new Intl.Collator('is', { numeric: true });

const isPresent = (v) => v !== null && v !== undefined;
const normalise = (text) => String(text).normalize('NFC').toLocaleLowerCase('is');

/** Which kind of filter suits a column, from all its values. */
export function filterKind(values) {
  const present = values.filter(isPresent);
  if (!present.length) return null;
  const distinct = new Set(present.map(String)).size;
  const sample = present[0];

  if (typeof sample === 'boolean') return 'select';
  if (typeof sample === 'number') return Number.isInteger(sample) && distinct <= MAX_NUMBER_OPTIONS ? 'select' : null;
  if (present.every((v) => UUID.test(v))) return null;
  if (present.every((v) => String(v).startsWith('https://'))) return present.length < values.length ? 'presence' : null;
  return distinct <= MAX_OPTIONS && distinct < values.length / 2 ? 'select' : 'search';
}

/** The dropdown choices for a select column, sorted the Icelandic way. */
export function optionsFor(values) {
  return [...new Set(values.filter(isPresent).map(String))].sort(collator.compare);
}

/** Does one value pass one filter? An empty filter passes everything. */
export function passes(value, { kind, query }) {
  if (!query) return true;
  if (kind === 'search') return isPresent(value) && normalise(value).includes(normalise(query));
  if (kind === 'presence') return (query === 'with') === isPresent(value);
  return String(value) === query;
}

/** Does a row pass every column filter? */
export const rowPasses = (row, filters) => filters.every((f) => passes(row[f.column], f));

/** Human label for a dropdown value (true/false read as Yes/No). */
const optionLabel = (value) => ({ true: 'Yes', false: 'No' })[value] ?? value;

/**
 * The input for one column's filter. Calls onChange(query) as the user types
 * or picks; '' means no filter.
 */
export function filterControl(column, kind, values, onChange) {
  const label = `Filter ${column}`;
  let control;
  if (kind === 'search') {
    control = el('input', { type: 'search', placeholder: 'Search…', ariaLabel: label, className: 'filter' });
  } else {
    const choices = kind === 'presence'
      ? [['with', 'With link'], ['without', 'Without']]
      : optionsFor(values).map((v) => [v, optionLabel(v)]);
    control = el('select', { ariaLabel: label, className: 'filter' },
      el('option', { value: '' }, 'All'),
      ...choices.map(([value, text]) => el('option', { value }, text)));
  }
  control.addEventListener('input', () => onChange(control.value.trim()));
  return control;
}
