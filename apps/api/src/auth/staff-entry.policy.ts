export type StaffRole = 'ADMIN' | 'ACCOUNTANT' | 'STAFF';

const normalizeInternalPath = (value?: string): string => {
  if (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
  ) {
    return value;
  }
  return '/';
};

export function resolveStaffOauthRedirect(
  role: StaffRole,
  requestedNext: string,
  language?: 'zh' | 'en',
): string {
  const safeNext = normalizeInternalPath(requestedNext);
  const localeMatch = safeNext.match(/^\/(zh|en)(?:\/|$)/);
  const locale = localeMatch?.[1] ?? language ?? 'en';
  const adminRoot = `/${locale}/admin`;
  const accountingRoot = `/${locale}/accounting`;
  const posRoot = `/${locale}/store/pos`;
  const pathname = safeNext.split(/[?#]/, 1)[0];
  const normalizedNext =
    pathname === accountingRoot ? `${accountingRoot}/dashboard` : safeNext;
  const normalizedPathname = normalizedNext.split(/[?#]/, 1)[0];

  const requestedSurface =
    normalizedPathname.startsWith(`${adminRoot}/`) ||
    normalizedPathname === adminRoot
      ? 'admin'
      : normalizedPathname.startsWith(`${accountingRoot}/`) ||
          normalizedPathname === accountingRoot
        ? 'accounting'
        : normalizedPathname.startsWith(`${posRoot}/`) ||
            normalizedPathname === posRoot
          ? 'pos'
          : null;

  if (
    role === 'ADMIN' &&
    (requestedSurface === 'admin' ||
      requestedSurface === 'accounting' ||
      requestedSurface === 'pos')
  ) {
    return normalizedNext;
  }
  if (role === 'ACCOUNTANT' && requestedSurface === 'accounting') {
    return normalizedNext;
  }
  if (role === 'STAFF' && requestedSurface === 'pos') {
    return normalizedNext;
  }

  if (role === 'ACCOUNTANT') return `/${locale}/accounting/dashboard`;
  if (role === 'STAFF') return posRoot;
  return adminRoot;
}
