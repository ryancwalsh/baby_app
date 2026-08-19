"use client";

import { useState, useTransition } from "react";
import { LightbulbIcon, RefreshCwIcon } from "lucide-react";
import {
  getNightLightAction,
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
 * Nothing is read on mount, and that is deliberate twice over: every call opens
 * a fresh cloud websocket and takes several seconds, and the camera is in a
 * room where a page load should not wake anyone. The state arrives only when
 * asked for, or as the answer to a change made here.
 *
 * `isOn` is a tri-state — null is genuinely unknown rather than off, because
 * the camera never reports on/off unless it changes. See README.md. From
 * unknown, a tap switches the light *off*: erring towards darkness cannot wake
 * a sleeping baby, whereas guessing the other way can.
 */
export function NightLight() {
  const [state, setState] = useState<NightLightState>({
    brightness: null,
    isOn: null,
  });
  /** What the slider shows mid-drag, before the camera has been told. */
  const [draggedBrightness, setDraggedBrightness] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Serialised through one transition so two commands can never be in flight
   * at once: each opens its own connection, and the camera answers the second
   * with state the first has already made stale.
   */
  function run(act: () => Promise<NightLightState>) {
    setError(null);
    startTransition(async () => {
      try {
        setState(await act());
      } catch {
        setError("Could not reach the camera.");
      } finally {
        setDraggedBrightness(null);
      }
    });
  }

  const shownBrightness = draggedBrightness ?? state.brightness;
  const powerLabel =
    state.isOn === null ? "Unknown" : state.isOn ? "On" : "Off";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <LightbulbIcon className="size-5 opacity-60" />
        Nanit night light
      </h2>

      <button
        type="button"
        role="switch"
        aria-checked={state.isOn === true}
        aria-label={`Nanit night light, currently ${powerLabel.toLowerCase()}`}
        onClick={() =>
          run(() => setNightLightPowerAction(state.isOn === false))
        }
        disabled={isPending}
        className="border-foreground/15 bg-foreground/5 flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left disabled:opacity-60"
      >
        <span className="flex-1 text-sm opacity-70">
          {error ??
            (state.isOn === null ? "Unknown — tap to turn off" : powerLabel)}
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

      <div className="rounded-2xl border border-foreground/15 bg-foreground/5 px-5 py-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="brightness" className="font-semibold">
            Brightness
          </label>
          <span className="text-sm tabular-nums opacity-70">
            {shownBrightness === null ? "—" : `${shownBrightness}%`}
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
          value={shownBrightness ?? MINIMUM_BRIGHTNESS}
          disabled={isPending}
          onChange={(event) => setDraggedBrightness(Number(event.target.value))}
          onPointerUp={() => {
            if (draggedBrightness !== null) {
              run(() => setNightLightBrightnessAction(draggedBrightness));
            }
          }}
          onKeyUp={() => {
            if (draggedBrightness !== null) {
              run(() => setNightLightBrightnessAction(draggedBrightness));
            }
          }}
          className="mt-3 w-full accent-amber-500 disabled:opacity-60"
        />

        <div className="mt-4 grid grid-cols-5 gap-2">
          {BRIGHTNESS_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => run(() => setNightLightBrightnessAction(preset))}
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

      <button
        type="button"
        onClick={() => run(getNightLightAction)}
        disabled={isPending}
        className="flex items-center justify-center gap-2 self-center text-sm opacity-70 disabled:opacity-40"
      >
        <RefreshCwIcon
          className={isPending ? "size-4 animate-spin" : "size-4"}
        />
        {isPending ? "Talking to the camera…" : "Read current state"}
      </button>
    </section>
  );
}
