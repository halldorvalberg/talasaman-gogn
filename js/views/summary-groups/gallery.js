// Summaries › Groups, the group gallery: for one topic, a card per group
// (largest first) with its representative sentence, keywords, a tone bar and
// the texts of its summaries, then the Stakar (summaries like no group). Only
// the texts are shown, never where a summary came from.

import { el } from '../../lib/dom.js';
import { plural } from '../../lib/format.js';
import { collapsible } from '../../components/collapsible.js';
import { TONES } from './data.js';
import { toneGlyph, toneCountsText, countTones } from './marks.js';

const summariesWord = (n) => plural(n, 'summary', 'summaries');

/** A bar split by tone (decoration) and the same counts as text. */
function toneBar(counts) {
  const segments = TONES.filter((t) => counts[t.key])
    .map((t) => el('span', { className: `tone-seg tone-${t.key}`, style: `flex-grow: ${counts[t.key]}` }));
  return el('div', { className: 'sg-tone-bar-wrap' },
    el('div', { className: 'sg-tone-bar', ariaHidden: 'true' }, ...segments),
    el('p', { className: 'sg-tone-counts' }, toneCountsText(counts)));
}

/** The texts of some summaries as a list, each with its tone, in a fold-out. */
function textList(members) {
  const items = members.map((s) => el('li', {}, toneGlyph(s.tone), el('span', {}, s.text)));
  return collapsible(`Read the ${summariesWord(members.length)}`, el('ol', { className: 'sg-texts' }, ...items),
    { className: 'sg-texts-toggle' });
}

/** Keywords as small pills (none when the group shares no distinctive word). */
const keywordList = (words) => (words.length
  ? el('ul', { className: 'sg-keywords', ariaLabel: 'Keywords' }, ...words.map((w) => el('li', {}, w)))
  : '');

/** One group's card. */
function groupCard(group, members) {
  return el('article', { className: 'sg-card' },
    el('h4', { className: 'sg-card-meta' }, `Group ${group.id} · ${summariesWord(group.size)}`),
    el('blockquote', { className: 'sg-sentence' }, el('p', {}, group.sentence)),
    keywordList(group.keywords),
    toneBar(group.tone),
    textList(members));
}

/** The card for the summaries that matched no group. */
function stakarCard(members) {
  return el('article', { className: 'sg-card sg-stakar' },
    el('h4', { className: 'sg-card-meta' }, `Stakar · ${summariesWord(members.length)}`),
    el('p', { className: 'sg-stakar-note' }, 'Summaries not close enough to any other to form a group.'),
    toneBar(countTones(members)),
    textList(members));
}

/**
 * The gallery for one topic.
 * @param {object} topic { name, count, groups, stakar } from the groups file
 * @param {Map<string, object>} byId every summary by id
 */
export function groupGallery(topic, byId) {
  const pick = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const cards = topic.groups.map((g) => groupCard(g, pick(g.summaries)));
  if (topic.stakar.length) cards.push(stakarCard(pick(topic.stakar)));
  return el('section', { className: 'sg-gallery', ariaLabel: `Groups in ${topic.name}` },
    el('h3', { className: 'sg-gallery-title' }, topic.name),
    el('p', { className: 'caption' },
      `${summariesWord(topic.count)}: ${plural(topic.groups.length, 'group', 'groups')} and ${topic.stakar.length} Stakar. ` +
      'Each group is headed by the sentence from its summaries closest to the group\'s average meaning.'),
    el('div', { className: 'sg-cards' }, ...cards));
}
