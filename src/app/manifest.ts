import type { MetadataRoute } from 'next'

/** PWA manifest (specs/029 P2 — Web Push needs an installable app on iOS; harmless elsewhere). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sojourn',
    short_name: 'Sojourn',
    description: 'Trips, portfolio and health routines.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f3ee',
    theme_color: '#1d4ed8',
    icons: [{ src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
