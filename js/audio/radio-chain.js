// The speech clean-up chain, built from Web Audio nodes:
//   noise reduction → high-pass → expander → de-esser → EQ → compressors → limiter
// (The high-pass comes after the noise reduction because the FFT processing
// there leaks a little energy into the lowest frequencies; the steep filter
// cleans that up.)
// Every stage can be bypassed on its own (with a short crossfade, so no
// clicks). All settings come from a preset (see presets.js) and can be
// changed while playing. Needs both worklets loaded first:
//   denoise-worklet.js ('denoiser') and expander-worklet.js ('downward-expander').

export const STAGES = [
  { id: 'denoise', label: 'Noise reduction' },
  { id: 'highpass', label: 'High-pass' },
  { id: 'expander', label: 'Expander' },
  { id: 'deesser', label: 'De-esser' },
  { id: 'eq', label: 'EQ' },
  { id: 'compressor', label: 'Compressors' },
  { id: 'limiter', label: 'Limiter' },
];

const FADE = 0.02; // s, time constant for bypass crossfades and setting changes
// Web Audio reads a high-/low-pass filter's Q in dB, not as a plain factor:
// a Butterworth (flat, no bump) Q of 1/√2 is 20·log10(1/√2) ≈ −3 dB.
const BUTTERWORTH_Q = 20 * Math.log10(Math.SQRT1_2);

const dbToGain = (db) => 10 ** (db / 20);

/** Connect nodes in a row; returns [first, last]. */
function series(...nodes) {
  nodes.reduce((a, b) => a.connect(b));
  return [nodes[0], nodes.at(-1)];
}

const biquad = (ctx, type, frequency, Q = BUTTERWORTH_Q) => new BiquadFilterNode(ctx, { type, frequency, Q });

/**
 * The extra gain a DynamicsCompressorNode adds on its own. The Web Audio
 * spec has it apply "makeup gain" of (1 / fullRangeGain)^0.6, where
 * fullRangeGain is what its curve does to a 0 dBFS signal. Left alone this
 * lifts everything — background noise included — by up to ~16 dB per
 * compressor, so we cancel it and set makeup explicitly instead.
 */
function autoMakeupDb(threshold, ratio) {
  const fullRangeDb = threshold + (0 - threshold) / ratio; // output level for a 0 dBFS input
  return -0.6 * fullRangeDb;
}

/**
 * A compressor followed by a gain that cancels its automatic makeup.
 * Returns { input, output, set(threshold, ratio, setter) }.
 */
function compressor(ctx, options) {
  const node = new DynamicsCompressorNode(ctx, options);
  const cancel = new GainNode(ctx);
  node.connect(cancel);
  const update = (threshold, ratio, set) => {
    set(node.threshold, threshold);
    set(node.ratio, ratio);
    set(cancel.gain, dbToGain(-autoMakeupDb(threshold, ratio)));
  };
  update(options.threshold ?? -24, options.ratio ?? 12, setNow);
  return { input: node, output: cancel, update };
}

/** Wrap a path (first…last) in wet/dry gains so it can be switched off cleanly. */
function bypassable(ctx, [first, last]) {
  const input = new GainNode(ctx), output = new GainNode(ctx);
  const wet = new GainNode(ctx, { gain: 1 }), dry = new GainNode(ctx, { gain: 0 });
  input.connect(first);
  last.connect(wet).connect(output);
  input.connect(dry).connect(output);
  return {
    input,
    output,
    set(on) {
      const t = ctx.currentTime;
      wet.gain.setTargetAtTime(on ? 1 : 0, t, FADE);
      dry.gain.setTargetAtTime(on ? 0 : 1, t, FADE);
    },
  };
}

// ---- Stages: each returns { path: [first, last], configure(settings, set) } --
// `set(param, value)` changes an AudioParam smoothly (no zipper noise).

/** Steep (24 dB/oct) cut below the voice: rumble, wind, handling noise. */
function highPass(ctx) {
  const filters = [biquad(ctx, 'highpass', 100), biquad(ctx, 'highpass', 100)];
  return {
    path: series(...filters),
    configure: ({ freq }, set) => filters.forEach((f) => set(f.frequency, freq)),
  };
}

/** Spectral noise reduction: removes steady background noise under and between words. */
function denoise(ctx) {
  const node = new AudioWorkletNode(ctx, 'denoiser');
  return {
    path: series(node),
    configure({ reduction, oversubtract }, set) {
      set(node.parameters.get('reduction'), reduction);
      set(node.parameters.get('oversubtract'), oversubtract);
    },
  };
}

/** Makes the gaps between words quieter; its threshold follows each recording's noise floor. */
function expander(ctx) {
  const node = new AudioWorkletNode(ctx, 'downward-expander');
  return {
    path: series(node),
    configure(settings, set) {
      for (const name of ['threshold', 'margin', 'ratio', 'attack', 'release']) set(node.parameters.get(name), settings[name]);
    },
  };
}

