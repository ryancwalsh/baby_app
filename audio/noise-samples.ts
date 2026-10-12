/**
 * The noise itself, as samples. The generators are ported from
 * ~/code/soundboard/noise/index.html: pink noise uses Paul Kellet's filter,
 * and brown is an integrated random walk.
 *
 * These once ran live, inside an AudioWorklet, producing every sample at the
 * moment it was played. That made the sound depend on this page's script
 * getting its turn about 375 times a second, and a phone gives an app that is
 * behind another one far fewer turns than that: the noise came out with hard
 * gaps in it. So the samples are made ahead of time, here, and the browser's
 * own audio thread plays them back — see `audio/noise-graph.ts`.
 */

export const NOISE_TYPES = [
  { description: 'Equal energy across all frequencies', label: 'White', value: 'white' },
  { description: 'Natural balance, most restful', label: 'Pink', value: 'pink' },
  { description: 'Deep rumble, low-emphasis', label: 'Brown', value: 'brown' },
] as const;

export type NoiseType = (typeof NOISE_TYPES)[number]['value'];

const QUARTER_TURN = Math.PI / 2;

function createWhite(frames: number) {
  return Float32Array.from({ length: frames }, () => (Math.random() * 2 - 1) * 0.5);
}

function createPink(frames: number) {
  const samples = new Float32Array(frames);
  let [b0, b1, b2, b3, b4, b5, b6] = [0, 0, 0, 0, 0, 0, 0];

  for (let index = 0; index < frames; index += 1) {
    const white = Math.random() * 2 - 1;

    b0 = 0.998_86 * b0 + white * 0.055_517_9;
    b1 = 0.993_32 * b1 + white * 0.075_075_9;
    b2 = 0.969 * b2 + white * 0.153_852;
    b3 = 0.866_5 * b3 + white * 0.310_485_6;
    b4 = 0.55 * b4 + white * 0.532_952_2;
    b5 = -0.761_6 * b5 - white * 0.016_898;
    samples[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.536_2) * 0.11;
    b6 = white * 0.115_926;
  }

  return samples;
}

function createBrown(frames: number) {
  const samples = new Float32Array(frames);
  let last = 0;

  for (let index = 0; index < frames; index += 1) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    samples[index] = last * 3.5;
  }

  return samples;
}

const GENERATORS: Record<NoiseType, (frames: number) => Float32Array> = {
  brown: createBrown,
  pink: createPink,
  white: createWhite,
};

/**
 * A stretch of noise that can be played end to end, over and over, with no
 * seam. A little more than is needed is generated, and that extra tail is
 * folded back over the start: the loop's last sample is then followed by the
 * very sample that came after it when it was made. The fold is equal-power,
 * which is the right one for two stretches that have nothing to do with each
 * other, so the loudness does not dip across it.
 */
export function createNoiseLoop(noiseType: NoiseType, frames: number, foldFrames: number): Float32Array<ArrayBuffer> {
  const generated = GENERATORS[noiseType](frames + foldFrames);
  const loop = new Float32Array(frames);

  loop.set(generated.subarray(0, frames));

  for (let index = 0; index < foldFrames; index += 1) {
    const angle = (index / foldFrames) * QUARTER_TURN;

    loop[index] = (generated[index] ?? 0) * Math.sin(angle) + (generated[frames + index] ?? 0) * Math.cos(angle);
  }

  return loop;
}
