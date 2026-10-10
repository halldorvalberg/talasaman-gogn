// A downward expander, run on the audio thread (Web Audio has no built-in
// one). Below the threshold the signal is pushed down further — by (ratio − 1)
// dB for every dB under — which quietens room noise between words while
// leaving speech untouched.
//
// Three parts, as in a studio gate/expander:
// 1. Level detection: an even ~10 ms RMS average. (A fast-attack peak
//    detector sits near the noise's peaks, ~10 dB above its average, and
//    never sees the gaps as quiet.)
// 2. Adaptive threshold: the recording's noise floor is the lowest 50 ms
//    level over the last ~2 s (a windowed minimum, so it settles fast and
//    follows changes), and the threshold sits `margin` dB above it — so
//    clean and noisy recordings both work. `threshold` is the upper limit.
// 3. Gain smoothing: the gain opens quickly when speech starts (attack) and
//    closes gently after it (release), so word endings aren't clipped.

const FLOOR_DB = -60;       // never attenuate more than this
const DETECT_TIME = 0.01;   // s, RMS averaging time
const FLOOR_SMOOTH = 0.05;  // s, smoothing of the level fed to the floor tracker
const BLOCK_TIME = 0.1;     // s per block of the windowed minimum
const BLOCKS = 20;          // blocks remembered (~2 s)
const SILENCE_DB = -90;     // digital silence isn't a noise floor; ignore it
const WARM_UP = 0.2;        // s ignored at the start, while the smoothed level is still rising from zero

class DownwardExpander extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -40 }, // dBFS (RMS), upper limit
      { name: 'margin', defaultValue: 8 },      // dB above the noise floor
      { name: 'ratio', defaultValue: 2, minValue: 1 },
      { name: 'attack', defaultValue: 0.005 },  // s, how fast the gain opens
      { name: 'release', defaultValue: 0.12 },  // s, how fast it closes
    ];
  }

  constructor() {
    super();
    this.meanSquare = 0;
    this.slow = 0;
    this.gainDb = 0;
    this.detectCoef = Math.exp(-1 / (DETECT_TIME * sampleRate));
    this.slowCoef = Math.exp(-1 / (FLOOR_SMOOTH * sampleRate));
    this.blockLength = Math.round(BLOCK_TIME * sampleRate);
    this.blockPos = 0;
    this.blockMin = Infinity;
    this.blocks = [];       // minima of recent blocks, newest last
    this.floorDb = SILENCE_DB;
    this.warmUp = Math.round(WARM_UP * sampleRate);
  }

  /** Even RMS average of the input, in dB. */
  detect(power) {
    this.meanSquare = this.detectCoef * this.meanSquare + (1 - this.detectCoef) * power;
    return 10 * Math.log10(this.meanSquare + 1e-12);
  }

  /** Track the noise floor: the lowest smoothed level over the last ~2 s, ignoring silence. */
  trackFloor(power) {
    this.slow = this.slowCoef * this.slow + (1 - this.slowCoef) * power;
    const level = 10 * Math.log10(this.slow + 1e-12);
    if (this.warmUp > 0) { this.warmUp--; return this.floorDb; }
    if (level > SILENCE_DB && level < this.blockMin) this.blockMin = level;
    if (++this.blockPos >= this.blockLength) {
      this.blockPos = 0;
      if (this.blockMin < Infinity) this.blocks.push(this.blockMin);
      if (this.blocks.length > BLOCKS) this.blocks.shift();
      this.blockMin = Infinity;
      if (this.blocks.length) this.floorDb = Math.min(...this.blocks);
    }
    return this.floorDb;
  }

  /** Move the gain towards its target: quickly up (attack), slowly down (release). */
  smooth(targetDb, attackCoef, releaseCoef) {
    const coef = targetDb > this.gainDb ? attackCoef : releaseCoef;
    this.gainDb = coef * this.gainDb + (1 - coef) * targetDb;
    return 10 ** (this.gainDb / 20);
  }

  process([input], [output], params) {
    if (!input.length) return true;
    const cap = params.threshold[0], margin = params.margin[0], ratio = params.ratio[0];
    const attackCoef = Math.exp(-1 / (params.attack[0] * sampleRate));
    const releaseCoef = Math.exp(-1 / (params.release[0] * sampleRate));

    for (let i = 0; i < input[0].length; i++) {
      let power = 0;
      for (const channel of input) power = Math.max(power, channel[i] * channel[i]);
      const level = this.detect(power);
      const threshold = Math.min(cap, this.trackFloor(power) + margin);
      const target = level < threshold ? Math.max((level - threshold) * (ratio - 1), FLOOR_DB) : 0;
      const gain = this.smooth(target, attackCoef, releaseCoef);
      for (let c = 0; c < output.length; c++) output[c][i] = (input[c] ?? input[0])[i] * gain;
    }
    return true;
  }
}

registerProcessor('downward-expander', DownwardExpander);
