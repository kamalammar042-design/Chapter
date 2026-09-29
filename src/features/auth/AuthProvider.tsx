import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** true until the stored session has been checked */
  loading: boolean;
  /** set when Supabase reports a password-recovery link was opened */
  recovery: boolean;
  lastEvent: AuthChangeEvent | null;
  /** the session ended without the student signing out (expired or revoked) */
  expired: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(env.isConfigured);
  const [recovery, setRecovery] = useState(false);
  const [lastEvent, setLastEvent] = useState<AuthChangeEvent | null>(null);
  const [expired, setExpired] = useState(false);
  const manualSignOut = useRef(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!env.isConfigured) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLastEvent(event);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_IN') setExpired(false);
      if (event === 'SIGNED_OUT') {
        setExpired(!manualSignOut.current);
        manualSignOut.current = false;
        setRecovery(false);
        qc.clear(); // never show one account's cached data to the next
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  const value = useMemo<AuthState>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    recovery,
    lastEvent,
    expired,
    signOut: async () => {
      manualSignOut.current = true;
      await supabase.auth.signOut();
    },
  }), [session, loading, recovery, lastEvent, expired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user; only use below RequireAuth. */
// eslint-disable-next-line react-refresh/only-export-components
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
