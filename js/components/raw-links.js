// The "JSON" and "CSV" links to an endpoint's raw data on talasaman.is.

import { el } from '../lib/dom.js';
import { API } from '../lib/data.js';

const rawLink = (href, label) => el('a', { className: 'raw', href, target: '_blank', rel: 'noopener' }, label);

/** Links to one endpoint (e.g. 'summaries') as JSON and as CSV. */
export const rawLinks = (endpoint) => [
  rawLink(`${API}/${endpoint}`, 'JSON'),
  rawLink(`${API}/${endpoint}?format=csv`, 'CSV'),
];
