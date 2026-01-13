export const normalizeEmail = (raw?: string | null): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  // 必须包含 '@' 符号才被视为有效邮箱
  if (!trimmed.includes('@')) {
    return null;
  }
  return trimmed.length > 0 ? trimmed : null;
};
