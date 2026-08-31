'use client';

import type { ReactNode } from 'react';
import { AdminShell } from '@/components/staff/AdminShell';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';

type AdminLayoutClientProps = {
  children: ReactNode;
  locale: Locale;
  role: 'ADMIN' | 'STAFF' | 'ACCOUNTANT';
};

export default function AdminLayoutClient({
  children,
  locale,
  role,
}: AdminLayoutClientProps) {
  async function handleLogout(): Promise<void> {
    try {
      await apiFetch<unknown>('/auth/logout', {
        method: 'POST',
        unauthorized: 'throw',
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    } finally {
      window.location.href = `/${locale}/admin/login`;
    }
  }

  return (
    <AdminShell locale={locale} role={role} onLogout={handleLogout}>
      {children}
    </AdminShell>
  );
}
