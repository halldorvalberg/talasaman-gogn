// Before/after view of the radio chain, so its effect can be seen as well as
// heard. Two canvases, each with the original (grey outline) under the radio
// sound (blue fill, in --highlight so it shows on both themes):
//   level    – a scrolling waveform of the last few seconds: compression lifts
//              the quiet parts, the limiter flattens peaks, the expander
//              pushes the gaps between words down
//   spectrum – loudness per frequency: the high-pass cut at 100 Hz, the
//              presence boost at 3.5 kHz, the de-esser above 5.5 kHz

import { el } from '../lib/dom.js';
import { clamp01 } from '../lib/math.js';
import { onTaps } from '../audio/radio.js';

const LEVEL_FLOOR_DB = -60;
const SPECTRUM = { minHz: 50, maxHz: 16000, minDb: -115, maxDb: -35 }; // fits these quiet, dull recordings
const MARKS = [
  { hz: 100, label: '100 Hz' },
  { hz: 1000, label: '1 kHz' },
  { hz: 3500, label: '3.5 kHz' },
  { hz: 5500, label: '5.5 kHz' },
  { hz: 10000, label: '10 kHz' },
];

/** Theme colours, read from CSS so both themes work. */
function palette(node) {
  const css = getComputedStyle(node);
  const get = (name) => css.getPropertyValue(name).trim();
  return { original: get('--ink-3'), radio: get('--highlight'), grid: get('--line'), text: get('--ink-3'), background: get('--bg') };
}

