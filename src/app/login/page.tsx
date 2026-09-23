import { redirect } from 'next/navigation';
import { LoginScreen } from '@/components/LoginScreen';
import { getSession } from '@/server/auth/session';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · Cocoa Factory' };

export default async function LoginPage() {
  if (await getSession()) redirect('/production');
  return <LoginScreen showDemoHint={!env.isProduction && process.env.SEED_DEMO_USERS === 'true'} />;
}
