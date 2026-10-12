'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { NOISE_TYPES, NOISE_WORKLET_SOURCE, type NoiseType } from '@/audio/noise-worklet';
import { type NoiseLogEntry } from '@/components/noise-log';
import { useNoiseLog } from '@/hooks/use-noise-log';

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
/**
 * `setTargetAtTime` approaches its target rather than reaching it, so the
 * element is paused a few time constants later, once the fade is inaudible.
 */
const PAUSE_AFTER_FADE_MILLISECONDS = 1_500;

type AudioGraph = {
  context: AudioContext;
  gain: GainNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  streamDestination: MediaStreamAudioDestinationNode;
  worklets: AudioWorkletNode[];
};

type NoiseSettings = { noiseType: NoiseType; texture: number; volume: number; warmth: number };

type NoiseAudio = NoiseSettings & {
  isPlaying: boolean;
  log: NoiseLogEntry[];
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const pauseTimeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const isTogglingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [noiseType, setNoiseType] = useState<NoiseType>('pink');
  const [volume, setVolume] = useState(70);
  const [warmth, setWarmth] = useState(50);
  const [texture, setTexture] = useState(0);
  const { log, record } = useNoiseLog(isPlaying, audioRef);

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
  const setPlaying = useCallback(
    async (shouldPlay: boolean, source: string) => {
      /**
       * A start takes a moment — the graph is built and the element has to begin
       * playing — and the button shows nothing until it is done, which invites a
       * second tap. That tap used to start again alongside the first: two graphs
       * were built, the element kept the first one's stream and this kept the
       * second one's nodes, so the sound that was heard was held by nothing and
       * answered to no control. A press that lands mid-toggle is dropped instead.
       */
      if (isTogglingRef.current) {
        return;
      }

      isTogglingRef.current = true;

      try {
        const isStopping = !shouldPlay;

        if (isStopping) {
          if (!isPlaying) {
            return;
          }

          record(`Stopped by ${source}`);

          const graph = graphRef.current;
          if (graph !== null) {
            /**
             * Faded rather than cut, because an abrupt stop is startling. The
             * element is paused only afterwards: pausing it outright would cut
             * the fade, and leaving it playing would hold the lock screen's
             * transport open over silence.
             */
            graph.gain.gain.setTargetAtTime(0, graph.context.currentTime, FADE_OUT_SECONDS);
          }

          pauseTimeoutRef.current = setTimeout(() => {
            pauseTimeoutRef.current = null;

            if (audioRef.current !== null) {
              audioRef.current.pause();
            }

            /**
             * The context is stopped too, after the element so that the
             * listener above does not take it for an interruption. Left
             * running it went on generating noise nobody could hear, and
             * Android's media notification went on showing the noise as
             * playing after it had been paused.
             */
            // eslint-disable-next-line promise/prefer-await-to-then -- A timer callback is synchronous; a context that will not suspend is only the waste it was before.
            graphRef.current?.context.suspend().catch(() => {});
          }, PAUSE_AFTER_FADE_MILLISECONDS);

          setIsPlaying(false);
        } else {
          if (pauseTimeoutRef.current !== null) {
            clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
          }

          const audio = audioRef.current;

          if (graphRef.current === null) {
            const graph = await buildGraph();

            /**
             * A phone can suspend the context under a playing element — iOS does
             * it for a call or another app's sound — and nothing brings it back
             * by itself. The element is paused only when the noise is meant to
             * be off, so while it plays the context is asked to carry on.
             */
            graph.context.addEventListener('statechange', () => {
              record(`The audio context is ${graph.context.state}`);

              if (graph.context.state !== 'running' && audioRef.current?.paused === false) {
                // eslint-disable-next-line promise/prefer-await-to-then -- An event listener is synchronous; a refused resume is tried again on the next change.
                graph.context.resume().catch(() => {});
              }
            });

            // eslint-disable-next-line require-atomic-updates -- Guarded by `isTogglingRef`, which lets only one toggle run at a time.
            graphRef.current = graph;
          }

          if (audio !== null) {
            audio.srcObject ??= graphRef.current.streamDestination.stream;

            await audio.play();
          }

          await graphRef.current.context.resume();
          applySettings(graphRef.current, { noiseType, texture, volume, warmth });
          record(`Started by ${source}`);
          setIsPlaying(true);
        }
      } catch (error) {
        record(`Could not start from ${source}: ${error instanceof Error ? error.message : String(error)}`);
        setIsPlaying(false);
      } finally {
        // eslint-disable-next-line require-atomic-updates -- Only the toggle that set this gets here; every other press returned above.
        isTogglingRef.current = false;
      }
    },
    [isPlaying, noiseType, record, texture, volume, warmth],
  );

  const togglePlay = useCallback(async () => {
    await setPlaying(!isPlaying, 'a button');
  }, [isPlaying, setPlaying]);

  /**
   * A backgrounded phone shows the lock screen transport for whatever is
   * playing, and hands its buttons here. Without handlers its pause would stop
   * the element while this still believed it was playing, and the button on
   * the page would then be lying.
   *
   * Each does what it says rather than toggling. A phone that interrupts the
   * sound for something else asks for `play` when it is done, and a toggle
   * that had not heard about the interruption answered that by switching the
   * noise off.
   */
  useEffect(() => {
    if ('mediaSession' in navigator) {
      const label = NOISE_TYPES.find((type) => type.value === noiseType)?.label;

      navigator.mediaSession.metadata = new MediaMetadata({ title: `${label} noise` });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('pause', () => {
        void setPlaying(false, 'the phone asking for pause');
      });
      navigator.mediaSession.setActionHandler('play', () => {
        void setPlaying(true, 'the phone asking for play');
      });
    }
  }, [isPlaying, noiseType, setPlaying]);

  const value = useMemo(
    () => ({ isPlaying, log, noiseType, texture, togglePlay, update, volume, warmth }),
    [isPlaying, log, noiseType, texture, togglePlay, update, volume, warmth],
  );

  return (
    <NoiseAudioContext value={value}>
      {children}
      {/*
        The phone can pause the element without asking — another app taking the
        sound, a headset button — and the buttons must not go on saying playing
        over silence. The pause this makes itself, after a fade, arrives once
        the state is already stopped.
      */}
      <audio
        onPause={() => {
          if (isPlaying) {
            record('The phone paused the sound');
            setIsPlaying(false);
          }
        }}
        ref={audioRef}
      />
    </NoiseAudioContext>
  );
}
