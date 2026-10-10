// Zoom and pan maths for the maps of Iceland (the Places map and the
// location zoom). A view is { k, ux, uy }: zoom factor k (1 = all of
// Iceland) and pan offsets in stage fractions, so a point at stage fraction f
// appears at (k * f + u) * stageSize on screen. All pure: views in, views out.

import { clamp } from './math.js';

export const MAX_ZOOM = 24; // ~20 px between neighbouring 0.01° coordinates
export const HOME = { k: 1, ux: 0, uy: 0 };
const FIT_MARGIN = 0.7; // a fitted group fills 70% of the stage
const HOP_FIT = 0.6; // at the top of a hop, both ends of a flight fit in 60% of the stage

const EPSILON = 1e-3;
/** Is the view closer in than all of Iceland? */
export const isZoomedIn = (v) => v.k > 1 + EPSILON;
/** Is the view as far in as it goes? */
export const isAtMaxZoom = (v) => v.k >= MAX_ZOOM - EPSILON;

/** Keep zoom within limits and the map covering the whole stage. */
export function clampView({ k, ux, uy }) {
  const kk = clamp(k, 1, MAX_ZOOM);
  return { k: kk, ux: clamp(ux, 1 - kk, 0), uy: clamp(uy, 1 - kk, 0) };
}

/** The view at zoom k with stage point (fx, fy) in the middle. */
export const centreOn = (fx, fy, k) => clampView({ k, ux: 0.5 - k * fx, uy: 0.5 - k * fy });

/** The stage point currently in the middle of the view. */
const centreOf = (v) => [(0.5 - v.ux) / v.k, (0.5 - v.uy) / v.k];

/** Zoom by `factor`, keeping the screen point (px, py) (stage fractions) still. */
export function zoomAround(view, factor, px, py) {
  const k = clamp(view.k * factor, 1, MAX_ZOOM);
  const fx = (px - view.ux) / view.k, fy = (py - view.uy) / view.k;
  return clampView({ k, ux: px - k * fx, uy: py - k * fy });
}

/** The view that fits a set of { fx, fy } points, centred. */
export function fitPoints(points) {
  const xs = points.map((p) => p.fx), ys = points.map((p) => p.fy);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(MAX_ZOOM, FIT_MARGIN / Math.max(maxX - minX, 1e-6), FIT_MARGIN / Math.max(maxY - minY, 1e-6));
  return centreOn((minX + maxX) / 2, (minY + maxY) / 2, k);
}

/**
 * The view part-way (t in 0–1) from `from` to `to`. Moves the centre and the
 * zoom (in log space) rather than the raw pan, so the point being zoomed
 * into stays on screen the whole way.
 */
export function interpolateView(from, to, t) {
  const [fx0, fy0] = centreOf(from), [fx1, fy1] = centreOf(to);
  const k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * t);
  return centreOn(fx0 + (fx1 - fx0) * t, fy0 + (fy1 - fy0) * t, k);
}

/** The part of a map frame { x, y, w, h } that the view shows, for the SVG viewBox. */
export const visibleFrame = (v, frame) => ({
  x: frame.x - (v.ux / v.k) * frame.w,
  y: frame.y - (v.uy / v.k) * frame.h,
  w: frame.w / v.k,
  h: frame.h / v.k,
});

/**
 * A flight from one view to another, as t (0–1) → view. When both ends are
 * zoomed in on places far apart, it zooms out part-way so that both are on
 * screen at the top of the hop, then back in: you see where you're going.
 */
export function flightPath(from, to) {
  const [fx0, fy0] = centreOf(from), [fx1, fy1] = centreOf(to);
  const span = Math.max(Math.abs(fx1 - fx0), Math.abs(fy1 - fy0), 1e-6);
  const topK = Math.max(1, HOP_FIT / span);
  const [log0, log1] = [Math.log(from.k), Math.log(to.k)];
  const hop = Math.min(from.k, to.k) > topK ? (log0 + log1) / 2 - Math.log(topK) : 0;
  return (t) => centreOn(
    fx0 + (fx1 - fx0) * t,
    fy0 + (fy1 - fy0) * t,
    Math.exp(log0 + (log1 - log0) * t - hop * 4 * t * (1 - t)));
}
