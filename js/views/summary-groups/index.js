// Summaries › Groups: what the tables said, grouped by meaning. Reads
// data/summary-groups.json (made offline by scripts/update-summary-groups.py:
// LaBSE embeddings, tone removed, average-linkage clustering per topic) and
// the summary texts from the API. Three views share one topic picker: the
// map of meaning, tone across topics, and the chosen topic's group gallery.
// No location, postcode or table is shown anywhere on this page.

import { el } from '../../lib/dom.js';
import { formatTime } from '../../lib/format.js';
import { legend } from '../../components/legend.js';
import { collapsible } from '../../components/collapsible.js';
import { rawLinks } from '../../components/raw-links.js';
import { loadGroupData, GROUPS_URL, TONES } from './data.js';
import { meaningMap } from './meaning-map.js';
import { toneOverview } from './tone-overview.js';
import { groupGallery } from './gallery.js';

const METHOD = [
  'Each summary is turned into a vector with LaBSE, a language model that compares the meaning of sentences (it only measures likeness; it writes nothing). Tone is measured as how far a summary leans towards a set of general positive or general worried example sentences, and then taken out of the vectors, so the groups form on what was said rather than how.',
  'Within each topic, summaries that are similar enough on average land in the same group (average-linkage clustering); those like no group are listed under Stakar. Each group is headed by its most typical sentence, with keywords that set it apart from the rest of the topic.',
  'This is our own approximate analysis, not talasaman.is\'s, and no text-generating AI is used. Tone measures the wording, not whether a table agreed. The groups are refreshed by a script when new summaries arrive.',
];

/** The topic picker: one pill per topic; calls onPick with the topic name. */
function topicPicker(topics, onPick) {
  const buttons = topics.map((t) => {
    const button = el('button', { className: 'sg-pill', type: 'button' }, t.name, el('span', { className: 'sg-pill-count' }, String(t.count)));
    button.addEventListener('click', () => onPick(t.name));
    return button;
  });
  const element = el('div', { className: 'sg-picker', role: 'group', ariaLabel: 'Topic' }, ...buttons);
  const select = (name) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(topics[i].name === name)));
  return { element, select };
}

/** The tone key under the charts: shape, colour and word together. */
const toneLegend = () => legend(TONES.map((t) => ({ swatch: `sg-key tone-${t.key}`, mark: t.glyph, label: t.label })));

/** A section heading with a short caption under it. */
const sectionHead = (title, caption) => [el('h2', {}, title), el('p', { className: 'caption' }, caption)];

/** Build the three views once the data is in, and wire the picker to them. */
async function fill(container, context) {
  const data = await loadGroupData();
  const byId = new Map(data.summaries.map((s) => [s.id, s]));
  const map = meaningMap(data.summaries);
  const overview = toneOverview(data.topics, data.summaries, (name) => select(name));
  // The same picker above the map and above the gallery, so it is in reach on a phone.
  const pickers = [0, 1].map(() => topicPicker(data.topics, (name) => select(name)));
  const galleryHolder = el('div');

  function select(name) {
    pickers.forEach((p) => p.select(name));
    map.select(name);
    overview.select(name);
    galleryHolder.replaceChildren(groupGallery(data.topics.find((t) => t.name === name), byId));
  }

  container.replaceChildren(
    pickers[0].element,
    ...sectionHead('Map of meaning', 'Every summary is a mark; summaries that said similar things sit close together. The axes have no names of their own. The chosen topic stands out and the rest fade back. Hover a mark, or focus the map and use the arrow keys, to read it.'),
    toneLegend(), map.element,
    ...sectionHead('Tone across topics', 'Each row is a topic, each mark a summary, from more critical on the left to more positive on the right; the shaded middle counts as neutral. Press a topic\'s name to pick it.'),
    overview.element,
    el('h2', {}, 'Groups'),
    pickers[1].element,
    galleryHolder,
    el('p', { className: 'caption' }, `Groups computed ${formatTime(data.generatedAt)}.`));
  select(data.topics[0].name);

  const resize = new ResizeObserver(() => { map.redraw(); overview.redraw(); });
  resize.observe(container);
  context?.onLeave(() => resize.disconnect());
}

/** The Groups page: intro, how it is done, then the views. */
export function summaryGroupsPage(page, pages, context) {
  const body = el('div', { className: 'sg-body' }, el('p', { className: 'table-status' }, 'Loading groups…'));
  fill(body, context).catch((err) =>
    body.replaceChildren(el('p', { className: 'error', role: 'alert' }, err.message)));
  return el('article', { className: 'summary-groups' },
    el('h1', {}, page.title),
    el('p', { className: 'lede' }, page.intro),
    collapsible('How the groups are made', el('div', { className: 'body' }, ...METHOD.map((p) => el('p', {}, p))),
      { className: 'sg-method' }),
    el('div', { className: 'actions' }, ...rawLinks('summaries'),
      el('a', { className: 'raw', href: GROUPS_URL, target: '_blank', rel: 'noopener' }, 'Groups JSON')),
    body);
}
