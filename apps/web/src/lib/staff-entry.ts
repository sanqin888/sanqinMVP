export type StaffRole = 'ADMIN' | 'ACCOUNTANT' | 'STAFF';

export type StaffSurface = 'admin' | 'accounting' | 'pos';

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === 'ADMIN' || role === 'ACCOUNTANT' || role === 'STAFF';
}

export function staffDefaultLanding(
  role: StaffRole,
  locale: 'zh' | 'en',
): string {
  switch (role) {
    case 'ADMIN':
      return `/${locale}/admin`;
    case 'ACCOUNTANT':
      return `/${locale}/accounting/dashboard`;
    case 'STAFF':
      return `/${locale}/store/pos`;
  }
}

export function staffSurfaceForPath(
  path: string,
  locale: 'zh' | 'en',
): StaffSurface | null {
  const pathname = path.split(/[?#]/, 1)[0];
  if (
    pathname === `/${locale}/admin` ||
    pathname.startsWith(`/${locale}/admin/`)
  ) {
    return 'admin';
  }
  if (
    pathname === `/${locale}/accounting` ||
    pathname.startsWith(`/${locale}/accounting/`)
  ) {
    return 'accounting';
  }
  if (
    pathname === `/${locale}/store/pos` ||
    pathname.startsWith(`/${locale}/store/pos/`)
  ) {
    return 'pos';
  }
  return null;
}

export function normalizeStaffNext(
  raw: string | null | undefined,
  locale: 'zh' | 'en',
): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  const accountingRoot = `/${locale}/accounting`;
  if (raw === accountingRoot) return `${accountingRoot}/dashboard`;
  return staffSurfaceForPath(raw, locale) ? raw : null;
}

export function staffRoleCanAccessSurface(
  role: StaffRole,
  surface: StaffSurface,
): boolean {
  if (role === 'ADMIN') return true;
  if (role === 'ACCOUNTANT') return surface === 'accounting';
  return surface === 'pos';
}

export function resolveStaffLanding(
  role: StaffRole,
  locale: 'zh' | 'en',
  requestedNext?: string | null,
): string {
  const normalizedNext = normalizeStaffNext(requestedNext, locale);
  if (normalizedNext) {
    const surface = staffSurfaceForPath(normalizedNext, locale);
    if (surface && staffRoleCanAccessSurface(role, surface)) {
      return normalizedNext;
    }
  }
  return staffDefaultLanding(role, locale);
}

export function buildStaffLoginPath(
  locale: 'zh' | 'en',
  requestedNext: string,
  options?: { needDevice?: boolean },
): string {
  const next =
    normalizeStaffNext(requestedNext, locale) ??
    staffDefaultLanding('ADMIN', locale);
  const params = new URLSearchParams({ next });
  if (options?.needDevice) params.set('needDevice', '1');
  return `/${locale}/staff/login?${params.toString()}`;
}
