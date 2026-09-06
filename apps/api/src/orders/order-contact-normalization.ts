import { normalizeEmail } from '../common/utils/email';

export const normalizeOrderEmail = (raw?: string | null): string | null =>
  normalizeEmail(raw);