/** A canvas sized for the screen's pixel density; returns its 2D context. */
function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(width * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

/** Peak of the latest block of samples, as 0–1 on a dB scale. */
function peakLevel(analyser, buffer) {
  analyser.getFloatTimeDomainData(buffer);
  let peak = 0;
  for (const v of buffer) peak = Math.max(peak, Math.abs(v));
  return clamp01(1 - (20 * Math.log10(peak + 1e-9)) / LEVEL_FLOOR_DB);
}

/** A mirrored envelope (like a DAW waveform) from a history of 0–1 levels. */
function envelopePath(ctx, history, width, height) {
  const mid = height / 2;
  const step = width / (history.length - 1);
  ctx.beginPath();
  history.forEach((v, i) => ctx.lineTo(i * step, mid - v * mid));
  for (let i = history.length - 1; i >= 0; i--) ctx.lineTo(i * step, mid + history[i] * mid);
  ctx.closePath();
}

/** The level history: the radio sound filled, the original outlined over it. */
function drawLevels(canvas, history, colours) {
  const { ctx, width, height } = fitCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colours.grid;
  ctx.fillRect(0, height / 2, width, 1);
  envelopePath(ctx, history.output, width, height);
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = colours.radio;
  ctx.fill();
  ctx.globalAlpha = 1;
  envelopePath(ctx, history.input, width, height);
  ctx.strokeStyle = colours.original;
  ctx.lineWidth = 1.25;
  ctx.stroke();
}

/** x position (0–1) of a frequency on the log axis. */
const freqX = (hz) => Math.log(hz / SPECTRUM.minHz) / Math.log(SPECTRUM.maxHz / SPECTRUM.minHz);

/** Trace one spectrum (dB per FFT bin) on the log frequency axis. */
function spectrumPath(ctx, data, sampleRate, width, height) {
  const binHz = sampleRate / 2 / data.length;
  ctx.beginPath();
  for (let i = 1; i < data.length; i++) {
    const hz = i * binHz;
    if (hz < SPECTRUM.minHz || hz > SPECTRUM.maxHz) continue;
    const y = 1 - clamp01((data[i] - SPECTRUM.minDb) / (SPECTRUM.maxDb - SPECTRUM.minDb));
    ctx.lineTo(freqX(hz) * width, y * height);
  }
}

const LABEL_BAND = 17; // px at the bottom of the spectrum kept for the frequency labels

/** Faint vertical lines at the marked frequencies. */
function drawFrequencyLines(ctx, width, height, colours) {
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = colours.text;
  for (const { hz } of MARKS) ctx.fillRect(freqX(hz) * width, 0, 1, height - LABEL_BAND);
  ctx.globalAlpha = 1;
}

/** The frequency labels, drawn last on a patch of background so they stay readable (7:1). */
function drawFrequencyLabels(ctx, width, height, colours) {
  ctx.font = '13px system-ui, sans-serif';
  for (const { hz, label } of MARKS) {
    const x = Math.min(freqX(hz) * width + 4, width - 54);
    ctx.fillStyle = colours.background;
    ctx.fillRect(x - 2, height - LABEL_BAND + 1, ctx.measureText(label).width + 4, LABEL_BAND - 1);
    ctx.fillStyle = colours.text;
    ctx.fillText(label, x, height - 3);
  }
}

/** Both spectra: the radio sound as a shaded curve, the original as a line over it. */
function drawSpectrum(canvas, taps, buffers, sampleRate, colours) {
  const { ctx, width, height } = fitCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  drawFrequencyLines(ctx, width, height, colours);
  taps.output.getFloatFrequencyData(buffers.output);
  taps.input.getFloatFrequencyData(buffers.input);
  ctx.lineWidth = 2;
  spectrumPath(ctx, buffers.output, sampleRate, width, height);
  ctx.strokeStyle = colours.radio;
  ctx.stroke();
  ctx.lineTo(width, height); // close down to the axis and shade the area under the radio curve
  ctx.lineTo(0, height);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = colours.radio;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.25;
  spectrumPath(ctx, buffers.input, sampleRate, width, height);
  ctx.strokeStyle = colours.original;
  ctx.stroke();
  drawFrequencyLabels(ctx, width, height, colours);
}

/** Run the drawing loop for as long as the canvases are on the page. */
function animate(levelCanvas, spectrumCanvas, { ctx, taps }) {
  const timeBuffer = new Float32Array(taps.input.fftSize);
  const freq = { input: new Float32Array(taps.input.frequencyBinCount), output: new Float32Array(taps.output.frequencyBinCount) };
  const history = { input: [], output: [] };
  let colours = palette(levelCanvas);
  let frame = 0;

  const tick = () => {
    if (!levelCanvas.isConnected) return; // left the page
    const points = Math.max(2, Math.round(levelCanvas.clientWidth / 2));
    for (const side of ['input', 'output']) {
      history[side].push(peakLevel(taps[side], timeBuffer));
      if (history[side].length > points) history[side].splice(0, history[side].length - points);
    }
    if (frame++ % 30 === 0) colours = palette(levelCanvas); // follow theme changes
    if (history.input.length > 1) drawLevels(levelCanvas, history, colours);
    drawSpectrum(spectrumCanvas, taps, freq, ctx.sampleRate, colours);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** The before/after visualiser: a legend and two canvases that start once audio plays. */
export function radioVisualizer() {
  const level = el('canvas', { className: 'viz-canvas viz-level', role: 'img', ariaLabel: 'Level over time: original and radio sound' });
  const spectrum = el('canvas', { className: 'viz-canvas viz-spectrum', role: 'img', ariaLabel: 'Frequency spectrum: original and radio sound' });
  const waiting = el('p', { className: 'viz-waiting' }, 'Play a recording to see the sound here.');
  onTaps((engine) => {
    waiting.remove();
    animate(level, spectrum, engine);
  });

  return el('div', { className: 'radio-viz' },
    el('div', { className: 'legend' },
      el('span', {}, el('span', { className: 'swatch key-original', ariaHidden: 'true' }), 'Original'),
      el('span', {}, el('span', { className: 'swatch key-radio', ariaHidden: 'true' }), 'Radio sound')),
    el('figure', {}, el('figcaption', {}, 'Level over the last seconds'), level),
    el('figure', {}, el('figcaption', {}, 'Spectrum'), spectrum),
    waiting);
}
