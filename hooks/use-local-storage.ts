"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage is an external store, so it is read through
 * `useSyncExternalStore` rather than copied into state by an effect. The server
 * snapshot is `undefined`, meaning "not known yet", which is what lets callers
 * render nothing on the first pass instead of flashing a logged-out view at
 * someone who is already logged in.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  /** Other tabs report through `storage`; this tab reports through `store`. */
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLocalStorage(key: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key),
    () => undefined,
  );

  const store = useCallback(
    (next: string | null) => {
      if (next === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, next);
      }
      for (const onChange of listeners) {
        onChange();
      }
    },
    [key],
  );

  return { value, isLoaded: value !== undefined, store };
}
