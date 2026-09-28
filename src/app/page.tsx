'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';

/** Operators start on their own work; managers start on the whole production line */
export default function Home() {
  const store = useStore();
  const router = useRouter();
  const user = store.users.find((u) => u.id === store.currentUserId);
  const home = user?.access === 'operator' || (user?.stations.length ?? 0) > 0 ? '/work' : '/production';
  useEffect(() => { router.replace(home); }, [home, router]);
  return <p className="empty-state" aria-busy="true">Opening…</p>;
}
