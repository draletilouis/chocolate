'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { PublicUser } from '@/server/auth/users';

interface AuthContextValue {
  user: PublicUser;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Session user resolved on the server (see app/(app)/layout.tsx) and shared with client components. */
export function AuthProvider({ user, children }: { user: PublicUser; children: ReactNode }) {
  const signOut = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* the session is destroyed server-side; continue */ }
    // Full navigation so nothing from the signed-in render stays in memory.
    window.location.assign('/login');
  }, []);
  const value = useMemo(() => ({ user, signOut }), [user, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Small helper for JSON API calls from client components. */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T & { success?: boolean; message?: string } }> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  let data: T & { success?: boolean; message?: string };
  try { data = await response.json(); } catch { data = { message: 'Unexpected server response' } as T & { message: string }; }
  return { ok: response.ok, status: response.status, data };
}
