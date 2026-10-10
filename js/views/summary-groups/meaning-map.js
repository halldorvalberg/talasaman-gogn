// Summaries › Groups, "Map of meaning": every summary as a mark placed by
// what it says (PCA of the tone-removed LaBSE vectors, from
// data/summary-groups.json), shaped and coloured by tone. One topic is
// highlighted at a time and the rest fade back. Pointer: hover a mark.
// Keyboard: focus the map and step through the highlighted topic's
// summaries with the arrow keys; each is read out and shown in the tooltip.

import { el, svgEl } from '../../lib/dom.js';
import { createTooltip } from '../../components/tooltip.js';
import { toneOf } from './data.js';
import { linear, clamp } from './layout.js';
import { toneMark, showSummaryTip, centreOf } from './marks.js';

const PAD = 14;       // px round the plot, so edge marks stay whole
const RADIUS = 6;     // half a mark's width, px
const HIT = 11;       // radius of the invisible hit area round a mark, px

/** Plot height for a width: wide and short on desktop, near square on a phone. */
const heightFor = (width) => Math.round(clamp(width * 0.6, 300, 560));

/** One summary's mark with a larger invisible hit circle. */
function markFor(summary, x, y) {
  return svgEl('g', { class: 'map-mark' },
    svgEl('circle', { cx: x, cy: y, r: HIT, class: 'hit' }),
    toneMark(summary.tone, x, y, RADIUS));
}

/** Short spoken description of a summary for the live region. */
function spoken(summary, n, total) {
  return `${n} of ${total}. ${summary.topic}, ${toneOf(summary.tone).label}. ${summary.text}`;
}

/**
 * @param {Array} summaries every summary ({ id, topic, tone, x, y, text })
 * @returns {{ element: HTMLElement, select(topic: string): void, redraw(): void }}
 */
export function meaningMap(summaries) {
  const svg = svgEl('svg', { class: 'meaning-map', tabindex: 0, role: 'group' });
  const live = el('p', { className: 'visually-hidden', ariaLive: 'polite' });
  const tooltip = createTooltip();
  tooltip.element.classList.add('sg-tooltip');
  const figure = el('div', { className: 'viz sg-map' }, svg, tooltip.element, live);
  let topic = null;
  let marks = []; // { summary, node } in drawing order
  let focused = -1;

  /** The highlighted topic's marks, left to right: the keyboard's stepping order. */
  const steps = () => marks.filter((m) => m.summary.topic === topic)
    .sort((a, b) => a.summary.x - b.summary.x || a.summary.y - b.summary.y);

  function draw() {
    const width = figure.clientWidth;
    if (!width) return;
    const height = heightFor(width);
    const sx = linear(0, 1, PAD, width - PAD);
    const sy = linear(0, 1, height - PAD, PAD);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    marks = summaries.map((summary) => ({ summary, node: markFor(summary, sx(summary.x), sy(summary.y)) }));
    marks.forEach(({ summary, node }) => {
      node.addEventListener('pointerenter', (e) => showSummaryTip(tooltip, e, summary, figure));
      node.addEventListener('pointerleave', tooltip.hide);
    });
    svg.replaceChildren(...marks.map((m) => m.node));
    highlight();
  }

  /** Fade every topic but the chosen one and draw its marks on top. */
  function highlight() {
    for (const { summary, node } of marks) node.classList.toggle('is-dim', summary.topic !== topic);
    svg.append(...marks.filter((m) => m.summary.topic === topic).map((m) => m.node));
    const n = marks.filter((m) => m.summary.topic === topic).length;
    svg.setAttribute('aria-label', `Map of meaning: ${summaries.length} summaries, ${n} about ${topic} highlighted. Use the arrow keys to read them one by one.`);
  }

  /** Move keyboard focus to the i-th highlighted summary (wrapping). */
  function focusStep(i) {
    const list = steps();
    if (!list.length) return;
    focused = (i + list.length) % list.length;
    svg.querySelector('.is-focused')?.classList.remove('is-focused');
    const { summary, node } = list[focused];
    node.classList.add('is-focused');
    showSummaryTip(tooltip, centreOf(node), summary, figure);
    live.textContent = spoken(summary, focused + 1, list.length);
  }

  const KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  svg.addEventListener('keydown', (e) => {
    if (e.key in KEYS) focusStep(focused < 0 && KEYS[e.key] < 0 ? -1 : focused + KEYS[e.key]);
    else if (e.key === 'Home') focusStep(0);
    else if (e.key === 'End') focusStep(-1);
    else if (e.key === 'Escape') tooltip.hide();
    else return;
    e.preventDefault();
  });
  svg.addEventListener('blur', () => {
    tooltip.hide();
    svg.querySelector('.is-focused')?.classList.remove('is-focused');
  });

  return {
    element: figure,
    select(name) {
      topic = name;
      focused = -1;
      highlight();
    },
    redraw: draw,
  };
}
