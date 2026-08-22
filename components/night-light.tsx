'use client';

import { LightbulbIcon, Volume2Icon, VolumeIcon } from 'lucide-react';
import { type CSSProperties, useEffect, useState, useTransition } from 'react';

import { setNightLightBrightnessAction, setNightLightPowerAction } from '@/app/actions/night-light';
import { BRIGHTNESS_PRESETS, MAXIMUM_BRIGHTNESS, MINIMUM_BRIGHTNESS } from '@/lib/nanit/brightness';
import { type NightLightState } from '@/lib/nanit/night-light';

/**
 * Optimistic, like the plug toggles: the shared camera connection is already
 * open, so a press is one frame on an existing socket and the real answer
 * lands quickly. On failure the control snaps back to where it started.
 */
export function NightLight({ initialState, secretHash }: { readonly initialState: NightLightState; readonly secretHash: string }) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<null | string>(null);
  const [isPending, startTransition] = useTransition();
  const [isSoundOn, setIsSoundOn] = useState(false);

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

  function setBrightness(brightness: number) {
    run({ ...state, brightness }, () => setNightLightBrightnessAction(secretHash, brightness));
  }

  return (
    <section className="border-foreground/15 bg-foreground/5 flex flex-col gap-4 rounded-2xl border px-5 py-4">
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

        <button
          aria-checked={isSoundOn}
          aria-label="Nanit sound"
          className={`shrink-0 rounded-lg border p-2 transition-colors ${isSoundOn ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/40'}`}
          onClick={() => setIsSoundOn(!isSoundOn)}
          role="switch"
          type="button"
        >
          {isSoundOn ? <Volume2Icon className="size-6" /> : <VolumeIcon className="size-6" />}
        </button>
      </div>

      {error !== null && <p className="text-sm text-amber-500">{error}</p>}

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
      </div>
    </section>
  );
}
