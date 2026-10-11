// Routes the recordings through the clean-up chain. One shared AudioContext,
// started the first time a clip plays (browsers only allow audio after a
// click). With "Radio sound" off every stage is bypassed, so the sound is
// unchanged — but the visualiser can still compare before and after.
// Settings are remembered in localStorage. Moving any slider turns the
// current preset into the "custom" one, which is stored in full.

import { GESTURE_EVENTS } from '../lib/dom.js';
import { STAGES, createRadioChain } from './radio-chain.js';
import { PRESETS, DEFAULT_PRESET } from './presets.js';

const STORAGE_KEY = 'radio';
const players = new Set();
const connected = new WeakSet();
const listeners = new Set();
let engine = null;   // { ctx, chain, taps } once started
let starting = null; // the start-up promise, so it only happens once

export const CUSTOM = 'custom';

/** Current settings: on/off, which preset, the custom values, and which stages are in use. */
export const settings = loadSettings();

/** A full copy of a preset's stage settings, with `values` laid over it stage by stage. */
function presetWith(base, values = {}) {
  const copy = structuredClone(base);
  for (const [stage, params] of Object.entries(values)) Object.assign(copy[stage] ?? {}, params);
  return copy;
}

/** The saved settings, filled in with defaults; the defaults if none are saved or they can't be read. */
function loadSettings() {
  const defaults = { on: false, preset: DEFAULT_PRESET, custom: null, stages: Object.fromEntries(STAGES.map((s) => [s.id, true])) };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const loaded = { ...defaults, ...saved, stages: { ...defaults.stages, ...saved?.stages } };
    // Stored custom values are laid over a preset, so settings added later still have a value.
    if (loaded.custom) loaded.custom = presetWith(PRESETS[DEFAULT_PRESET], loaded.custom);
    const known = PRESETS[loaded.preset] || (loaded.preset === CUSTOM && loaded.custom);
    if (!known) loaded.preset = DEFAULT_PRESET; // e.g. settings from an older version
    delete loaded.amount;
    return loaded;
  } catch {
    return defaults;
  }
}

/** The settings the chain uses now: a preset's, or the custom ones. */
export function currentPreset() {
  return settings.preset === CUSTOM ? settings.custom : PRESETS[settings.preset];
}

/** Change one value of one stage (from a slider); switches to the custom preset. */
export function setStageValue(stage, key, value) {
  updateRadio({ preset: CUSTOM, custom: presetWith(currentPreset(), { [stage]: { [key]: value } }) });
}

/** Analysers on the chain's input (original) and output (radio sound). */
function createTaps(ctx, chain) {
  const tap = () => new AnalyserNode(ctx, { fftSize: 4096, smoothingTimeConstant: 0.75 });
  const taps = { input: tap(), output: tap() };
  chain.input.connect(taps.input);
  chain.output.connect(taps.output);
  return taps;
}

/** Send one player into the chain (possible only once per element). */
function connect(audio) {
  if (!engine || connected.has(audio)) return;
  engine.ctx.createMediaElementSource(audio).connect(engine.chain.input);
  connected.add(audio);
}

/** Push the settings into the running chain; with the switch off every stage is bypassed. */
function apply() {
  if (!engine) return;
  engine.chain.configure(currentPreset());
  for (const { id } of STAGES) engine.chain.setStage(id, settings.on && settings.stages[id]);
}

let context = null;

/** Resume the AudioContext if the browser left it suspended. */
function wakeContext() {
  if (context && context.state !== 'running') context.resume().catch(() => {});
}

/**
 * The AudioContext, created on first use. Phones (iOS Safari above all) only
 * let a context make sound if it is created or resumed during a tap, click
 * or key press itself — not after an await — so this runs synchronously in
 * the play handler, and any later gesture wakes it again (see below).
 */
function audioContext() {
  context ??= new AudioContext();
  wakeContext();
  return context;
}

// A gesture anywhere wakes a context the browser left suspended.
for (const type of GESTURE_EVENTS) document.addEventListener(type, wakeContext, true);

/** What happened when the engine started, for audioStatus(). */
const startup = { error: null, worklets: true };

/** The stages that run as AudioWorklets (they need a secure https page). */
const WORKLET_STAGES = ['denoise', 'expander'];

/**
 * Load the worklet stages. Without them (no AudioWorklet on a page that
 * isn't https, or a browser that refuses them) the chain still runs
 * without those two stages, so playback and the visualisers keep working.
 */
async function loadWorklets(ctx) {
  try {
    await ctx.audioWorklet.addModule(new URL('./denoise-worklet.js', import.meta.url));
    await ctx.audioWorklet.addModule(new URL('./expander-worklet.js', import.meta.url));
    return true;
  } catch (err) {
    startup.error = `Noise reduction and expander unavailable: ${err.message}`;
    return false;
  }
}

/** The current preset, minus the worklet stages if they couldn't load. */
const chainPreset = () => (startup.worklets
  ? currentPreset()
  : { ...currentPreset(), order: STAGES.map((s) => s.id).filter((id) => !WORKLET_STAGES.includes(id)) });

/** Start the audio engine once; later calls wait for the same start-up. */
function startEngine() {
  const ctx = audioContext(); // synchronously, while the gesture still counts
  starting ??= (async () => {
    startup.worklets = await loadWorklets(ctx);
    const chain = createRadioChain(ctx, chainPreset());
    chain.output.connect(ctx.destination);
    engine = { ctx, chain, taps: createTaps(ctx, chain) };
    players.forEach(connect);
    apply();
    listeners.forEach((fn) => fn(engine));
  })();
  starting.catch((err) => {
    startup.error = err.message;
    console.error('Radio sound could not start:', err);
  });
  return starting;
}

/** How the audio engine is doing, for the debug panel. */
export function audioStatus() {
  return {
    secure: window.isSecureContext,
    workletSupport: Boolean(window.AudioWorkletNode),
    context: context?.state ?? 'not created',
    engine: engine ? 'running' : starting ? 'starting or failed' : 'not started (press play)',
    worklets: startup.worklets,
    error: startup.error,
  };
}

/** Every player on the page registers here; pressing play starts the engine. */
export function registerPlayer(audio) {
  players.add(audio);
  connect(audio);
  audio.addEventListener('play', async () => {
    await startEngine();
    connect(audio);
    audioContext();
  });
}

/** Change settings (from a click). */
export function updateRadio(change) {
  Object.assign(settings, change, { stages: { ...settings.stages, ...change.stages } });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  apply();
}

/** The before/after analysers, now if running or as soon as the engine starts. */
export function onTaps(callback) {
  if (engine) callback(engine);
  else listeners.add(callback);
}
