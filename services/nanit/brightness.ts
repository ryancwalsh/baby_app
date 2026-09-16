/**
 * Kept apart from `night-light.ts` so the browser can import these without
 * pulling the websocket and protobuf code in with them.
 */

export const MINIMUM_BRIGHTNESS = 0;
export const MAXIMUM_BRIGHTNESS = 100;

/**
 * Bunched towards the dim end on purpose: the useful range for a sleeping baby
 * is the bottom few percent, where a slider is hard to land on accurately.
 */
export const BRIGHTNESS_PRESETS = [0, 1, 2, 5, 10, 15, 20, 30, 50, 100];

/**
 * A walk down to a dim glow rather than an abrupt drop, for a baby who is
 * nearly asleep. The steps are the preset buttons themselves, so a fade only
 * ever passes through brightnesses that are already offered by hand.
 */
export const FADE_TARGET_BRIGHTNESS = 1;
export const FADE_DURATION_MILLISECONDS = 120_000;

/**
 * Every preset below where the fade starts, dimmest last. The total time is
 * fixed, so a brighter start means more steps rather than a longer fade.
 */
export function getFadeSteps(startBrightness: number) {
  return BRIGHTNESS_PRESETS.filter((preset) => preset >= FADE_TARGET_BRIGHTNESS && preset < startBrightness).sort((first, second) => second - first);
}
