// Pure layout for the chorus zoom: the talasaman.is image's bubbles moved
// out to sit around the rim of a circle (the lens), each partly tucked
// behind it, in the same order around as in the image. Boxes and circles are
// in the image's own units; nothing here touches the page.

import { middleOf } from './math.js';

const SPREAD = 0.5; // 0 keeps each bubble's own angle, 1 spaces them evenly round the rim
const REACH = 0.1;  // how far past the rim a bubble's middle sits, in its own half-size

/** The angles, moved part of the way (SPREAD) towards being evenly spaced, keeping their order. */
function spreadAngles(angles) {
  const n = angles.length, step = (2 * Math.PI) / n;
  const order = angles.map((a, i) => i).sort((i, j) => angles[i] - angles[j]);
  const start = order.reduce((sum, i, k) => sum + angles[i] - k * step, 0) / n;
  const spread = [...angles];
  order.forEach((i, k) => { spread[i] += (start + k * step - angles[i]) * SPREAD; });
  return spread;
}

/**
 * Where each bubble goes so that the bubbles ring the circle: its middle on
 * the rim or a little outside it, never closer in than it already was.
 * @param {Array<{ x: number, y: number, width: number, height: number }>} boxes the bubbles' boxes
 * @param {{ cx: number, cy: number, r: number }} circle
 * @returns {Array<{ dx: number, dy: number, direction: [number, number] }>}
 *   the shift for each bubble and its unit direction out from the circle
 */
export function ringAround(boxes, { cx, cy, r }) {
  const middles = boxes.map(middleOf);
  const angles = spreadAngles(middles.map(([x, y]) => Math.atan2(y - cy, x - cx)));
  return boxes.map((b, i) => {
    const [x, y] = middles[i];
    const direction = [Math.cos(angles[i]), Math.sin(angles[i])];
    const distance = Math.max(Math.hypot(x - cx, y - cy), r + (REACH * Math.min(b.width, b.height)) / 2);
    return { dx: cx + direction[0] * distance - x, dy: cy + direction[1] * distance - y, direction };
  });
}

/** The box around a circle and every box, each shifted, with `pad` (a share of the size) all round. */
export function frameAround(boxes, shifts, { cx, cy, r }, pad = 0) {
  const xs = [cx - r, cx + r], ys = [cy - r, cy + r];
  boxes.forEach((b, i) => {
    xs.push(b.x + shifts[i].dx, b.x + b.width + shifts[i].dx);
    ys.push(b.y + shifts[i].dy, b.y + b.height + shifts[i].dy);
  });
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const p = pad * Math.max(x1 - x0, y1 - y0);
  return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p };
}
