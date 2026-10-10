// Small number helpers shared by the views, components and audio code.

/** `value` kept within lo–hi. */
export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** `value` kept within 0–1. */
export const clamp01 = (value) => clamp(value, 0, 1);
