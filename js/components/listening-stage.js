// The listening view: a full-screen stage opened from the Audio page. The
// front-page image moves with the voice as the aggressive chorus, and a
// player underneath goes through every recording in turn, starting over
// after the last. Esc or the close button leaves it; it fits any screen in
// either orientation (see css/components/listening-stage.css).

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

/** Keep Tab and Shift+Tab going round the focusable elements inside `root`. */
function trapTab(event, root) {
  const focusable = [...root.querySelectorAll('button, [tabindex="0"]')];
  const [first, last] = [focusable[0], focusable.at(-1)];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/**
 * A player that goes through `rows` in turn, wrapping round at both ends.
 * @returns its parts (audio, line, time, now-playing count and title) and play(i), next, previous
 */
function createPlaylist(rows, start) {
  const audio = recordingAudio({ preload: 'auto' }); // the visualiser needs the CORS request
  const count = el('span', { className: 'stage-count' });
  const title = el('span', { className: 'stage-title' });
  let index = start;

  function play(i) {
    index = (i + rows.length) % rows.length;
    audio.src = rows[index].audio;
    count.textContent = `${index + 1} / ${rows.length}`;
    title.textContent = recordingTitle(rows[index]);
    audio.play();
  }
  const next = () => play(index + 1);
  const previous = () => (audio.currentTime > RESTART_WITHIN ? (audio.currentTime = 0) : play(index - 1));
  audio.addEventListener('ended', next);
  return { audio, count, title, play: () => play(index), next, previous };
}

/** The stage's markup: close button, the moving image, and the player. */
function stageElement({ playlist, playPause, line, time, close }) {
  return el('div', { className: 'stage', role: 'dialog', ariaModal: 'true', ariaLabel: 'Listening view' },
    stageButton('✕', 'Close the listening view', close, 'stage-close'),
    el('div', { className: 'stage-art' }, heroChorus({ mood: 'aggressive' })),
    el('div', { className: 'stage-player' },
      el('p', { className: 'stage-now', ariaLive: 'polite' }, playlist.count, playlist.title),
      el('div', { className: 'stage-controls' },
        stageButton('⏮', 'Previous recording', playlist.previous),
        playPause,
        stageButton('⏭', 'Next recording', playlist.next),
        el('div', { className: 'stage-line' }, line.element),
        time.element)),
    playlist.audio);
}

/**
 * Open the stage over the page and start playing.
 * @param {Array<{ audio: string, topic: string, location: string, table: number }>} rows the recordings, in playing order
 * @param {number} [start] index of the first recording
 */
export function openListeningStage(rows, start = 0) {
  document.querySelectorAll('audio').forEach((a) => a.pause()); // one thing playing at a time
  const opener = document.activeElement;
  const playlist = createPlaylist(rows, start);
  const { audio } = playlist;
  const line = createProgressLine({ label: 'Position in the recording' });
  line.connect(audio);
  const time = timeReadout(audio, 'stage-time');
  const playPause = playButton(audioPlayback(audio), { className: 'stage-button stage-play', look: PLAY_PAUSE_ICON });
  const stage = stageElement({ playlist, playPause, line, time, close });

  /** Esc closes; Tab goes round the stage's own controls only (it is modal). */
  function onKey(event) {
    if (event.key === 'Escape') close();
    else if (event.key === 'Tab') trapTab(event, stage);
  }

  function close() {
    audio.pause();
    time.stop();
    line.disconnect();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('stage-open');
    stage.remove();
    opener?.focus?.();
  }

  document.addEventListener('keydown', onKey);
  document.body.classList.add('stage-open');
  document.body.append(stage);
  playlist.play();
  playPause.focus();
}
