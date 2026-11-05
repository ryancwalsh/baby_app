'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const HIDDEN_SWITCHES_KEY = 'baby-app-hidden-switches';

function parseHiddenDeviceIds(value: null | string | undefined): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((deviceId): deviceId is string => typeof deviceId === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Which of the `TAPO_DEVICES` switches this phone leaves off the Switches tab, per phone like the clock and date formats. Only the hidden ones are stored, so every switch is shown until someone turns it off here, and a device added to `TAPO_DEVICES` later shows up on its own. Anything unreadable hides nothing.
 */
export function useHiddenSwitches() {
  const { isLoaded, store, value } = useLocalStorage(HIDDEN_SWITCHES_KEY);
  const hiddenDeviceIds = parseHiddenDeviceIds(value);

  return {
    hiddenDeviceIds,
    isLoaded,
    setIsShown: (deviceId: string, isShown: boolean) => {
      const others = hiddenDeviceIds.filter((hiddenDeviceId) => hiddenDeviceId !== deviceId);
      store(JSON.stringify(isShown ? others : [...others, deviceId]));
    },
  };
}
