// Small number helpers shared by the views, components and audio code, and
// random picks. Anything random takes `random` (0…1) so a test can fix it.

/** `value` kept within lo–hi. */
export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** `value` kept within 0–1. */
export const clamp01 = (value) => clamp(value, 0, 1);

/** The middle [x, y] of a box { x, y, width, height } (an SVG bounding box). */
export const middleOf = (b) => [b.x + b.width / 2, b.y + b.height / 2];

/** A whole number from 0 to n − 1, at random. */
export const randomIndex = (n, random = Math.random) => Math.floor(random() * n);

/** A random item of `items`, other than `not` when there is a choice. */
export function randomOf(items, not = null, random = Math.random) {
  const choices = items.length > 1 ? items.filter((item) => item !== not) : items;
  return choices[randomIndex(choices.length, random)];
}

/** A copy of `items` in random order (Fisher–Yates). */
export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
