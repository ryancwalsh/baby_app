'use client';

import { type PointerEvent } from 'react';

import { useLullabyAudio } from '@/components/lullaby-audio-provider';

const SECONDS_PER_MINUTE = 60;
const KEYBOARD_SEEK_SECONDS = 5;

function formatTrackTime(totalSeconds: number) {
  const wholeSeconds = Math.floor(totalSeconds);
  const seconds = wholeSeconds % SECONDS_PER_MINUTE;

  return `${Math.floor(wholeSeconds / SECONDS_PER_MINUTE)}:${String(seconds).padStart(2, '0')}`;
}

/**
 * How far into the current track it is. A tap anywhere on the bar jumps there, and a finger dragged along it keeps jumping, as on any media player.
 */
export function LullabyScrubber({ name }: { readonly name: string }) {
  const { position, seek } = useLullabyAudio();
  const { durationSeconds, elapsedSeconds } = position;
  const fraction = durationSeconds > 0 ? Math.min(elapsedSeconds / durationSeconds, 1) : 0;

  function seekTo(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();

    if (box.width > 0) {
      seek(((event.clientX - box.left) / box.width) * durationSeconds);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        aria-label={`Position in ${name}`}
        aria-valuemax={Math.round(durationSeconds)}
        aria-valuemin={0}
        aria-valuenow={Math.round(elapsedSeconds)}
        aria-valuetext={`${formatTrackTime(elapsedSeconds)} of ${formatTrackTime(durationSeconds)}`}
        className="flex cursor-pointer touch-none items-center py-3"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            seek(elapsedSeconds - KEYBOARD_SEEK_SECONDS);
          } else if (event.key === 'ArrowRight') {
            seek(elapsedSeconds + KEYBOARD_SEEK_SECONDS);
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekTo(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            seekTo(event);
          }
        }}
        role="slider"
        tabIndex={0}
      >
        <div className="bg-foreground/15 relative h-1.5 w-full rounded-full">
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${fraction * 100}%` }} />
          <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${fraction * 100}%` }} />
        </div>
      </div>
      <div className="text-faint flex justify-between text-xs tabular-nums">
        <span>{formatTrackTime(elapsedSeconds)}</span>
        <span>{formatTrackTime(durationSeconds)}</span>
      </div>
    </div>
  );
}
