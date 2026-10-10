// Summaries › Audio › Link builder: what each part of the listening view's
// address does, and a form that writes such an address. One checkbox per
// part; a ticked part shows its control and goes into the link, which is
// written with lib/listen-address.js (the same code the #/listen route reads
// it with). The recordings come from /summaries, as on the Audio page.

import { el } from '../lib/dom.js';
import { recordingTitle } from '../lib/format.js';
import { fetchRecordings } from '../lib/recordings.js';
import { optionsFor } from '../components/table-filters.js';
import { PRESETS, DEFAULT_PRESET } from '../audio/presets.js';
import {
  parseListenHash, buildListenHash, listenPlaylist, parseTime, formatTime, PRESET_CHOICES, NO_OPTIONS,
} from '../lib/listen-address.js';

/** The link last built, so leaving to try it and coming back keeps the choices. */
let lastHash = null;

const TIME_HINT = 'Minutes and seconds (1:30) or seconds (90).';

/** The parts of the address, for the table: [part, what it does, example]. */
const partRows = (example) => [
  ['Recording number', 'Start at this recording, counting from 1 in the Audio page\'s order. Past the last one, the last plays. With a topic or location, a recording they leave out is skipped to the next one that is in.', '#/listen/7'],
  ['t', 'Start this far into that recording: minutes:seconds or seconds. Only read when the link is opened; the address leaves it out once the next recording starts.', '#/listen/7?t=1:30'],
  ['topic', 'Only recordings on this topic, as in the Audio page\'s Topic filter. A topic no recording has is ignored.', buildListenHash({ topic: example.topic })],
  ['location', 'Only recordings from this location, as in the Location filter. Combines with topic.', buildListenHash({ location: example.location })],
  ['preset', 'Radio sound: clear, natural or radio, or off to switch it off. Remembered afterwards, like the Audio page\'s switch.', '#/listen?preset=natural'],
  ['mood', 'How the image moves with the voice: calm, or aggressive (the default).', '#/listen?mood=calm'],
  ['loop', 'loop=0 stops after the last recording; by default it starts over.', '#/listen?loop=0'],
];

