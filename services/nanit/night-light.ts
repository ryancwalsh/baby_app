import { FADE_DURATION_MILLISECONDS, getFadeSteps, MAXIMUM_BRIGHTNESS, MINIMUM_BRIGHTNESS } from '@/services/nanit/brightness';
import { getNightLightState, type NightLightState, sendToCamera, setNightLightFading, syncFromCamera } from '@/services/nanit/connection';

/**
 * A nightLightTimeout of zero means the light stays on until switched off.
 */
const STAY_ON_INDEFINITELY = 0;

/**
 * Waits for the camera's own brightness rather than answering from cache. The
 * cache was previously returned straight away with the read left running in the
 * background, which meant the first load after a restart rendered a stale value
 * and only a second load was right.
 *
 * On/off still comes from the cache, because it cannot be asked for at all.
 */
export function readNightLight(): Promise<NightLightState> {
  return syncFromCamera();
}

/**
 * Brightness and on/off are independent: setting a level does not switch the
 * light on, and switching it on does not change the level.
 */
export function setNightLightBrightness(brightness: number): Promise<NightLightState> {
  if (Number.isInteger(brightness) && brightness >= MINIMUM_BRIGHTNESS && brightness <= MAXIMUM_BRIGHTNESS) {
    return sendToCamera('PUT_SETTINGS', { settings: { nightLightBrightness: brightness } }, { brightness });
  }

  throw new Error(`Brightness must be a whole number from ${MINIMUM_BRIGHTNESS} to ${MAXIMUM_BRIGHTNESS} (got ${brightness}).`);
}

/**
 * The fade runs here rather than in the browser because a phone puts a
 * backgrounded page's timers to sleep — locking the screen or switching apps
 * mid fade used to stall it part way down, and closing the tab abandoned it
 * altogether. This process is long-lived and already holds the camera socket,
 * so the walk down carries on with nobody watching. Pages only start it, stop
 * it, and watch the state come back over the stream.
 *
 * Parked on `globalThis` for the same reason the connection is: `next dev`
 * re-evaluates modules, and a module-level counter would forget a running fade.
 */
const globalForFade = globalThis as typeof globalThis & {
  nanitFadeGeneration?: number;
};

/**
 * Every start takes the next generation, so a stop — or a second start — leaves
 * a loop that is already part way down to notice it is no longer the current
 * one and give up before its next write.
 */
function isCurrentFade(generation: number) {
  return globalForFade.nanitFadeGeneration === generation;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runFade(steps: number[], generation: number) {
  for (const brightness of steps) {
    await wait(FADE_DURATION_MILLISECONDS / steps.length);

    if (isCurrentFade(generation)) {
      try {
        await setNightLightBrightness(brightness);
      } catch {
        /**
         * An unreachable camera ends the fade rather than grinding through the
         * rest of the steps; the button goes out, which is the truth.
         */
        stopNightLightFade();
      }
    }
  }

  if (isCurrentFade(generation)) {
    stopNightLightFade();
  }
}

export function stopNightLightFade(): NightLightState {
  globalForFade.nanitFadeGeneration = (globalForFade.nanitFadeGeneration ?? 0) + 1;
  setNightLightFading(false);

  return getNightLightState();
}

/**
 * Returns as soon as the fade is under way; the walk down keeps running in this
 * process and reaches open pages over the night light stream.
 */
export function startNightLightFade(): NightLightState {
  stopNightLightFade();

  const steps = getFadeSteps(getNightLightState().brightness);

  if (steps.length > 0) {
    const generation = (globalForFade.nanitFadeGeneration ?? 0) + 1;
    globalForFade.nanitFadeGeneration = generation;
    setNightLightFading(true);

    // eslint-disable-next-line promise/prefer-await-to-then -- Deliberately not awaited: the fade outlives the request that started it.
    runFade(steps, generation).catch(() => {});
  }

  return getNightLightState();
}

export function setNightLightPower(isOn: boolean): Promise<NightLightState> {
  /**
   * Mirrors the frame the camera emits for its own switch-on.
   */
  return sendToCamera(
    'PUT_CONTROL',
    {
      control: isOn ? { nightLight: 'LIGHT_ON', nightLightTimeout: STAY_ON_INDEFINITELY } : { nightLight: 'LIGHT_OFF' },
    },
    { isOn },
  );
}

export { type NightLightState } from '@/services/nanit/connection';
