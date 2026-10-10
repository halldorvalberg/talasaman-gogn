// The pages in the sidebar. Most pages are one API endpoint, where `render`
// turns its rows into a visualisation (default: a table). Pages with their
// own `view` build the whole page themselves. A `parent` makes a subpage,
// shown indented under its parent in the sidebar.

import { renderCircles } from './views/circles/index.js';
import { renderPlaces } from './views/places/index.js';
import { overviewPage } from './views/overview.js';
import { audioPage } from './views/audio.js';
import { componentsPage } from './views/components.js';

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
  },
  {
    id: 'summaries/audio',
    title: 'Audio',
    parent: 'summaries',
    intro: 'Recordings of table discussions, where everyone at the table agreed to be recorded. Each clip comes with the facilitator\'s written summary of what was said.',
    view: audioPage,
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
];

/** Subpages of a page, e.g. Audio under Summaries. */
export const childrenOf = (page) => PAGES.filter((p) => p.parent === page.id);

/** The page for a URL hash like '#/places', falling back to the overview. */
export function pageForHash(hash) {
  const id = hash.replace(/^#\/?/, '') || 'overview';
  return PAGES.find((p) => p.id === id) ?? PAGES[0];
}
