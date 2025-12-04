//Users/apple/sanqinMVP/apps/web/src/app/[locale]/checkout/layout.tsx
'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';

export default function CheckoutLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
