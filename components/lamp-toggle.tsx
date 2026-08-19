"use client";

import { useState, useTransition } from "react";
import { LampIcon, PlugZapIcon } from "lucide-react";
import {
  toggleLampAction,
  type ConnectedLamp,
  type UnreachableLamp,
} from "@/app/actions/lamp";

const CARD_CLASS_NAME =
  "border-foreground/15 bg-foreground/5 flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left";

/**
 * Optimistic on purpose: the plug takes a moment to answer over the cloud, and
 * a switch that lags behind the tap reads as broken. If the call fails the
 * switch snaps back to the state we started from.
 */
export function LampToggle({
  lamp,
  secretHash,
}: {
  lamp: ConnectedLamp;
  secretHash: string;
}) {
  const [isOn, setIsOn] = useState(lamp.isOn);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const previous = isOn;
    setIsOn(!previous);
    setError(null);

    startTransition(async () => {
      try {
        setIsOn(await toggleLampAction(secretHash, lamp.deviceId));
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
      className={`${CARD_CLASS_NAME} disabled:opacity-60`}
    >
      <LampIcon
        className={isOn ? "size-6 text-amber-500" : "size-6 opacity-50"}
      />
      <span className="flex-1">
        <span className="block font-semibold">{lamp.alias}</span>
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

/**
 * Shown in place of the switch when the plug did not answer, so the row states
 * why it cannot be controlled rather than offering a switch that would fail.
 */
export function UnreachableLampRow({ lamp }: { lamp: UnreachableLamp }) {
  return (
    <div className={`${CARD_CLASS_NAME} opacity-60`}>
      <PlugZapIcon className="size-6 opacity-50" />
      <span className="flex-1">
        <span className="block font-semibold">{lamp.alias}</span>
        <span className="block text-sm opacity-70">{lamp.reason}</span>
      </span>
    </div>
  );
}
