// A radial bar chart: one ring per item, the largest on the outside, each
// an arc whose length is its share of the largest (the largest sweeps 95% of
// the circle, clockwise from twelve o'clock). The names sit at the start of
// their ring, outlined in the page colour so they read over the bar ends. A
// tooltip names the hovered ring; a table elsewhere on the page carries the
// same numbers for screen readers, so the chart itself is one labelled image.
// The chart scales with its width, but its text stays 13 px on screen.

import { el, svgEl } from '../lib/dom.js';
import { formatNumber } from '../lib/format.js';
import { createTooltip } from './tooltip.js';

const SWEEP = 342;   // degrees the largest sweeps: 95% of the circle
const RING = 22;     // distance between ring centres (chart units)
const THICKNESS = 14; // stroke width of a ring
const HOLE = 70;     // radius of the empty middle
const LABEL_GAP = 8; // between a name and its ring's start

/** The point at `angle` degrees clockwise from twelve o'clock on a circle of radius r. */
function pointAt(r, angle) {
  const rad = (angle * Math.PI) / 180;
  return [r * Math.sin(rad), -r * Math.cos(rad)];
}

/** SVG path data for an arc of radius r from twelve o'clock, `angle` degrees clockwise. */
export function arcPath(r, angle) {
  const [x0, y0] = pointAt(r, 0);
  const [x1, y1] = pointAt(r, Math.max(angle, 0.5)); // a sliver still shows
  return `M${x0},${y0} A${r},${r} 0 ${angle > 180 ? 1 : 0} 1 ${x1},${y1}`;
}

/** Ring radius for item i (0 = largest, outermost) of n. */
const radiusOf = (i, n) => HOLE + (n - i - 0.5) * RING;

/** One ring: the bar, and the name at its start. */
function ring({ name, count }, i, n, max) {
  const r = radiusOf(i, n);
  const bar = svgEl('path', { d: arcPath(r, (SWEEP * count) / max), class: 'radial-bar' });
  return svgEl('g', { class: 'radial-ring' },
    bar,
    svgEl('text', { x: -LABEL_GAP, y: -r, class: 'radial-label', 'dominant-baseline': 'middle' },
      `${name} · ${formatNumber(count)}`));
}

/** The note in the empty middle, one line per item of `lines`, centred as a block. */
function centreNote(lines) {
  const tspans = lines.map((line, i) =>
    svgEl('tspan', { x: 0, dy: i ? '1.2em' : `${-0.6 * (lines.length - 1)}em` }, line));
  return svgEl('text', { x: 0, y: 0, class: 'radial-centre', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, ...tspans);
}

/**
 * Keep the chart's text the same size on screen at any width: the CSS sizes
 * it in chart units times --radial-unit, the chart units per screen px.
 */
function keepTextSize(figure, svg, side) {
  new ResizeObserver(() => {
    const width = svg.getBoundingClientRect().width;
    if (width) figure.style.setProperty('--radial-unit', String(side / width));
  }).observe(svg);
}

/**
 * @param {Array<{ name: string, count: number }>} items largest first
 * @param {object} options
 * @param {string} options.label the chart's accessible name
 * @param {string|string[]} [options.centre] a short note for the empty middle (an array: one line each)
 * @param {string} [options.unit] what a count counts, for the tooltip ("summaries")
 * @returns {HTMLElement}
 */
export function radialBars(items, { label, centre = '', unit = '' }) {
  const n = items.length;
  const max = Math.max(...items.map((i) => i.count));
  const outer = radiusOf(-0.5, n);
  const rings = items.map((item, i) => ring(item, i, n, max));
  const side = 2 * outer + 8; // the rings plus a little room for the round caps
  const svg = svgEl('svg', { viewBox: `${-outer - 4} ${-outer - 4} ${side} ${side}`, class: 'radial-bars', role: 'img', 'aria-label': label },
    ...rings,
    centreNote([centre].flat()));

  const tooltip = createTooltip();
  rings.forEach((g, i) => {
    g.addEventListener('pointermove', (e) => tooltip.show(e, items[i].name, `${formatNumber(items[i].count)} ${unit}`.trim()));
    g.addEventListener('pointerleave', tooltip.hide);
  });
  const figure = el('div', { className: 'radial-figure' }, svg, tooltip.element);
  keepTextSize(figure, svg, side);
  return figure;
}
