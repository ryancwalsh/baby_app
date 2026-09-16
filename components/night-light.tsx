'use client';

import { LightbulbIcon, SunsetIcon, Volume2Icon, VolumeIcon } from 'lucide-react';
import { type CSSProperties, useEffect, useState, useTransition } from 'react';

import { setNightLightBrightnessAction, setNightLightPowerAction, startNightLightFadeAction, stopNightLightFadeAction } from '@/app/actions/night-light';
import { useNanitAudio } from '@/components/nanit-audio-provider';
import { BRIGHTNESS_PRESETS, FADE_DURATION_MILLISECONDS, FADE_TARGET_BRIGHTNESS, MAXIMUM_BRIGHTNESS, MINIMUM_BRIGHTNESS } from '@/services/nanit/brightness';
import { type NightLightState } from '@/services/nanit/night-light';

const FADE_MINUTES = FADE_DURATION_MILLISECONDS / 60_000;

/**
 * Optimistic, like the plug toggles: the shared camera connection is already
 * open, so a press is one frame on an existing socket and the real answer
 * lands quickly. On failure the control snaps back to where it started.
 */
export function NightLight({ initialState, secretHash }: { readonly initialState: NightLightState; readonly secretHash: string }) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<null | string>(null);
  const [isPending, startTransition] = useTransition();
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

  /**
   * Any hand-set brightness wins over a fade that is still running; the server
   * cancels it, and the optimistic state says so straight away.
   */
  function setBrightness(brightness: number) {
    run({ ...state, brightness, isFading: false }, () => setNightLightBrightnessAction(secretHash, brightness));
  }

  /**
   * The walk down itself belongs to the server — see services/nanit/night-light.ts.
   * It carries on through a locked screen, a backgrounded app or a closed tab,
   * and every step comes back over the stream above, so this only has to ask.
   */
  function toggleFading() {
    run({ ...state, isFading: !state.isFading }, () => (state.isFading ? stopNightLightFadeAction(secretHash) : startNightLightFadeAction(secretHash)));
  }

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
            state.isFading ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'
          }`}
          disabled={isPending || (!state.isFading && state.brightness <= FADE_TARGET_BRIGHTNESS)}
          onClick={toggleFading}
          type="button"
        >
          <SunsetIcon className="size-5 opacity-60" />
          {state.isFading ? 'Stop fading' : `Fade to ${FADE_TARGET_BRIGHTNESS}% over ${FADE_MINUTES} minutes`}
        </button>
      </div>
    </section>
  );
}
