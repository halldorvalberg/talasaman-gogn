// The pages in the sidebar. Most pages are one API endpoint, where `render`
// turns its rows into a visualisation (default: a table). Pages with their
// own `view` build the whole page themselves. A `parent` makes a subpage,
// shown indented under its parent in the sidebar (a subpage of a subpage
// goes one step further in). A `hidden` page has no sidebar link, and one
// that `takesPath` also answers addresses below its own, e.g. #/listen/7.

import { renderSummaryTopics } from './views/summary-topics.js';
import { renderCircles } from './views/circles/index.js';
import { renderPlaces } from './views/places/index.js';
import { overviewPage } from './views/overview.js';
import { audioPage } from './views/audio.js';
import { componentsPage } from './views/components.js';
import { listenPage } from './views/listen.js';
import { linkBuilderPage } from './views/link-builder.js';
import { splitHash } from './lib/hash.js';
import { LISTEN_ID } from './lib/listen-address.js';

export const PAGES = [
  {
    id: 'overview',
    title: 'Overview',
    view: (page, pages) => overviewPage(pages),
  },
  {
    id: 'circles',
    title: 'Circles',
    intro: 'The ring structure under Ísland: one ring per postcode, one per event location, and the facilitators (Lóðsar). Each ring shows its active member count. Here the postcode rings are drawn on a map, followed by the event locations and their tables.',
    render: renderCircles,
  },
  {
    id: 'places',
    title: 'Places',
    intro: 'Favourite places in Iceland and why people chose them. Coordinates are rounded to about 1 km, and no names are included.',
    render: renderPlaces,
  },
  {
    id: 'islenskast',
    title: 'Íslenskast',
    intro: 'Answers to "What is the most Icelandic thing in the world?", grouped by hand into categories and concepts. Identical answers are merged and counted.',
  },
  {
    id: 'topics',
    title: 'Topics',
    intro: 'The words people chose to talk about, ranked by how often they were picked.',
  },
  {
    id: 'summaries',
    title: 'Summaries',
    intro: 'Summaries of the table discussions written by the facilitators, with location and table number. Audio is included where participants agreed to it.',
    extras: [{ method: 'COUNT', label: ' topics', render: renderSummaryTopics }],
  },
  {
    id: 'summaries/audio',
    title: 'Audio',
    parent: 'summaries',
    intro: 'Recordings of table discussions, where everyone at the table agreed to be recorded. Each clip comes with the facilitator\'s written summary of what was said.',
    view: audioPage,
  },
  {
    id: 'summaries/audio/link',
    title: 'Link builder',
    parent: 'summaries/audio',
    intro: 'Build a link that opens the full-screen listening view just the way you want it: at a chosen recording and time, only some topics or locations, with a Radio sound setting and either chorus.',
    view: linkBuilderPage,
  },
  {
    id: 'stats',
    title: 'Stats',
    intro: 'Overall totals in a single table.',
  },
  {
    id: 'components',
    title: 'Components',
    intro: 'A playground of the pieces built for this site, each live on real data from the API: audio players and visualisers, the talasaman.is image turned into visualisers, a round map that zooms into the venues where the tables met, and the filterable table.',
    view: componentsPage,
  },
  {
    id: LISTEN_ID,
    title: 'Listening view',
    hidden: true, // full screen, opened from the Audio page or a link
    takesPath: true,
    view: listenPage,
  },
];

/** Subpages of a page, e.g. Audio under Summaries. */
export const childrenOf = (page) => PAGES.filter((p) => p.parent === page.id);

/** A page's parent, grandparent and so on, outermost first. */
export function ancestorsOf(page) {
  const parent = PAGES.find((p) => p.id === page.parent);
  return parent ? [...ancestorsOf(parent), parent] : [];
}

/** The class for a page's link in a list of pages: 'sub sub-2' two levels in, '' at the top. */
export function depthClass(page) {
  const depth = ancestorsOf(page).length;
  return depth ? `sub sub-${depth}` : '';
}

/**
 * The page for a URL hash like '#/places' or '#/listen/7?t=90': the page with
 * that path, else one that takes the rest of it, else the overview.
 */
export function pageForHash(hash) {
  const id = splitHash(hash).path || 'overview';
  return PAGES.find((p) => p.id === id)
    ?? PAGES.find((p) => p.takesPath && id.startsWith(`${p.id}/`))
    ?? PAGES[0];
}
