// A dataset page: title, intro, the endpoint button and raw-data links. The
// button loads the endpoint into a collapsible result section below.

import { el } from '../lib/dom.js';
import { fetchEndpoint } from '../lib/data.js';
import { formatNumber, formatTime } from '../lib/format.js';
import { buildTable } from '../components/table.js';
import { collapsible } from '../components/collapsible.js';
import { rawLinks } from '../components/raw-links.js';
import { childrenOf } from '../pages.js';

/** The result section under the button, created on first load. */
function resultSection(results) {
  let section = results.querySelector('details');
  if (!section) {
    section = collapsible('', el('div', { className: 'body' }));
    results.append(section);
  }
  return { section, summary: section.querySelector('summary'), body: section.querySelector('.body') };
}

/** Fetch the page's endpoint and show it (as a visualisation or a table). */
async function load(page, button, results) {
  button.disabled = true;
  const { section, summary, body } = resultSection(results);
  summary.textContent = 'Loading…';
  section.open = true;
  try {
    const { data, meta } = await fetchEndpoint(page.id);
    body.replaceChildren(page.render ? await page.render(data) : buildTable(data));
    summary.textContent = `${formatNumber(meta.count)} rows · ${formatTime(meta.generatedAt)}`;
  } catch (err) {
    summary.textContent = 'Failed to load';
    body.replaceChildren(el('p', { className: 'error', role: 'alert' }, err.message));
  } finally {
    button.disabled = false;
  }
}

export function endpointPage(page) {
  const results = el('div', { className: 'results' });
  const button = el('button', { className: 'endpoint' },
    el('span', { className: 'method' }, 'GET'), ` /api/v1/${page.id}`);
  button.addEventListener('click', () => load(page, button, results));

  return el('article', {},
    el('h1', {}, page.title),
    el('p', { className: 'lede' }, page.intro),
    ...childrenOf(page).map((child) =>
      el('p', { className: 'subpage-link' }, el('a', { href: `#/${child.id}` }, `${child.title} →`))),
    el('div', { className: 'actions' },
      button,
      ...rawLinks(page.id)),
    results,
  );
}
