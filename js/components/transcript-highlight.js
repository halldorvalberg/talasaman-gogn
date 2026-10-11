// A recording's summary as text that follows the voice: while the <audio>
// plays, the word being spoken turns blue, and words already spoken go from
// blue to the normal text colour (white on dark and blue grounds); words to
// come stay quieter. Clicking a word jumps the recording there. Timings come
// from data/transcript-timing.json (lib/transcript.js); without a matching
// one the text is shown plain. Two tones: 'page' (on the page or a card) and
// 'blue' (white on its own deep blue box, beside the blue chorus and lens).
// A box shorter than the text keeps the current line in view by scrolling
// itself, never the page. Styles: css/components/transcript.css.

import { el } from '../lib/dom.js';
import { followPlayback } from '../lib/playback.js';
import { reducedMotion } from '../lib/motion.js';
import { wordsOf, timesFor, wordAt, loadTranscriptTimings } from '../lib/transcript.js';

/** The words as spans (data-index = position), with plain spaces between them. */
function wordSpans(words) {
  return words.map((word, i) => {
    const span = el('span', { className: 'transcript-word' }, word);
    span.dataset.index = i;
    return span;
  });
}

/** Mark the words between the old and new current word: spoken before `now`, current at `now`. */
function markWords(spans, before, now) {
  const from = Math.max(0, Math.min(before, now));
  const to = Math.min(spans.length - 1, Math.max(before, now));
  for (let i = from; i <= to; i++) {
    spans[i].classList.toggle('is-spoken', i < now);
    spans[i].classList.toggle('is-now', i === now);
  }
}

/**
 * Scroll `box` (not the page) so the line of `span` shows, with the line
 * before it too when three or more lines fit. Nothing when all the text fits.
 */
function scrollToWord(box, span) {
  if (box.scrollHeight <= box.clientHeight) return;
  const line = parseFloat(getComputedStyle(box).lineHeight) || span.offsetHeight;
  const context = box.clientHeight >= 3 * line ? line : 0;
  box.scrollTo({ top: span.offsetTop - context, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}

/**
 * The word to light at `time`: none before playback starts, all spoken
 * once it has ended. Words count as spoken up to (not including) the result.
 */
function currentWord(audio, times, time) {
  if (audio.ended) return times.length;
  return wordAt(times, time);
}

/** A click on a word starts the recording from it (not while selecting text); `timesNow` gives the current timings. */
function jumpOnClick(element, audio, timesNow) {
  element.addEventListener('click', (event) => {
    const span = event.target.closest('.transcript-word');
    const times = timesNow();
    if (!span || !times || !getSelection().isCollapsed) return;
    audio.currentTime = times[span.dataset.index][0];
  });
}

/**
 * A transcript of one recording, following `audio`.
 * @param {HTMLAudioElement} audio
 * @param {object} [options]
 * @param {string} [options.text] the summary
 * @param {{ words: number[][], text_hash: string }|null} [options.timing] its entry in transcript-timing.json
 * @param {'page'|'blue'} [options.tone]
 * @param {string} [options.className] extra classes, e.g. one that limits its height
 * @returns {{ element: HTMLElement, show: (text: string, timing?: object|null) => void, stop: () => void }}
 *   show swaps in another text; stop ends the following
 */
export function createTranscript(audio, { text = '', timing = null, tone = 'page', className = '' } = {}) {
  const element = el('p', { className: `transcript transcript-${tone} ${className}`.trim() });
  let spans = [];
  let times = null;
  let index = -1;
  let lineTop = -1;

  function show(newText, newTiming = null) {
    const words = wordsOf(newText);
    times = timesFor(words, newTiming);
    spans = times ? wordSpans(words) : [];
    index = -1;
    lineTop = -1;
    element.classList.toggle('has-times', Boolean(times));
    if (times) element.replaceChildren(...spans.flatMap((span, i) => (i ? [' ', span] : [span])));
    else element.textContent = newText;
    element.scrollTop = 0;
    render(audio.currentTime);
  }

  /** Light the word for `time`; scroll only when the current word moves to another line. */
  function render(time) {
    const following = Boolean(times) && (!audio.paused || time > 0);
    element.classList.toggle('is-following', following);
    if (!times) return;
    const now = following ? currentWord(audio, times, time) : -1;
    if (now === index) return;
    markWords(spans, index, now);
    index = now;
    const span = spans[Math.min(Math.max(now, 0), spans.length - 1)];
    if (span.offsetTop === lineTop) return;
    lineTop = span.offsetTop;
    scrollToWord(element, span);
  }

  jumpOnClick(element, audio, () => times);
  const stop = followPlayback(audio, render);
  show(text, timing);
  return { element, show, stop };
}

/**
 * A transcript that follows whichever of `rows` the `audio` is playing,
 * switching text whenever it loads another recording, with timings loaded
 * from data/transcript-timing.json.
 * @param {HTMLAudioElement} audio
 * @param {Array<{ id: string, audio: string, summary: string }>} rows the recordings it can play
 * @param {object} [options] as for createTranscript (tone, className)
 */
export function recordingTranscript(audio, rows, options = {}) {
  const transcript = createTranscript(audio, options);
  const listening = new AbortController();
  let timings = {};
  const showCurrent = () => {
    const row = rows.find((r) => r.audio === audio.src);
    transcript.show(row?.summary ?? '', row ? timings[row.id] : null);
  };
  audio.addEventListener('loadstart', showCurrent, { signal: listening.signal });
  loadTranscriptTimings().then((all) => {
    timings = all;
    if (!listening.signal.aborted) showCurrent();
  });
  showCurrent();
  return { ...transcript, stop: () => { listening.abort(); transcript.stop(); } };
}
