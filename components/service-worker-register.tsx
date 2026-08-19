'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js') // eslint-disable-next-line promise/prefer-await-to-then -- `register` is called from a synchronous effect body.
        .catch((error) => {
          console.warn('Service worker registration failed:', error);
        });
    }
  }, []);

  return null;
}
