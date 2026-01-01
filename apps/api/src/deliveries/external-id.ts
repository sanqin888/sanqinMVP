//apps/api/src/deliveries/external-id.ts
import { createHash } from 'crypto';

const ALLOWED_EXTERNAL_ID = /[^a-zA-Z0-9\-._~]+/g;
const MAX_EXTERNAL_ID_LENGTH = 64;

const trimToEmpty = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const normalizeExternalOrderRef = (value: string): string => {
  const trimmed = trimToEmpty(value);
  if (!trimmed) {
    throw new Error('orderRef is required');
  }

  const sanitized = trimmed.replace(ALLOWED_EXTERNAL_ID, '-');
  const collapsed = sanitized.replace(/-+/g, '-').replace(/^-+|-+$/g, '');

  if (!collapsed) {
    throw new Error('orderRef has no valid characters');
  }

  if (collapsed.length <= MAX_EXTERNAL_ID_LENGTH) {
    return collapsed;
  }

  const hash = createHash('sha256').update(collapsed).digest('hex').slice(0, 8);
  const keepLength = Math.max(1, MAX_EXTERNAL_ID_LENGTH - hash.length - 1);
  return `${collapsed.slice(0, keepLength)}-${hash}`;
};
