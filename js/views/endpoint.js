// A dataset page: title, intro, the endpoint button and raw-data links. The
// button loads the endpoint into a collapsible result section below. A page
// can add extra views of the same data (`extras` in pages.js), each with its
// own button that shows its view in the same section.

import { el } from '../lib/dom.js';
import { fetchEndpoint } from '../lib/data.js';
import { formatNumber, formatTime } from '../lib/format.js';
import { buildTable } from '../components/table.js';
import { collapsible } from '../components/collapsible.js';
import { rawLinks } from '../components/raw-links.js';
import { subpageLinks } from '../components/subpage-links.js';

/** The result section under the button, created on first load. */
function resultSection(results) {
  let section = results.querySelector('details');
  if (!section) {
    section = collapsible('', el('div', { className: 'body' }));
    results.append(section);
  }
  return { section, summary: section.querySelector('summary'), body: section.querySelector('.body') };
}

/**
 * Fetch the page's endpoint and show it with `render` (by default the page's
 * visualisation, or a table).
 */
async function load(page, button, results, render = page.render ?? buildTable) {
  button.disabled = true;
  const { section, summary, body } = resultSection(results);
  summary.textContent = 'Loading…';
  section.open = true;
  try {
    const { data, meta } = await fetchEndpoint(page.id);
    body.replaceChildren(await render(data));
    summary.textContent = `${formatNumber(meta.count)} rows · ${formatTime(meta.generatedAt)}`;
  } catch (err) {
    summary.textContent = 'Failed to load';
    body.replaceChildren(el('p', { className: 'error', role: 'alert' }, err.message));
  } finally {
    button.disabled = false;
  }
}

/** A button that loads the endpoint and shows it with `render`. */
function loadButton(page, results, [method, label], render) {
  const button = el('button', { className: 'endpoint' }, el('span', { className: 'method' }, method), label);
  button.addEventListener('click', () => load(page, button, results, render));
  return button;
}

/** A dataset page for one endpoint; its data loads when a button is pressed. */
export function endpointPage(page) {
  const results = el('div', { className: 'results' });
  const button = loadButton(page, results, ['GET', ` /api/v1/${page.id}`]);
  const extras = (page.extras ?? []).map(({ method, label, render }) => loadButton(page, results, [method, label], render));

  return el('article', {},
    el('h1', {}, page.title),
    el('p', { className: 'lede' }, page.intro),
    ...subpageLinks(page),
    el('div', { className: 'actions' },
      button,
      ...extras,
      ...rawLinks(page.id)),
    results,
  );
}
