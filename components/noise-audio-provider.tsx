'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { NOISE_WORKLET_SOURCE, type NoiseType } from '@/lib/noise-worklet';

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
const FADE_OUT_SECONDS = 0.3;

type AudioGraph = {
  context: AudioContext;
  gain: GainNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  worklets: AudioWorkletNode[];
};

type NoiseSettings = { noiseType: NoiseType; texture: number; volume: number; warmth: number };

type NoiseAudio = NoiseSettings & {
  isPlaying: boolean;
  togglePlay: () => Promise<void>;
  update: (changes: Partial<NoiseSettings>) => void;
};

async function buildGraph(): Promise<AudioGraph> {
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

  merger.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(context.destination);

  return { context, gain, highpass, lowpass, worklets };
}

function applySettings(graph: AudioGraph, settings: NoiseSettings) {
  const now = graph.context.currentTime;

  graph.gain.gain.setTargetAtTime(settings.volume / MAXIMUM_PERCENT, now, RAMP_SECONDS);
  graph.lowpass.frequency.setTargetAtTime(BRIGHTEST_HERTZ * (WARMEST_HERTZ / BRIGHTEST_HERTZ) ** (settings.warmth / MAXIMUM_PERCENT), now, RAMP_SECONDS);
  graph.highpass.frequency.setTargetAtTime(FULLEST_HERTZ * (THINNEST_HERTZ / FULLEST_HERTZ) ** (settings.texture / MAXIMUM_PERCENT), now, RAMP_SECONDS);

  for (const worklet of graph.worklets) {
    // eslint-disable-next-line unicorn/require-post-message-target-origin -- An AudioWorkletNode port is not a window; there is no origin to target.
    worklet.port.postMessage({ noiseType: settings.noiseType });
  }
}

const NoiseAudioContext = createContext<NoiseAudio | null>(null);

export function useNoiseAudio() {
  const audio = useContext(NoiseAudioContext);

  if (audio === null) {
    throw new Error('useNoiseAudio needs a NoiseAudioProvider above it.');
  }

  return audio;
}

/**
 * Procedural noise rather than a looping sample, so it never repeats and never
 * has a seam. Two independent generators are panned hard left and right, which
 * is what makes it sound wide rather than like a point source.
 *
 * The audio graph is built on first play: browsers refuse to start an
 * AudioContext until a gesture, and there is no reason to hold one open before.
 *
 * This lives above the router, mounted once by the root layout, so that walking
 * to another tab does not take the sound with it. Nothing tears the graph down
 * short of leaving the app — stopping is the play button's job.
 */
export function NoiseAudioProvider({ children }: { readonly children: React.ReactNode }) {
  const graphRef = useRef<AudioGraph | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState<NoiseType>('pink');
  const [volume, setVolume] = useState(70);
  const [warmth, setWarmth] = useState(50);
  const [texture, setTexture] = useState(0);

  const update = useCallback(
    (changes: Partial<NoiseSettings>) => {
      const settings = { noiseType, texture, volume, warmth, ...changes };

      if (changes.noiseType !== undefined) {
        setNoiseType(changes.noiseType);
      }

      if (changes.volume !== undefined) {
        setVolume(changes.volume);
      }

      if (changes.warmth !== undefined) {
        setWarmth(changes.warmth);
      }

      if (changes.texture !== undefined) {
        setTexture(changes.texture);
      }

      if (graphRef.current !== null && isPlaying) {
        applySettings(graphRef.current, settings);
      }
    },
    [isPlaying, noiseType, texture, volume, warmth],
  );

  /**
   * A start that never got its audio graph leaves the button showing stopped,
   * which is the truth.
   */
  const togglePlay = useCallback(async () => {
    try {
      if (isPlaying) {
        const graph = graphRef.current;
        if (graph !== null) {
          /**
           * Faded rather than cut, because an abrupt stop is startling.
           */
          graph.gain.gain.setTargetAtTime(0, graph.context.currentTime, FADE_OUT_SECONDS);
        }

        setIsPlaying(false);
      } else {
        // eslint-disable-next-line require-atomic-updates -- Guarded by the play button, which is disabled to a single press at a time.
        graphRef.current ??= await buildGraph();
        await graphRef.current.context.resume();
        applySettings(graphRef.current, { noiseType, texture, volume, warmth });
        setIsPlaying(true);
      }
    } catch {
      setIsPlaying(false);
    }
  }, [isPlaying, noiseType, texture, volume, warmth]);

  const value = useMemo(() => ({ isPlaying, noiseType, texture, togglePlay, update, volume, warmth }), [isPlaying, noiseType, texture, togglePlay, update, volume, warmth]);

  return <NoiseAudioContext value={value}>{children}</NoiseAudioContext>;
}
