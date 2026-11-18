'use client';

import { useEffect, useRef } from 'react';
import { openDiscrepancies } from '@/lib/discrepancies';
import { useStore } from '@/lib/store';

/** Set on a device where a manager asked to be told about serious discrepancies */
export const NOTIFY_KEY = 'discrepancy-notify';

export const notifyEnabled = () => {
  try { return typeof Notification !== 'undefined' && Notification.permission === 'granted' && window.localStorage.getItem(NOTIFY_KEY) === '1'; } catch { return false; }
};

/**
 * Tells a manager about a new serious discrepancy while the app is open on this device, as a system
 * notification. It shows nothing itself; the register page turns it on. Other devices' saves arrive
 * every few seconds, so a weight that does not add up on the floor reaches the office within moments.
 */
export function DiscrepancyWatch() {
  const store = useStore();
  const known = useRef<Set<string> | null>(null);
  const serious = store.sessionUserId ? openDiscrepancies(store, new Date().toISOString().slice(0, 10)).filter((d) => d.severity === 'high') : [];
  const ids = serious.map((d) => d.id).join('|');

  useEffect(() => {
    if (!store.hydrated || !store.sessionUserId) return;
    const before = known.current;
    known.current = new Set(serious.map((d) => d.id));
    // The first list after opening the app is what was already there, not news
    if (!before || !notifyEnabled()) return;
    for (const d of serious.filter((x) => !before.has(x.id)).slice(0, 3)) {
      try {
        const n = new Notification(d.title, { body: d.detail, tag: d.id });
        n.onclick = () => { window.focus(); window.location.assign('/discrepancies'); };
      } catch { /* notifications are not available here */ }
    }
  }, [ids, store.hydrated, store.sessionUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
