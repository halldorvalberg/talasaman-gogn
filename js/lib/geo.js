// Projection and bounding boxes for drawing Iceland as plain SVG.
// Equirectangular, with longitude scaled for 65° N so shapes look right at
// Iceland's latitude; y is flipped so north is up. Boxes are in lon/lat:
// { west, east, south, north }.

const COS_LAT = Math.cos((65 * Math.PI) / 180);
const EMPTY_BOX = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };

/** [lon, lat] → [x, y] in map units. */
export const project = ([lon, lat]) => [lon * COS_LAT, -lat];

/** The polygons of a Polygon or MultiPolygon geometry. */
export const polygonsOf = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

/** SVG path data for one ring of [lon, lat] points. */
const ringPath = (ring) =>
  ring.map((pt, i) => (i ? 'L' : 'M') + project(pt).map((v) => v.toFixed(4)).join(',')).join('') + 'Z';

/** SVG path data for a Polygon or MultiPolygon, holes included. */
export function pathFor(geometry) {
  return polygonsOf(geometry).flatMap((polygon) => polygon.map(ringPath)).join('');
}

/** The smallest box holding both boxes. */
const union = (a, b) => ({
  west: Math.min(a.west, b.west), east: Math.max(a.east, b.east),
  south: Math.min(a.south, b.south), north: Math.max(a.north, b.north),
});

/** Bounding box of a geometry's outer rings. */
export function bboxOf(geometry) {
  let box = EMPTY_BOX;
  for (const polygon of polygonsOf(geometry)) {
    for (const [lon, lat] of polygon[0]) box = union(box, { west: lon, east: lon, south: lat, north: lat });
  }
  return box;
}

/** Bounding box around several boxes, grown by `pad` degrees on every side. */
export function unionOf(boxes, pad = 0) {
  const u = boxes.reduce(union, EMPTY_BOX);
  return { west: u.west - pad, east: u.east + pad, south: u.south - pad, north: u.north + pad };
}

/** Do two boxes overlap? */
export const intersects = (a, b) =>
  a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;

/** Is a { lat, lng } point inside a box? */
export const contains = (box, { lat, lng }) =>
  lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;

/** A box in map units, for SVG: { x, y, w, h } with (x, y) the north-west corner. */
export function frameOf(box) {
  const [x0, y0] = project([box.west, box.north]);
  const [x1, y1] = project([box.east, box.south]);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A frame as an SVG viewBox attribute. */
export const viewBoxAttr = ({ x, y, w, h }) => `${x} ${y} ${w} ${h}`;
