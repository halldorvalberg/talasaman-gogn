// The Components page: a playground of the site's reusable pieces, grouped
// (audio, the talasaman.is image, maps, data), each with a heading, a
// one-line note and a live demo on real data. One recording from /summaries
// plays from a player bar that stays at the top; every audio demo follows it.

import { el } from '../lib/dom.js';
import { fetchEndpoint, loadJsonOnce } from '../lib/data.js';
import { plural, people, recordingTitle, compareIcelandic } from '../lib/format.js';
import { recordingAudio } from '../components/audio-player.js';
import { playButton, audioPlayback, timeReadout } from '../components/player-controls.js';
import { createProgressLine } from '../components/progress-line.js';
import { createWaveformBars } from '../components/waveform-bars.js';
import { createLocationZoom } from '../components/location-zoom.js';
import { radioVisualizer } from '../components/radio-visualizer.js';
import { logoPulse } from '../components/logo-pulse.js';
import { heroChorus, heroSpectrum } from '../components/hero-visualisers.js';
import { buildTable } from '../components/table.js';

const FIRST_FLIGHT_DELAY = 700; // ms of all of Iceland before flying to the first venue
const DRIVEN_SECONDS = 10;      // length of the progress line that runs on its own clock

/** A titled demo whose body fills in once `fill` resolves with its content (or is given it). */
function demo(title, description, fill) {
  const body = el('div', { className: 'demo-body' }, el('p', { className: 'table-status' }, 'Loading…'));
  Promise.resolve()
    .then(fill)
    .then((content) => body.replaceChildren(...content))
    .catch((err) => body.replaceChildren(el('p', { className: 'error', role: 'alert' }, err.message)));
  return el('section', { className: 'demo' },
    el('h3', {}, title),
    el('p', { className: 'demo-note' }, description),
    body);
}

/** A group of demos under its own heading. */
const group = (title, ...demos) =>
  el('section', { className: 'playground-group' }, el('h2', {}, title), ...demos);

/**
 * The first recording, as the <audio> every audio demo shares. It joins the
 * radio chain, so the visualisers can hear it (and Radio sound applies).
 */
async function loadClip() {
  const { data } = await fetchEndpoint('summaries');
  const row = data.find((r) => r.audio);
  if (!row) throw new Error('No recordings available');
  const audio = recordingAudio({ src: row.audio, preload: 'metadata' });
  return { audio, caption: recordingTitle(row), rows: data };
}

/** The bar at the top: what is playing, play/pause, a progress line and the time. */
function playerBar(clip) {
  const bar = el('div', { className: 'playground-player', role: 'region', ariaLabel: 'Player' },
    el('p', { className: 'table-status' }, 'Loading a recording…'));
  clip.then(({ audio, caption }) => {
    const line = createProgressLine({ label: `Position in the recording: ${caption}` });
    line.connect(audio);
    bar.replaceChildren(
      el('p', { className: 'demo-caption' }, 'Now playing: ', caption),
      el('div', { className: 'demo-player' }, playButton(audioPlayback(audio)), line.element, timeReadout(audio).element),
      audio); // on the page, so leaving the page stops it
  }).catch((err) => bar.replaceChildren(el('p', { className: 'error', role: 'alert' }, err.message)));
  return bar;
}

/** A progress line on its own clock: no audio, just a length in seconds. */
function drivenLineDemo() {
  const line = createProgressLine({ duration: DRIVEN_SECONDS, label: `A ${DRIVEN_SECONDS}-second timer` });
  let running = false;
  let atEnd = 0;
  const button = playButton({
    isPaused: () => !running,
    toggle: () => {
      clearTimeout(atEnd);
      running = !running;
      if (!running) return line.pause();
      if (line.time >= DRIVEN_SECONDS) line.seek(0);
      line.play();
      // The clock stops by itself at the end; show Play again then.
      atEnd = setTimeout(() => { running = false; button.dispatchEvent(new Event('ended')); }, (DRIVEN_SECONDS - line.time) * 1000);
    },
    watch: (show) => queueMicrotask(() => button.addEventListener('ended', show)),
  });
  return [el('div', { className: 'demo-player' }, button, line.element)];
}

/** Waveform bars of the shared recording, lit in step with it. */
async function waveformDemo(clip) {
  const { audio, caption } = await clip;
  const bars = createWaveformBars({ bars: 64, label: `Loudness over time: ${caption}` });
  await bars.load(audio.src);
  bars.follow(audio);
  return [bars.element];
}

