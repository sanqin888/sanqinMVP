// apps/web/src/app/[locale]/membership/layout.tsx
'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/auth-session';

export default function MembershipLayout({ children }: { children: ReactNode }) {
  // 只给会员子树包 SessionProvider，其他页面不受影响
  return <SessionProvider>{children}</SessionProvider>;
}
