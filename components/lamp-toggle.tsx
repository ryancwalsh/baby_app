"use client";

import { useState, useTransition } from "react";
import { LampIcon } from "lucide-react";
import { toggleLampAction, type Lamp } from "@/app/actions/lamp";

/**
 * Optimistic on purpose: the plug takes a moment to answer over the cloud, and
 * a switch that lags behind the tap reads as broken. If the call fails the
 * switch snaps back to the state we started from.
 */
export function LampToggle({ lamp }: { lamp: Lamp }) {
  const [isOn, setIsOn] = useState(lamp.isOn);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const previous = isOn;
    setIsOn(!previous);
    setError(null);

    startTransition(async () => {
      try {
        setIsOn(await toggleLampAction(lamp.deviceId));
      } catch {
        setIsOn(previous);
        setError("Could not reach the plug.");
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={handleClick}
      disabled={isPending}
      className="border-foreground/15 bg-foreground/5 flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left disabled:opacity-60"
    >
      <LampIcon
        className={isOn ? "size-6 text-amber-500" : "size-6 opacity-50"}
      />
      <span className="flex-1">
        <span className="block font-semibold capitalize">{lamp.alias}</span>
        <span className="block text-sm opacity-70">
          {error ?? (isOn ? "On" : "Off")}
        </span>
      </span>
      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
          isOn ? "bg-amber-500" : "bg-foreground/25"
        }`}
      >
        <span
          className={`size-5 rounded-full bg-white transition-transform ${
            isOn ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
