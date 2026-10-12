import { NOISE_WORKLET_SOURCE, type NoiseType } from '@/audio/noise-worklet';

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

export type AudioGraph = {
  context: AudioContext;
  gain: GainNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  streamDestination: MediaStreamAudioDestinationNode;
  worklets: AudioWorkletNode[];
};

export type NoiseSettings = { noiseType: NoiseType; texture: number; volume: number; warmth: number };

export async function buildGraph(): Promise<AudioGraph> {
  const context = new AudioContext();
  const blob = new Blob([NOISE_WORKLET_SOURCE], { type: 'application/javascript' });
  const moduleUrl = URL.createObjectURL(blob);
  await context.audioWorklet.addModule(moduleUrl);
  URL.revokeObjectURL(moduleUrl);

  const merger = context.createChannelMerger(2);
  const worklets = [0, 1].map((channel) => {
    const worklet = new AudioWorkletNode(context, 'noise-proc', { outputChannelCount: [1] });
    worklet.connect(merger, 0, channel);
    return worklet;
  });

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

  merger.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(streamDestination);

  return { context, gain, highpass, lowpass, streamDestination, worklets };
}

export function applySettings(graph: AudioGraph, settings: NoiseSettings) {
  const now = graph.context.currentTime;

  graph.gain.gain.setTargetAtTime(settings.volume / MAXIMUM_PERCENT, now, RAMP_SECONDS);
  graph.lowpass.frequency.setTargetAtTime(BRIGHTEST_HERTZ * (WARMEST_HERTZ / BRIGHTEST_HERTZ) ** (settings.warmth / MAXIMUM_PERCENT), now, RAMP_SECONDS);
  graph.highpass.frequency.setTargetAtTime(FULLEST_HERTZ * (THINNEST_HERTZ / FULLEST_HERTZ) ** (settings.texture / MAXIMUM_PERCENT), now, RAMP_SECONDS);

  for (const worklet of graph.worklets) {
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- An AudioWorkletNode port is not a window; there is no origin to target.
    worklet.port.postMessage({ noiseType: settings.noiseType });
  }
}
