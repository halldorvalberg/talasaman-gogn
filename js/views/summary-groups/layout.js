// Pure layout for Summaries › Groups: a linear scale and a simple beeswarm.
// Numbers in, numbers out; no DOM.

/** A linear scale from [d0, d1] to [r0, r1]. */
export const linear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** Offsets 0, +1, −1, +2, −2 … times `step`. */
function* alternating(step) {
  yield 0;
  for (let k = 1; ; k++) { yield k * step; yield -k * step; }
}

/**
 * A beeswarm: a vertical offset for each x so no two marks of diameter `d`
 * overlap, placed left to right as close to the middle line as they fit.
 * @param {number[]} xs positions in px
 * @returns {number[]} offsets in px, in the order of `xs`
 */
export function swarm(xs, d) {
  const order = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]);
  const placed = [];
  const offsets = new Array(xs.length);
  for (const i of order) {
    const near = placed.filter((p) => xs[i] - p.x < d);
    for (const y of alternating(d / 2)) {
      if (near.every((p) => Math.hypot(xs[i] - p.x, y - p.y) >= d)) {
        offsets[i] = y;
        placed.push({ x: xs[i], y });
        break;
      }
    }
  }
  return offsets;
}
