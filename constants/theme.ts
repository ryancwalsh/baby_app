/**
 * Read by hooks/use-theme.ts and by the script in app/layout.tsx that applies the theme before the first paint. It lives here rather than in the hook because the layout is a server component, and a value exported from a client module reaches it only as a reference.
 */
export const THEME_KEY = 'baby-app-theme';
