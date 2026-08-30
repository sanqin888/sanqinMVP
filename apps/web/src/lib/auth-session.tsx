// apps/web/src/lib/auth-session.tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiFetch } from '@/lib/api/client';

export type SessionUser = {
  userStableId?: string;
  email?: string | null;
  role?: string | null;
  language?: 'zh' | 'en';
  name?: string | null;
  mfaVerifiedAt?: string | null;
  requiresTwoFactor?: boolean;
  twoFactorEnabled?: boolean;
};

export type Session =
  | {
      user?: SessionUser | null;
    }
  | null;

export type SessionStatus = 'authenticated' | 'unauthenticated' | 'loading';

type AuthContextValue = {
  session: Session;
  status: SessionStatus;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_EVENT = 'auth-session-change';

function syncMemberLocaleCookie(session: Session): void {
  if (typeof document === 'undefined') return;

  const user = session?.user;
  const language = user?.role === 'CUSTOMER' ? user.language : undefined;
  if (language === 'zh' || language === 'en') {
    document.cookie = `member_locale=${language}; path=/; max-age=${60 * 60 * 24 * 365}`;
    return;
  }

  document.cookie = 'member_locale=; path=/; max-age=0';
}

async function fetchSession(): Promise<Session> {
  let data: SessionUser | null;
  try {
    data = await apiFetch<SessionUser | null>('/auth/me', {
      unauthorized: 'throw',
    });
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }

  if (!data) return null;
  if (typeof data.userStableId !== 'string' || !data.userStableId) return null;

  const safeUser: SessionUser = { ...data };
  return {
    user: safeUser,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  const refresh = useCallback(async () => {
    setStatus('loading');
    const next = await fetchSession();
    syncMemberLocaleCookie(next);
    setSession(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = () => {
      void refresh();
    };

    window.addEventListener(AUTH_EVENT, handler);
    return () => window.removeEventListener(AUTH_EVENT, handler);
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, status, refresh }),
    [session, status, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): { data: Session; status: SessionStatus } {
  const ctx = useContext(AuthContext);
  if (!ctx) return { data: null, status: 'unauthenticated' };
  return { data: ctx.session, status: ctx.status };
}

export async function signOut(): Promise<void> {
  try {
    await apiFetch<unknown>('/auth/logout', {
      method: 'POST',
      unauthorized: 'throw',
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }

  if (typeof document !== 'undefined') {
    document.cookie = 'member_locale=; path=/; max-age=0';
  }
  notifyAuthChange();
}

type SignInOptions = { callbackUrl?: string };

export function notifyAuthChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function signIn(provider: 'google', opts?: SignInOptions): void {
  if (typeof window === 'undefined') return;
  if (provider !== 'google') throw new Error('Unsupported provider');

  const callbackUrl = opts?.callbackUrl ?? '/';
  const qs = new URLSearchParams();
  qs.set('callbackUrl', callbackUrl);
  const primary = navigator.languages?.[0] ?? navigator.language ?? '';
  const language = primary.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  qs.set('language', language);

  // 走你现有 /api 代理到 UPSTREAM/api
  window.location.assign(`/api/v1/auth/oauth/google/start?${qs.toString()}`);
}
