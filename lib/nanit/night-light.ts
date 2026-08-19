import { connectToCamera, type CameraConnection } from "@/lib/nanit/camera";
import { getAccessToken, getFirstCamera } from "@/lib/nanit/auth";
import {
  MAXIMUM_BRIGHTNESS,
  MINIMUM_BRIGHTNESS,
} from "@/lib/nanit/brightness";

/** A nightLightTimeout of zero means the light stays on until switched off. */
const STAY_ON_INDEFINITELY = 0;

export interface NightLightState {
  /** 0-100, or null when the camera did not report it. */
  brightness: number | null;
  /**
   * Null means genuinely unknown, not off. The on/off state cannot be read
   * back — the camera only announces it when it changes — so a short-lived
   * connection often never learns it. See README.md.
   */
  isOn: boolean | null;
}

interface Settings {
  settings?: { nightLightBrightness?: number };
}

/**
 * Opens a connection, runs `act`, then reads the resulting state and closes.
 * Every call reconnects: a Next.js server action has no process to keep a
 * long-lived socket in, which is exactly why `isOn` is so often null.
 */
async function withCamera(
  act: (camera: CameraConnection) => Promise<void>,
): Promise<NightLightState> {
  const accessToken = await getAccessToken();
  const { cameraUid } = await getFirstCamera(accessToken);
  const camera = await connectToCamera(cameraUid, accessToken);

  try {
    await act(camera);

    const settings = (await camera.sendRequest("GET_SETTINGS", {
      getSettings: { all: true },
    })) as Settings;
    const announced = camera.getAnnouncedNightLight();

    return {
      brightness: settings.settings?.nightLightBrightness ?? null,
      isOn: announced === undefined ? null : announced === "LIGHT_ON",
    };
  } finally {
    camera.close();
  }
}

export function readNightLight(): Promise<NightLightState> {
  return withCamera(async () => {});
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
    return withCamera(async (camera) => {
      await camera.sendRequest("PUT_SETTINGS", {
        settings: { nightLightBrightness: brightness },
      });
    });
  }

  throw new Error(
    `Brightness must be a whole number from ${MINIMUM_BRIGHTNESS} to ${MAXIMUM_BRIGHTNESS} (got ${brightness}).`,
  );
}

export function setNightLightPower(isOn: boolean): Promise<NightLightState> {
  return withCamera(async (camera) => {
    /** Mirrors the frame the camera emits for its own switch-on. */
    await camera.sendRequest("PUT_CONTROL", {
      control: isOn
        ? { nightLight: "LIGHT_ON", nightLightTimeout: STAY_ON_INDEFINITELY }
        : { nightLight: "LIGHT_OFF" },
    });
  });
}
