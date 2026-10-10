// <audio> elements for the summary recordings. Every one joins the radio
// processing chain (crossorigin is needed for that: without it Web Audio
// gets silence). The native player on top has two fixes:
// - Browser-recorded WebM files carry no duration, so Chrome shows an endless
//   timeline; findDuration (lib/playback.js) makes the browser find it.
// - Starting one clip pauses whichever other clip is playing.

import { el } from '../lib/dom.js';
import { findDuration } from '../lib/playback.js';
import { registerPlayer } from '../audio/radio.js';

let playing = null;

/**
 * An <audio> element for a recording, joined to the radio chain.
 * @param {object} props element properties (src, preload, controls…)
 */
export function recordingAudio(props) {
  // crossOrigin must be set before src, so the request is made with CORS.
  const audio = el('audio', { crossOrigin: 'anonymous', ...props });
  registerPlayer(audio);
  return audio;
}

/**
 * A native player for one recording.
 * @param {string} src audio URL
 * @param {string} label accessible name, e.g. "Recording: gervigreind, Borð 3"
 */
export function audioPlayer(src, label) {
  const audio = recordingAudio({ src, controls: true, preload: 'none', ariaLabel: label, className: 'player' });
  findDuration(audio);
  audio.addEventListener('play', () => {
    if (playing && playing !== audio) playing.pause();
    playing = audio;
  });
  return audio;
}
