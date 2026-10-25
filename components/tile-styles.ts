/**
 * Dark tiles tinted with each colour rather than filled with it, so the screen stays dim in the nursery at night. Each label is a darker shade in light and a lighter one in dark, so it keeps a WCAG AA contrast of at least 4.5:1 on its tile in both. Medicine is fuchsia rather than rose, which sat too close to the bottle's orange to tell apart in a dim room.
 */
export const TILE_COLORS = {
  bottle: { border: 'border-orange-500/30', label: 'text-orange-700 dark:text-orange-500', surface: 'bg-orange-500/10' },
  diaper: { border: 'border-yellow-500/30', label: 'text-yellow-800 dark:text-yellow-400', surface: 'bg-yellow-500/10' },
  medicine: { border: 'border-fuchsia-500/30', label: 'text-fuchsia-700 dark:text-fuchsia-400', surface: 'bg-fuchsia-500/10' },
  sleep: { border: 'border-sky-400/30', label: 'text-sky-700 dark:text-sky-400', surface: 'bg-sky-400/10' },
  stopwatch: { border: 'border-emerald-500/30', label: 'text-emerald-700 dark:text-emerald-400', surface: 'bg-emerald-500/10' },
} as const;

export const TILE_BUTTON_CLASS_NAME = 'self-start rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60';
