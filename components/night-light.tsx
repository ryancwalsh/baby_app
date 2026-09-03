'use client';

import { LightbulbIcon, SunsetIcon, Volume2Icon, VolumeIcon } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState, useTransition } from 'react';

import { setNightLightBrightnessAction, setNightLightPowerAction } from '@/app/actions/night-light';
import { useNanitAudio } from '@/components/nanit-audio-provider';
import { BRIGHTNESS_PRESETS, MAXIMUM_BRIGHTNESS, MINIMUM_BRIGHTNESS } from '@/services/nanit/brightness';
import { type NightLightState } from '@/services/nanit/night-light';

/**
 * A walk down to a dim glow rather than an abrupt drop, for a baby who is
 * nearly asleep. Evenly spaced steps rather than one write per percent, so the
 * camera gets the same bounded number of frames however bright it starts.
 */
const FADE_TARGET_BRIGHTNESS = 1;
const FADE_DURATION_MILLISECONDS = 120_000;
const FADE_STEP_COUNT = 15;

/**
 * Optimistic, like the plug toggles: the shared camera connection is already
 * open, so a press is one frame on an existing socket and the real answer
 * lands quickly. On failure the control snaps back to where it started.
 */
export function NightLight({ initialState, secretHash }: { readonly initialState: NightLightState; readonly secretHash: string }) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<null | string>(null);
  const [isPending, startTransition] = useTransition();
  const [isFading, setIsFading] = useState(false);
  /**
   * The loop reads the ref rather than the state, since a stop pressed mid
   * fade has to be visible to a closure that is already running.
   */
  const isFadingRef = useRef(false);
  /**
   * The sound half lives in the provider above the router, not here: this
   * section unmounts on navigation and the listening would go with it.
   */
  const { error: audioError, isMonitoring, isStarting, setIsMonitoring } = useNanitAudio();

  /**
   * Live updates, so a change made in the Nanit app shows up here without a
   * refresh. The stream is ignored while a press of ours is in flight, since
   * the optimistic value is newer than anything the camera has announced yet.
   */
  useEffect(() => {
    const source = new EventSource(`/api/night-light/stream?secretHash=${encodeURIComponent(secretHash)}`);

    source.addEventListener('message', (event) => {
      setState(JSON.parse(event.data) as NightLightState);
    });

    return () => {
      source.close();
    };
  }, [secretHash]);

  /**
   * Serialised through one transition so two commands are never in flight at
   * once, which would let the slower answer overwrite the newer state.
   */
  function run(optimistic: NightLightState, act: () => Promise<NightLightState>) {
    const previous = state;
    setState(optimistic);
    setError(null);

    startTransition(async () => {
      try {
        setState(await act());
      } catch {
        setState(previous);
        setError('Could not reach the camera.');
      }
    });
  }

  function stopFading() {
    isFadingRef.current = false;
    setIsFading(false);
  }

  /**
   * Any hand-set brightness wins over a fade that is still running.
   */
  function setBrightness(brightness: number) {
    stopFading();
    run({ ...state, brightness }, () => setNightLightBrightnessAction(secretHash, brightness));
  }

  async function fadeToTarget() {
    const startBrightness = state.brightness;
    let lastBrightness = startBrightness;

    isFadingRef.current = true;
    setIsFading(true);
    setError(null);

    for (let step = 1; step <= FADE_STEP_COUNT && isFadingRef.current; step += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, FADE_DURATION_MILLISECONDS / FADE_STEP_COUNT);
      });

      const brightness = Math.round(startBrightness + ((FADE_TARGET_BRIGHTNESS - startBrightness) * step) / FADE_STEP_COUNT);

      if (isFadingRef.current && brightness !== lastBrightness) {
        lastBrightness = brightness;
        setState((current) => ({ ...current, brightness }));

        try {
          setState(await setNightLightBrightnessAction(secretHash, brightness));
        } catch {
          stopFading();
          setError('Could not reach the camera.');
        }
      }
    }

    stopFading();
  }

  /**
   * Navigating away should not leave a loop writing to the camera.
   */
  useEffect(() => {
    return stopFading;
  }, []);

  return (
    <section className="border-foreground/15 bg-foreground/2 flex flex-col gap-4 rounded-2xl border px-5 py-4">
      <div className="flex items-center gap-3">
        <h2 className="text-foreground/60 flex flex-1 items-center gap-2 text-lg font-semibold">
          <LightbulbIcon className="size-5 opacity-60" />
          Nanit night light
        </h2>

        <button
          aria-checked={state.isOn}
          aria-label="Nanit night light"
          className={`shrink-0 rounded-lg border p-2 transition-colors disabled:opacity-60 ${state.isOn ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/40'}`}
          disabled={isPending}
          onClick={() => run({ ...state, isOn: !state.isOn }, () => setNightLightPowerAction(secretHash, !state.isOn))}
          role="switch"
          type="button"
        >
          <LightbulbIcon className="size-6" />
        </button>

        {/*
          Two of the Nanit app's three modes: off, and on even in the
          background. There is no "only while the app is open" here.
        */}
        <button
          aria-checked={isMonitoring}
          aria-label="Listen to the room"
          className={`shrink-0 rounded-lg border p-2 transition-colors disabled:opacity-60 ${isMonitoring ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/40'}`}
          disabled={isStarting}
          onClick={() => setIsMonitoring(!isMonitoring)}
          role="switch"
          type="button"
        >
          {isMonitoring ? <Volume2Icon className="size-6" /> : <VolumeIcon className="size-6" />}
        </button>
      </div>

      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
      {audioError !== null && <p className="text-sm text-amber-500">{audioError}</p>}

      <div>
        <div className="flex items-baseline justify-between">
          <label className="font-semibold opacity-60" htmlFor="brightness">
            Brightness
          </label>
          {/*
            The number carries the reading, so it is the large half; the percent
            sign is shrunk and dimmed so it does not compete in a dark room.
          */}
          <span className="text-2xl tabular-nums opacity-70">
            {state.brightness}
            <span className="text-xs opacity-50">%</span>
          </span>
        </div>

        {/*
          Committed on release, not on every pixel of the drag: `onChange` only
          moves the handle, and the camera is told once the finger lifts.
        */}
        <input
          className={`brightness-slider mt-3 w-full ${state.brightness === MINIMUM_BRIGHTNESS ? 'text-moon' : 'text-amber-500'}`}
          id="brightness"
          max={MAXIMUM_BRIGHTNESS}
          min={MINIMUM_BRIGHTNESS}
          onChange={(event) => setState({ ...state, brightness: Number(event.target.value) })}
          onKeyUp={() => setBrightness(state.brightness)}
          onPointerUp={() => setBrightness(state.brightness)}
          style={{ '--brightness-fill': `${state.brightness}%` } as CSSProperties}
          type="range"
          value={state.brightness}
        />

        <div className="mt-4 grid grid-cols-5 gap-2">
          {BRIGHTNESS_PRESETS.map((preset) => (
            <button
              className={`rounded-lg border py-2 text-lg tabular-nums disabled:opacity-60 ${
                state.brightness === preset
                  ? `font-semibold ${preset === MINIMUM_BRIGHTNESS ? 'border-moon/60 text-moon' : 'border-amber-500/60 text-amber-500'}`
                  : 'border-foreground/15'
              }`}
              disabled={isPending}
              key={preset}
              onClick={() => setBrightness(preset)}
              type="button"
            >
              {preset}
              <span className="text-xs opacity-50">%</span>
            </button>
          ))}
        </div>

        <button
          className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg border py-2 disabled:opacity-40 ${
            isFading ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'
          }`}
          disabled={isPending || state.brightness <= FADE_TARGET_BRIGHTNESS}
          onClick={() => (isFading ? stopFading() : fadeToTarget())}
          type="button"
        >
          <SunsetIcon className="size-5 opacity-60" />
          {isFading ? 'Stop fading' : `Fade to ${FADE_TARGET_BRIGHTNESS}% over 2 minutes`}
        </button>
      </div>
    </section>
  );
}
