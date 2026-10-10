// Small controls shared by the players: a Play/Pause button that keeps in
// step with whatever it plays, and an "0:12 / 3:45" time readout. Used by
// the Components page's player, the listening view and "Play all".

import { el } from '../lib/dom.js';
import { formatClock } from '../lib/format.js';
import { followPlayback } from '../lib/playback.js';

/** What a play button shows: an icon, a word (none for an icon-only button) and an accessible name. */
const PLAY_PAUSE = (paused) => (paused
  ? { icon: '▶', text: 'Play', label: 'Play' }
  : { icon: '❚❚', text: 'Pause', label: 'Pause' });

/** The same, with the icon alone (the name is still read out). */
export const PLAY_PAUSE_ICON = (paused) => ({ ...PLAY_PAUSE(paused), text: '' });

/** "0:12 / 3:45", or "0:12 / –:––" while the length is unknown. */
export const clockText = (time, duration) =>
  `${formatClock(time)} / ${duration ? formatClock(duration) : '–:––'}`;

/** The play state of an <audio> element, in the shape playButton takes. */
export const audioPlayback = (audio) => ({
  isPaused: () => audio.paused,
  toggle: () => (audio.paused ? audio.play() : audio.pause()),
  watch: (show) => ['play', 'pause', 'ended'].forEach((type) => audio.addEventListener(type, show)),
});

/** Fill a button with what `look` gives for the current state. */
function showLook(button, { icon, text, label }) {
  const iconSpan = el('span', { className: 'play-icon', ariaHidden: 'true' }, icon);
  if (text) button.replaceChildren(iconSpan, ' ', text); // the space only shows outside flex layouts
  else button.replaceChildren(icon);
  button.ariaLabel = label;
  if (!text) button.title = label;
}

/**
 * A button that plays and pauses something, kept in step with it.
 * @param {object} playback
 * @param {() => boolean} playback.isPaused
 * @param {() => void} playback.toggle play if paused, else pause
 * @param {(show: () => void) => void} playback.watch call show whenever the state changes by itself
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {(paused: boolean) => { icon: string, text: string, label: string }} [options.look]
 */
export function playButton({ isPaused, toggle, watch }, { className = 'demo-button play-button', look = PLAY_PAUSE } = {}) {
  const button = el('button', { className });
  const show = () => showLook(button, look(isPaused()));
  button.addEventListener('click', () => { toggle(); show(); });
  watch(show);
  show();
  return button;
}

/**
 * A time readout following an <audio> element.
 * @returns {{ element: HTMLElement, stop: () => void }} stop ends the following
 */
export function timeReadout(audio, className = 'demo-time') {
  const element = el('span', { className });
  const stop = followPlayback(audio, (time, duration) => { element.textContent = clockText(time, duration); });
  return { element, stop };
}
