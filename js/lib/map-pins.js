// Pure placement of pins on a map of Iceland. A pin's place on the map is a
// fraction of the stage (fx, fy in 0–1), so it survives resizing; its place
// on screen (sx, sy in px) follows from the current view (see map-view.js).

import { project } from './geo.js';

const GOLDEN_ANGLE = 2.39996;
const SPIRAL_STEP = 9; // px

/**
 * Offset (px) for the i-th place sharing one rounded coordinate, on a
 * sunflower spiral, so stacked pins can be told apart at full zoom.
 */
export function spiralOffset(i) {
  if (!i) return { dx: 0, dy: 0 };
  const r = SPIRAL_STEP * Math.sqrt(i);
  return { dx: Math.cos(i * GOLDEN_ANGLE) * r, dy: Math.sin(i * GOLDEN_ANGLE) * r };
}

/**
 * One pin per row ({ place, reason, lat, lng }), positioned within `frame`
 * (the map's { x, y, w, h } in map units), sorted north to south so southern
 * pins draw on top.
 */
export function layoutPins(rows, frame) {
  const seen = new Map();
  return rows
    .map((row) => {
      const key = `${row.lat},${row.lng}`;
      const i = seen.get(key) ?? 0;
      seen.set(key, i + 1);
      const [px, py] = project([row.lng, row.lat]);
      return { row, fx: (px - frame.x) / frame.w, fy: (py - frame.y) / frame.h, ...spiralOffset(i) };
    })
    .sort((a, b) => a.fy - b.fy);
}

/** Set each pin's screen position (sx, sy in px) for a view and stage size. */
export function placeOnScreen(pins, view, width, height) {
  for (const p of pins) {
    p.sx = (view.k * p.fx + view.ux) * width;
    p.sy = (view.k * p.fy + view.uy) * height;
  }
}

/** Is a screen point within the stage, give or take `margin` px? */
export const onStage = (p, width, height, margin) =>
  p.sx >= -margin && p.sy >= -margin && p.sx <= width + margin && p.sy <= height + margin;
