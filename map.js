// Choropleth of circle members per póstnúmer, drawn as plain SVG.
// Polygons: Byggðastofnun/LMÍ póstnúmer layer, simplified with mapshaper.

const SVG_NS = 'http://www.w3.org/2000/svg';
const COS_LAT = Math.cos((65 * Math.PI) / 180);

// Bins for a heavily skewed count (most areas 0, a few 40–70).
const BINS = [
  { min: 1, max: 2 },
  { min: 3, max: 5 },
  { min: 6, max: 10 },
  { min: 11, max: 20 },
  { min: 21, max: 40 },
  { min: 41, max: Infinity },
];

// Höfuðborgarsvæðið, lon/lat.
const CAPITAL_BOX = { west: -22.08, east: -21.6, south: 63.98, north: 64.2 };

let geoPromise;
function loadGeo() {
  geoPromise ??= fetch('postnumer.geojson').then((r) => {
    if (!r.ok) throw new Error(`postnumer.geojson: HTTP ${r.status}`);
    return r.json();
  });
  return geoPromise;
}

export const project = ([lon, lat]) => [lon * COS_LAT, -lat];

function binIndex(count) {
  if (!count) return -1;
  return BINS.findIndex((b) => count >= b.min && count <= b.max);
}

export function pathFor(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let d = '';
  for (const polygon of polygons) {
    for (const ring of polygon) {
      d += ring.map((pt, i) => (i ? 'L' : 'M') + project(pt).map((v) => v.toFixed(4)).join(',')).join('') + 'Z';
    }
  }
  return d;
}

function bboxOf(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const polygon of polygons) {
    for (const [lon, lat] of polygon[0]) {
      west = Math.min(west, lon); east = Math.max(east, lon);
      south = Math.min(south, lat); north = Math.max(north, lat);
    }
  }
  return { west, east, south, north };
}

const intersects = (a, b) =>
  a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;

function viewBoxFor(box) {
  const [x0, y0] = project([box.west, box.north]);
  const [x1, y1] = project([box.east, box.south]);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function drawMap(features, box, { label, outline } = {}) {
  const vb = viewBoxFor(box);
  const svg = svgEl('svg', {
    viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    class: 'map',
    role: 'img',
    'aria-label': label,
  });
  // Stroke widths are in screen pixels regardless of zoom.
  for (const f of features) {
    if (!intersects(f.bbox, box)) continue;
    const path = svgEl('path', {
      d: f.d,
      class: f.bin < 0 ? 'area empty' : `area bin-${f.bin}`,
      'vector-effect': 'non-scaling-stroke',
    });
    path.dataset.key = f.key;
    svg.append(path);
  }
  if (outline) {
    const o = viewBoxFor(outline);
    svg.append(svgEl('rect', {
      x: o.x, y: o.y, width: o.w, height: o.h,
      class: 'inset-outline',
      'vector-effect': 'non-scaling-stroke',
    }));
  }
  return svg;
}

function legend() {
  const wrap = document.createElement('div');
  wrap.className = 'legend';
  const items = [{ cls: 'empty', text: '0' }, ...BINS.map((b, i) => ({
    cls: `bin-${i}`,
    text: b.max === Infinity ? `${b.min}+` : b.min === b.max ? `${b.min}` : `${b.min}–${b.max}`,
  }))];
  for (const { cls, text } of items) {
    const item = document.createElement('span');
    const swatch = document.createElement('span');
    swatch.className = `swatch ${cls}`;
    item.append(swatch, text);
    wrap.append(item);
  }
  return wrap;
}

export async function renderCirclesMap(rows, buildTable) {
  const geo = await loadGeo();

  const members = new Map();
  for (const r of rows) {
    if (r.parentSlug === 'postnumer' && /^\d{3}$/.test(r.slug)) members.set(Number(r.slug), r);
  }

  const features = geo.features.map((f, i) => {
    const code = f.properties.postnumer;
    const row = members.get(code);
    const count = row?.memberCount ?? 0;
    return {
      key: String(i),
      code,
      name: row?.name ?? (code ? `${code} ${f.properties.stadur}` : 'Ekkert póstnúmer'),
      count,
      bin: binIndex(count),
      d: pathFor(f.geometry),
      bbox: bboxOf(f.geometry),
    };
  });
  const byKey = new Map(features.map((f) => [f.key, f]));

  const all = features.reduce((b, f) => ({
    west: Math.min(b.west, f.bbox.west), east: Math.max(b.east, f.bbox.east),
    south: Math.min(b.south, f.bbox.south), north: Math.max(b.north, f.bbox.north),
  }), { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity });

  const mapped = new Set(features.map((f) => f.code));
  const unmapped = [...members.values()].filter((r) => r.memberCount && !mapped.has(Number(r.slug)));
  const total = [...members.values()].reduce((s, r) => s + r.memberCount, 0);

  const root = document.createElement('div');
  root.className = 'viz';

  const caption = document.createElement('p');
  caption.className = 'caption';
  caption.textContent = `Members by home postcode — ${total.toLocaleString('is-IS')} people in total.`;
  if (unmapped.length) {
    caption.textContent += ' Not on the map (PO-box codes with no area): ' +
      unmapped.map((r) => `${r.name} (${r.memberCount})`).join(', ') + '.';
  }

  const maps = document.createElement('div');
  maps.className = 'maps';
  const country = document.createElement('figure');
  country.append(drawMap(features, all, { label: 'Iceland by postcode', outline: CAPITAL_BOX }));
  const capital = document.createElement('figure');
  const capTitle = document.createElement('figcaption');
  capTitle.textContent = 'Höfuðborgarsvæðið';
  capital.append(capTitle, drawMap(features, CAPITAL_BOX, { label: 'Capital area by postcode' }));
  maps.append(country, capital);

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.hidden = true;

  maps.addEventListener('pointermove', (e) => {
    const f = byKey.get(e.target.dataset?.key);
    for (const p of maps.querySelectorAll('.area.hover')) p.classList.remove('hover');
    if (!f) { tooltip.hidden = true; return; }
    for (const p of maps.querySelectorAll(`[data-key="${f.key}"]`)) p.classList.add('hover');
    tooltip.replaceChildren();
    const name = document.createElement('strong');
    name.textContent = f.name;
    tooltip.append(name, document.createElement('br'),
      `${f.count.toLocaleString('is-IS')} ${f.count === 1 ? 'person' : 'people'}`);
    tooltip.hidden = false;
    const box = root.getBoundingClientRect();
    tooltip.style.left = `${e.clientX - box.left + 14}px`;
    tooltip.style.top = `${e.clientY - box.top + 14}px`;
  });
  maps.addEventListener('pointerleave', () => {
    tooltip.hidden = true;
    for (const p of maps.querySelectorAll('.area.hover')) p.classList.remove('hover');
  });

  const tableToggle = document.createElement('details');
  tableToggle.className = 'table-toggle';
  const tableSummary = document.createElement('summary');
  tableSummary.textContent = 'Show table';
  tableToggle.append(tableSummary, buildTable(rows));

  const credit = document.createElement('p');
  credit.className = 'caption';
  credit.textContent = 'Póstnúmeramörk: Byggt á gögnum frá Byggðastofnun.';

  root.append(caption, legend(), maps, tooltip, credit, tableToggle);
  return root;
}
