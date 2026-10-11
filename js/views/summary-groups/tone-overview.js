// Summaries › Groups, "Tone across topics": one row per topic, every summary
// a mark on a shared critical ← → positive axis (its standardised tone score
// from data/summary-groups.json), stacked as a beeswarm so none hide. The
// shaded middle is the neutral band. Each row's name is a button that picks
// the topic; its counts per tone are written out beside it.

import { el, svgEl } from '../../lib/dom.js';
import { createTooltip } from '../../components/tooltip.js';
import { formatNumber } from '../../lib/format.js';
import { clamp } from '../../lib/math.js';
import { linear, swarm } from './layout.js';
import { toneMark, toneCountsText, countTones, showSummaryTip } from './marks.js';

const DOMAIN = 3;       // the axis runs from −3 to +3 standard deviations
const NEUTRAL = 0.6;    // the neutral band, as in the script (NEUTRAL_BAND)
const RADIUS = 5;       // half a mark's width, px
const GAP = 1.5;        // px between marks in the swarm
const PAD = 8;          // px at the ends of a strip

/** One topic's strip: the neutral band, the middle line and a mark per summary. */
function strip(summaries, width, onMark) {
  const x = linear(-DOMAIN, DOMAIN, PAD, width - PAD);
  const xs = summaries.map((s) => x(clamp(s.toneScore, -DOMAIN, DOMAIN)));
  const offsets = swarm(xs, 2 * RADIUS + GAP);
  const reach = Math.max(0, ...offsets.map(Math.abs)) + RADIUS + 3;
  const height = Math.max(2 * reach, 28);
  const mid = height / 2;
  const marks = summaries.map((s, i) => {
    const node = toneMark(s.tone, xs[i], mid + offsets[i], RADIUS);
    onMark(node, s);
    return node;
  });
  return svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'tone-strip', 'aria-hidden': 'true' },
    svgEl('rect', { x: x(-NEUTRAL), y: 0, width: x(NEUTRAL) - x(-NEUTRAL), height, class: 'neutral-band' }),
    svgEl('line', { x1: x(0), x2: x(0), y1: 0, y2: height, class: 'mid-line' }),
    ...marks);
}

/** A topic row's heading: the pick button and the counts written out. */
function rowHead(topic, members, onPick) {
  const button = el('button', { className: 'sg-row-pick', type: 'button' },
    `${topic.name} · ${formatNumber(topic.count)}`);
  button.addEventListener('click', () => onPick(topic.name));
  return el('div', { className: 'sg-row-head' }, button,
    el('span', { className: 'sg-row-counts' }, toneCountsText(countTones(members))));
}

/** The header row: the axis's ends and middle, in words. */
const axisRow = () => el('div', { className: 'sg-row sg-axis-row', ariaHidden: 'true' }, el('span'),
  el('div', { className: 'sg-axis' },
    el('span', {}, '← more critical'), el('span', {}, 'neutral'), el('span', {}, 'more positive →')));

/** One topic's row, with an empty holder its strip is drawn into (it needs the width). */
function topicRow(topic, summaries, onPick) {
  const members = summaries.filter((s) => s.topic === topic.name);
  const holder = el('div', { className: 'sg-row-strip' });
  const row = el('div', { className: 'sg-row' }, rowHead(topic, members, onPick), holder);
  return { topic, members, holder, row };
}

/**
 * @param {object[]} topics from the groups file, in order
 * @param {object[]} summaries every summary with its topic, tone and toneScore
 * @param {(topic: string) => void} onPick called when a row's name is pressed
 */
export function toneOverview(topics, summaries, onPick) {
  const tooltip = createTooltip();
  tooltip.element.classList.add('sg-tooltip');
  const rows = topics.map((topic) => topicRow(topic, summaries, onPick));
  const figure = el('div', { className: 'viz sg-tone' }, axisRow(), ...rows.map((r) => r.row), tooltip.element);
  const onMark = (node, s) => {
    node.addEventListener('pointerenter', (e) => showSummaryTip(tooltip, e, s, figure));
    node.addEventListener('pointerleave', tooltip.hide);
  };

  return {
    element: figure,
    /** Mark the chosen topic's row. */
    select(name) {
      for (const { topic, row } of rows) {
        row.classList.toggle('is-selected', topic.name === name);
        row.querySelector('button').setAttribute('aria-pressed', String(topic.name === name));
      }
    },
    /** Draw every strip at its holder's current width. */
    redraw() {
      for (const { members, holder } of rows) {
        if (holder.clientWidth) holder.replaceChildren(strip(members, holder.clientWidth, onMark));
      }
    },
  };
}
