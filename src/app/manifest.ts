import type { MetadataRoute } from 'next';
import { brand } from '@/lib/brand';

/** Lets phones, tablets and computers install the app with Equator's compass-star icon */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${brand.name} · Production`,
    short_name: brand.shortName,
    description: 'Record every station of the production line, from beans to bars.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
