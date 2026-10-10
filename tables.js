// Event locations and their tables on a map of Iceland, after the graph on
// talasaman.is/hringir: location → tables → one dot per person at the table.
// Data: tables.json (structure only, refreshed by scripts/update-tables.py).

import { project } from './map.js';
import { loadBase, extentOf } from './places.js';
import { pathFor } from './map.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DESIGN_W = 1000; // all sizes below are px at this map width

// Node geometry, in design px.
const TABLE_R = 5;
const PERSON_R = 1.6;
const PERSON_RING = 8.5;
const TABLE_GAP = 23; // arc length per table around its location

let dataPromise;
function loadTables() {
  dataPromise ??= fetch('tables.json').then((r) => {
    if (!r.ok) throw new Error(`tables.json: HTTP ${r.status}`);
    return r.json();
  });
  return dataPromise;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Geometry of one location's little graph, relative to its centre.
function clusterShape(loc) {
  const n = loc.tables.length;
  const people = loc.tables.reduce((s, t) => s + t.members, 0);
  const ring = n === 1 ? 17 : Math.max(17, (TABLE_GAP * n) / (2 * Math.PI));
  const tables = loc.tables.map((t, i) => {
    const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    return { ...t, x: Math.cos(a) * ring, y: Math.sin(a) * ring };
  });
  return {
    people,
    locR: 3.5 + Math.sqrt(people) * 0.75,
    tables,
    radius: ring + PERSON_RING + PERSON_R + 2,
  };
}

// Push overlapping clusters apart while springing each back towards its
// real position. Deterministic, a few hundred cheap iterations.
function relax(nodes, bounds) {
  for (let it = 0; it < 400; it++) {
    for (const a of nodes) {
      a.x += (a.ax - a.x) * 0.05;
      a.y += (a.ay - a.y) * 0.05;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.radius + b.radius + 4;
        if (d >= min) continue;
        if (d < 1e-3) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
    for (const a of nodes) {
      a.x = Math.min(bounds.w - a.radius, Math.max(a.radius, a.x));
      a.y = Math.min(bounds.h - a.radius, Math.max(a.radius, a.y));
    }
  }
}

export async function renderTablesMap() {
  const [base, data] = await Promise.all([loadBase(), loadTables()]);
  const coast = base.features.filter((f) => f.properties.kind === 'coast');
  const box = extentOf(coast);
  const [x0, y0] = project([box.west, box.north]);
  const [x1, y1] = project([box.east, box.south]);
  const w = x1 - x0, h = y1 - y0;
  const s = w / DESIGN_W; // map units per design px
  const H = h / s;

  const svg = svgEl('svg', {
    viewBox: `${x0} ${y0} ${w} ${h}`,
    class: 'tables-map',
    role: 'img',
    'aria-label': 'Event locations and their tables on a map of Iceland',
  });

  for (const f of base.features) {
    if (f.properties.kind !== 'coast' && f.properties.kind !== 'glacier') continue;
    svg.append(svgEl('path', { d: pathFor(f.geometry), class: f.properties.kind, 'vector-effect': 'non-scaling-stroke' }));
  }

  // Lay out in design px, then place with a transform into map units.
  const nodes = data.locations.filter((l) => l.lat != null && l.tables.length).map((loc) => {
    const [px, py] = project([loc.lng, loc.lat]);
    const ax = (px - x0) / s, ay = (py - y0) / s;
    return { loc, ...clusterShape(loc), ax, ay, x: ax, y: ay };
  });
  relax(nodes, { w: DESIGN_W, h: H });

  const layer = svgEl('g', { transform: `translate(${x0} ${y0}) scale(${s})` });
  const leaders = svgEl('g', { class: 'leaders' });
  const anchors = svgEl('g', { class: 'anchors' });
  const clusters = svgEl('g', { class: 'clusters' });
  layer.append(leaders, anchors, clusters);
  svg.append(layer);

  for (const n of nodes) {
    const moved = Math.hypot(n.x - n.ax, n.y - n.ay) > 4;
    if (moved) {
      leaders.append(svgEl('line', { x1: n.ax, y1: n.ay, x2: n.x, y2: n.y, 'vector-effect': 'non-scaling-stroke' }));
    }
    anchors.append(svgEl('circle', { cx: n.ax, cy: n.ay, r: 1.8 }));

    const g = svgEl('g', { class: 'tcluster', transform: `translate(${n.x} ${n.y})` });
    g.dataset.name = n.loc.name;
    g.dataset.tables = n.tables.length;
    g.dataset.people = n.people;
    for (const t of n.tables) {
      g.append(svgEl('line', { x1: 0, y1: 0, x2: t.x, y2: t.y, class: 'spoke', 'vector-effect': 'non-scaling-stroke' }));
    }
    for (const t of n.tables) {
      const tg = svgEl('g', { class: 'ttable', transform: `translate(${t.x} ${t.y})` });
      tg.dataset.label = `${n.loc.name} · Borð ${t.number ?? '?'}`;
      tg.dataset.people = t.members;
      for (let i = 0; i < t.members; i++) {
        const a = -Math.PI / 2 + (i / t.members) * 2 * Math.PI;
        tg.append(svgEl('circle', { class: 'person', r: PERSON_R, cx: Math.cos(a) * PERSON_RING, cy: Math.sin(a) * PERSON_RING }));
      }
      tg.append(svgEl('circle', { class: 'table', r: TABLE_R }));
      tg.append(svgEl('circle', { class: 'hit', r: PERSON_RING + 2 })); // easy hover target
      g.append(tg);
    }
    g.append(svgEl('circle', { class: 'loc', r: n.locR }));
    clusters.append(g);
  }

  // ---- Hover ----
  const stage = el('div', { className: 'tables-stage' }, svg);
  const tooltip = el('div', { className: 'tooltip', hidden: true });
  stage.append(tooltip);

  stage.addEventListener('pointermove', (e) => {
    const cluster = e.target.closest?.('.tcluster');
    const table = e.target.closest?.('.ttable');
    stage.classList.toggle('focus', !!cluster);
    for (const c of clusters.querySelectorAll('.tcluster.on')) if (c !== cluster) c.classList.remove('on');
    if (!cluster) { tooltip.hidden = true; return; }
    cluster.classList.add('on');
    const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
    tooltip.replaceChildren(
      el('strong', {}, table ? table.dataset.label : cluster.dataset.name),
      el('br'),
      table
        ? people(+table.dataset.people)
        : `${cluster.dataset.tables} ${cluster.dataset.tables === '1' ? 'table' : 'tables'} · ${people(+cluster.dataset.people)}`,
    );
    tooltip.hidden = false;
    const r = stage.getBoundingClientRect();
    tooltip.style.left = `${e.clientX - r.left + 14}px`;
    tooltip.style.top = `${e.clientY - r.top + 14}px`;
  });
  stage.addEventListener('pointerleave', () => {
    tooltip.hidden = true;
    stage.classList.remove('focus');
    for (const c of clusters.querySelectorAll('.tcluster.on')) c.classList.remove('on');
  });

  const totalTables = nodes.reduce((sum, n) => sum + n.tables.length, 0);
  const totalPeople = nodes.reduce((sum, n) => sum + n.people, 0);

  return el('section', { className: 'tables-section' },
    el('h2', {}, 'Locations and tables'),
    el('p', { className: 'caption' },
      `${nodes.length} locations, ${totalTables} tables, ${totalPeople} people at tables. ` +
      'Each blue dot is a location, each red dot one of its tables, and the small dots the people at that table. ' +
      'Where locations crowd together they are pushed apart; a thin line leads back to the real spot.'),
    el('div', { className: 'legend' },
      el('span', {}, el('span', { className: 'swatch key-loc' }), 'Location'),
      el('span', {}, el('span', { className: 'swatch key-table' }), 'Table'),
      el('span', {}, el('span', { className: 'swatch key-person' }), 'Person at a table')),
    stage,
    el('p', { className: 'caption' },
      'Tables: talasaman.is/hringir (structure only, no names). Locations geocoded with OpenStreetMap Nominatim.'),
  );
}
