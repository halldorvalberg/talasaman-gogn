// A small panel that shows how the audio engine is doing, for finding out
// why a visualiser stands still on some device: is the page secure, did the
// engine start, is the AudioContext running, does any sound reach the
// visualisers, and is reduced motion on. Shown when the address has
// ?debug=1 (e.g. #/listen?debug=1).

import { el } from '../lib/dom.js';
import { audioStatus } from '../audio/radio.js';
import { onLevel } from '../audio/level-meter.js';
import { reducedMotion } from '../lib/motion.js';

const REFRESH = 500; // ms between updates

/** The panel's lines for the current state; `level` is the visualisers' 0…1 input. */
function statusLines(level) {
  const s = audioStatus();
  return [
    ['Secure page (https)', s.secure],
    ['AudioWorklet supported', s.workletSupport],
    ['AudioContext', s.context],
    ['Engine', s.engine],
    ['Noise stages loaded', s.worklets],
    ['Level reaching visualisers', level === null ? 'nothing yet' : level.toFixed(2)],
    ['Reduced motion (keeps visualisers still)', reducedMotion.matches],
    ['Error', s.error ?? 'none'],
    ['Browser', navigator.userAgent],
  ];
}

/** Start showing the panel at the bottom of the page. */
export function showAudioDebug() {
  const list = el('dl', {});
  const panel = el('aside', { className: 'audio-debug', ariaLabel: 'Audio debug' }, el('h2', {}, 'Audio debug'), list);
  let level = null;
  onLevel((value) => { level = value; });
  const render = () => list.replaceChildren(...statusLines(level).flatMap(([name, value]) =>
    [el('dt', {}, name), el('dd', {}, String(value))]));
  render();
  setInterval(render, REFRESH);
  document.body.append(panel);
}