/**
 * Removes the sharp hiss on s-sounds: a Linkwitz–Riley crossover, and only
 * the top band is compressed, so the rest of the voice is untouched.
 */
function deEsser(ctx) {
  const input = new GainNode(ctx), output = new GainNode(ctx);
  const low = [biquad(ctx, 'lowpass', 5500), biquad(ctx, 'lowpass', 5500)];
  const high = [biquad(ctx, 'highpass', 5500), biquad(ctx, 'highpass', 5500)];
  const squash = compressor(ctx, { knee: 6, attack: 0.001, release: 0.06 });
  series(input, ...low, output);
  series(input, ...high, squash.input);
  squash.output.connect(output);
  return {
    path: [input, output],
    configure({ freq, threshold, ratio }, set) {
      [...low, ...high].forEach((f) => set(f.frequency, freq));
      squash.update(threshold, ratio, set);
    },
  };
}

/** Voice EQ: less mud, a presence lift where clarity lives, a little air. */
function eq(ctx) {
  const mud = new BiquadFilterNode(ctx, { type: 'peaking', Q: 1 });
  const presence = new BiquadFilterNode(ctx, { type: 'peaking' });
  const air = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 8000 });
  return {
    path: series(mud, presence, air),
    configure(s, set) {
      set(mud.frequency, s.mudFreq);
      set(mud.gain, s.mud);
      set(presence.frequency, s.presenceFreq);
      set(presence.Q, s.presenceQ);
      set(presence.gain, s.presence);
      set(air.gain, s.air);
    },
  };
}

/** A slow leveller evens out speakers and sentences; a faster one controls words; then makeup gain. */
function compressors(ctx) {
  const leveller = compressor(ctx, { knee: 10, attack: 0.02, release: 0.4 });
  const fast = compressor(ctx, { knee: 4, attack: 0.003, release: 0.12 });
  const makeup = new GainNode(ctx);
  leveller.output.connect(fast.input);
  fast.output.connect(makeup);
  return {
    path: [leveller.input, makeup],
    configure(s, set) {
      leveller.update(s.levellerThreshold, s.levellerRatio, set);
      fast.update(s.threshold, s.ratio, set);
      set(makeup.gain, dbToGain(s.makeup));
    },
  };
}

/**
 * A transfer curve that is straight up to `knee`, then bends smoothly
 * (tanh) towards ±1, so the output can never exceed full scale.
 */
function softClipCurve(knee = 0.89, points = 2048) {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const over = Math.abs(x) - knee;
    curve[i] = over <= 0 ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh(over / (1 - knee)));
  }
  return curve;
}

/**
 * Ceiling: a fast, hard compressor catches most peaks; the soft clipper
 * after it rounds off whatever overshoot gets through, so nothing passes
 * 0 dBFS. (Web Audio's compressor alone isn't a brick wall.)
 */
function limiter(ctx) {
  const hard = compressor(ctx, { knee: 0, ratio: 20, attack: 0.001, release: 0.05 });
  const clip = new WaveShaperNode(ctx, { curve: softClipCurve(), oversample: '4x' });
  hard.output.connect(clip);
  return {
    path: [hard.input, clip],
    configure: ({ threshold }, set) => hard.update(threshold, 20, set),
  };
}

const BUILDERS = { highpass: highPass, denoise, expander, deesser: deEsser, eq, compressor: compressors, limiter };

/** The stages in `order`, each wrapped in its bypass switch and connected in a row. */
function buildStages(ctx, order) {
  const stages = order.map((id) => {
    const stage = BUILDERS[id](ctx);
    return { id, ...stage, switch: bypassable(ctx, stage.path) };
  });
  stages.reduce((a, b) => (a.switch.output.connect(b.switch.input), b));
  return stages;
}

/** Set an AudioParam at once. */
const setNow = (param, value) => { param.value = value; };

/** Set an AudioParam with a short glide, so changes while playing don't click. */
const smoothSetter = (ctx) => (param, value) => param.setTargetAtTime(value, ctx.currentTime, FADE);

/**
 * Build the whole chain with a preset's settings. A preset may give its own
 * `order` of stage ids (e.g. the expander after the compressors).
 * @returns {{ input: AudioNode, output: AudioNode, setStage(id, on), configure(preset) }}
 */
export function createRadioChain(ctx, preset) {
  const stages = buildStages(ctx, preset.order ?? STAGES.map((s) => s.id));
  const configureWith = (p, set) => stages.forEach((s) => s.configure(p[s.id], set)); // order is fixed once built
  configureWith(preset, setNow); // the first settings go in directly
  const configure = (p) => configureWith(p, smoothSetter(ctx));

  return {
    input: stages[0].switch.input,
    output: stages.at(-1).switch.output,
    setStage: (id, on) => stages.find((s) => s.id === id).switch.set(on),
    configure,
  };
}
