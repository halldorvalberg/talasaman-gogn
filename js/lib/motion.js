// Timing for animations driven from JS: easing curves, a frame-by-frame
// tween, and the user's reduced-motion preference, which every moving thing
// on the site checks (CSS animations are switched off in base.css).

/** Live: `.matches` is true while the user prefers reduced motion. */
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** Fast start, gentle stop. t and the result are 0–1. */
export const easeOut = (t) => 1 - (1 - t) ** 3;

/** Gentle start and stop. t and the result are 0–1. */
export const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2);

/**
 * Call onStep(t) every frame as t runs from 0 to 1 over `duration` ms; just
 * onStep(1) when the user prefers reduced motion.
 * @returns {{ done: Promise<void>, cancel: () => void }} done never settles if cancelled
 */
export function tween(duration, onStep) {
  if (reducedMotion.matches) {
    onStep(1);
    return { done: Promise.resolve(), cancel() {} };
  }
  let frame = 0;
  const done = new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      onStep(t);
      if (t < 1) frame = requestAnimationFrame(step);
      else resolve();
    };
    frame = requestAnimationFrame(step);
  });
  return { done, cancel: () => cancelAnimationFrame(frame) };
}
