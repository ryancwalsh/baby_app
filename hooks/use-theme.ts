'use client';

import { THEME_KEY } from '@/constants/theme';
import { useLocalStorage } from '@/hooks/use-local-storage';

export const THEMES = [
  { label: 'System', theme: 'system' },
  { label: 'Light', theme: 'light' },
  { label: 'Dark', theme: 'dark' },
] as const;

export type Theme = (typeof THEMES)[number]['theme'];

/**
 * Per phone. "System" follows the phone's own setting and is marked by having no `data-theme` at all, so that app/globals.css can leave it to `prefers-color-scheme`.
 */
export function applyTheme(theme: Theme) {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export function useTheme() {
  const { store, value } = useLocalStorage(THEME_KEY);
  const theme = THEMES.find((option) => option.theme === value)?.theme ?? 'system';

  return {
    setTheme: (next: Theme) => {
      store(next);
      applyTheme(next);
    },
    theme,
  };
}