/** The table explaining each part, with examples drawn from the recordings. */
function partsTable(rows) {
  return el('div', { className: 'table-wrap lb-parts' },
    el('table', {},
      el('thead', {}, el('tr', {}, ...['Part', 'What it does', 'Example'].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, ...partRows(rows[0] ?? { topic: 'gervigreind', location: 'Tækniskólinn' }).map(([part, what, example]) =>
        el('tr', {},
          el('th', { scope: 'row' }, part),
          el('td', {}, what),
          el('td', {}, el('code', {}, example)))))));
}

/** A labelled dropdown of [value, text] choices. */
function selectControl(id, label, choices) {
  const select = el('select', { id, className: 'filter' },
    ...choices.map(([value, text]) => el('option', { value }, text)));
  return {
    node: el('div', { className: 'lb-field' }, el('label', { htmlFor: id }, label), select),
    select,
    get: () => select.value || null,
    set: (value) => { select.value = value; },
  };
}

/** A fieldset of radio buttons over [value, text] choices, `initial` picked. */
function radioControl(name, legend, choices, initial) {
  const inputs = choices.map(([value]) => el('input', { type: 'radio', name, value, checked: value === initial }));
  return {
    node: el('fieldset', { className: 'lb-radios' }, el('legend', {}, legend),
      ...choices.map(([, text], i) => el('label', { className: 'lb-radio' }, inputs[i], text))),
    get: () => inputs.find((input) => input.checked)?.value ?? null,
    set: (value) => inputs.forEach((input) => { input.checked = input.value === String(value); }),
  };
}

/** The start time, typed as 1:30 or 90; says so when it can't be read. */
function timeControl() {
  const hint = el('p', { className: 'lb-hint', id: 'lb-t-hint' }, TIME_HINT);
  const input = el('input', { id: 'lb-t', className: 'filter lb-time', value: '1:30', autocomplete: 'off', spellcheck: false });
  input.setAttribute('aria-describedby', hint.id);
  input.addEventListener('input', () => {
    const bad = parseTime(input.value) === null;
    input.ariaInvalid = String(bad);
    hint.textContent = bad ? `Not a time yet, so it is left out. ${TIME_HINT}` : TIME_HINT;
    hint.classList.toggle('error', bad);
  });
  return {
    node: el('div', { className: 'lb-field' }, el('label', { htmlFor: input.id }, 'Start at'), input, hint),
    get: () => parseTime(input.value),
    set: (seconds) => { input.value = formatTime(seconds); },
  };
}

/** Picks a recording, listing those the chosen topic and location leave ('7 · topic · place · Borð 2'). */
function recordingControl(rows) {
  const control = selectControl('lb-recording', 'Recording', []);
  /** List the recordings that `filters` ({ topic, location }) leave, keeping the choice if it is still there. */
  control.refresh = (filters) => {
    const chosen = control.select.value;
    control.select.replaceChildren(...listenPlaylist(rows, filters).entries.map(({ row, number }) =>
      el('option', { value: number }, `${number} · ${recordingTitle(row)}`)));
    const options = [...control.select.options];
    if (options.some((option) => option.value === chosen)) control.set(chosen);
    else if (options.length) control.set(options[0].value); // the first that is left
  };
  const get = control.get;
  control.get = () => (get() ? +get() : null);
  control.refresh({});
  return control;
}

/** Two choices standing for true and false, read and set as a boolean. */
function booleanRadios(name, legend, [yes, no], initial) {
  const radios = radioControl(name, legend, [['1', yes], ['0', no]], initial ? '1' : '0');
  return { ...radios, get: () => radios.get() === '1', set: (value) => radios.set(value ? '1' : '0') };
}

/** Every part's control, with the name on its checkbox, in the address's order. */
function partControls(rows) {
  const choicesOf = (column) => optionsFor(rows.map((r) => r[column])).map((v) => [v, v]);
  const presetLabel = (id) => PRESETS[id]?.label ?? 'Off';
  return {
    recording: { label: 'Recording number', control: recordingControl(rows) },
    t: { label: 'Start time (t)', control: timeControl() },
    topic: { label: 'Topic', control: selectControl('lb-topic', 'Topic', choicesOf('topic')) },
    location: { label: 'Location', control: selectControl('lb-location', 'Location', choicesOf('location')) },
    preset: { label: 'Radio sound (preset)', control: radioControl('lb-preset', 'Radio sound', PRESET_CHOICES.map((id) => [id, presetLabel(id)]), DEFAULT_PRESET) },
    mood: { label: 'Chorus (mood)', control: radioControl('lb-mood', 'Chorus', [['calm', 'Calm'], ['aggressive', 'Aggressive']], 'calm') },
    loop: { label: 'After the last (loop)', control: booleanRadios('lb-loop', 'After the last recording', ['Start over', 'Stop'], false) },
  };
}

/** One part: its checkbox, and its control, shown only while ticked. */
function partRow(key, { label, control }) {
  const checkbox = el('input', { type: 'checkbox', id: `lb-${key}-on`, className: 'lb-check' });
  const body = el('div', { className: 'lb-control', hidden: true }, control.node);
  checkbox.addEventListener('change', () => { body.hidden = !checkbox.checked; });
  const node = el('div', { className: 'lb-part' },
    el('label', { className: 'lb-toggle', htmlFor: checkbox.id }, checkbox, label), body);
  return { node, checkbox, body };
}

/** The generated link with Copy and Open. Returns { node, show(hash) }. */
function linkOutput() {
  const field = el('input', { id: 'lb-link', className: 'filter lb-link', readOnly: true });
  const status = el('p', { className: 'lb-status', role: 'status' });
  const copy = el('button', { type: 'button', className: 'lb-button' }, 'Copy');
  const open = el('a', { className: 'lb-button' }, 'Open');
  copy.addEventListener('click', () => navigator.clipboard.writeText(field.value)
    .then(() => { status.textContent = 'Copied'; })
    .catch(() => { field.select(); status.textContent = 'Could not copy: the link is selected, so press Ctrl+C (⌘C) to copy it.'; }));
  field.addEventListener('focus', () => field.select());
  const node = el('div', { className: 'lb-output' },
    el('label', { htmlFor: field.id }, 'Your link'), field,
    el('div', { className: 'lb-actions' }, copy, open, status));
  return {
    node,
    show: (hash) => {
      field.value = `${location.origin}${location.pathname}${hash}`;
      open.href = hash;
      status.textContent = '';
    },
  };
}

/** The options the ticked parts give; unticked parts are null. */
function chosenOptions(parts) {
  const options = { ...NO_OPTIONS };
  for (const [key, { row, control }] of Object.entries(parts)) {
    if (row.checkbox.checked) options[key] = control.get();
  }
  return options;
}

/** Tick and set the parts an address has (to come back to the last link built). */
function restore(parts, hash) {
  const options = parseListenHash(hash);
  for (const [key, { row, control }] of Object.entries(parts)) {
    if (options[key] === null) continue;
    row.checkbox.checked = true;
    row.body.hidden = false;
    control.set(options[key]);
  }
}

/** The builder form: a checkbox per part, then the link it makes. */
function linkBuilder(rows) {
  const parts = partControls(rows);
  for (const [key, part] of Object.entries(parts)) part.row = partRow(key, part);
  const output = linkOutput();
  const update = () => {
    const { topic, location } = chosenOptions(parts);
    parts.recording.control.refresh({ topic, location });
    lastHash = buildListenHash(chosenOptions(parts));
    output.show(lastHash);
  };
  const form = el('form', { className: 'link-builder' },
    el('fieldset', { className: 'lb-parts-list' },
      el('legend', {}, 'Parts to put in the link'),
      ...Object.values(parts).map((part) => part.row.node)),
    output.node);
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  if (lastHash) restore(parts, lastHash);
  update();
  return form;
}

/** The Link builder page: the parts explained, then the builder, once the recordings arrive. */
export function linkBuilderPage(page) {
  const area = el('div', {}, el('p', { className: 'table-status' }, 'Loading recordings…'));
  fetchRecordings()
    .then((rows) => area.replaceChildren(
      el('h2', {}, 'The parts of the address'),
      partsTable(rows),
      el('p', { className: 'caption' }, 'Put the recording number after #/listen/, and the other parts after a ?, joined with &: ',
        el('code', {}, '#/listen/7?t=1:30&mood=calm'), '.'),
      el('h2', {}, 'Build a link'),
      linkBuilder(rows)))
    .catch((err) => area.replaceChildren(el('p', { className: 'error', role: 'alert' }, err.message)));
  return el('article', { className: 'link-builder-page' },
    el('h1', {}, page.title),
    el('p', { className: 'lede' }, page.intro),
    area);
}
