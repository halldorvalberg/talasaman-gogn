// A "Play all" button: plays the recordings one after another, from the top.
// When one ends the next starts; if the listener jumps to another recording
// meanwhile, it carries on from there. Pressing it again stops.

import { playButton } from './player-controls.js';

/** What the button shows while stopped and while playing. */
const PLAY_ALL = (stopped) => (stopped
  ? { icon: 'play', text: 'Play all', label: 'Play all recordings, one after another' }
  : { icon: 'stop', text: 'Stop', label: 'Stop playing all recordings' });

/** Play a recording from its start. */
function playFromStart(audio) {
  audio.currentTime = 0;
  audio.play();
}

/**
 * @param {() => HTMLAudioElement[]} getPlayers the recordings to play, in order
 *   (asked again each time, so hidden or filtered-out ones can be left out)
 * @param {Element} root an element containing them all (media events don't
 *   bubble, so we listen there in the capture phase)
 */
export function playAllButton(getPlayers, root) {
  let active = false;
  let show = () => {};

  root.addEventListener('ended', (event) => {
    if (!active) return;
    const players = getPlayers();
    const next = players[players.indexOf(event.target) + 1];
    if (next) playFromStart(next);
    else { active = false; show(); }
  }, true);

  function toggle() {
    const players = getPlayers();
    if (active) players.forEach((a) => a.pause());
    else if (players.length) playFromStart(players[0]);
    active = !active && players.length > 0;
  }

  return playButton(
    { isPaused: () => !active, toggle, watch: (fn) => { show = fn; } },
    { className: 'radio-play-all', look: PLAY_ALL });
}
