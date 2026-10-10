// Following an <audio> element's playback, for anything drawn in step with
// it. Browser-recorded WebM files (all the summary recordings) carry no
// duration, so that is found first; and the position is read on every
// animation frame while playing, because timeupdate alone fires only about
// four times a second, which makes a moving mark jerky.

const FOLLOWED_EVENTS = ['timeupdate', 'seeked', 'durationchange', 'loadedmetadata', 'pause', 'ended', 'emptied'];
const durationFound = new WeakSet();

/**
 * Make the browser work out a missing duration. Without one Chrome shows an
 * endless timeline; seeking far past the end once makes it find the real
 * length, then we jump back to where playback was (the start).
 * Safe to call more than once per element, and it runs again whenever the
 * element loads a new recording (a new src).
 */
export function findDuration(audio) {
  if (durationFound.has(audio)) return;
  durationFound.add(audio);
  const fix = () => {
    if (audio.duration !== Infinity) return;
    const resume = !audio.paused;
    audio.addEventListener('durationchange', function back() {
      if (audio.duration === Infinity) return;
      audio.removeEventListener('durationchange', back);
      audio.currentTime = 0;
      if (resume) audio.play();
    });
    audio.currentTime = 1e101;
  };
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) fix();
  audio.addEventListener('loadedmetadata', fix);
}

/** The duration in seconds, or 0 while it is still unknown. */
export const knownDuration = (audio) => (Number.isFinite(audio.duration) ? audio.duration : 0);

/**
 * Call onTick(time, duration) (seconds; duration 0 until known) every frame
 * while `audio` plays, and on every seek, pause, end and duration change.
 * @returns {() => void} stops following
 */
export function followPlayback(audio, onTick) {
  findDuration(audio);
  const listening = new AbortController();
  let frame = 0;
  const tick = () => onTick(audio.currentTime, knownDuration(audio));
  const loop = () => { tick(); frame = requestAnimationFrame(loop); };
  const stopLoop = () => cancelAnimationFrame(frame);

  const on = (type, fn) => audio.addEventListener(type, fn, { signal: listening.signal });
  on('playing', () => { stopLoop(); loop(); });
  for (const type of ['pause', 'ended', 'emptied']) on(type, stopLoop);
  for (const type of FOLLOWED_EVENTS) on(type, tick);

  if (!audio.paused) loop();
  else tick();
  return () => { stopLoop(); listening.abort(); };
}
