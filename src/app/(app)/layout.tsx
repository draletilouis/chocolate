import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/components/AuthProvider';
import { Shell } from '@/components/Shell';
import { getSession } from '@/server/auth/session';
import { StoreProvider } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Every page in this group requires a valid server-side session. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    const path = (await headers()).get('x-pathname') ?? '/';
    redirect(path && path !== '/' ? `/login?next=${encodeURIComponent(path)}` : '/login');
  }
  return (
    <AuthProvider user={session.user}>
      <StoreProvider authUser={session.user}>
        <Shell>{children}</Shell>
      </StoreProvider>
    </AuthProvider>
  );
}
