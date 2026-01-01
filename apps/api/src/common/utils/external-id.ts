// apps/api/src/common/utils/external-id.ts
import { CLIENT_REQUEST_ID_RE } from './client-request-id';
import { normalizeStableId } from './stable-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const normalizeExternalOrderRef = (value: string): string => {
  const v = (value ?? '').trim();
  if (!v) throw new Error('orderRef is required');

  if (UUID_RE.test(v)) {
    throw new Error('orderRef must not be a UUID');
  }

  if (CLIENT_REQUEST_ID_RE.test(v)) return v;

  const stable = normalizeStableId(v);
  if (stable) return stable;

  throw new Error('orderRef must be clientRequestId or orderStableId');
};
