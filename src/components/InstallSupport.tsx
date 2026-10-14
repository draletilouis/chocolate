'use client';

import { useEffect } from 'react';

/** Registers the service worker that makes the app installable (public/sw.js) */
export function InstallSupport() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
  }, []);
  return null;
}
