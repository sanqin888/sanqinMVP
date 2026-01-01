//apps/api/src/deliveries/external-id.ts
import { createHash } from 'crypto';

const ALLOWED_EXTERNAL_ID = /[^a-zA-Z0-9\-._~]+/g;
const MAX_EXTERNAL_ID_LENGTH = 64;
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UUID_PLAIN_RE = /^[0-9a-fA-F]{32}$/;

const trimToEmpty = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const normalizeExternalOrderRef = (value: string): string => {
  const trimmed = trimToEmpty(value);
  if (!trimmed) {
    throw new Error('orderRef is required');
  }

  if (UUID_RE.test(trimmed) || UUID_PLAIN_RE.test(trimmed)) {
    const hash = createHash('sha256')
      .update(trimmed)
      .digest('hex')
      .slice(0, 16);
    return `uuid-${hash}`;
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
