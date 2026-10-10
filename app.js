import { renderCirclesMap } from './map.js';
import { renderPlacesMap } from './places.js';

const API = 'https://talasaman.is/api/v1';

const PAGES = [
  {
    id: 'overview',
    title: 'Overview',
  },
  {
    id: 'circles',
    title: 'Circles',
    intro: 'The ring structure under Ísland: one ring per postcode, one per event location, and the facilitators (Lóðsar). Each ring shows its active member count. Here the postcode rings are drawn on a map.',
    render: renderCirclesMap,
  },
  {
    id: 'places',
    title: 'Places',
    intro: 'Favourite places in Iceland and why people chose them. Coordinates are rounded to about 1 km, and no names are included.',
    render: renderPlacesMap,
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
    id: 'stats',
    title: 'Stats',
    intro: 'Overall totals in a single table.',
  },
];

const nav = document.getElementById('pages');
const page = document.getElementById('page');
const crumb = document.getElementById('crumb');

// ---- Sidebar ----------------------------------------------------------------

const toggle = document.getElementById('toggle-sidebar');
const narrow = matchMedia('(max-width: 800px)');

function setSidebar(open) {
  document.body.classList.toggle('sidebar-closed', !open);
  toggle.setAttribute('aria-expanded', String(open));
}

setSidebar(narrow.matches ? false : localStorage.getItem('sidebar') !== 'closed');
toggle.addEventListener('click', () => {
  const open = document.body.classList.contains('sidebar-closed');
  setSidebar(open);
  if (!narrow.matches) localStorage.setItem('sidebar', open ? 'open' : 'closed');
});

// ---- Palette ----------------------------------------------------------------

const PALETTES = { neo: 'Neo-scandi', talasaman: 'Talasaman.is' };
const paletteButton = document.getElementById('toggle-palette');
const paletteName = document.getElementById('palette-name');

function setPalette(name) {
  if (name === 'talasaman') document.documentElement.dataset.palette = name;
  else delete document.documentElement.dataset.palette;
  localStorage.setItem('palette', name);
  paletteName.textContent = PALETTES[name];
}

setPalette(document.documentElement.dataset.palette ?? 'neo');
paletteButton.addEventListener('click', () => {
  setPalette(document.documentElement.dataset.palette === 'talasaman' ? 'neo' : 'talasaman');
});

for (const p of PAGES) {
  const a = document.createElement('a');
  a.href = `#/${p.id}`;
  a.textContent = p.title;
  a.dataset.page = p.id;
  nav.append(a);
}

// ---- Routing ----------------------------------------------------------------

function route() {
  const id = location.hash.replace(/^#\/?/, '') || 'overview';
  const p = PAGES.find((x) => x.id === id) ?? PAGES[0];

  for (const a of nav.querySelectorAll('a')) {
    a.classList.toggle('active', a.dataset.page === p.id);
  }
  crumb.textContent = p.title;
  document.title = `${p.title} · Talasaman gögn`;
  if (narrow.matches) setSidebar(false);

  page.replaceChildren(p.id === 'overview' ? overviewPage() : endpointPage(p));
  page.scrollTop = 0;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();

// ---- Pages ------------------------------------------------------------------

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function overviewPage() {
  const tiles = el('div', { className: 'tiles' });
  const root = el('article', {},
    el('h1', {}, 'Talasaman gögn'),
    el('p', { className: 'lede' },
      'Open data from Samtal, a public conversation project across Iceland. Each page in the sidebar is one dataset from the ',
      el('a', { href: 'https://talasaman.is/gogn' }, 'open API'),
      '. Load it, look at it, collapse it.'),
    tiles,
    el('h2', {}, 'Datasets'),
    el('ul', { className: 'index' }, ...PAGES.slice(1).map((p) =>
      el('li', {},
        el('a', { href: `#/${p.id}` }, p.title),
        el('span', {}, p.intro.split('. ')[0].replace(/\.$/, '') + '.')))),
  );

  fetchEndpoint('stats').then(({ data }) => {
    const labels = {
      participants: 'Participants',
      circlesWithMembers: 'Circles with members',
      locations: 'Locations',
      places: 'Places',
      topicWords: 'Topic words',
    };
    tiles.replaceChildren(...data.map((r) =>
      el('div', { className: 'tile' },
        el('span', { className: 'tile-value' }, r.value.toLocaleString('is-IS')),
        el('span', { className: 'tile-label' }, labels[r.metric] ?? r.metric))));
  }).catch(() => tiles.remove());

  return root;
}

function endpointPage(p) {
  const results = el('div', { className: 'results' });
  const button = el('button', { className: 'endpoint' },
    el('span', { className: 'method' }, 'GET'), ` /api/v1/${p.id}`);
  button.addEventListener('click', () => load(p, button, results));

  return el('article', {},
    el('h1', {}, p.title),
    el('p', { className: 'lede' }, p.intro),
    el('div', { className: 'actions' },
      button,
      el('a', { className: 'raw', href: `${API}/${p.id}`, target: '_blank', rel: 'noopener' }, 'JSON'),
      el('a', { className: 'raw', href: `${API}/${p.id}?format=csv`, target: '_blank', rel: 'noopener' }, 'CSV')),
    results,
  );
}

// ---- Loading ----------------------------------------------------------------

async function fetchEndpoint(name) {
  const res = await fetch(`${API}/${name}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function load(p, button, results) {
  button.disabled = true;
  let section = results.querySelector('details');
  if (!section) {
    section = el('details', {}, el('summary'), el('div', { className: 'body' }));
    results.append(section);
  }
  const summary = section.querySelector('summary');
  const body = section.querySelector('.body');
  summary.textContent = 'Loading…';
  section.open = true;

  try {
    const { data, meta } = await fetchEndpoint(p.id);
    body.replaceChildren(p.render ? await p.render(data, buildTable) : buildTable(data));
    const time = new Date(meta.generatedAt).toLocaleString('is-IS');
    summary.textContent = `${meta.count.toLocaleString('is-IS')} rows · ${time}`;
  } catch (err) {
    summary.textContent = 'Failed to load';
    body.replaceChildren(el('p', { className: 'error' }, err.message));
  } finally {
    button.disabled = false;
  }
}

// ---- Table ------------------------------------------------------------------

function buildTable(rows) {
  if (!rows.length) return el('p', {}, 'No rows.');

  const columns = Object.keys(rows[0]);
  const table = document.createElement('table');

  const headRow = table.createTHead().insertRow();
  for (const col of columns) headRow.append(el('th', {}, col));

  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const col of columns) renderCell(tr.insertCell(), row[col]);
  }

  return el('div', { className: 'table-wrap' }, table);
}

function renderCell(td, value) {
  if (value === null || value === undefined) {
    td.textContent = '—';
    td.className = 'empty';
  } else if (typeof value === 'string' && value.startsWith('https://')) {
    td.append(el('a', { href: value, target: '_blank', rel: 'noopener' }, 'link'));
  } else if (typeof value === 'number') {
    td.textContent = value.toLocaleString('is-IS');
    td.className = 'num';
  } else if (typeof value === 'object') {
    td.textContent = JSON.stringify(value);
  } else {
    td.textContent = String(value);
  }
}
