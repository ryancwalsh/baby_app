import { createNoiseLoop, type NoiseType } from '@/audio/noise-samples';

/**
 * The Web Audio half of the noise: the nodes, and how the sliders map onto
 * them. `NoiseAudioProvider` decides when it plays.
 */

export const MINIMUM_PERCENT = 0;
export const MAXIMUM_PERCENT = 100;
/**
 * Warmth sweeps a low-pass filter between these, so 100% is properly muffled.
 */
const BRIGHTEST_HERTZ = 20_000;
const WARMEST_HERTZ = 400;
/**
 * Texture sweeps a high-pass filter, thinning the sound as it rises.
 */
const FULLEST_HERTZ = 20;
const THINNEST_HERTZ = 2_000;
const RAMP_SECONDS = 0.05;
/**
 * Two loops of different lengths play at once. Neither is long, but together
 * they only line up again after their lengths multiplied — 221 seconds — so
 * nothing that could be heard as a repeat comes round, for half a minute of
 * samples held in memory. Each is scaled so that the pair is as loud as one.
 */
const LOOP_SECONDS = [13, 17];
const LOOP_GAIN = Math.SQRT1_2;
const FOLD_SECONDS = 0.5;
const CHANNELS = 2;
/**
 * Changing the kind of noise swaps one set of loops for another, and the two
 * are crossed over this long so the change is not a click.
 */
const SWAP_SECONDS = 0.2;
const SWAP_SETTLE_MILLISECONDS = 1_000;

type LoadedNoise = { fade: GainNode; noiseType: NoiseType; sources: AudioBufferSourceNode[] };

export type AudioGraph = {
  context: AudioContext;
  gain: GainNode;
  highpass: BiquadFilterNode;
  /**
   * The loops now playing. Null until the first settings are applied.
   */
  loaded: LoadedNoise | null;
  lowpass: BiquadFilterNode;
  streamDestination: MediaStreamAudioDestinationNode;
};

export type NoiseSettings = { noiseType: NoiseType; texture: number; volume: number; warmth: number };

export function buildGraph(): AudioGraph {
  const context = new AudioContext();
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  const gain = context.createGain();
  gain.gain.value = 0;

  /**
   * The graph ends in a MediaStream played by an `<audio>` element rather than
   * in `context.destination`, because iOS treats the two completely
   * differently: a bare AudioContext obeys the ringer switch and is suspended
   * when the app leaves the screen, while a playing media element keeps its
   * sound through both — which is why the lullabies, which are an `<audio>`
   * element, never had this problem. Android does not care either way.
   */
  const streamDestination = context.createMediaStreamDestination();

  lowpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(streamDestination);

  return { context, gain, highpass, loaded: null, lowpass, streamDestination };
}

/**
 * The two channels are made separately, which is what makes the noise sound
 * wide rather than like a point source.
 */
function loadNoise(graph: AudioGraph, noiseType: NoiseType) {
  const { context } = graph;
  const now = context.currentTime;
  const previous = graph.loaded;
  const fade = context.createGain();

  if (previous === null) {
    fade.gain.value = LOOP_GAIN;
  } else {
    fade.gain.value = 0;
    fade.gain.setTargetAtTime(LOOP_GAIN, now, SWAP_SECONDS);
  }

  fade.connect(graph.lowpass);

  const sources = LOOP_SECONDS.map((seconds) => {
    const frames = Math.round(seconds * context.sampleRate);
    const buffer = context.createBuffer(CHANNELS, frames, context.sampleRate);

    for (let channel = 0; channel < CHANNELS; channel += 1) {
      buffer.copyToChannel(createNoiseLoop(noiseType, frames, Math.round(FOLD_SECONDS * context.sampleRate)), channel);
    }

    const source = context.createBufferSource();

    source.buffer = buffer;
    source.loop = true;
    source.connect(fade);
    source.start();

    return source;
  });

  if (previous !== null) {
    previous.fade.gain.setTargetAtTime(0, now, SWAP_SECONDS);
    setTimeout(() => {
      for (const source of previous.sources) {
        source.stop();
        source.disconnect();
      }

      previous.fade.disconnect();
    }, SWAP_SETTLE_MILLISECONDS);
  }

  graph.loaded = { fade, noiseType, sources };
}

export function applySettings(graph: AudioGraph, settings: NoiseSettings) {
  const now = graph.context.currentTime;

  graph.gain.gain.setTargetAtTime(settings.volume / MAXIMUM_PERCENT, now, RAMP_SECONDS);
  graph.lowpass.frequency.setTargetAtTime(BRIGHTEST_HERTZ * (WARMEST_HERTZ / BRIGHTEST_HERTZ) ** (settings.warmth / MAXIMUM_PERCENT), now, RAMP_SECONDS);
  graph.highpass.frequency.setTargetAtTime(FULLEST_HERTZ * (THINNEST_HERTZ / FULLEST_HERTZ) ** (settings.texture / MAXIMUM_PERCENT), now, RAMP_SECONDS);

  if (graph.loaded?.noiseType !== settings.noiseType) {
    loadNoise(graph, settings.noiseType);
  }
}
