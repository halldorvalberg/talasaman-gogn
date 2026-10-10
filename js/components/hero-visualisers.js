// Audio visualisers made from the talasaman.is hero image (talasaman-hero.js).
// All three follow whatever recording is playing, through the shared level
// meter, and stay still for people who prefer reduced motion.
//   heroChorus()    the whole image; each bubble swells with its own frequency band,
//                   calmly (slow, small swells) or aggressively (jolts outward and tilts)
//   heroSpectrum()  the image taken apart: the bubbles in a row, low to high pitch

import { el, svgEl } from '../lib/dom.js';
import { reducedMotion } from '../lib/motion.js';
import { onBands, logBands } from '../audio/level-meter.js';
import { loadHero } from './talasaman-hero.js';

/**
 * A container that fills itself with `build(hero)` once the image has loaded,
 * and an `isLive()` check: false once it has been taken off the page.
 */
function heroFigure(className, label, build) {
  const figure = el('div', { className: `hero-viz ${className}`, role: 'img', ariaLabel: label });
  let shown = false;
  const isLive = () => {
    if (figure.isConnected) shown = true;
    return figure.isConnected || !shown;
  };
  loadHero()
    .then((hero) => figure.replaceChildren(build(hero, isLive)))
    .catch((err) => figure.replaceChildren(el('p', { className: 'error' }, err.message)));
  return figure;
}

/** The hero as one SVG: bubble paths (returned for animating) and its lettering. */
function heroSvg(hero) {
  const bubbles = hero.bubbles.map(({ d }) => svgEl('path', { d, class: 'hero-viz-bubble' }));
  const lines = hero.lines.map((g) => g.cloneNode(true));
  lines.forEach((g) => { g.removeAttribute('style'); g.setAttribute('class', 'hero-viz-line'); });
  const svg = svgEl('svg', { viewBox: hero.viewBox, 'aria-hidden': 'true' },
    svgEl('g', {}, ...bubbles),
    svgEl('g', { class: 'hero-viz-lettering' }, ...lines));
  return { svg, bubbles };
}

/** Follow `subscribe(callback)` until the figure leaves the page. */
function whileLive(isLive, subscribe, callback) {
  const stop = subscribe((...args) => {
    if (!isLive()) return stop();
    if (!reducedMotion.matches) callback(...args);
  });
}

const scale = (node, amount) => { node.style.transform = `scale(${amount})`; };

/** The bounding box of a path, measured off-screen. */
function boxOf(d) {
  const probe = svgEl('svg', { class: 'measure' }, svgEl('path', { d }));
  document.body.append(probe);
  const box = probe.firstChild.getBBox();
  probe.remove();
  return box;
}

/** A viewBox that frames one path with some room around it. */
function viewBoxAround(d) {
  const b = boxOf(d);
  const pad = Math.max(b.width, b.height) * 0.18;
  return `${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`;
}

/**
 * How each chorus moves. `follow` is the share of the way to the band's
 * level covered each frame (lower = smoother, slower); `swell` how much
 * bigger a bubble gets at full level; `push` how far (in image units) it
 * jolts outward from the middle; `tilt` how many degrees it turns.
 */
const MOODS = {
  calm: { follow: 0.06, swell: 0.07, push: 0, tilt: 0 },
  aggressive: { follow: 1, swell: 0.3, push: 45, tilt: 9 },
};

/** Where each bubble sits relative to the middle of the image, as a unit direction. */
function outwardDirections(hero) {
  const boxes = hero.bubbles.map(({ d }) => boxOf(d));
  const centre = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  const [mx, my] = boxes.map(centre).reduce(([ax, ay], [x, y]) => [ax + x / boxes.length, ay + y / boxes.length], [0, 0]);
  return boxes.map((b) => {
    const [x, y] = centre(b);
    const length = Math.hypot(x - mx, y - my) || 1;
    return [(x - mx) / length, (y - my) / length];
  });
}

/**
 * The whole image; bubble i swells with the i-th band, low to high pitch.
 * @param {{ mood?: 'calm' | 'aggressive' }} [options]
 */
export function heroChorus({ mood = 'calm' } = {}) {
  const { follow, swell, push, tilt } = MOODS[mood];
  return heroFigure(`hero-chorus hero-${mood}`, `The talasaman.is image, each bubble moving ${mood === 'calm' ? 'calmly' : 'aggressively'} with its own pitch range`, (hero, isLive) => {
    const { svg, bubbles } = heroSvg(hero);
    const directions = outwardDirections(hero);
    const shown = bubbles.map(() => 0);
    whileLive(isLive, (fn) => onBands(logBands(bubbles.length), fn), (values) =>
      bubbles.forEach((b, i) => {
        shown[i] += (values[i] - shown[i]) * follow;
        const v = shown[i], [dx, dy] = directions[i];
        const turn = (i % 2 ? 1 : -1) * tilt * v; // neighbours tilt opposite ways
        b.style.transform = `translate(${dx * push * v}px, ${dy * push * v}px) rotate(${turn}deg) scale(${1 + swell * v})`;
      }));
    return svg;
  });
}

/** The image taken apart: one cell per bubble, each moving with its band, named. */
export function heroSpectrum() {
  return heroFigure('hero-spectrum', 'The eleven bubbles of the talasaman.is image in a row, each moving with its pitch range', (hero, isLive) => {
    const bands = logBands(hero.bubbles.length);
    const cells = hero.bubbles.map(({ d, name }, i) => {
      const bubble = svgEl('path', { d, class: 'hero-viz-bubble' });
      const svg = svgEl('svg', { viewBox: viewBoxAround(d), 'aria-hidden': 'true' }, bubble);
      const [lo, hi] = bands[i].map((f) => (f >= 1000 ? `${(f / 1000).toFixed(1)}k` : Math.round(f)));
      const cell = el('figure', { className: 'hero-cell' }, svg,
        el('figcaption', {}, el('span', {}, `${i + 1}. ${name}`), el('span', { className: 'hero-band' }, `${lo}–${hi} Hz`)));
      return { cell, bubble };
    });
    whileLive(isLive, (fn) => onBands(bands, fn), (values) =>
      cells.forEach(({ bubble }, i) => scale(bubble, 0.55 + 0.5 * values[i])));
    return el('div', { className: 'hero-cells' }, ...cells.map((c) => c.cell));
  });
}
