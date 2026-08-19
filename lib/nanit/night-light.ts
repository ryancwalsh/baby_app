import {
  connect,
  getNightLightState,
  sendToCamera,
  type NightLightState,
} from "@/lib/nanit/connection";
import { MAXIMUM_BRIGHTNESS, MINIMUM_BRIGHTNESS } from "@/lib/nanit/brightness";

/** A nightLightTimeout of zero means the light stays on until switched off. */
const STAY_ON_INDEFINITELY = 0;

export type { NightLightState };

/**
 * Returns the last known state without waiting on the camera, and opens the
 * shared connection in the background so the next press is quick and later
 * announcements are seen. Cheap enough to call while rendering a page.
 */
export function readNightLight(): NightLightState {
  connect().catch(() => {});
  return getNightLightState();
}

/**
 * Brightness and on/off are independent: setting a level does not switch the
 * light on, and switching it on does not change the level.
 */
export function setNightLightBrightness(
  brightness: number,
): Promise<NightLightState> {
  if (
    Number.isInteger(brightness) &&
    brightness >= MINIMUM_BRIGHTNESS &&
    brightness <= MAXIMUM_BRIGHTNESS
  ) {
    return sendToCamera(
      "PUT_SETTINGS",
      { settings: { nightLightBrightness: brightness } },
      { brightness },
    );
  }

  throw new Error(
    `Brightness must be a whole number from ${MINIMUM_BRIGHTNESS} to ${MAXIMUM_BRIGHTNESS} (got ${brightness}).`,
  );
}

export function setNightLightPower(isOn: boolean): Promise<NightLightState> {
  /** Mirrors the frame the camera emits for its own switch-on. */
  return sendToCamera(
    "PUT_CONTROL",
    {
      control: isOn
        ? { nightLight: "LIGHT_ON", nightLightTimeout: STAY_ON_INDEFINITELY }
        : { nightLight: "LIGHT_OFF" },
    },
    { isOn },
  );
}
