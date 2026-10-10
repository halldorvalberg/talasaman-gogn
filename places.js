// Favourite places as pins on a plain map of Iceland: coastline, glaciers,
// lakes and the large rivers. Base map: LMÍ IS 50V, simplified with mapshaper.

import { project, pathFor } from './map.js';

const PAD = 0.15; // degrees around the coastline bbox
const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAW_ORDER = ['glacier', 'lake', 'river', 'coast'];

let basePromise;
function loadBase() {
  basePromise ??= fetch('iceland.geojson').then((r) => {
    if (!r.ok) throw new Error(`iceland.geojson: HTTP ${r.status}`);
    return r.json();
  });
  return basePromise;
}

function extentOf(features) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const f of features) {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons) {
      for (const [lon, lat] of polygon[0]) {
        west = Math.min(west, lon); east = Math.max(east, lon);
        south = Math.min(south, lat); north = Math.max(north, lat);
      }
    }
  }
  return { west: west - PAD, east: east + PAD, south: south - PAD, north: north + PAD };
}

const inside = (box, { lat, lng }) =>
  lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export async function renderPlacesMap(rows, buildTable) {
  const base = await loadBase();
  const coast = base.features.filter((f) => f.properties.kind === 'coast');
  const box = extentOf(coast);
  const [x0, y0] = project([box.west, box.north]);
  const [x1, y1] = project([box.east, box.south]);
  const w = x1 - x0, h = y1 - y0;

  // ---- Base map ----
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
  svg.setAttribute('class', 'basemap');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Map of Iceland with glaciers, lakes and rivers');
  for (const kind of DRAW_ORDER) {
    for (const f of base.features) {
      if (f.properties.kind !== kind) continue;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathFor(f.geometry));
      path.setAttribute('class', kind);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(path);
    }
  }

  // ---- Pins ----
  const onMap = rows.filter((r) => inside(box, r));
  const offMap = rows.filter((r) => !inside(box, r));

  // Coordinates are rounded to ~1 km, so several places can share a point.
  // Fan those out on a small sunflower spiral so each pin stays reachable.
  const seen = new Map();
  const pins = onMap
    .map((r) => {
      const key = `${r.lat},${r.lng}`;
      const i = seen.get(key) ?? 0;
      seen.set(key, i + 1);
      const [px, py] = project([r.lng, r.lat]);
      const angle = i * 2.39996; // golden angle
      const radius = i ? 5 * Math.sqrt(i) : 0; // px
      return {
        row: r,
        left: ((px - x0) / w) * 100,
        top: ((py - y0) / h) * 100,
        dx: Math.cos(angle) * radius,
        dy: Math.sin(angle) * radius,
      };
    })
    .sort((a, b) => a.top - b.top); // southern pins on top

  const stage = el('div', { className: 'places-stage' });
  stage.style.aspectRatio = `${w} / ${h}`;
  stage.append(svg);

  const flag = el('div', { className: 'flag', hidden: true, role: 'dialog' });
  let openPin = null;

  function closeFlag() {
    flag.hidden = true;
    openPin?.classList.remove('open');
    openPin?.setAttribute('aria-expanded', 'false');
    openPin = null;
  }

  function openFlag(pin, p) {
    if (openPin === pin) return closeFlag();
    closeFlag();
    openPin = pin;
    pin.classList.add('open');
    pin.setAttribute('aria-expanded', 'true');

    const close = el('button', { className: 'flag-close', title: 'Close', ariaLabel: 'Close' }, '×');
    close.addEventListener('click', closeFlag);
    flag.replaceChildren(
      close,
      el('h3', {}, p.row.place),
      el('p', {}, p.row.reason || '—'),
    );

    // Hang the flag off the pin head; flip near the right and top edges.
    flag.classList.toggle('flip-x', p.left > 62);
    flag.classList.toggle('flip-y', p.top < 35);
    flag.style.left = `calc(${p.left}% + ${p.dx}px)`;
    flag.style.top = `calc(${p.top}% + ${p.dy}px)`;
    flag.hidden = false;
    close.focus({ preventScroll: true });
  }

  for (const p of pins) {
    const pin = el('button', { className: 'pin', ariaLabel: p.row.place, title: p.row.place });
    pin.setAttribute('aria-expanded', 'false');
    pin.style.left = `calc(${p.left}% + ${p.dx}px)`;
    pin.style.top = `calc(${p.top}% + ${p.dy}px)`;
    pin.append(el('span', { className: 'pin-head' }), el('span', { className: 'pin-stem' }));
    pin.addEventListener('click', (e) => { e.stopPropagation(); openFlag(pin, p); });
    stage.append(pin);
  }
  stage.append(flag);

  flag.addEventListener('click', (e) => e.stopPropagation());
  stage.addEventListener('click', closeFlag);
  stage.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlag(); });

  // ---- Around the map ----
  const caption = el('p', { className: 'caption' },
    `${onMap.length} places on the map. Hover a pin to find it, click to read why.`);

  const legend = el('div', { className: 'legend' },
    el('span', {}, el('span', { className: 'swatch key-glacier' }), 'Glacier'),
    el('span', {}, el('span', { className: 'swatch key-water' }), 'Lakes and rivers'),
    el('span', {}, el('span', { className: 'swatch key-pin' }), 'Place'));

  const root = el('div', { className: 'viz' }, caption, legend, stage);

  if (offMap.length) {
    root.append(el('p', { className: 'caption' },
      'Not on the map (outside Iceland or coordinates in the sea): ' +
      offMap.map((r) => `${r.place} (${r.lat}, ${r.lng})`).join(' · ')));
  }

  root.append(
    el('p', { className: 'caption' }, 'Kortagrunnur: IS 50V, Landmælingar Íslands.'),
    el('details', { className: 'table-toggle' }, el('summary', {}, 'Show table'), buildTable(rows)),
  );
  return root;
}
