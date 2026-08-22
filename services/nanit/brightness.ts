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
