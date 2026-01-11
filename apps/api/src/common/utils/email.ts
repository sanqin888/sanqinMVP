export const normalizeEmail = (raw?: string | null): string | null => {
  if (raw == null) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};
