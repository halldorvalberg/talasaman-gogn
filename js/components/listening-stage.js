// The listening view: a full-screen stage, shown by the #/listen route
// (views/listen.js). The front-page image moves with the voice as a chorus
// (aggressive or calm), and a player underneath goes through the recordings
// in turn, starting over after the last unless told to stop there. Esc or
// the close button leaves it; it fits any screen in either orientation (see
// css/components/listening-stage.css). Browsers block sound until the page
// has been clicked, so if playing is refused a big Start button appears.

import { el } from '../lib/dom.js';
import { recordingTitle } from '../lib/format.js';
import { recordingAudio } from './audio-player.js';
import { playButton, audioPlayback, timeReadout, PLAY_PAUSE_ICON } from './player-controls.js';
import { createProgressLine } from './progress-line.js';
import { heroChorus } from './hero-visualisers.js';

const RESTART_WITHIN = 3; // s: "previous" restarts the recording if further in than this

/** A round control button with an icon and an accessible name. */
function stageButton(icon, label, onClick, className = '') {
  const button = el('button', { className: `stage-button ${className}`.trim(), ariaLabel: label, title: label }, icon);
  button.addEventListener('click', onClick);
  return button;
}

/** The buttons and focusable parts inside `root` that are showing. */
const focusableIn = (root) =>
  [...root.querySelectorAll('button, [tabindex="0"]')].filter((node) => !node.closest('[hidden]'));

