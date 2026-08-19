import { type MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
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
    name: "Laydon's Room",
    orientation: 'portrait',
    scope: '/',
    short_name: 'Laydon',
    start_url: '/',
    theme_color: '#7c6bb0',
  };
}
