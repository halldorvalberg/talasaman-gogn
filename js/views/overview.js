// The overview page: what this is, headline numbers from /stats, and an index
// of the dataset pages.

import { el } from '../lib/dom.js';
import { fetchEndpoint } from '../lib/data.js';
import { formatNumber } from '../lib/format.js';

const STAT_LABELS = {
  participants: 'Participants',
  circlesWithMembers: 'Circles with members',
  locations: 'Locations',
  places: 'Places',
  topicWords: 'Topic words',
};

/** The first sentence of a page intro, for the index. */
const firstSentence = (text) => text.split('. ')[0].replace(/\.$/, '') + '.';

/** Big-number tiles, filled in once /stats arrives (removed if it fails). */
function statTiles() {
  const tiles = el('div', { className: 'tiles' });
  fetchEndpoint('stats')
    .then(({ data }) => tiles.replaceChildren(...data.map((row) =>
      el('div', { className: 'tile' },
        el('span', { className: 'tile-value' }, formatNumber(row.value)),
        el('span', { className: 'tile-label' }, STAT_LABELS[row.metric] ?? row.metric)))))
    .catch(() => tiles.remove());
  return tiles;
}

function datasetIndex(pages) {
  return el('ul', { className: 'index' }, ...pages.filter((p) => p.intro).map((p) =>
    el('li', { className: p.parent ? 'sub' : '' },
      el('a', { href: `#/${p.id}` }, p.title),
      el('span', {}, firstSentence(p.intro)))));
}

export function overviewPage(pages) {
  return el('article', {},
    el('h1', {}, 'Talasaman gögn'),
    el('p', { className: 'lede' },
      'Open data from Samtal, a public conversation project across Iceland. Each page in the sidebar is one dataset from the ',
      el('a', { href: 'https://talasaman.is/gogn' }, 'open API'),
      '. Load it, look at it, collapse it.'),
    statTiles(),
    el('h2', {}, 'Datasets'),
    datasetIndex(pages),
  );
}
