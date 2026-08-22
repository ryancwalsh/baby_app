import { type MetadataRoute } from 'next';

import { getEnvironment } from '@/constants/environment';

export default function manifest(): MetadataRoute.Manifest {
  const { APP_SHORT_NAME, APP_TITLE } = getEnvironment();

  return {
    background_color: '#fdfcfa',
    description: 'Nursery controls',
    display: 'standalone',
    icons: [
      {
        purpose: 'any',
        sizes: '192x192',
        src: '/icon-192.png',
        type: 'image/png',
      },
      {
        purpose: 'any',
        sizes: '512x512',
        src: '/icon-512.png',
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: '/icon-512.png',
        type: 'image/png',
      },
    ],
    name: APP_TITLE,
    orientation: 'portrait',
    scope: '/',
    short_name: APP_SHORT_NAME,
    start_url: '/',
    theme_color: '#000000',
  };
}
