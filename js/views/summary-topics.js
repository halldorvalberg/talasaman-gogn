// Summaries › "Topics": which topics the summaries were about and how many
// summaries each came up in. Tables either picked one of the set topics or
// wrote their own (`topicChosen` in /summaries). A radial bar chart shows the
// set topics, most frequent on the outside; tables below list both kinds on
// one scale so their bars compare (and carry the numbers for screen readers).

import { el } from '../lib/dom.js';
import { plural, compareIcelandic } from '../lib/format.js';
import { countBars } from '../components/count-bars.js';
import { radialBars } from '../components/radial-bars.js';

/**
 * How many summaries each topic has, most first (ties alphabetical).
 * @returns {Array<{ name: string, count: number, chosen: boolean }>}
 */
export function countTopics(rows) {
  const counts = new Map();
  for (const { topic, topicChosen } of rows) {
    const name = topic.trim();
    const entry = counts.get(name) ?? { name, count: 0, chosen: Boolean(topicChosen) };
    entry.count++;
    counts.set(name, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || compareIcelandic(a.name, b.name));
}

const HEADINGS = { nameHeading: 'Topic', countHeading: 'Summaries' };

/** The topic counts of the summaries, set topics and the tables' own. */
export function renderSummaryTopics(rows) {
  const topics = countTopics(rows);
  const max = topics[0]?.count ?? 1;
  const set = topics.filter((t) => t.chosen);
  const own = topics.filter((t) => !t.chosen);
  return el('div', { className: 'summary-topics' },
    el('p', { className: 'caption' },
      `${plural(rows.length, 'summary', 'summaries')} on ${plural(topics.length, 'topic', 'topics')}: ` +
      `${plural(set.length, 'set topic', 'set topics')} the tables could pick, and ${own.length} the tables wrote themselves.`),
    radialBars(set, {
      label: `Set topics by number of summaries, most frequent outermost: ${set.map((t) => `${t.name} ${t.count}`).join(', ')}`,
      centre: own.length ? [`+${own.length}`, 'own topics'] : '',
      unit: 'summaries',
    }),
    countBars(set, { caption: 'Set topics', ...HEADINGS }, max),
    own.length ? countBars(own, { caption: 'Topics the tables wrote themselves', ...HEADINGS }, max) : '');
}
