'use client';

import { PauseIcon, PlayIcon, WavesIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { NOISE_TYPES, NOISE_WORKLET_SOURCE, type NoiseType } from '@/lib/noise-worklet';

const CARD_CLASS_NAME = 'border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4';

const MINIMUM_PERCENT = 0;
const MAXIMUM_PERCENT = 100;
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

/**
 * Procedural noise rather than a looping sample, so it never repeats and never
 * has a seam. Two independent generators are panned hard left and right, which
 * is what makes it sound wide rather than like a point source.
 *
 * The audio graph is built on first play: browsers refuse to start an
 * AudioContext until a gesture, and there is no reason to hold one open before.
 */
export function EndlessNoise() {
  const graphRef = useRef<AudioGraph | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState<NoiseType>('pink');
  const [volume, setVolume] = useState(70);
  const [warmth, setWarmth] = useState(50);
  const [texture, setTexture] = useState(0);

  /**
   * Nothing should keep making sound once this leaves the page.
   */
  useEffect(() => {
    return () => {
      void graphRef.current?.context.close();
      graphRef.current = null;
    };
  }, []);

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

  function applySettings(graph: AudioGraph, settings: { noiseType: NoiseType; texture: number; volume: number; warmth: number }) {
    const now = graph.context.currentTime;

    graph.gain.gain.setTargetAtTime(settings.volume / MAXIMUM_PERCENT, now, RAMP_SECONDS);
    graph.lowpass.frequency.setTargetAtTime(BRIGHTEST_HERTZ * (WARMEST_HERTZ / BRIGHTEST_HERTZ) ** (settings.warmth / MAXIMUM_PERCENT), now, RAMP_SECONDS);
    graph.highpass.frequency.setTargetAtTime(FULLEST_HERTZ * (THINNEST_HERTZ / FULLEST_HERTZ) ** (settings.texture / MAXIMUM_PERCENT), now, RAMP_SECONDS);

    for (const worklet of graph.worklets) {
      // eslint-disable-next-line unicorn/require-post-message-target-origin -- An AudioWorkletNode port is not a window; there is no origin to target.
      worklet.port.postMessage({ noiseType: settings.noiseType });
    }
  }

  function update(changes: { noiseType?: NoiseType; texture?: number; volume?: number; warmth?: number }) {
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
  }

  async function togglePlay() {
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
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-foreground/60 flex items-center gap-2 text-lg font-semibold">
        <WavesIcon className="size-5 opacity-60" />
        Endless noise
      </h2>

      <button
        aria-pressed={isPlaying}
        className={`${CARD_CLASS_NAME} flex w-full items-center gap-4 text-left`}
        onClick={async () => {
          try {
            await togglePlay();
          } catch {
            setIsPlaying(false);
          }
        }}
        type="button"
      >
        {isPlaying ? <PauseIcon className="size-6 text-amber-500" /> : <PlayIcon className="size-6 opacity-50" />}
        <span className="flex-1">
          <span className="block font-semibold capitalize">{noiseType} noise</span>
          <span className="block text-sm opacity-70">{isPlaying ? 'Playing — never loops' : 'Stopped'}</span>
        </span>
      </button>

      <div className={`${CARD_CLASS_NAME} flex flex-col gap-4`}>
        <div className="grid grid-cols-3 gap-2">
          {NOISE_TYPES.map((option) => (
            <button
              className={`flex flex-col gap-1 rounded-lg border px-2 py-3 text-center ${
                option.value === noiseType ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15'
              }`}
              key={option.value}
              onClick={() => update({ noiseType: option.value })}
              type="button"
            >
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-xs opacity-60">{option.description}</span>
            </button>
          ))}
        </div>

        {(
          [
            { hint: 'silent → loud', label: 'Volume', onChange: (next: number) => update({ volume: next }), value: volume },
            { hint: 'bright → muffled', label: 'Warmth', onChange: (next: number) => update({ warmth: next }), value: warmth },
            { hint: 'full → thin', label: 'Texture', onChange: (next: number) => update({ texture: next }), value: texture },
          ] as const
        ).map((slider) => (
          <div key={slider.label}>
            <div className="flex items-baseline justify-between">
              <label className="font-semibold" htmlFor={`noise-${slider.label}`}>
                {slider.label}
              </label>
              {/*
                The number carries the reading, so it is the large half; the
                percent sign is shrunk and dimmed so it does not compete in a
                dark room.
              */}
              <span className="text-2xl tabular-nums opacity-70">
                {slider.value}
                <span className="text-xs opacity-50">%</span>
              </span>
            </div>
            <input
              className="mt-2 w-full accent-amber-500"
              id={`noise-${slider.label}`}
              max={MAXIMUM_PERCENT}
              min={MINIMUM_PERCENT}
              onChange={(event) => slider.onChange(Number(event.target.value))}
              type="range"
              value={slider.value}
            />
            <p className="text-xs opacity-50">{slider.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
