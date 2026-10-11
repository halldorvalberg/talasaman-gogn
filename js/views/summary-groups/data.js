// Data for Summaries › Groups: the precomputed groups in
// data/summary-groups.json (made by scripts/update-summary-groups.py) and the
// summary texts from the API. From the API only each summary's text is kept;
// its location, postcode and table are dropped on arrival, so nothing on this
// page can show where a summary came from.

import { fetchEndpoint, loadJsonOnce } from '../../lib/data.js';

export const GROUPS_URL = 'data/summary-groups.json';

/** The three tones, in reading order: shape and word carry them, colour only helps. */
export const TONES = [
  { key: 'positive', label: 'positive', glyph: '▲' },
  { key: 'neutral', label: 'neutral', glyph: '●' },
  { key: 'critical', label: 'critical', glyph: '▼' },
];

/** The tone entry for a key such as 'positive'. */
export const toneOf = (key) => TONES.find((t) => t.key === key);

/** id → summary text, keeping nothing else from the API rows. */
const textsById = (rows) => new Map(rows.map(({ id, summary }) => [String(id), (summary ?? '').trim()]));

/**
 * The groups file plus every summary as a flat list.
 * @returns {Promise<{ topics: object[], summaries: Array<{ id, topic, group, tone, toneScore, x, y, text }>, generatedAt: string }>}
 */
export async function loadGroupData() {
  const [groups, { data }] = await Promise.all([loadJsonOnce(GROUPS_URL), fetchEndpoint('summaries')]);
  const texts = textsById(data);
  const summaries = Object.entries(groups.summaries)
    .map(([id, s]) => ({ id, ...s, text: texts.get(id) ?? '' }));
  return { topics: groups.topics, summaries, generatedAt: groups.generatedAt };
}
