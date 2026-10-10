// Circle members per póstnúmer as a choropleth: the whole country, plus a
// zoomed map of the capital area where most people live.
// Polygons: Byggðastofnun/LMÍ póstnúmer layer (data/postnumer.geojson).

import { el, svgEl, removeClassWithin } from '../../lib/dom.js';
import { loadJsonOnce } from '../../lib/data.js';
import { pathFor, bboxOf, unionOf, intersects, frameOf, viewBoxAttr } from '../../lib/geo.js';
import { formatNumber, people } from '../../lib/format.js';
import { legend } from '../../components/legend.js';
import { createTooltip } from '../../components/tooltip.js';

// Bins for a heavily skewed count (most areas 0, a few 40–70). Their colours
// are --bin-0 … --bin-5 in css/tokens.css.
const BINS = [
  { min: 1, max: 2 },
  { min: 3, max: 5 },
  { min: 6, max: 10 },
  { min: 11, max: 20 },
  { min: 21, max: 40 },
  { min: 41, max: Infinity },
];

const CAPITAL_BOX = { west: -22.08, east: -21.6, south: 63.98, north: 64.2 }; // höfuðborgarsvæðið

/** Bin index for a member count; -1 for nobody. */
const binIndex = (count) => (count ? BINS.findIndex((b) => count >= b.min && count <= b.max) : -1);

const binLabel = ({ min, max }) => (max === Infinity ? `${min}+` : min === max ? `${min}` : `${min}–${max}`);

/** Postcode rings by number, from the circles rows. */
function postcodeRows(rows) {
  const byCode = new Map();
  for (const r of rows) {
    if (r.parentSlug === 'postnumer' && /^\d{3}$/.test(r.slug)) byCode.set(Number(r.slug), r);
  }
  return byCode;
}

/** One drawable area per polygon, with its name, count and bin. */
function toAreas(geo, byCode) {
  return geo.features.map((f, i) => {
    const code = f.properties.postnumer;
    const row = byCode.get(code);
    const count = row?.memberCount ?? 0;
    return {
      key: String(i),
      name: row?.name ?? (code ? `${code} ${f.properties.stadur}` : 'Ekkert póstnúmer'),
      code,
      count,
      bin: binIndex(count),
      d: pathFor(f.geometry),
      bbox: bboxOf(f.geometry),
    };
  });
}

/** An SVG map of the areas inside `box`, optionally outlining another box. */
function drawMap(areas, box, { label, outline } = {}) {
  const svg = svgEl('svg', { viewBox: viewBoxAttr(frameOf(box)), class: 'map', role: 'img', 'aria-label': label });
  for (const a of areas.filter((a) => intersects(a.bbox, box))) {
    const path = svgEl('path', {
      d: a.d,
      class: a.bin < 0 ? 'area empty' : `area bin-${a.bin}`,
      'vector-effect': 'non-scaling-stroke',
    });
    path.dataset.key = a.key;
    svg.append(path);
  }
  if (outline) {
    const { x, y, w, h } = frameOf(outline);
    svg.append(svgEl('rect', { x, y, width: w, height: h, class: 'inset-outline', 'vector-effect': 'non-scaling-stroke' }));
  }
  return svg;
}

/** Highlight an area in every map and show its name and count while hovered. */
function attachHover(maps, areas, tooltip) {
  const byKey = new Map(areas.map((a) => [a.key, a]));
  maps.addEventListener('pointermove', (e) => {
    const area = byKey.get(e.target.dataset?.key);
    removeClassWithin(maps, 'hover');
    if (!area) return tooltip.hide();
    for (const path of maps.querySelectorAll(`[data-key="${area.key}"]`)) path.classList.add('hover');
    tooltip.show(e, area.name, people(area.count));
  });
  maps.addEventListener('pointerleave', () => {
    tooltip.hide();
    removeClassWithin(maps, 'hover');
  });
}

/** The caption: total, plus any postcodes with members but no polygon (PO boxes). */
function caption(byCode, areas) {
  const mapped = new Set(areas.map((a) => a.code));
  const rows = [...byCode.values()];
  const total = rows.reduce((sum, r) => sum + r.memberCount, 0);
  const unmapped = rows.filter((r) => r.memberCount && !mapped.has(Number(r.slug)));
  let text = `Members by home postcode — ${formatNumber(total)} people in total.`;
  if (unmapped.length) {
    text += ' Not on the map (PO-box codes with no area): ' +
      unmapped.map((r) => `${r.name} (${r.memberCount})`).join(', ') + '.';
  }
  return el('p', { className: 'caption' }, text);
}

/** The choropleth of members per postcode, from the circles rows. */
export async function renderPostcodeMap(rows) {
  const geo = await loadJsonOnce('data/postnumer.geojson');
  const byCode = postcodeRows(rows);
  const areas = toAreas(geo, byCode);
  const country = unionOf(areas.map((a) => a.bbox));

  const maps = el('div', { className: 'maps' },
    el('figure', {}, drawMap(areas, country, { label: 'Iceland by postcode', outline: CAPITAL_BOX })),
    el('figure', {},
      el('figcaption', {}, 'Höfuðborgarsvæðið'),
      drawMap(areas, CAPITAL_BOX, { label: 'Capital area by postcode' })));

  const tooltip = createTooltip();
  attachHover(maps, areas, tooltip);

  const legendItems = [{ swatch: 'empty', label: '0' }, ...BINS.map((b, i) => ({ swatch: `bin-${i}`, label: binLabel(b) }))];
  return el('div', { className: 'viz' },
    caption(byCode, areas),
    legend(legendItems),
    maps,
    tooltip.element,
    el('p', { className: 'caption' }, 'Póstnúmeramörk: Byggt á gögnum frá Byggðastofnun.'));
}
