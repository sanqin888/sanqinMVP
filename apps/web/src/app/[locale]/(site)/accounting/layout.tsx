import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AccountingShell } from '@/components/staff/AccountingShell';
import {
  buildStaffLoginPath,
  isStaffRole,
  staffDefaultLanding,
} from '@/lib/staff-entry';
import { serverApiFetch } from '@/server/api';

export const metadata: Metadata = {
  title: 'SanQ Accounting',
  description: 'SanQ accounting and financial reporting workspace.',
  manifest: '/accounting.webmanifest',
  icons: {
    apple: [
      {
        url: '/images/pwa/accounting-v1.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
  appleWebApp: {
    title: 'SanQ Accounting',
    statusBarStyle: 'default',
    capable: true,
  },
};

type Session = {
  role?: string;
  requiresTwoFactor?: boolean;
};

async function getSession(): Promise<Session | null> {
  try {
    return await serverApiFetch<Session>('/auth/me', {
      forwardCookies: true,
    });
  } catch {
    return null;
  }
}

export default async function AccountingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' || locale === 'en' ? locale : 'en';
  const session = await getSession();
  const role = session?.role;

  if (role !== 'ADMIN' && role !== 'ACCOUNTANT') {
    if (isStaffRole(role)) {
      redirect(staffDefaultLanding(role, safeLocale));
    }
    redirect(
      buildStaffLoginPath(
        safeLocale,
        `/${safeLocale}/accounting/dashboard`,
      ),
    );
  }

  return <AccountingShell locale={safeLocale}>{children}</AccountingShell>;
}
