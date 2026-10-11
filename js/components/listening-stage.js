// The listening view: a full-screen stage, shown by the #/listen route
// (views/listen.js). The front-page image moves with the voice as a chorus
// (aggressive or calm), and a player underneath goes through the recordings
// in turn, starting over after the last unless told to stop there; above the
// player, the summary being read lights up word by word. Esc or the close
// button leaves it; it fits any screen in either orientation (see
// css/components/listening-stage.css). It starts playing at once; when the
// browser refuses sound before a click, it plays muted until the first tap.

import { el, GESTURE_EVENTS } from '../lib/dom.js';
import { recordingTitle } from '../lib/format.js';
import { recordingAudio } from './audio-player.js';
import { playButton, audioPlayback, timeReadout, PLAY_PAUSE_ICON } from './player-controls.js';
import { createProgressLine } from './progress-line.js';
import { heroChorus } from './hero-visualisers.js';
import { recordingTranscript } from './transcript-highlight.js';
import { icon } from './icons.js';

const RESTART_WITHIN = 3; // s: "previous" restarts the recording if further in than this

/** A round control button with an icon (a name from icons.js) and an accessible name. */
function stageButton(iconName, label, onClick, className = '') {
  const button = el('button', { className: `stage-button ${className}`.trim(), ariaLabel: label, title: label }, icon(iconName));
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

/** A keydown handler for the stage: Esc closes; Tab goes round its own controls only (it is modal). */
const stageKeys = (stage, onClose) => (event) => {
  if (event.key === 'Escape') onClose();
  else if (event.key === 'Tab') trapTab(event, stage);
};

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

/**
 * Browsers only allow sound after a tap, click or key press, so a link opened
 * directly can't start with sound. It then tries to play muted (allowed by
 * most browsers), so the view runs straight away; the first gesture anywhere
 * starts the sound. A small hint says so meanwhile.
 * @returns {{ element: HTMLElement, onBlocked: () => void, stop: () => void }}
 */
function soundUnlock(audio) {
  const hint = el('p', { className: 'stage-sound-hint', role: 'status', hidden: true });
  const stop = () => GESTURE_EVENTS.forEach((type) => document.removeEventListener(type, unmute, true));
  function unmute() {
    stop();
    audio.muted = false;
    hint.hidden = true;
    if (audio.paused) audio.play().catch(() => {});
  }
  function onBlocked() {
    audio.muted = true;
    hint.textContent = 'Tap anywhere for sound';
    audio.play().catch(() => { hint.textContent = 'Tap anywhere to start'; }); // some browsers refuse even muted
    hint.hidden = false;
    GESTURE_EVENTS.forEach((type) => document.addEventListener(type, unmute, true));
  }
  return { element: hint, onBlocked, stop };
}

/** The stage's markup: close button, the moving image, the transcript over the player, and the sound hint. */
function stageElement({ playlist, playPause, line, time, art, transcript, hint, close }) {
  return el('div', { className: 'stage', role: 'dialog', ariaModal: 'true', ariaLabel: 'Listening view' },
    stageButton('close', 'Close the listening view', close, 'stage-close'),
    art,
    el('div', { className: 'stage-player' },
      transcript.element,
      el('p', { className: 'stage-now', ariaLive: 'polite' }, playlist.count, playlist.title),
      el('div', { className: 'stage-controls' },
        stageButton('previous', 'Previous recording', playlist.previous),
        playPause,
        stageButton('next', 'Next recording', playlist.next),
        el('div', { className: 'stage-line' }, line.element),
        time.element)),
    hint,
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
  let sound = null; // set just below; the playlist only calls onBlocked once playing starts
  const playlist = createPlaylist(rows, { onTrackChange, onBlocked: () => sound.onBlocked() });
  const { audio } = playlist;
  sound = soundUnlock(audio);
  const line = createProgressLine({ label: 'Position in the recording' });
  line.connect(audio);
  const time = timeReadout(audio, 'stage-time');
  const playPause = playButton(audioPlayback(audio), { className: 'stage-button stage-play', look: PLAY_PAUSE_ICON });
  const art = el('div', { className: 'stage-art' }, chorusArt(mood));
  const transcript = recordingTranscript(audio, rows, { className: 'stage-transcript transcript-lines' });
  const stage = stageElement({ playlist, playPause, line, time, art, transcript, hint: sound.element, close: onClose });
  const onKey = stageKeys(stage, onClose);

  function destroy() {
    sound.stop();
    audio.pause();
    time.stop();
    transcript.stop();
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
