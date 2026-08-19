"use client";

import { useState, useTransition } from "react";
import { LightbulbIcon } from "lucide-react";
import {
  setNightLightBrightnessAction,
  setNightLightPowerAction,
} from "@/app/actions/night-light";
import {
  BRIGHTNESS_PRESETS,
  MAXIMUM_BRIGHTNESS,
  MINIMUM_BRIGHTNESS,
} from "@/lib/nanit/brightness";
import type { NightLightState } from "@/lib/nanit/night-light";

/**
 * Optimistic, like the plug toggles: the shared camera connection is already
 * open, so a press is one frame on an existing socket and the real answer
 * lands quickly. On failure the control snaps back to where it started.
 */
export function NightLight({
  initialState,
  secretHash,
}: {
  initialState: NightLightState;
  secretHash: string;
}) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Serialised through one transition so two commands are never in flight at
   * once, which would let the slower answer overwrite the newer state.
   */
  function run(
    optimistic: NightLightState,
    act: () => Promise<NightLightState>,
  ) {
    const previous = state;
    setState(optimistic);
    setError(null);

    startTransition(async () => {
      try {
        setState(await act());
      } catch {
        setState(previous);
        setError("Could not reach the camera.");
      }
    });
  }

  function setBrightness(brightness: number) {
    run({ ...state, brightness }, () =>
      setNightLightBrightnessAction(secretHash, brightness),
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-foreground/60 flex items-center gap-2 text-lg font-semibold">
        <LightbulbIcon className="size-5 opacity-60" />
        Nanit night light
      </h2>

      <button
        type="button"
        role="switch"
        aria-checked={state.isOn}
        onClick={() =>
          run({ ...state, isOn: !state.isOn }, () =>
            setNightLightPowerAction(secretHash, !state.isOn),
          )
        }
        disabled={isPending}
        className="border-foreground/15 bg-foreground/5 flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left disabled:opacity-60"
      >
        <span className="flex-1 text-sm opacity-70">
          {error ?? (state.isOn ? "On" : "Off")}
        </span>
        <span
          className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
            state.isOn ? "bg-amber-500" : "bg-foreground/25"
          }`}
        >
          <span
            className={`size-5 rounded-full bg-white transition-transform ${
              state.isOn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </span>
      </button>

      <div className="border-foreground/15 bg-foreground/5 rounded-2xl border px-5 py-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="brightness" className="font-semibold">
            Brightness
          </label>
          <span className="text-sm tabular-nums opacity-70">
            {state.brightness}%
          </span>
        </div>

        {/**
         * Committed on release, not on every pixel of the drag: `onChange` only
         * moves the handle, and the camera is told once the finger lifts.
         */}
        <input
          id="brightness"
          type="range"
          min={MINIMUM_BRIGHTNESS}
          max={MAXIMUM_BRIGHTNESS}
          value={state.brightness}
          onChange={(event) =>
            setState({ ...state, brightness: Number(event.target.value) })
          }
          onPointerUp={() => setBrightness(state.brightness)}
          onKeyUp={() => setBrightness(state.brightness)}
          className="mt-3 w-full accent-amber-500"
        />

        <div className="mt-4 grid grid-cols-5 gap-2">
          {BRIGHTNESS_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setBrightness(preset)}
              disabled={isPending}
              className={`rounded-lg border py-2 text-sm tabular-nums disabled:opacity-60 ${
                state.brightness === preset
                  ? "border-amber-500/60 font-semibold text-amber-500"
                  : "border-foreground/15"
              }`}
            >
              {preset}%
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
