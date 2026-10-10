// How loud the sound coming out of the radio chain is right now, for
// anything that wants to move with it (e.g. the pulsing logo). One shared
// animation loop reads the output analyser once a frame and tells every
// subscriber the smoothed level (0 = quiet, 1 = loud) and whether a new
// sound just started (an onset: the level jumped well above its recent average).
// onBands() does the same per frequency band, for visualisers with many parts.

import { clamp01 } from '../lib/math.js';
import { onTaps } from './radio.js';

const FLOOR_DB = -50; // at or below this the level is 0
const CEIL_DB = -10;  // at or above this it is 1
const ATTACK = 0.5;   // share of the way to a louder level covered each frame
const RELEASE = 0.12; // …and to a quieter one
const ONSET_JUMP = 0.18; // level above its slow average that counts as an onset
const ONSET_GAP = 140;   // ms, at least this long between onsets

const subscribers = new Set();
const bandFollowers = new Set();
let analyser = null;
let samples = null;
let spectrum = null; // dB per FFT bin, read once a frame when bands are wanted
let level = 0, average = 0, lastOnset = 0;
let running = false;

/** RMS of the analyser's latest block, mapped from dB to 0…1. */
function readLevel() {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const s of samples) sum += s * s;
  const db = 10 * Math.log10(sum / samples.length + 1e-12);
  return clamp01((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB));
}

function frame(now) {
  const target = readLevel();
  level += (target - level) * (target > level ? ATTACK : RELEASE);
  average += (level - average) * 0.05;
  const onset = level - average > ONSET_JUMP && now - lastOnset > ONSET_GAP;
  if (onset) lastOnset = now;
  subscribers.forEach((fn) => fn(level, onset));
  if (bandFollowers.size) {
    analyser.getFloatFrequencyData(spectrum);
    bandFollowers.forEach((follow) => follow());
  }
  requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  onTaps(({ taps }) => {
    analyser = taps.output;
    samples = new Float32Array(analyser.fftSize);
    spectrum = new Float32Array(analyser.frequencyBinCount);
    requestAnimationFrame(frame);
  });
}

/**
 * Call `callback(level, onset)` every animation frame once audio has played.
 * @returns {() => void} unsubscribe
 */
export function onLevel(callback) {
  subscribers.add(callback);
  start();
  return () => subscribers.delete(callback);
}

/** Power (dB) between two frequencies in the latest spectrum. */
function bandDb(lo, hi) {
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  let sum = 0;
  for (let k = Math.max(1, Math.floor(lo / binHz)); k <= Math.ceil(hi / binHz); k++) sum += 10 ** (spectrum[k] / 10);
  return 10 * Math.log10(sum + 1e-20);
}

/**
 * Bands spaced evenly in pitch (log scale) between two frequencies.
 * @returns {Array<[number, number]>} [low, high] Hz per band
 */
export function logBands(count, from = 160, to = 7000) {
  const edge = (i) => from * (to / from) ** (i / count);
  return Array.from({ length: count }, (_, i) => [edge(i), edge(i + 1)]);
}

const BAND_RANGE = 30;  // dB below a band's recent peak that counts as 0
const PEAK_FALL = 0.05; // dB per frame a band's remembered peak sinks (about 3 dB a second)

/**
 * Call `callback(values)` every frame with one 0…1 level per band. Each band
 * is scaled to its own recent peak, so the quieter high bands move as much
 * as the loud low ones.
 * @param {Array<[number, number]>} bands e.g. logBands(11)
 * @returns {() => void} unsubscribe
 */
export function onBands(bands, callback) {
  const peaks = bands.map(() => -100);
  const values = bands.map(() => 0);
  const follow = () => {
    bands.forEach(([lo, hi], i) => {
      const db = bandDb(lo, hi);
      peaks[i] = Math.max(db, peaks[i] - PEAK_FALL);
      const target = clamp01(1 - (peaks[i] - db) / BAND_RANGE);
      values[i] += (target - values[i]) * (target > values[i] ? ATTACK : RELEASE);
    });
    callback(values);
  };
  bandFollowers.add(follow);
  start();
  return () => bandFollowers.delete(follow);
}
