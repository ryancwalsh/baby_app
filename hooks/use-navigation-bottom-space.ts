'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const NAVIGATION_BOTTOM_SPACE_KEY = 'baby-app-navigation-bottom-space';

/**
 * Extra room under the tabs, in the order they are offered. It is added on top of the space iOS reserves for its home indicator, for a phone where taps at the very bottom of the screen still go astray.
 */
export const NAVIGATION_BOTTOM_SPACES = [
  { label: 'None', pixels: 0, space: 'none' },
  { label: 'Some', pixels: 12, space: 'some' },
  { label: 'More', pixels: 24, space: 'more' },
] as const;

export type NavigationBottomSpace = (typeof NAVIGATION_BOTTOM_SPACES)[number]['space'];

/**
 * Per phone, like the clock and date formats. Anything unreadable is none.
 */
export function useNavigationBottomSpace() {
  const { store, value } = useLocalStorage(NAVIGATION_BOTTOM_SPACE_KEY);
  const choice = NAVIGATION_BOTTOM_SPACES.find(({ space }) => space === value) ?? NAVIGATION_BOTTOM_SPACES[0];

  return {
    bottomSpace: choice.space,
    bottomSpacePixels: choice.pixels,
    setBottomSpace: (next: NavigationBottomSpace) => {
      store(next);
    },
  };
}
