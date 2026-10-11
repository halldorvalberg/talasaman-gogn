// #/listen: the listening view as a page of its own, controlled by its
// address (see lib/listen-address.js for every part). The address follows
// the player: moving to another recording rewrites it in place, and editing
// it while here moves the player without reloading the page. Closing goes
// back to where the listener came from, or to the Audio page.

import { el } from '../lib/dom.js';
import { fetchRecordings } from '../lib/recordings.js';
import { parseListenHash, buildListenHash, listenPlaylist, indexOfRecording, DEFAULT_MOOD } from '../lib/listen-address.js';
import { updateRadio } from '../audio/radio.js';
import { mountListeningStage } from '../components/listening-stage.js';

const FALLBACK = '#/summaries/audio';

/** Switch Radio sound as the address asks ('off', or a preset); nothing if it doesn't. */
function applyPreset(preset) {
  if (preset === 'off') updateRadio({ on: false });
  else if (preset) updateRadio({ on: true, preset });
}

/** A full-screen line of text (loading, or what went wrong) with a way back. */
function stageMessage(text, { error = false } = {}) {
  return el('div', { className: 'stage stage-message' },
    el('p', { className: error ? 'error' : '', role: error ? 'alert' : 'status' }, text),
    el('p', {}, el('a', { href: FALLBACK }, '← Back to the Audio page')));
}

/** Do two option sets pick different recordings to play? */
const filtersDiffer = (a, b) => a.topic !== b.topic || a.location !== b.location;

/**
 * The listening view page.
 * @param {object} page
 * @param {object[]} pages
 * @param {{ hash: string, from: string|null, onChange: (fn: (hash: string) => void) => void,
 *   onLeave: (fn: () => void) => void }} route from main.js; `from` is the page shown before
 */
export function listenPage(page, pages, route) {
  const holder = el('div', { className: 'listen-page' }, stageMessage('Loading recordings…'));
  const state = { options: parseListenHash(route.hash), rows: null, entries: [], stage: null, edited: false, left: false };

  /** Back where the listener came from; a new entry instead if they edited the address here. */
  const close = () => {
    if (route.from && !state.edited) history.back();
    else location.hash = route.from ?? FALLBACK;
  };

  /** Keep the address on the recording now playing (without a new history entry). */
  const followTrack = (index) => {
    state.options = { ...state.options, recording: state.entries[index].number, t: null };
    history.replaceState(history.state, '', buildListenHash(state.options));
  };

  /** (Re)build the stage for the current options. */
  const mount = () => {
    const { entries, start } = listenPlaylist(state.rows, state.options);
    const { t, mood, loop } = state.options;
    state.entries = entries;
    state.stage?.destroy();
    holder.replaceChildren();
    state.stage = mountListeningStage(holder, {
      rows: entries.map((entry) => entry.row), start, startAt: t,
      mood: mood ?? DEFAULT_MOOD, loop: loop ?? true, onClose: close, onTrackChange: followTrack,
    });
  };

  document.body.classList.add('stage-open');
  applyPreset(state.options.preset);
  fetchRecordings()
    .then((rows) => {
      if (state.left) return;
      if (!rows.length) { holder.replaceChildren(stageMessage('No recordings to play.')); return; }
      state.rows = rows;
      mount();
    })
    .catch((err) => holder.replaceChildren(stageMessage(err.message, { error: true })));

  route.onChange((hash) => {
    state.edited = true;
    const before = state.options;
    state.options = parseListenHash(hash);
    if (state.options.preset !== before.preset) applyPreset(state.options.preset);
    if (state.stage) updateStage(state, before, mount);
  });
  route.onLeave(() => {
    state.left = true;
    state.stage?.destroy();
    document.body.classList.remove('stage-open');
  });
  return holder;
}

/**
 * Move the playing stage to new options: other filters rebuild it; another
 * mood, loop, recording or start time changes just that.
 */
function updateStage(state, before, mount) {
  const now = state.options;
  if (filtersDiffer(now, before) || now.shuffle !== before.shuffle) { mount(); return; }
  if (now.mood !== before.mood) state.stage.setMood(now.mood ?? DEFAULT_MOOD);
  if (now.loop !== before.loop) state.stage.setLoop(now.loop ?? true);
  if (now.recording !== before.recording) state.stage.jump(indexOfRecording(state.entries, now.recording ?? 1), now.t);
  else if (now.t !== null && now.t !== before.t) state.stage.seek(now.t);
}
