// The talasaman.is logo (a speech bubble) as an audio visualiser: the bubble
// swells with the loudness of whatever recording is playing, and a ring
// ripples out from it each time a new sound starts. Still when nothing plays,
// and always still for people who prefer reduced motion.

import { svgEl } from '../lib/dom.js';
import { reducedMotion } from '../lib/motion.js';
import { onLevel } from '../audio/level-meter.js';

// The bubble from talasaman.is/icon.svg, in its own coordinates.
const BUBBLE = 'M346.92,541.19c-.78.7-4.04,1.5-4.9,1.11-1.15-.53-2.88-3.38-2.85-4.66l1.06-41.66,1.28-17.64c.28-3.88-.86-9.13-4.22-11.65-34.18-25.6-52.1-66.11-49.98-108.79,1.88-37.8,16.2-72.52,42.99-98.44,34.83-33.7,81.11-47.95,128.64-36.54,28.67,6.88,55.14,20.84,75,42.76,19.07,21.05,33.15,46.39,34.58,74.8l.68,13.41-.62,14.16c-1.36,31.3-15.18,60.24-34.71,84.66-32.83,41.05-86.11,56.96-137.9,44.7l-49.05,43.79Z';
const VIEW_BOX = '260.65 213.2 335 335';
const SWELL = 0.22;     // how much bigger the bubble gets at full level
const MAX_RINGS = 4;    // ripples on screen at once
const RING_TIME = 900;  // ms for a ripple to fade out

/** Send one ring out from the bubble; it removes itself when faded. */
function ripple(layer, strength) {
  if (layer.childElementCount >= MAX_RINGS) return;
  const ring = svgEl('path', { d: BUBBLE, class: 'logo-ring' });
  layer.append(ring);
  const from = 1 + SWELL * strength;
  ring.animate(
    [{ transform: `scale(${from})`, opacity: 1 }, { transform: `scale(${from + 0.35})`, opacity: 0 }],
    { duration: RING_TIME, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' },
  ).finished.then(() => ring.remove());
}

/**
 * @param {object} [options]
 * @param {string} [options.className] extra class, e.g. for its size
 * @param {string} [options.label] accessible name; without one it is decorative
 * @returns {SVGSVGElement}
 */
export function logoPulse({ className = '', label } = {}) {
  const rings = svgEl('g');
  const bubble = svgEl('path', { d: BUBBLE, class: 'logo-bubble' });
  const svg = svgEl('svg', { viewBox: VIEW_BOX, class: `logo-pulse ${className}`.trim() }, rings, bubble);
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  else svg.setAttribute('aria-hidden', 'true');

  let shown = false;
  const stop = onLevel((level, onset) => {
    if (!svg.isConnected) {
      if (shown) stop(); // its page was left: stop listening
      return;
    }
    shown = true;
    if (reducedMotion.matches) return;
    bubble.style.transform = `scale(${1 + SWELL * level})`;
    if (onset) ripple(rings, level);
  });
  return svg;
}
