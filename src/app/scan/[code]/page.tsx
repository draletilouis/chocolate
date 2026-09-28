'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LinkButton, PageHeader } from '@/components/ui';
import { scanTarget } from '@/lib/derive';
import { useStore } from '@/lib/store';

/** Where a scanned QR code lands: the batch at the station it is waiting at, or the lot */
export default function ScanPage() {
  const { code } = useParams<{ code: string }>();
  const store = useStore();
  const router = useRouter();
  const target = scanTarget(store, code);
  useEffect(() => { if (target) router.replace(target); }, [target, router]);
  if (target) return <p className="empty-state" aria-busy="true">Opening…</p>;
  const text = decodeURIComponent(code);
  return (
    <>
      <PageHeader eyebrow="Scan" title={`Nothing found for ${text}`} subtitle="Check the code, or search for the batch or lot. Records made on another device are not on this one yet." />
      <LinkButton href={`/search?q=${encodeURIComponent(text)}`}>Search for {text}</LinkButton>
    </>
  );
}
