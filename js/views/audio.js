// Summaries › Audio: the recorded table discussions, one card per recording
// with the facilitator's written summary. Filter by topic and location, or
// search the summaries. An optional "radio sound" chain cleans up the voices.
// The Listening view link opens #/listen with the chosen topic and location.

import { icon } from '../components/icons.js';
import { el } from '../lib/dom.js';
import { fetchRecordings } from '../lib/recordings.js';
import { buildListenHash } from '../lib/listen-address.js';
import { plural, tableAt } from '../lib/format.js';
import { filterControl, rowPasses } from '../components/table-filters.js';
import { audioPlayer } from '../components/audio-player.js';
import { radioControls } from '../components/radio-controls.js';
import { playAllButton } from '../components/play-all.js';
import { rawLinks } from '../components/raw-links.js';
import { subpageLinks } from '../components/subpage-links.js';

/** '1 recording' / '21 recordings' */
const recordings = (n) => plural(n, 'recording', 'recordings');

const FILTERS = [
  { column: 'topic', kind: 'select', label: 'Topic' },
  { column: 'location', kind: 'select', label: 'Location' },
  { column: 'summary', kind: 'search', label: 'Search summaries' },
];

/** One recording: what the table talked about, where, the clip and the summary. */
function clipCard(row) {
  const where = tableAt(row);
  return el('article', { className: 'clip' },
    el('h2', { className: 'clip-topic' }, row.topic),
    el('p', { className: 'clip-where' }, where),
    audioPlayer(row.audio, `Recording: ${row.topic}, ${where}`),
    el('p', { className: 'clip-summary' }, row.summary));
}

/** The filter bar; calls onChange with the active filters after every change. */
function filterBar(rows, onChange) {
  const filters = FILTERS.map((f) => ({ ...f, query: '' }));
  const fields = filters.map((f) => {
    const control = filterControl(f.label, f.kind, rows.map((r) => r[f.column]), (query) => {
      f.query = query;
      onChange(filters);
    });
    return el('label', { className: 'filter-field' }, el('span', {}, f.label), control);
  });
  return el('div', { className: 'filter-bar' }, ...fields);
}

/** Hide the cards whose row fails a filter; returns how many are still shown. */
function showPassing(cards, filters) {
  let shown = 0;
  for (const { row, card } of cards) {
    card.hidden = !rowPasses(row, filters);
    if (!card.hidden) shown++;
  }
  return shown;
}

/** The value a filter is set to ('' if none), by column. */
const queryOf = (filters, column) => filters.find((f) => f.column === column).query;

/** Cards for every clip, with filters and a live count, once the data arrives. */
async function fillClips(container, onFilter) {
  const rows = await fetchRecordings();
  const cards = rows.map((row) => ({ row, card: clipCard(row) }));
  const status = el('p', { className: 'table-status', role: 'status' }, recordings(rows.length));

  const bar = filterBar(rows, (filters) => {
    const shown = showPassing(cards, filters);
    status.textContent = shown === rows.length ? recordings(rows.length) : `Showing ${shown} of ${recordings(rows.length)}`;
    onFilter(filters);
  });

  container.replaceChildren(bar, status, el('div', { className: 'clips' }, ...cards.map((c) => c.card)));
}

/**
 * The "Listening view" link to #/listen, and a function that points it at
 * the recordings the topic and location filters leave.
 */
function listeningViewLink() {
  const link = el('a', { className: 'radio-play-all', href: buildListenHash({}) }, icon('expand'), 'Listening view');
  link.title = 'Full screen: the talasaman.is image moves with the voice while the recordings play in turn';
  const follow = (filters) => {
    link.href = buildListenHash({ topic: queryOf(filters, 'topic') || null, location: queryOf(filters, 'location') || null });
  };
  return { link, follow };
}

/** The Audio page: raw links, the Radio sound panel, then the recordings. */
export function audioPage(page) {
  const clips = el('div', { className: 'clips-area' }, el('p', { className: 'table-status' }, 'Loading recordings…'));
  const listening = listeningViewLink();
  fillClips(clips, listening.follow).catch((err) =>
    clips.replaceChildren(el('p', { className: 'error', role: 'alert' }, err.message)));
  const visiblePlayers = () => [...clips.querySelectorAll('.clip:not([hidden]) audio')];

  return el('article', {},
    el('h1', {}, page.title),
    el('p', { className: 'lede' }, page.intro),
    ...subpageLinks(page),
    el('div', { className: 'actions' }, ...rawLinks('summaries')),
    radioControls({ extra: [playAllButton(visiblePlayers, clips), listening.link] }),
    clips);
}
