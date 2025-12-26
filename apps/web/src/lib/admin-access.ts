// apps/web/src/lib/admin-access.ts

const adminEmailsRaw =
  process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '';

export const ADMIN_EMAILS = adminEmailsRaw
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

export function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

export function isAdminEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return ADMIN_EMAILS.includes(normalized);
}
