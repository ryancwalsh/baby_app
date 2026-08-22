'use client';

import { PauseIcon, PlayIcon, WavesIcon } from 'lucide-react';

import { NOISE_TYPES } from '@/audio/noise-worklet';
import { MAXIMUM_PERCENT, MINIMUM_PERCENT, useNoiseAudio } from '@/components/noise-audio-provider';

const CARD_CLASS_NAME = 'border-foreground/15 bg-foreground/2 rounded-2xl border px-5 py-4';

/**
 * The sound itself is owned by `NoiseAudioProvider`, above the router, so that
 * it survives leaving this tab. Everything here is the panel that drives it.
 */
export function EndlessNoise() {
  const { isPlaying, noiseType, texture, togglePlay, update, volume, warmth } = useNoiseAudio();

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
          await togglePlay();
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
