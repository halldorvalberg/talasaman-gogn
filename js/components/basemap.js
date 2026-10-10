// The base map of Iceland under the places map and the location zoom: its
// extent, and the SVG of coastline, glaciers, lakes and large rivers.
// Base map: LMÍ IS 50V (data/iceland.geojson).

import { svgEl } from '../lib/dom.js';
import { pathFor, bboxOf, unionOf, viewBoxAttr } from '../lib/geo.js';

const MAP_PAD = 0.15; // degrees of sea around the coastline
const DRAW_ORDER = ['coast', 'glacier', 'lake', 'river']; // land first, water and ice on top

/** The features of one kind ('coast', 'glacier', 'lake' or 'river'). */
export const featuresOf = (base, kind) => base.features.filter((f) => f.properties.kind === kind);

/** The lon/lat box the map shows: the coastline with a margin of sea. */
export function mapBox(base) {
  return unionOf(featuresOf(base, 'coast').map((f) => bboxOf(f.geometry)), MAP_PAD);
}

/** One <path> per feature of the given kinds, classed by kind, in that order. */
export function featurePaths(base, kinds = DRAW_ORDER) {
  return kinds.flatMap((kind) => featuresOf(base, kind)
    .map((f) => svgEl('path', { d: pathFor(f.geometry), class: kind, 'vector-effect': 'non-scaling-stroke' })));
}

/** The base map as an <svg> showing `frame` (map units); its viewBox is the view. */
export function drawBaseMap(base, frame) {
  return svgEl('svg', {
    viewBox: viewBoxAttr(frame), class: 'basemap', role: 'img',
    'aria-label': 'Map of Iceland with glaciers, lakes and rivers',
  }, ...featurePaths(base));
}
