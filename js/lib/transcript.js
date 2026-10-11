// Word timings for the recorded summaries: when each word of a summary is
// spoken on its recording. They are computed offline by forced alignment
// (scripts/align-transcripts.py) into data/transcript-timing.json, keyed by
// summary id; the text itself always comes from the API. Pure functions,
// apart from the loader.

import { loadJsonOnce } from './data.js';

const TIMING_FILE = 'data/transcript-timing.json';

/** A summary's words as shown, split on whitespace (the script splits the same way). */
export const wordsOf = (text) => text.trim().split(/\s+/).filter(Boolean);

/** FNV-1a 32 (hex) of the words joined by spaces, as UTF-8: the script's text_hash. */
export function textHash(words) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(words.join(' '))) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The [start, end] seconds of each word, if `timing` was made for exactly
 * these words; null otherwise (no timing, a changed summary, or a count that
 * doesn't match), so the text is then shown plain.
 * @param {string[]} words
 * @param {{ words: number[][], text_hash: string }|null|undefined} timing
 */
export function timesFor(words, timing) {
  if (!timing || timing.words?.length !== words.length) return null;
  return timing.text_hash === textHash(words) ? timing.words : null;
}

/**
 * Index of the word being spoken at `time` seconds: the last one started by
 * then, so a pause keeps the word before it lit. -1 before the first word.
 * @param {number[][]} times [start, end] per word, in order
 */
export function wordAt(times, time) {
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid][0] <= time) { found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found;
}

/**
 * The timings of every recording, by summary id. Shared by every caller; a
 * missing or broken file gives none (the text then shows without highlighting).
 * @returns {Promise<Record<string, { words: number[][], text_hash: string }>>}
 */
export const loadTranscriptTimings = () =>
  loadJsonOnce(TIMING_FILE).then((file) => file.recordings ?? {}, () => ({}));
