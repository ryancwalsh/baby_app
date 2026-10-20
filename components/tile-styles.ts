/**
 * Dark tiles tinted with each colour rather than filled with it, so the screen stays dim in the nursery at night.
 */
export const TILE_COLORS = {
  bottle: { border: 'border-orange-500/30', label: 'text-orange-500', surface: 'bg-orange-500/10' },
  diaper: { border: 'border-yellow-500/30', label: 'text-yellow-600 dark:text-yellow-400', surface: 'bg-yellow-500/10' },
  sleep: { border: 'border-sky-400/30', label: 'text-sky-500 dark:text-sky-400', surface: 'bg-sky-400/10' },
  stopwatch: { border: 'border-emerald-500/30', label: 'text-emerald-600 dark:text-emerald-400', surface: 'bg-emerald-500/10' },
} as const;

export const TILE_BUTTON_CLASS_NAME = 'self-start rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60';