/** A meeting venue from data/tables.json, as a location for the zoom: what met there. */
const venueLocation = (venue) => ({
  name: venue.name,
  text: `${plural(venue.tables.length, 'table', 'tables')} · ${people(venue.members)}`,
  lat: venue.lat,
  lng: venue.lng,
});

/** A labelled <select> of venues; its values are indexes into `venues`. */
function venuePicker(venues, onPick) {
  const select = el('select', { className: 'filter' },
    ...venues.map((v, i) => el('option', { value: i }, `${v.name} — ${v.text}`)));
  select.addEventListener('change', () => onPick(venues[select.value]));
  return { select, field: el('label', { className: 'demo-field' }, el('span', {}, 'Meeting venue'), select) };
}

/** The venues on the map where tables met, as locations in Icelandic alphabetical order. */
function venuesOf(tables) {
  return tables.locations
    .filter((v) => v.lat != null && v.tables.length)
    .map(venueLocation)
    .sort((a, b) => compareIcelandic(a.name, b.name));
}

/** The location zoom with a venue picker, a random pick and a way back out. */
async function zoomDemo() {
  const [base, tables] = await Promise.all([loadJsonOnce('data/iceland.geojson'), loadJsonOnce('data/tables.json')]);
  const venues = venuesOf(tables);
  const lens = createLocationZoom(base);
  const { select, field } = venuePicker(venues, (venue) => lens.showLocation(venue));

  const pickRandom = () => {
    select.value = Math.floor(Math.random() * venues.length);
    lens.showLocation(venues[select.value]);
  };
  const random = el('button', { className: 'demo-button' }, 'Random venue');
  random.addEventListener('click', pickRandom);
  const all = el('button', { className: 'demo-button' }, 'All of Iceland');
  all.addEventListener('click', () => lens.showAll());

  setTimeout(pickRandom, FIRST_FLIGHT_DELAY);
  return [el('div', { className: 'demo-controls' }, field, random, all), lens.element];
}

/** The summaries as a filterable table (topic and location dropdowns, text search). */
async function tableDemo(clip) {
  const { rows } = await clip;
  return [buildTable(rows.map(({ topic, location, table, summary }) => ({ topic, location, table, summary })))];
}

const PLAY_FIRST = 'Press Play in the player above to see it move.';

function audioGroup(clip) {
  return group('Audio',
    demo('Progress line',
      'A thin line whose dot crosses a recording as it plays: the one in the player above follows the recording. ' +
      'Without a recording it runs on its own clock, like this 10-second one. Click, drag or use the arrow keys to jump.',
      drivenLineDemo),
    demo('Waveform bars',
      'The loudness of the recording as rounded bars, like a Spotify code. Bars turn blue as playback passes them.',
      () => waveformDemo(clip)),
    demo('Before and after',
      `The level and spectrum of the original against the cleaned-up "Radio sound" (set on the Audio page). ${PLAY_FIRST}`,
      () => [radioVisualizer()]));
}

function imageGroup() {
  return group('The talasaman.is image',
    demo('Pulsing logo',
      `The talasaman.is speech bubble swells with the voice and sends out a ring on each new sound. It is also in the sidebar title on every page. ${PLAY_FIRST}`,
      () => [el('div', { className: 'logo-stage' }, logoPulse({ className: 'logo-large' }))]),
    demo('Chorus, calm',
      `The front-page image, "Eitt samtal getur breytt öllu.": each of its eleven bubbles breathes gently with its own pitch range, low to high. ${PLAY_FIRST}`,
      () => [heroChorus({ mood: 'calm' })]),
    demo('Chorus, aggressive',
      `The same image, but every bubble jolts outward, tilts and swells hard with its pitch range. ${PLAY_FIRST}`,
      () => [heroChorus({ mood: 'aggressive' })]),
    demo('Taken apart',
      `The same image dissected into its eleven bubbles, side by side from low to high pitch, each moving with its range. ${PLAY_FIRST}`,
      () => [heroSpectrum()]));
}

const mapsGroup = () => group('Maps',
  demo('Location zoom',
    'A round lens that flies from all of Iceland into a venue where the tables met, and the pin wiggles as it lands. Pick another venue to hop over to it.',
    zoomDemo));

const dataGroup = (clip) => group('Data',
  demo('Table with filters',
    'Any endpoint\'s rows as a table: a dropdown for columns with few values, a text search for free text. Here, the summaries.',
    () => tableDemo(clip)));

export function componentsPage(page) {
  const clip = loadClip();
  return el('article', { className: 'playground' },
    el('h1', {}, page.title),
    el('p', { className: 'lede' }, page.intro),
    playerBar(clip),
    audioGroup(clip),
    imageGroup(),
    mapsGroup(),
    dataGroup(clip));
}
