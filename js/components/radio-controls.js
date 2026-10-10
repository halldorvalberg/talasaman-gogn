// The "Radio sound" panel on the Audio page: one on/off switch, a choice of
// preset, a card per processing stage (an on/off toggle and sliders for its
// settings), and a before/after visualiser. Moving a slider switches to the
// "Custom" preset; picking another preset moves the sliders to its values.

import { el } from '../lib/dom.js';
import { STAGES } from '../audio/radio-chain.js';
import { PRESETS } from '../audio/presets.js';
import { settings, updateRadio, currentPreset, setStageValue, CUSTOM } from '../audio/radio.js';
import { radioVisualizer } from './radio-visualizer.js';

const HINTS = {
  denoise: 'Removes steady background noise, under and between words',
  highpass: 'Cuts everything below the cut-off: rumble and handling noise',
  expander: 'Makes the gaps between words quieter',
  deesser: 'Removes the sharp hiss on s-sounds',
  eq: 'Less boom, more clarity in the voice',
  compressor: 'Evens out loud and quiet speech',
  limiter: 'Stops peaks from clipping',
};

const hz = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(1)} kHz` : `${v} Hz`);
const db = (v) => `${v > 0 ? '+' : ''}${v} dB`;
const ratio = (v) => `${v}:1`;
const ms = (v) => `${Math.round(v * 1000)} ms`;

/** The sliders of each stage: which setting, its range, and how to show its value. */
const SLIDERS = {
  denoise: [
    { key: 'reduction', label: 'Reduction', min: 0, max: 40, step: 1, show: db },
    { key: 'oversubtract', label: 'Strength', min: 1, max: 4, step: 0.1, show: (v) => `×${v}` },
  ],
  highpass: [
    { key: 'freq', label: 'Cut-off', min: 20, max: 300, step: 5, show: hz },
  ],
  expander: [
    { key: 'margin', label: 'Above noise', min: 0, max: 24, step: 1, show: db },
    { key: 'threshold', label: 'Threshold cap', min: -60, max: -10, step: 1, show: db },
    { key: 'ratio', label: 'Ratio', min: 1, max: 8, step: 0.5, show: ratio },
    { key: 'release', label: 'Release', min: 0.03, max: 0.5, step: 0.01, show: ms },
  ],
  deesser: [
    { key: 'freq', label: 'From', min: 3000, max: 10000, step: 100, show: hz },
    { key: 'threshold', label: 'Threshold', min: -60, max: 0, step: 1, show: db },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, show: ratio },
  ],
  eq: [
    { key: 'mudFreq', label: 'Mud at', min: 100, max: 600, step: 10, show: hz },
    { key: 'mud', label: 'Mud', min: -12, max: 6, step: 0.5, show: db },
    { key: 'presenceFreq', label: 'Presence at', min: 1000, max: 6000, step: 100, show: hz },
    { key: 'presence', label: 'Presence', min: -6, max: 12, step: 0.5, show: db },
    { key: 'air', label: 'Air (8 kHz+)', min: -6, max: 9, step: 0.5, show: db },
  ],
  compressor: [
    { key: 'levellerThreshold', label: 'Leveller threshold', min: -50, max: 0, step: 1, show: db },
    { key: 'levellerRatio', label: 'Leveller ratio', min: 1, max: 6, step: 0.1, show: ratio },
    { key: 'threshold', label: 'Fast threshold', min: -50, max: 0, step: 1, show: db },
    { key: 'ratio', label: 'Fast ratio', min: 1, max: 12, step: 0.5, show: ratio },
    { key: 'makeup', label: 'Makeup', min: 0, max: 20, step: 0.5, show: db },
  ],
  limiter: [
    { key: 'threshold', label: 'Ceiling', min: -12, max: 0, step: 0.5, show: db },
  ],
};

/** The "Radio sound" on/off switch. */
function powerSwitch(onChange) {
  const button = el('button', { className: 'radio-switch', role: 'switch' },
    el('span', { className: 'radio-switch-track', ariaHidden: 'true' }), 'Radio sound');
  const show = () => button.setAttribute('aria-checked', String(settings.on));
  button.addEventListener('click', () => { updateRadio({ on: !settings.on }); show(); onChange(); });
  show();
  return button;
}

/** Natural / Clear / Radio / Custom, as a row of radio buttons. Returns { node, show }. */
function presetPicker(onChange) {
  const choices = [
    ...Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, hint: p.hint })),
    { id: CUSTOM, label: 'Custom', hint: 'Your own settings: move any slider' },
  ];
  const buttons = choices.map(({ id, label, hint }) => {
    const button = el('button', { className: 'radio-preset', title: hint, role: 'radio' }, label);
    button.dataset.preset = id;
    button.addEventListener('click', () => {
      // Custom starts from the current preset the first time.
      if (id === CUSTOM && !settings.custom) updateRadio({ custom: structuredClone(currentPreset()) });
      updateRadio({ preset: id });
      onChange();
    });
    return button;
  });
  const show = () => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset === settings.preset)));
  return { node: el('div', { className: 'radio-presets', role: 'radiogroup', ariaLabel: 'Preset' }, ...buttons), show };
}

/** One labelled slider for a stage setting. Returns { node, input, show }. */
function slider(stage, { key, label, min, max, step, show: format }, onChange) {
  const input = el('input', { type: 'range', min, max, step, className: 'radio-slider' });
  const value = el('output', { className: 'radio-value' });
  const showValue = () => {
    value.textContent = format(+input.value);
    input.ariaValueText = value.textContent;
  };
  const show = () => {
    input.value = currentPreset()[stage][key];
    showValue();
  };
  input.addEventListener('input', () => {
    setStageValue(stage, key, +input.value);
    showValue();
    onChange();
  });
  const node = el('label', { className: 'radio-control' },
    el('span', { className: 'radio-control-name' }, label), value, input);
  return { node, input, show };
}

/** A stage's card: its on/off toggle and its sliders. Returns { node, controls, show }. */
function stageCard({ id, label }, onChange) {
  const toggle = el('button', { className: 'radio-stage', title: HINTS[id] }, label);
  const showToggle = () => toggle.setAttribute('aria-pressed', String(settings.stages[id]));
  toggle.addEventListener('click', () => { updateRadio({ stages: { [id]: !settings.stages[id] } }); showToggle(); });
  const sliders = SLIDERS[id].map((spec) => slider(id, spec, onChange));
  const node = el('fieldset', { className: 'radio-card' },
    el('legend', {}, toggle),
    el('p', { className: 'radio-card-hint' }, HINTS[id]),
    ...sliders.map((s) => s.node));
  return {
    node,
    controls: [toggle, ...sliders.map((s) => s.input)],
    show: () => { showToggle(); sliders.forEach((s) => s.show()); },
  };
}

const PANEL_HINT =
  'Cleans up the recordings with classic sound processing (no AI): noise reduction, high-pass filter, ' +
  'expander, de-esser, EQ, compressors and a limiter, in that order. Turn single stages off to hear what each one does, ' +
  'or move a slider to make your own setting.';

/** The preset row and the stage cards, kept in step with the settings. */
function settingsControls() {
  const showAll = () => { presets.show(); cards.forEach((c) => c.show()); };
  const presets = presetPicker(showAll);
  // A slider only needs the preset row updated (it switched to Custom).
  const cards = STAGES.map((stage) => stageCard(stage, presets.show));
  /** Grey out everything but the switch while Radio sound is off. */
  const syncDisabled = () => {
    for (const c of [...presets.node.children, ...cards.flatMap((card) => card.controls)]) c.disabled = !settings.on;
  };
  syncDisabled();
  showAll();
  return { presets: presets.node, cards: cards.map((c) => c.node), syncDisabled };
}

/**
 * The whole panel.
 * @param {{ extra?: Node | Node[] }} [options] e.g. a "Play all" button, shown next to the presets
 */
export function radioControls({ extra } = {}) {
  const { presets, cards, syncDisabled } = settingsControls();
  return el('section', { className: 'radio-panel', ariaLabel: 'Radio sound processing' },
    el('div', { className: 'radio-row' }, powerSwitch(syncDisabled), presets, ...[extra ?? []].flat()),
    el('p', { className: 'radio-hint' }, PANEL_HINT),
    radioVisualizer(),
    el('div', { className: 'radio-cards' }, ...cards));
}
