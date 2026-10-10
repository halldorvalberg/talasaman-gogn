// Settings for the speech clean-up chain (radio-chain.js), one object per
// preset. Levels in dBFS, times in seconds, frequencies in Hz.
//
// Tuned offline against all 21 audible recordings with the harness in
// .claude/radio-tuning/ (see its README for the rounds and measurements).
// All three are level-matched (speech ≈ −18.5 dBFS) so switching presets
// doesn't just make things louder. Compared with the originals:
//   natural – least processing; brighter voice, peaks tamed, slightly more even
//   clear   – lowest background: speech/background contrast 38 → 42 dB
//             (noisy recordings 26 → 29.5 dB); no compression, since
//             compression lifts the background along with quiet speech
//   radio   – denser, most even loudness between recordings (spread 3.3 → 1.8 dB)

const NO_COMPRESSION = { levellerThreshold: 0, levellerRatio: 1, threshold: 0, ratio: 1 };

const shared = {
  highpass: { freq: 100 },
  deesser: { freq: 5500, threshold: -32, ratio: 6 },
  limiter: { threshold: -2 },
};

export const PRESETS = {
  natural: {
    label: 'Natural',
    hint: 'Gentle clean-up that keeps the recording natural',
    ...shared,
    denoise: { reduction: 18, oversubtract: 2 },
    expander: { threshold: -30, margin: 10, ratio: 2, attack: 0.005, release: 0.18 },
    eq: { mudFreq: 250, mud: -2, presenceFreq: 3500, presenceQ: 0.8, presence: 3, air: 0 },
    compressor: { levellerThreshold: -22, levellerRatio: 1.5, threshold: 0, ratio: 1, makeup: 4.5 },
  },
  clear: {
    label: 'Clear',
    hint: 'Least background noise, clearest voice',
    ...shared,
    denoise: { reduction: 30, oversubtract: 3.5 },
    expander: { threshold: -30, margin: 10, ratio: 2.5, attack: 0.005, release: 0.15 },
    eq: { mudFreq: 250, mud: -3, presenceFreq: 3500, presenceQ: 0.8, presence: 4, air: 0 },
    compressor: { ...NO_COMPRESSION, makeup: 2 },
  },
  radio: {
    label: 'Radio',
    hint: 'Denser, even loudness, like broadcast radio',
    ...shared,
    denoise: { reduction: 30, oversubtract: 3.5 },
    expander: { threshold: -28, margin: 10, ratio: 3, attack: 0.005, release: 0.15 },
    eq: { mudFreq: 250, mud: -3, presenceFreq: 3500, presenceQ: 0.8, presence: 4.5, air: 0 },
    compressor: { levellerThreshold: -24, levellerRatio: 2, threshold: -14, ratio: 3, makeup: 8.5 },
  },
};

export const DEFAULT_PRESET = 'clear';
