// Spectral noise reduction, run on the audio thread. Classic DSP, no
// machine learning: the same family as Audacity's "Noise Reduction".
//
// 1. Short-time FFT: 1024-sample frames, 75% overlap, sqrt-Hann windows.
// 2. Noise estimate per frequency bin by windowed "minimum statistics"
//    (Martin 2001): the noise is the lowest smoothed power over the last
//    ~1.5 s, kept as a ring of short sub-window minima. Speech has gaps more
//    often than that, so the estimate finds the noise between words and
//    recovers quickly when the room changes. Near-silent frames (codec
//    dropouts, digital silence) are skipped so they can't drag it down.
// 3. A Wiener gain per bin from a "decision-directed" SNR estimate
//    (Ephraim & Malah 1984), which changes smoothly over time and avoids the
//    warbly "musical noise" of plain spectral subtraction.
// 4. Never attenuate more than `reduction` dB, so the voice stays natural.

const N = 1024;          // frame length
const HOP = N / 4;       // 75% overlap
const BINS = N / 2 + 1;
const SMOOTH = 0.85;     // power smoothing for the noise tracker
const SUB_FRAMES = 24;   // frames per sub-window (~0.13 s at 48 kHz)
const SUBWINDOWS = 12;   // sub-windows remembered (~1.5 s)
const SILENT_FRAME = 1e-9; // mean bin power below this (≈ −90 dB) counts as digital silence
const DD_ALPHA = 0.98;   // decision-directed smoothing

/** In-place iterative radix-2 FFT (inverse when `inverse`). */
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const WINDOW = Float32Array.from({ length: N }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)));
const OLA_SCALE = 1 / 2; // sqrt-Hann² at 75% overlap sums to 2

class Denoiser extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'reduction', defaultValue: 15, minValue: 0, maxValue: 40 }, // max dB of attenuation
      { name: 'oversubtract', defaultValue: 1.5, minValue: 1, maxValue: 4 }, // how much to trust the noise estimate
    ];
  }

  constructor() {
    super();
    this.ring = new Float32Array(N);    // last N input samples, circular
    this.ringPos = 0;
    this.subMin = new Float32Array(BINS).fill(Infinity);              // current sub-window's minimum
    this.history = Array.from({ length: SUBWINDOWS }, () => new Float32Array(BINS).fill(Infinity));
    this.historyPos = 0;
    this.subCount = 0;
    this.output = new Float32Array(N);  // overlap-add accumulator
    this.filled = 0;                    // samples since the last frame
    this.ready = new Float32Array(0);   // finished samples waiting to be sent
    this.readyPos = 0;
    this.power = new Float32Array(BINS);
    this.noise = new Float32Array(BINS).fill(Infinity);
    this.prevClean = new Float32Array(BINS); // |S|² estimate of the previous frame
    this.re = new Float32Array(N);
    this.im = new Float32Array(N);
    this.frames = 0;
  }

  /** Smooth this frame's power and fold it into the current sub-window's minimum. */
  trackNoise(bin, p) {
    this.power[bin] = this.frames ? SMOOTH * this.power[bin] + (1 - SMOOTH) * p : p;
    if (this.power[bin] < this.subMin[bin]) this.subMin[bin] = this.power[bin];
  }

  /** Every SUB_FRAMES frames: store the sub-window minimum; noise = minimum over the window. */
  rollWindow() {
    if (++this.subCount < SUB_FRAMES) return;
    this.subCount = 0;
    this.history[this.historyPos].set(this.subMin);
    this.historyPos = (this.historyPos + 1) % SUBWINDOWS;
    this.subMin.fill(Infinity);
    for (let bin = 0; bin < BINS; bin++) {
      let min = Infinity;
      for (const h of this.history) if (h[bin] < min) min = h[bin];
      this.noise[bin] = min;
    }
  }

  /** Wiener gain for one bin from the decision-directed a-priori SNR. */
  gain(bin, p, floor, oversubtract) {
    const noise = Math.max(this.noise[bin] * oversubtract, 1e-12);
    const posterior = p / noise;
    const prior = DD_ALPHA * (this.prevClean[bin] / noise) + (1 - DD_ALPHA) * Math.max(posterior - 1, 0);
    const g = Math.max(prior / (1 + prior), floor);
    this.prevClean[bin] = g * g * p;
    return g;
  }

  /** Window, transform, apply gains, transform back and overlap-add one frame. */
  processFrame(floor, oversubtract) {
    const { re, im } = this;
    for (let i = 0; i < N; i++) { re[i] = this.ring[(this.ringPos + i) % N] * WINDOW[i]; im[i] = 0; } // oldest first
    fft(re, im, false);
    let total = 0;
    for (let bin = 0; bin < BINS; bin++) total += re[bin] * re[bin] + im[bin] * im[bin];
    // Skip digital silence, and the first frames while the buffer still holds start-up zeros.
    const silent = total / BINS < SILENT_FRAME || this.frames < N / HOP;
    for (let bin = 0; bin < BINS; bin++) {
      const p = re[bin] * re[bin] + im[bin] * im[bin];
      if (!silent) this.trackNoise(bin, p);
      const g = this.gain(bin, p, floor, oversubtract);
      re[bin] *= g; im[bin] *= g;
      if (bin > 0 && bin < N / 2) { re[N - bin] = re[bin]; im[N - bin] = -im[bin]; } // keep it real
    }
    if (!silent) this.rollWindow();
    fft(re, im, true);
    for (let i = 0; i < N; i++) this.output[i] += re[i] * WINDOW[i] * OLA_SCALE;
    // The first HOP samples are now complete.
    this.ready = this.output.slice(0, HOP);
    this.readyPos = 0;
    this.output.copyWithin(0, HOP);
    this.output.fill(0, N - HOP);
    this.frames++;
  }

  process([input], [output], params) {
    const mono = input[0];
    const out = output[0];
    if (!mono) return true;
    const floor = 10 ** (-params.reduction[0] / 20);
    const oversubtract = params.oversubtract[0];
    for (let i = 0; i < mono.length; i++) {
      this.ring[this.ringPos] = mono[i];
      this.ringPos = (this.ringPos + 1) % N;
      out[i] = this.readyPos < this.ready.length ? this.ready[this.readyPos++] : 0;
      if (++this.filled === HOP) {
        this.filled = 0;
        this.processFrame(floor, oversubtract);
      }
    }
    for (let c = 1; c < output.length; c++) output[c].set(out);
    return true;
  }
}

registerProcessor('denoiser', Denoiser);
