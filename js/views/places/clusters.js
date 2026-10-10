// Pure grouping of pins that would overlap on screen at the current zoom.

import { onStage } from '../../lib/map-pins.js';

const GROUP_RADIUS = 18; // px; pins closer than this (on both axes) merge
const MARGIN = 40; // px outside the stage still counted, so edge groups are stable

const near = (a, b) => Math.abs(a.sx - b.sx) < GROUP_RADIUS && Math.abs(a.sy - b.sy) < GROUP_RADIUS;

/**
 * Greedy screen-space grouping. `keep` (e.g. the highlighted pin) never joins
 * a group. Returns the groups (each { members, x, y } with x/y their screen
 * centre) and the set of pins that are in one.
 */
export function findClusters(pins, { width, height, keep = null }) {
  const grouped = new Set();
  const groups = [];
  for (const p of pins) {
    if (grouped.has(p) || p === keep || !onStage(p, width, height, MARGIN)) continue;
    const members = [p, ...pins.filter((q) => q !== p && q !== keep && !grouped.has(q) && near(p, q))];
    if (members.length < 2) continue;
    for (const m of members) grouped.add(m);
    groups.push({
      members,
      x: members.reduce((sum, m) => sum + m.sx, 0) / members.length,
      y: members.reduce((sum, m) => sum + m.sy, 0) / members.length,
    });
  }
  return { groups, grouped };
}
