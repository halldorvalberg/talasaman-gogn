// A recording drawn as a row of thick, rounded bars standing on a shared
// middle line, in the style of a Spotify code. Each bar is the loudness
// (RMS, in dB) of one slice of the audio, or one number from any array you
// give it. Bars up to the playback position take the accent colour, so it can
// follow an <audio> element (or anything that calls setProgress).

import { svgEl } from '../lib/dom.js';
import { followPlayback } from '../lib/playback.js';
import { clamp01 } from '../lib/math.js';

const DECODE_RATE = 8000; // Hz; plenty to measure loudness, and quick to decode
const PITCH = 2;          // design units from one bar to the next
const BAR_WIDTH = 1;      // design units; the gap between bars is the same
const HEIGHT = 14;        // design units, the tallest bar including its round ends
const DB_RANGE = 20;      // dB from the shortest bar to the tallest

/** An audio URL, its bytes or an already decoded AudioBuffer, as an AudioBuffer. */
export async function decodeAudio(source) {
  if (source instanceof AudioBuffer) return source;
  let bytes = source;
  if (typeof source === 'string') {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
    bytes = await res.arrayBuffer();
  }
  return new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(bytes);
}

/** The sample channels of an AudioBuffer. */
export const channelsOf = (buffer) =>
  Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/**
 * Loudness of `count` equal slices of the audio: the RMS over all channels.
 * @param {Float32Array[]} channels samples, -1–1
 * @returns {number[]} one value per slice, not normalised
 */
export function barLevels(channels, count) {
  const length = channels[0].length;
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * length) / count), end = Math.floor(((i + 1) * length) / count);
    let sum = 0;
    for (const samples of channels) {
      for (let s = start; s < end; s++) sum += samples[s] ** 2;
    }
    return Math.sqrt(sum / Math.max(1, (end - start) * channels.length));
  });
}

/**
 * RMS levels as decibels above a floor DB_RANGE below the loudest slice
 * (anything quieter is 0). Speech has a few loud peaks; on a plain linear
 * scale every other bar would look alike.
 */
export function loudness(levels) {
  const db = levels.map((v) => 20 * Math.log10(v + 1e-9));
  const floor = Math.max(...db) - DB_RANGE;
  return db.map((v) => Math.max(0, v - floor));
}

/**
 * Scale values so the largest is 1, then round them to `steps` heights (as a
 * Spotify code has eight); steps = 0 keeps every height.
 * @returns {number[]} 0–1
 */
export function normalise(values, steps) {
  const max = Math.max(...values, 0);
  return values.map((v) => {
    const level = max > 0 ? Math.max(0, v) / max : 0;
    return steps > 1 ? Math.round(level * (steps - 1)) / (steps - 1) : level;
  });
}

/** One bar: a round-capped line centred on y = 0; level 0 leaves just a dot. */
function barLine(level, i) {
  const half = (level * (HEIGHT - BAR_WIDTH)) / 2;
  const x = i * PITCH + PITCH / 2;
  return svgEl('line', { class: 'bar', x1: x, x2: x, y1: -half, y2: half, 'stroke-width': BAR_WIDTH });
}

/**
 * @param {object} [options]
 * @param {number} [options.bars] how many bars to cut a recording into
 * @param {number} [options.steps] how many bar heights to round to (0 = any height)
 * @param {string} [options.label] accessible name
 * @returns the bars' `element` (an <svg>) and its controls (see below)
 */
export function createWaveformBars({ bars = 48, steps = 8, label = 'Waveform of the recording' } = {}) {
  const svg = svgEl('svg', { class: 'waveform-bars', role: 'img', 'aria-label': label });
  let lines = [];
  let lit = 0; // how many bars have the accent colour

  /** Draw one bar per value (any non-negative numbers; scaled to fit). */
  function setValues(values) {
    lines = normalise(values, steps).map(barLine);
    lit = 0;
    svg.setAttribute('viewBox', `0 ${-HEIGHT / 2} ${lines.length * PITCH} ${HEIGHT}`);
    svg.replaceChildren(...lines);
  }

  /** Colour the bars up to a fraction (0–1) of the way through. */
  function setProgress(fraction) {
    const next = Math.ceil(clamp01(fraction) * lines.length);
    if (next === lit) return;
    lines.forEach((line, i) => line.classList.toggle('played', i < next));
    lit = next;
  }

  /** Decode a recording (URL, bytes or AudioBuffer) and draw its loudness. */
  async function load(source) {
    const buffer = await decodeAudio(source);
    setValues(loudness(barLevels(channelsOf(buffer), bars)));
    return buffer;
  }

  /** Light the bars in step with an <audio> element; returns a function that stops. */
  const follow = (audio) => followPlayback(audio, (time, duration) => setProgress(duration ? time / duration : 0));

  setValues(new Array(bars).fill(0)); // a dotted line until there is something to show
  return { element: svg, setValues, setProgress, load, follow };
}
