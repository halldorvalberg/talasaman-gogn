// Summaries › Audio: the recorded table discussions, one card per recording
// with the facilitator's written summary. Filter by topic and location, or
// search the summaries. An optional "radio sound" chain cleans up the voices.

import { el } from '../lib/dom.js';
import { fetchEndpoint } from '../lib/data.js';
import { plural, tableAt } from '../lib/format.js';
import { filterControl, rowPasses } from '../components/table-filters.js';
import { audioPlayer } from '../components/audio-player.js';
import { radioControls } from '../components/radio-controls.js';
import { playAllButton } from '../components/play-all.js';
import { openListeningStage } from '../components/listening-stage.js';
import { rawLinks } from '../components/raw-links.js';

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

/** Cards for every clip, with filters and a live count, once the data arrives. Resolves with the rows. */
async function fillClips(container) {
  const { data } = await fetchEndpoint('summaries');
  const rows = data.filter((r) => r.audio);
  const cards = rows.map((row) => ({ row, card: clipCard(row) }));
  const status = el('p', { className: 'table-status', role: 'status' }, recordings(rows.length));

  const bar = filterBar(rows, (filters) => {
    const shown = showPassing(cards, filters);
    status.textContent = shown === rows.length ? recordings(rows.length) : `Showing ${shown} of ${recordings(rows.length)}`;
  });

  container.replaceChildren(bar, status, el('div', { className: 'clips' }, ...cards.map((c) => c.card)));
  return rows;
}

/** The "Listening view" button, usable once the recordings have loaded. */
function listeningViewButton(loaded) {
  const button = el('button', { className: 'radio-play-all', disabled: true }, '⤢ Listening view');
  button.title = 'Full screen: the talasaman.is image moves with the voice while every recording plays in turn';
  loaded.then((rows) => {
    button.disabled = false;
    button.addEventListener('click', () => openListeningStage(rows));
  }).catch(() => {}); // the error is already shown in place of the clips
  return button;
}

/** The Audio page: raw links, the Radio sound panel, then the recordings. */
export function audioPage(page) {
  const clips = el('div', { className: 'clips-area' }, el('p', { className: 'table-status' }, 'Loading recordings…'));
  const loaded = fillClips(clips);
  loaded.catch((err) =>
    clips.replaceChildren(el('p', { className: 'error', role: 'alert' }, err.message)));
  const visiblePlayers = () => [...clips.querySelectorAll('.clip:not([hidden]) audio')];

  return el('article', {},
    el('h1', {}, page.title),
    el('p', { className: 'lede' }, page.intro),
    el('div', { className: 'actions' }, ...rawLinks('summaries')),
    radioControls({ extra: [playAllButton(visiblePlayers, clips), listeningViewButton(loaded)] }),
    clips);
}
