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

export type SessionUser = {
  userStableId?: string;
  email?: string | null;
  role?: string | null;
  id?: string;
  name?: string | null;
};

export type Session =
  | {
      user?: SessionUser | null;
      userId?: string;
    }
  | null;

export type SessionStatus = 'authenticated' | 'unauthenticated' | 'loading';

type AuthContextValue = {
  session: Session;
  status: SessionStatus;
  refresh: () => Promise<void>;
};

type ApiEnvelope<T> = {
  code: string;
  message?: string;
  details?: T;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function unwrapEnvelope<T>(payload: unknown): T | null {
  if (!isRecord(payload)) return null;

  // 信封结构：{ code, message, details }
  if (typeof payload.code === 'string') {
    const env = payload as ApiEnvelope<T>;
    return (env.details ?? null) as T | null;
  }

  // 非信封结构：直接就是数据
  return payload as T;
}

async function fetchSession(): Promise<Session> {
  const res = await fetch('/api/v1/auth/me', {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) return null;

  const payload = (await res.json().catch(() => null)) as unknown;
  const data = unwrapEnvelope<SessionUser | null>(payload);

  if (!data) return null;

  const userId = data.userStableId ?? data.id;
  return {
    user: {
      ...data,
      id: userId,
    },
    userId,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  const refresh = useCallback(async () => {
    setStatus('loading');
    const next = await fetchSession();
    setSession(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    void refresh();
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
  await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

// 你当前的 admin/login 是自写 fetch('/api/v1/auth/login')，所以这里保留空实现即可
export async function signIn(): Promise<void> {
  return undefined;
}
