'use client';

import { LightbulbIcon, SunsetIcon } from 'lucide-react';
import { type CSSProperties, useEffect, useState, useTransition } from 'react';

import { useNanitAudio } from '@/components/nanit-audio-provider';
import { NightLightOffline } from '@/components/night-light-offline';
import { changeNightLight, getWorkerUrl } from '@/components/worker-client';
import { reportWorkerTrouble, useWorkerStatus } from '@/hooks/use-worker-status';
import { BRIGHTNESS_PRESETS, FADE_DURATION_MILLISECONDS, FADE_TARGET_BRIGHTNESS, MAXIMUM_BRIGHTNESS, MINIMUM_BRIGHTNESS } from '@/services/nanit/brightness';
import { type NightLightState } from '@/services/nanit/night-light';

const FADE_MINUTES = FADE_DURATION_MILLISECONDS / 60_000;

/**
 * The laptop holds the camera connection, so while this phone cannot reach it the tile shows what was last known, dimmed, with nothing to press.
 */
export function NightLight({
  initialState,
  onChange,
  secretHash,
}: {
  readonly initialState: NightLightState | null;
  readonly onChange: (state: NightLightState) => void;
  readonly secretHash: string;
}) {
  const workerStatus = useWorkerStatus();

  return workerStatus === 'offline' ? (
    <NightLightOffline secretHash={secretHash} />
  ) : (
    <NightLightControls initialState={initialState} onChange={onChange} secretHash={secretHash} />
  );
}

/**
 * Optimistic, like the plug toggles: the shared camera connection is already
 * open, so a press is one frame on an existing socket and the real answer
 * lands quickly. On failure the control snaps back to where it started.
 */
function NightLightControls({
  initialState,
  onChange,
  secretHash,
}: {
  /**
   * Null until the stream's first frame, which is the current state.
   */
  readonly initialState: NightLightState | null;
  /**
   * Told every state the tile shows. Must be stable across renders.
   */
  readonly onChange: (state: NightLightState) => void;
  readonly secretHash: string;
}) {
  /**
   * A placeholder until the stream's first frame; `isKnown` says whether it has come.
   */
  const [state, setState] = useState<NightLightState>(initialState ?? { brightness: MINIMUM_BRIGHTNESS, isFading: false, isOn: false });
  const [isKnown, setIsKnown] = useState(initialState !== null);
  const [error, setError] = useState<null | string>(null);
  const [isPending, startTransition] = useTransition();
  /**
   * The listen button is in the bottom navigation, but a camera that could not
   * be reached for sound is still reported here, beside the camera's own tile.
   */
  const { error: audioError } = useNanitAudio();

  useEffect(() => {
    if (isKnown) {
      onChange(state);
    }
  }, [isKnown, onChange, state]);

  /**
   * Live updates, so a change made in the Nanit app shows up here without a
   * refresh. The stream is ignored while a press of ours is in flight, since
   * the optimistic value is newer than anything the camera has announced yet.
   */
  useEffect(() => {
    const source = new EventSource(getWorkerUrl('/night-light/stream', secretHash));

    source.addEventListener('message', (event) => {
      setState(JSON.parse(event.data) as NightLightState);
      setIsKnown(true);
    });
    source.addEventListener('error', reportWorkerTrouble);

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
        reportWorkerTrouble();
      }
    });
  }

  /**
   * Any hand-set brightness wins over a fade that is still running; the server
   * cancels it, and the optimistic state says so straight away.
   */
  function setBrightness(brightness: number) {
    run({ ...state, brightness, isFading: false }, async () => changeNightLight(secretHash, { action: 'brightness', brightness }));
  }

  /**
   * The walk down itself belongs to the server — see services/nanit/night-light.ts.
   * It carries on through a locked screen, a backgrounded app or a closed tab,
   * and every step comes back over the stream above, so this only has to ask.
   */
  function toggleFading() {
    run({ ...state, isFading: !state.isFading }, async () => changeNightLight(secretHash, { action: state.isFading ? 'stop-fade' : 'start-fade' }));
  }

  return (
    <section className="border-foreground/15 bg-foreground/2 dark:bg-black flex flex-col gap-4 rounded-2xl border px-5 py-4">
      <div className="flex items-center gap-3">
        <h2 className="text-foreground/60 flex flex-1 items-center gap-2 text-lg font-semibold">
          <LightbulbIcon className="size-5 opacity-60" />
          Nanit night light
        </h2>

        <button
          aria-checked={state.isOn}
          aria-label="Nanit night light"
          className={`shrink-0 rounded-lg border p-2 transition-colors disabled:opacity-60 ${state.isOn ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/40'}`}
          disabled={isPending || !isKnown}
          onClick={() => run({ ...state, isOn: !state.isOn }, async () => changeNightLight(secretHash, { action: 'power', isOn: !state.isOn }))}
          role="switch"
          type="button"
        >
          <LightbulbIcon className="size-6" />
        </button>
      </div>

      {!isKnown && <p className="text-sm opacity-60">Asking the laptop…</p>}
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
          disabled={!isKnown}
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
              disabled={isPending || !isKnown}
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
          className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg border p-2 disabled:opacity-40 ${
            state.isFading ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/60'
          }`}
          disabled={isPending || !isKnown || (!state.isFading && state.brightness <= FADE_TARGET_BRIGHTNESS)}
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
