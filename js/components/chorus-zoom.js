// The location zoom (location-zoom.js) in the middle of the talasaman.is
// front-page image: the lens takes the place of the lettering ("Eitt samtal
// getur breytt öllu.") and the image's eleven speech bubbles ring its rim,
// each partly tucked behind it. Every bubble swells with its own pitch band
// while a recording plays (the calm chorus of hero-visualisers.js) and
// breathes slowly while all is quiet; both stop for reduced motion.

import { el, svgEl } from '../lib/dom.js';
import { viewBoxAttr } from '../lib/geo.js';
import { ringAround, frameAround } from '../lib/chorus-ring.js';
import { loadHero } from './talasaman-hero.js';
import { bubblePaths, boxOf, measureBox, liveCheck, moveWithBands } from './hero-visualisers.js';
import { createLocationZoom } from './location-zoom.js';

const LENS_REACH = 1.3;  // the lens's radius, as a share of the lettering's half-diagonal
const ROOM = 0.03;       // room round the figure for the bubbles to swell into, as a share of its size

/** The circle over the lettering: centred on it, just reaching its corners (image units). */
function letteringCircle(hero) {
  const boxes = hero.lines.map(measureBox);
  const x0 = Math.min(...boxes.map((b) => b.x)), x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y0 = Math.min(...boxes.map((b) => b.y)), y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: (LENS_REACH * Math.hypot(x1 - x0, y1 - y0)) / 2 };
}

/** The bubbles, each shifted onto the ring, as an <svg> showing `frame`; the paths are returned for animating. */
function ringSvg(hero, shifts, frame) {
  const bubbles = bubblePaths(hero);
  bubbles.forEach((b, i) => b.style.setProperty('--i', i)); // staggers the breathing
  const placed = bubbles.map((b, i) => svgEl('g', { transform: `translate(${shifts[i].dx} ${shifts[i].dy})` }, b));
  const svg = svgEl('svg', { viewBox: viewBoxAttr(frame), class: 'chorus-ring', 'aria-hidden': 'true' }, ...placed);
  return { svg, bubbles };
}

/** Shape the figure like `frame` and set where the lens sits in it, in % (read by the CSS). */
function fitLens(figure, frame, { cx, cy, r }) {
  const percent = (value) => `${value * 100}%`;
  figure.style.setProperty('--ring-aspect', `${frame.w} / ${frame.h}`);
  figure.style.setProperty('--lens-left', percent((cx - r - frame.x) / frame.w));
  figure.style.setProperty('--lens-top', percent((cy - r - frame.y) / frame.h));
  figure.style.setProperty('--lens-size', percent((2 * r) / frame.w));
}

/** Ring the lens with the image's bubbles, once the image has loaded, and set them moving in `mood`. */
function addBubbles(figure, hero, isLive, mood) {
  const circle = letteringCircle(hero);
  const boxes = hero.bubbles.map(({ d }) => boxOf(d));
  const shifts = ringAround(boxes, circle);
  const frame = frameAround(boxes, shifts, circle, ROOM);
  const { svg, bubbles } = ringSvg(hero, shifts, frame);
  fitLens(figure, frame, circle);
  figure.prepend(svg);
  moveWithBands(bubbles, shifts.map((s) => s.direction), isLive, mood);
}

/**
 * @param {object} base the parsed data/iceland.geojson
 * @param {object} [options] passed to createLocationZoom (zoom, duration, viaAll), plus
 * @param {'line'|'blue'} [options.tone] 'line': black lines on white (default);
 *   'blue': the map in the bubbles' blue with white lines and names, all blue and white
 * @param {'calm'|'aggressive'} [options.mood] how hard the bubbles move with the sound (see hero-visualisers.js)
 * @returns the figure's `element` and the lens's showLocation / showAll
 */
export function chorusZoom(base, { tone = 'line', mood = 'aggressive', ...options } = {}) {
  // Between venues this lens flies all the way out to Iceland and back in.
  const zoom = createLocationZoom(base, { viaAll: true, ...options });
  const figure = el('div', { className: `chorus-zoom chorus-zoom-${mood}${tone === 'blue' ? ' lens-blue' : ''}` }, zoom.element);
  const isLive = liveCheck(figure);
  loadHero()
    .then((hero) => addBubbles(figure, hero, isLive, mood))
    .catch((err) => figure.append(el('p', { className: 'error' }, err.message)));
  // Just the venue's name in this lens: no "x tables · y people" line.
  const showLocation = (location) => zoom.showLocation({ ...location, text: '' });
  return { ...zoom, showLocation, element: figure };
}
