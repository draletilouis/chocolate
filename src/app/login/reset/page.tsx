import { redirect } from 'next/navigation';
import { ResetPasswordScreen } from '@/components/ResetPasswordScreen';
import { getSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reset password · Cocoa Factory' };

export default async function ResetPage() {
  if (await getSession()) redirect('/account/password');
  return <ResetPasswordScreen />;
}
