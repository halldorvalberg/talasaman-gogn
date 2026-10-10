// A thin line with a dot that travels from left to right over the length of
// a recording. Either drive it yourself (setDuration, then play, pause, seek
// or setTime) or connect it to an <audio> element and it follows that one.
// Click, drag or use the arrow keys on it to seek; assistive technology sees
// it as a slider.

import { el } from '../lib/dom.js';
import { formatClock } from '../lib/format.js';
import { followPlayback } from '../lib/playback.js';
import { clamp } from '../lib/math.js';

// Seconds moved by each key; Home and End go to the start and the end.
const KEY_STEPS = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 };

/** How far through, 0–1; 0 while the duration is unknown. */
const fractionOf = (time, duration) => (duration > 0 ? clamp(time / duration, 0, 1) : 0);

/**
 * A clock for when no <audio> is connected: counts seconds from play() until
 * pause() or the end, and calls onTick(time) every frame in between.
 */
function createClock(onTick) {
  let startedAt = 0; // performance.now() at which time would have been 0
  let frame = 0;
  const clock = {
    time: 0,
    duration: 0,
    playing: false,
    play() {
      if (clock.playing || clock.time >= clock.duration) return;
      clock.playing = true;
      startedAt = performance.now() - clock.time * 1000;
      frame = requestAnimationFrame(clock.step);
    },
    pause() {
      clock.playing = false;
      cancelAnimationFrame(frame);
    },
    step(now) {
      clock.time = Math.min(clock.duration, (now - startedAt) / 1000);
      if (clock.time >= clock.duration) clock.pause();
      else frame = requestAnimationFrame(clock.step);
      onTick();
    },
    setTime(seconds) {
      clock.time = clamp(seconds, 0, clock.duration);
      startedAt = performance.now() - clock.time * 1000;
      onTick();
    },
  };
  return clock;
}

/** The line's parts: a hairline track, the played part over it, and the dot. */
function lineElement(label) {
  const rail = el('span', { className: 'progress-rail' },
    el('span', { className: 'progress-track' }),
    el('span', { className: 'progress-played' }),
    el('span', { className: 'progress-dot' }));
  const line = el('div', { className: 'progress-line', tabIndex: 0, ariaLabel: label }, rail);
  line.setAttribute('role', 'slider');
  line.setAttribute('aria-valuemin', '0');
  return { line, rail };
}

/** Point the line and its slider values at a time. */
function showTime(line, time, duration) {
  line.style.setProperty('--progress', fractionOf(time, duration));
  line.setAttribute('aria-valuemax', String(Math.round(duration)));
  line.setAttribute('aria-valuenow', String(Math.round(Math.min(time, duration))));
  line.setAttribute('aria-valuetext', duration ? `${formatClock(time)} of ${formatClock(duration)}` : 'Length not known yet');
}

/** Seek with a press or drag anywhere on the line. */
function attachPointerSeek(line, rail, seekToFraction) {
  const fractionAt = (e) => {
    const r = rail.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  };
  line.addEventListener('pointerdown', (e) => {
    line.setPointerCapture(e.pointerId);
    line.classList.add('dragging');
    seekToFraction(fractionAt(e));
  });
  line.addEventListener('pointermove', (e) => {
    if (line.hasPointerCapture(e.pointerId)) seekToFraction(fractionAt(e));
  });
  const release = () => line.classList.remove('dragging');
  line.addEventListener('pointerup', release);
  line.addEventListener('pointercancel', release);
}

/** Seek with the arrow, Page and Home/End keys. */
function attachKeySeek(line, { time, duration, seek }) {
  line.addEventListener('keydown', (e) => {
    const target = e.key === 'Home' ? 0
      : e.key === 'End' ? duration()
      : e.key in KEY_STEPS ? time() + KEY_STEPS[e.key] : null;
    if (target === null || !duration()) return;
    e.preventDefault();
    seek(target);
  });
}

/**
 * @param {object} [options]
 * @param {number} [options.duration] length in seconds, if already known
 * @param {string} [options.label] accessible name, e.g. 'Playback position'
 * @param {(seconds: number) => void} [options.onSeek] called when the user seeks
 * @returns the line's `element` and its controls (see below)
 */
export function createProgressLine({ duration = 0, label = 'Playback position', onSeek } = {}) {
  const { line, rail } = lineElement(label);
  const clock = createClock(() => showTime(line, clock.time, clock.duration));
  let audio = null;
  let unfollow = () => {};

  const now = () => (audio ? audio.currentTime : clock.time);
  const length = () => clock.duration;

  /** Go to a time, moving the connected audio if there is one. */
  function seek(seconds) {
    const time = clamp(seconds, 0, length());
    if (audio) audio.currentTime = time;
    else clock.setTime(time);
    onSeek?.(time);
  }

  /** Follow an <audio> element from now on (instead of the own clock). */
  function connect(element) {
    disconnect();
    clock.pause();
    audio = element;
    unfollow = followPlayback(audio, (time, known) => {
      clock.duration = known;
      showTime(line, time, known);
    });
    return disconnect;
  }

  function disconnect() {
    unfollow();
    audio = null;
  }

  attachPointerSeek(line, rail, (fraction) => { if (length()) seek(fraction * length()); });
  attachKeySeek(line, { time: now, duration: length, seek });
  clock.duration = duration;
  showTime(line, 0, duration);

  return {
    element: line,
    connect,
    disconnect,
    seek,
    /** Set the length in seconds (own clock only; a connected audio sets its own). */
    setDuration(seconds) { clock.duration = seconds; clock.setTime(clock.time); },
    /** Move the dot to a time without telling onSeek, e.g. from your own player. */
    setTime: (seconds) => clock.setTime(seconds),
    play: () => (audio ? audio.play() : clock.play()),
    pause: () => (audio ? audio.pause() : clock.pause()),
    get time() { return now(); },
    get duration() { return length(); },
  };
}
