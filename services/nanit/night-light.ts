import { MAXIMUM_BRIGHTNESS, MINIMUM_BRIGHTNESS } from '@/services/nanit/brightness';
import { type NightLightState, sendToCamera, syncFromCamera } from '@/services/nanit/connection';

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
