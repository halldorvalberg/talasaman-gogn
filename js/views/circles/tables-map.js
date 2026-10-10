// Event locations and their tables on a map of Iceland, after the graph on
// talasaman.is/hringir: location → tables → one dot per person at a table.
// Data: data/tables.json (structure only; see scripts/update-tables.py).

import { el, svgEl, removeClassWithin } from '../../lib/dom.js';
import { loadJsonOnce } from '../../lib/data.js';
import { project, frameOf, viewBoxAttr } from '../../lib/geo.js';
import { plural, people, tableAt } from '../../lib/format.js';
import { mapBox, featurePaths } from '../../components/basemap.js';
import { legend } from '../../components/legend.js';
import { createTooltip } from '../../components/tooltip.js';
import {
  DESIGN_WIDTH, TABLE_RADIUS, PERSON_RADIUS, PERSON_RING, graphShape, onCircle, relax,
} from './tables-layout.js';

const MOVED = 4; // design px; graphs pushed further than this get a leader line

/** Locations with coordinates and tables, laid out in design px. */
function layoutNodes(locations, frame, scale) {
  const nodes = locations.filter((l) => l.lat != null && l.tables.length).map((location) => {
    const [px, py] = project([location.lng, location.lat]);
    const ax = (px - frame.x) / scale, ay = (py - frame.y) / scale;
    return { location, ...graphShape(location), ax, ay, x: ax, y: ay };
  });
  relax(nodes, { width: DESIGN_WIDTH, height: frame.h / scale });
  return nodes;
}

/** One table: its dot, its people around it, and a bigger invisible hover target. */
function drawTable(location, table) {
  const g = svgEl('g', { class: 'ttable', transform: `translate(${table.x} ${table.y})` });
  g.dataset.label = tableAt({ location: location.name, table: table.number ?? '?' });
  g.dataset.people = table.members;
  for (let i = 0; i < table.members; i++) {
    const { x, y } = onCircle(i, table.members, PERSON_RING);
    g.append(svgEl('circle', { class: 'person', r: PERSON_RADIUS, cx: x, cy: y }));
  }
  g.append(svgEl('circle', { class: 'table', r: TABLE_RADIUS }), svgEl('circle', { class: 'hit', r: PERSON_RING + 2 }));
  return g;
}

/** One location's graph: spokes, tables, and the location dot on top. */
function drawGraph(node) {
  const g = svgEl('g', { class: 'tcluster', transform: `translate(${node.x} ${node.y})` });
  Object.assign(g.dataset, { name: node.location.name, tables: node.tables.length, people: node.people });
  for (const t of node.tables) {
    g.append(svgEl('line', { x1: 0, y1: 0, x2: t.x, y2: t.y, class: 'spoke', 'vector-effect': 'non-scaling-stroke' }));
  }
  g.append(...node.tables.map((t) => drawTable(node.location, t)));
  g.append(svgEl('circle', { class: 'loc', r: node.locationRadius }));
  return g;
}

/** A dot at the real position, and a dotted line to the graph if it was moved. */
function drawAnchor(node) {
  const parts = [svgEl('circle', { class: 'anchor', cx: node.ax, cy: node.ay, r: 1.8 })];
  if (Math.hypot(node.x - node.ax, node.y - node.ay) > MOVED) {
    parts.unshift(svgEl('line', { class: 'leader', x1: node.ax, y1: node.ay, x2: node.x, y2: node.y, 'vector-effect': 'non-scaling-stroke' }));
  }
  return parts;
}

/** Hovering a graph dims the others and names the location or table. */
function attachHover(stage, tooltip) {
  stage.addEventListener('pointermove', (e) => {
    const graph = e.target.closest?.('.tcluster');
    const table = e.target.closest?.('.ttable');
    stage.classList.toggle('focus', !!graph);
    removeClassWithin(stage, 'on');
    if (!graph) return tooltip.hide();
    graph.classList.add('on');
    if (table) tooltip.show(e, table.dataset.label, people(+table.dataset.people));
    else tooltip.show(e, graph.dataset.name, `${plural(+graph.dataset.tables, 'table', 'tables')} · ${people(+graph.dataset.people)}`);
  });
  stage.addEventListener('pointerleave', () => {
    tooltip.hide();
    stage.classList.remove('focus');
    removeClassWithin(stage, 'on');
  });
}

function summary(nodes) {
  const tables = nodes.reduce((sum, n) => sum + n.tables.length, 0);
  const seated = nodes.reduce((sum, n) => sum + n.people, 0);
  return `${nodes.length} locations, ${tables} tables, ${seated} people at tables. ` +
    'Each blue dot is a location, each red dot one of its tables, and the small dots the people at that table. ' +
    'Where locations crowd together they are pushed apart; a dotted line leads back to the real spot.';
}

export async function renderTablesMap() {
  const [base, data] = await Promise.all([loadJsonOnce('data/iceland.geojson'), loadJsonOnce('data/tables.json')]);
  const frame = frameOf(mapBox(base));
  const scale = frame.w / DESIGN_WIDTH; // map units per design px
  const nodes = layoutNodes(data.locations, frame, scale);

  const svg = svgEl('svg', { viewBox: viewBoxAttr(frame), class: 'tables-map', role: 'img', 'aria-label': 'Event locations and their tables on a map of Iceland' },
    ...featurePaths(base, ['coast', 'glacier']),
    svgEl('g', { transform: `translate(${frame.x} ${frame.y}) scale(${scale})` },
      ...nodes.flatMap(drawAnchor),
      ...nodes.map(drawGraph)));

  const tooltip = createTooltip();
  const stage = el('div', { className: 'tables-stage' }, svg, tooltip.element);
  attachHover(stage, tooltip);

  return el('section', { className: 'tables-section' },
    el('h2', {}, 'Locations and tables'),
    el('p', { className: 'caption' }, summary(nodes)),
    legend([
      { swatch: 'key-loc', label: 'Location' },
      { swatch: 'key-table', label: 'Table' },
      { swatch: 'key-person', label: 'Person at a table' },
    ]),
    stage,
    el('p', { className: 'caption' },
      'Tables: talasaman.is/hringir (structure only, no names). Locations geocoded with OpenStreetMap Nominatim.'));
}
