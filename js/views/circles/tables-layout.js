// Pure layout for the locations-and-tables map: the shape of each location's
// little graph, and pushing crowded graphs apart. All sizes are in design px
// (px on a map drawn DESIGN_WIDTH wide); no DOM here.

export const DESIGN_WIDTH = 1000;
export const TABLE_RADIUS = 5;
export const PERSON_RADIUS = 1.6;
export const PERSON_RING = 8.5; // people sit on this circle around their table

const TABLE_SPACING = 23; // arc length per table around its location
const MIN_RING = 17;
const GAP = 4; // between neighbouring graphs

/** Where each table sits around its location, and how much room the graph needs. */
export function graphShape(location) {
  const n = location.tables.length;
  const people = location.tables.reduce((sum, t) => sum + t.members, 0);
  const ring = n === 1 ? MIN_RING : Math.max(MIN_RING, (TABLE_SPACING * n) / (2 * Math.PI));
  const tables = location.tables.map((t, i) => ({ ...t, ...onCircle(i, n, ring) }));
  return {
    people,
    locationRadius: 3.5 + Math.sqrt(people) * 0.75,
    tables,
    radius: ring + PERSON_RING + PERSON_RADIUS + 2,
  };
}

/** Point i of n spaced evenly around a circle, starting at twelve o'clock. */
export function onCircle(i, n, radius) {
  const angle = -Math.PI / 2 + (i / n) * 2 * Math.PI;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** Pull each node a little towards its real position (ax, ay). */
function springToAnchors(nodes, strength) {
  for (const n of nodes) {
    n.x += (n.ax - n.x) * strength;
    n.y += (n.ay - n.y) * strength;
  }
}

/** If two graphs overlap, push both apart by half the overlap. */
function separate(a, b, seed) {
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const min = a.radius + b.radius + GAP;
  if (d >= min) return;
  if (d < 1e-3) { dx = Math.cos(seed); dy = Math.sin(seed); d = 1; } // same spot: pick a direction
  const push = (min - d) / 2;
  a.x -= (dx / d) * push; a.y -= (dy / d) * push;
  b.x += (dx / d) * push; b.y += (dy / d) * push;
}

/** Keep every graph wholly inside the map. */
function keepInside(nodes, { width, height }) {
  for (const n of nodes) {
    n.x = Math.min(width - n.radius, Math.max(n.radius, n.x));
    n.y = Math.min(height - n.radius, Math.max(n.radius, n.y));
  }
}

/**
 * Move overlapping graphs apart while each stays as close as it can to its
 * real position. Deterministic. Mutates x/y of nodes shaped
 * { ax, ay, x, y, radius }.
 */
export function relax(nodes, bounds, iterations = 400) {
  for (let it = 0; it < iterations; it++) {
    springToAnchors(nodes, 0.05);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) separate(nodes[i], nodes[j], i + j);
    }
    keepInside(nodes, bounds);
  }
}
