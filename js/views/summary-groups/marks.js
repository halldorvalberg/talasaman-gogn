// The tone marks shared by the Groups views, like Samtal's: ▲ positive,
// ● neutral, ▼ critical. Shape and a word carry the tone; colour only helps.

import { el, svgEl } from '../../lib/dom.js';
import { toneOf, excerpt } from './data.js';

/**
 * An SVG mark for a tone centred on (x, y).
 * @param {number} r half the mark's width, px
 */
export function toneMark(tone, x, y, r) {
  const className = `tone-mark tone-${tone}`;
  if (tone === 'neutral') return svgEl('circle', { cx: x, cy: y, r: r * 0.85, class: className });
  const up = tone === 'positive' ? -1 : 1; // apex up for positive, down for critical
  const tip = y + up * r * 1.1;
  const base = y - up * r * 0.75;
  return svgEl('path', { d: `M${x},${tip}L${x + r},${base}L${x - r},${base}Z`, class: className });
}

/** The tone as a coloured glyph for screen and its word for screen readers. */
export function toneGlyph(tone) {
  const { glyph, label } = toneOf(tone);
  return el('span', { className: 'tone-glyph-wrap' },
    el('span', { className: `tone-glyph tone-${tone}`, ariaHidden: 'true' }, glyph),
    el('span', { className: 'visually-hidden' }, label));
}

/** "▲ 4 positive · ● 1 neutral · ▼ 2 critical" as text, for counts { positive, neutral, critical }. */
export function toneCountsText(counts) {
  return ['positive', 'neutral', 'critical']
    .map((key) => `${toneOf(key).glyph} ${counts[key]} ${toneOf(key).label}`).join(' · ');
}

/** { positive, neutral, critical } counts of a list of summaries. */
export function countTones(summaries) {
  const counts = { positive: 0, neutral: 0, critical: 0 };
  for (const s of summaries) counts[s.tone]++;
  return counts;
}

/**
 * Keep a tooltip box inside its container: shift it left when it would run
 * past the right edge (the shared tooltip places it right of the pointer).
 */
export function keepInside(box, container) {
  const room = container.clientWidth - box.offsetWidth;
  if (box.offsetLeft > room) box.style.left = `${Math.max(0, room)}px`;
}

/** Show a summary in a tooltip (topic, tone, the first 200 characters) at `point` ({ clientX, clientY }). */
export function showSummaryTip(tooltip, point, summary, container) {
  const { glyph, label } = toneOf(summary.tone);
  tooltip.show(point, `${summary.topic} · ${glyph} ${label}`, excerpt(summary.text));
  keepInside(tooltip.element, container);
}

/** The middle of an element on screen, as a pointer-like point for the tooltip. */
export function centreOf(node) {
  const box = node.getBoundingClientRect();
  return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
}
