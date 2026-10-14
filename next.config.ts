import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  // The embedded PostgreSQL used when DATABASE_URL is not set loads its WebAssembly files at run time.
  serverExternalPackages: ['@electric-sql/pglite'],
  // The service worker that makes the app installable: always fetched fresh, and only allowed to run this site's scripts.
  async headers() {
    return [{
      source: '/sw.js',
      headers: [
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
      ],
    }];
  },
};
export default config;
