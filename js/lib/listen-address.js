// The address of the listening view, read and written in one place so the
// route (views/listen.js) and the link builder (views/link-builder.js) can
// never disagree. Pure: no DOM.
//
//   #/listen/7?t=1:30&topic=…&location=…&preset=clear&mood=calm&loop=0
//
// Every part is optional. Anything missing or not understood reads as null,
// which means "the default": the first recording, from the start, all
// recordings, the current Radio sound setting, the aggressive chorus, looping.

import { splitHash } from './hash.js';
import { formatClock } from './format.js';
import { PRESETS } from '../audio/presets.js';

/** The route's page id (the path before the recording number). */
export const LISTEN_ID = 'listen';

/** Radio sound settings an address can ask for; 'off' switches it off. */
export const PRESET_CHOICES = [...Object.keys(PRESETS), 'off'];

/** Which chorus the image moves as. */
export const MOODS = ['calm', 'aggressive'];
export const DEFAULT_MOOD = 'aggressive';

/** The parts in the order they are written. */
const TEXT_PARTS = ['topic', 'location', 'preset', 'mood'];

/**
 * @typedef {object} ListenOptions every field null when not given
 * @property {number|null} recording 1-based, in the Audio page's order
 * @property {number|null} t where to start in it, whole seconds
 * @property {string|null} topic only recordings on this topic
 * @property {string|null} location only recordings from this location
 * @property {string|null} preset one of PRESET_CHOICES
 * @property {string|null} mood one of MOODS
 * @property {boolean|null} loop false: stop after the last recording
 */

/** Options with nothing set: the whole listening view with its defaults. */
export const NO_OPTIONS = Object.freeze({
  recording: null, t: null, topic: null, location: null, preset: null, mood: null, loop: null,
});

/** '7' → 7; anything but a whole number of 1 or more → null. */
function positiveInt(text) {
  return /^\d+$/.test(text ?? '') && +text >= 1 ? +text : null;
}

/** The value if it is one of `choices` (any letter case), else null. */
function oneOf(text, choices) {
  const lower = text?.trim().toLowerCase();
  return choices.includes(lower) ? lower : null;
}

/** Trimmed text, or null when empty or missing. */
const textOrNull = (text) => text?.trim() || null;

/** '0' / 'false' / 'no' / 'off' → false; '1' / 'true' / 'yes' / 'on' → true; else null. */
function parseLoop(text) {
  const lower = text?.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(lower)) return false;
  if (['1', 'true', 'yes', 'on'].includes(lower)) return true;
  return null;
}

/**
 * A time as typed: '1:30' or '90' → 90, '1:02:03' → 3723 (whole seconds).
 * Returns null for anything else, e.g. '1:75', '-5' or ''.
 */
export function parseTime(text) {
  const value = String(text ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(value)) return Math.floor(+value);
  if (!/^\d+(:[0-5]?\d){1,2}$/.test(value)) return null;
  return value.split(':').reduce((total, part) => total * 60 + +part, 0);
}

/** 90 → '1:30', as written in the address. */
export const formatTime = (seconds) => formatClock(seconds);

/** Read the options from a hash like '#/listen/7?t=1:30&mood=calm'. */
export function parseListenHash(hash) {
  const { path, query } = splitHash(hash);
  return {
    recording: positiveInt(path.split('/')[1]),
    t: parseTime(query.get('t')),
    topic: textOrNull(query.get('topic')),
    location: textOrNull(query.get('location')),
    preset: oneOf(query.get('preset'), PRESET_CHOICES),
    mood: oneOf(query.get('mood'), MOODS),
    loop: parseLoop(query.get('loop')),
  };
}

/** UTF-8 bytes of one non-ASCII letter, percent-encoded: '%C3%B3' (ó). */
const ENCODED_LETTER = /%[C-F][0-9A-F](%[89AB][0-9A-F])+/gi;

/**
 * A value made safe for the address, keeping Icelandic letters readable
 * ('Menntaskólinn%20við%20Sund'): browsers accept them as they are.
 */
const encodePart = (value) => encodeURIComponent(value).replace(ENCODED_LETTER, decodeURIComponent);

/** Write options as a hash; null fields are left out. Inverse of parseListenHash. */
export function buildListenHash(options) {
  const { recording, t, loop } = { ...NO_OPTIONS, ...options };
  const params = [];
  if (t !== null) params.push(`t=${formatTime(t)}`);
  for (const part of TEXT_PARTS) {
    if (options[part]) params.push(`${part}=${encodePart(options[part])}`);
  }
  if (loop !== null) params.push(`loop=${loop ? 1 : 0}`);
  const path = recording ? `#/${LISTEN_ID}/${recording}` : `#/${LISTEN_ID}`;
  return params.length ? `${path}?${params.join('&')}` : path;
}

/** Compare two names the way a person would: same letters, any case. */
const sameText = (a, b) =>
  String(a).normalize('NFC').toLocaleLowerCase('is') === String(b).normalize('NFC').toLocaleLowerCase('is');

/** Does `row` match every filter in `filters` ([column, value] pairs)? */
const matchesAll = (row, filters) => filters.every(([column, value]) => sameText(row[column], value));

/**
 * The recordings an address plays, and which of them to start with.
 * Filters naming a topic or location no recording has are ignored, and if
 * the filters together leave nothing, every recording plays. The recording
 * number counts in `rows` (the Audio page's order); if that one is filtered
 * out, the next one that isn't starts (the last, past the end).
 * @param {object[]} rows every recording, in the Audio page's order
 * @param {ListenOptions} options
 * @returns {{ entries: { row: object, number: number }[], start: number }} start indexes entries
 */
export function listenPlaylist(rows, { recording, topic, location }) {
  const numbered = rows.map((row, i) => ({ row, number: i + 1 }));
  const filters = [['topic', topic], ['location', location]]
    .filter(([column, value]) => value && rows.some((row) => sameText(row[column], value)));
  const passing = numbered.filter(({ row }) => matchesAll(row, filters));
  const entries = passing.length ? passing : numbered;
  const after = entries.findIndex(({ number }) => number >= (recording ?? 1));
  return { entries, start: after === -1 ? Math.max(entries.length - 1, 0) : after };
}