/** Keep Tab and Shift+Tab going round the focusable elements inside `root`. */
function trapTab(event, root) {
  const focusable = focusableIn(root);
  const [first, last] = [focusable[0], focusable.at(-1)];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/** `seconds`, kept inside the recording (its length must be known). */
const withinRecording = (audio, seconds) => Math.max(0, Math.min(seconds, audio.duration - 1));

/**
 * A player that goes through `rows` in turn. The buttons wrap round at both
 * ends; at the end of the last recording it starts over only if `loop`.
 * @param {object[]} rows
 * @param {object} hooks
 * @param {(index: number) => void} hooks.onTrackChange after moving to another recording
 * @param {() => void} hooks.onBlocked when the browser refuses to play before a click
 * @returns its parts (audio, now-playing count and title) and play(i, at, quiet), seek, next, previous, setLoop
 */
function createPlaylist(rows, { onTrackChange, onBlocked }) {
  const audio = recordingAudio({ preload: 'auto' }); // the visualiser needs the CORS request
  const count = el('span', { className: 'stage-count' });
  const title = el('span', { className: 'stage-title' });
  let index = 0;
  let loop = true;
  let seekTo = null; // seconds to start the loading recording from

  /** Load recording `i` (wrapping round), from `at` seconds, and play it. */
  function play(i, at = null, quiet = false) {
    index = (i + rows.length) % rows.length;
    seekTo = at;
    audio.src = rows[index].audio;
    count.textContent = `${index + 1} / ${rows.length}`;
    title.textContent = recordingTitle(rows[index]);
    audio.play().catch((err) => { if (err.name === 'NotAllowedError') onBlocked(); });
    if (!quiet) onTrackChange(index);
  }
  const next = () => play(index + 1);
  const previous = () => (audio.currentTime > RESTART_WITHIN ? (audio.currentTime = 0) : play(index - 1));
  const startOver = () => loop || index < rows.length - 1;
  // The recordings carry no length, so findDuration (lib/playback.js) seeks
  // to the end and back to 0 first: a start time waits until that is done.
  const seekIfDue = () => {
    if (seekTo === null || audio.seeking || !Number.isFinite(audio.duration)) return;
    audio.currentTime = withinRecording(audio, seekTo);
    seekTo = null;
  };
  /** Go to `at` seconds now if the length is known, else as soon as it is. */
  const seek = (at) => { seekTo = at; seekIfDue(); };

  audio.addEventListener('ended', () => { if (startOver()) next(); });
  for (const type of ['durationchange', 'seeked', 'playing']) audio.addEventListener(type, seekIfDue);
  return { audio, count, title, play, seek, next, previous, setLoop: (value) => { loop = value; } };
}

/** The "▶ Start" panel shown over the stage while the browser waits for a click. */
function startPanel(onStart) {
  const button = el('button', { className: 'stage-start-button' },
    el('span', { ariaHidden: 'true' }, '▶'), ' Start');
  button.addEventListener('click', onStart);
  const panel = el('div', { className: 'stage-start', hidden: true },
    el('div', { className: 'stage-start-card' },
      button,
      el('p', { className: 'stage-start-hint' }, 'Your browser waits for a click before it plays sound.')));
  return {
    element: panel,
    show: () => { panel.hidden = false; button.focus(); },
    hide: () => { panel.hidden = true; },
  };
}

/** The stage's markup: close button, the moving image, the player and the Start panel. */
function stageElement({ playlist, playPause, line, time, art, start, close }) {
  return el('div', { className: 'stage', role: 'dialog', ariaModal: 'true', ariaLabel: 'Listening view' },
    stageButton('✕', 'Close the listening view', close, 'stage-close'),
    art,
    el('div', { className: 'stage-player' },
      el('p', { className: 'stage-now', ariaLive: 'polite' }, playlist.count, playlist.title),
      el('div', { className: 'stage-controls' },
        stageButton('⏮', 'Previous recording', playlist.previous),
        playPause,
        stageButton('⏭', 'Next recording', playlist.next),
        el('div', { className: 'stage-line' }, line.element),
        time.element)),
    start.element,
    playlist.audio);
}

/** The image, moving as the chorus of `mood`. */
const chorusArt = (mood) => heroChorus({ mood });

/**
 * Show the listening view in `container` and start playing.
 * @param {HTMLElement} container where the stage goes (it covers the screen wherever it is)
 * @param {object} options
 * @param {Array<{ audio: string, topic: string, location: string, table: number }>} options.rows the recordings, in playing order
 * @param {number} [options.start] index of the first recording
 * @param {number|null} [options.startAt] seconds into it to start from
 * @param {'calm'|'aggressive'} [options.mood] which chorus the image moves as
 * @param {boolean} [options.loop] start over after the last recording
 * @param {() => void} options.onClose the close button or Esc was pressed
 * @param {(index: number) => void} [options.onTrackChange] after moving to another recording (not on start or jump)
 * @returns {{ jump: (index: number, at?: number|null) => void, seek: (seconds: number) => void,
 *   setMood: (mood: string) => void, setLoop: (loop: boolean) => void, destroy: () => void }}
 *   jump goes to another recording; destroy stops the stage and removes it
 */
export function mountListeningStage(container, { rows, start = 0, startAt = null, mood = 'aggressive', loop = true, onClose, onTrackChange = () => {} }) {
  document.querySelectorAll('audio').forEach((a) => a.pause()); // one thing playing at a time
  const startButton = startPanel(() => playlist.audio.play());
  const playlist = createPlaylist(rows, { onTrackChange, onBlocked: startButton.show });
  const { audio } = playlist;
  const line = createProgressLine({ label: 'Position in the recording' });
  line.connect(audio);
  const time = timeReadout(audio, 'stage-time');
  const playPause = playButton(audioPlayback(audio), { className: 'stage-button stage-play', look: PLAY_PAUSE_ICON });
  const art = el('div', { className: 'stage-art' }, chorusArt(mood));
  const stage = stageElement({ playlist, playPause, line, time, art, start: startButton, close: onClose });
  audio.addEventListener('play', () => {
    const hadFocus = startButton.element.contains(document.activeElement);
    startButton.hide();
    if (hadFocus) playPause.focus(); // focus stays in the stage, on the control that now matters
  });

  /** Esc closes; Tab goes round the stage's own controls only (it is modal). */
  function onKey(event) {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'Tab') trapTab(event, stage);
  }

  function destroy() {
    audio.pause();
    time.stop();
    line.disconnect();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('stage-open');
    stage.remove();
  }

  document.addEventListener('keydown', onKey);
  document.body.classList.add('stage-open');
  container.append(stage);
  playlist.setLoop(loop);
  playlist.play(start, startAt, true);
  playPause.focus();
  return {
    jump: (index, at = null) => playlist.play(index, at, true),
    seek: playlist.seek,
    setMood: (value) => art.replaceChildren(chorusArt(value)),
    setLoop: playlist.setLoop,
    destroy,
  };
}
