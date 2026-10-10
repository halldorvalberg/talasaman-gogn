const API = 'https://talasaman.is/api/v1';
const ENDPOINTS = ['circles', 'places', 'islenskast', 'topics', 'summaries', 'stats'];

const nav = document.getElementById('endpoints');
const results = document.getElementById('results');

for (const name of ENDPOINTS) {
  const button = document.createElement('button');
  button.textContent = `GET /api/v1/${name}`;
  button.addEventListener('click', () => load(name, button));
  nav.append(button);
}

async function load(name, button) {
  button.disabled = true;
  const section = sectionFor(name);
  section.querySelector('summary').textContent = `GET /api/v1/${name} — loading…`;
  section.open = true;

  try {
    const res = await fetch(`${API}/${name}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data, meta } = await res.json();
    const time = new Date(meta.generatedAt).toLocaleString('is-IS');
    section.querySelector('summary').textContent =
      `GET /api/v1/${name} — ${meta.count} rows · ${time}`;
    section.querySelector('.body').replaceChildren(buildTable(data));
  } catch (err) {
    section.querySelector('summary').textContent = `GET /api/v1/${name} — failed`;
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = err.message;
    section.querySelector('.body').replaceChildren(p);
  } finally {
    button.disabled = false;
  }
}

// One collapsible section per endpoint; reloading replaces its contents.
function sectionFor(name) {
  let section = document.getElementById(`result-${name}`);
  if (!section) {
    section = document.createElement('details');
    section.id = `result-${name}`;
    section.innerHTML = '<summary></summary><div class="body"></div>';
    results.prepend(section);
  }
  return section;
}

function buildTable(rows) {
  if (!rows.length) {
    const p = document.createElement('p');
    p.textContent = 'No rows.';
    return p;
  }

  const columns = Object.keys(rows[0]);
  const table = document.createElement('table');

  const headRow = table.createTHead().insertRow();
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col;
    headRow.append(th);
  }

  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const col of columns) renderCell(tr.insertCell(), row[col]);
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.append(table);
  return wrap;
}

function renderCell(td, value) {
  if (value === null || value === undefined) {
    td.textContent = '—';
    td.className = 'empty';
  } else if (typeof value === 'string' && value.startsWith('https://')) {
    const a = document.createElement('a');
    a.href = value;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'link';
    td.append(a);
  } else if (typeof value === 'number') {
    td.textContent = value.toLocaleString('is-IS');
    td.className = 'num';
  } else if (typeof value === 'object') {
    td.textContent = JSON.stringify(value);
  } else {
    td.textContent = String(value);
  }
}
