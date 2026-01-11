// apps/api/src/common/utils/phone.ts
export const normalizePhone = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\D+/g, '');
  return normalized.length > 0 ? normalized : null;
};
