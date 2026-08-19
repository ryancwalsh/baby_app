/**
 * The noise generator, ported from ~/code/soundboard/noise/index.html. It is a
 * string rather than a file because an AudioWorklet module is loaded by URL,
 * and a blob URL built here avoids depending on a bundler emitting a separate
 * asset at a stable path.
 *
 * Pink noise uses Paul Kellet's filter; brown is an integrated random walk.
 * Both are generated per sample forever, so nothing ever loops or repeats.
 */
export const NOISE_WORKLET_SOURCE = `
class NoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0;
    this.lastBrown = 0;
    this.noiseType = 'pink';
    this.port.onmessage = (event) => {
      this.noiseType = event.data.noiseType;
    };
  }

  process(inputs, outputs) {
    const channel = outputs[0][0];
    if (!channel) {
      return true;
    }

    for (let index = 0; index < channel.length; index++) {
      const white = Math.random() * 2 - 1;

      if (this.noiseType === 'white') {
        channel[index] = white * 0.5;
      } else if (this.noiseType === 'pink') {
        this.b0 = 0.99886 * this.b0 + white * 0.0555179;
        this.b1 = 0.99332 * this.b1 + white * 0.0750759;
        this.b2 = 0.969 * this.b2 + white * 0.153852;
        this.b3 = 0.8665 * this.b3 + white * 0.3104856;
        this.b4 = 0.55 * this.b4 + white * 0.5329522;
        this.b5 = -0.7616 * this.b5 - white * 0.016898;
        channel[index] = (this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362) * 0.11;
        this.b6 = white * 0.115926;
      } else {
        this.lastBrown = (this.lastBrown + 0.02 * white) / 1.02;
        channel[index] = this.lastBrown * 3.5;
      }
    }

    return true;
  }
}

registerProcessor('noise-proc', NoiseProcessor);
`;

export const NOISE_TYPES = [
  { description: 'Equal energy across all frequencies', label: 'White', value: 'white' },
  { description: 'Natural balance, most restful', label: 'Pink', value: 'pink' },
  { description: 'Deep rumble, low-emphasis', label: 'Brown', value: 'brown' },
] as const;

export type NoiseType = (typeof NOISE_TYPES)[number]['value'];
