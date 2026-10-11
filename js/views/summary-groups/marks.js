// The tone marks shared by the Groups views, like Samtal's: ▲ positive,
// ● neutral, ▼ critical (TONES in data.js). Shape and a word carry the tone;
// colour only helps. Also the summary tooltip the map and the strips share.

import { el, svgEl } from '../../lib/dom.js';
import { excerpt } from '../../lib/format.js';
import { keepInside } from '../../components/tooltip.js';
import { TONES, toneOf } from './data.js';

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
  return TONES.map(({ key, glyph, label }) => `${glyph} ${counts[key]} ${label}`).join(' · ');
}

/** { positive, neutral, critical } counts of a list of summaries. */
export function countTones(summaries) {
  const counts = Object.fromEntries(TONES.map(({ key }) => [key, 0]));
  for (const s of summaries) counts[s.tone]++;
  return counts;
}

/** Show a summary in a tooltip (topic, tone, the first 200 characters) at `point` ({ clientX, clientY }). */
export function showSummaryTip(tooltip, point, summary, container) {
  const { glyph, label } = toneOf(summary.tone);
  tooltip.show(point, `${summary.topic} · ${glyph} ${label}`, excerpt(summary.text));
  keepInside(tooltip.element, container);
}
