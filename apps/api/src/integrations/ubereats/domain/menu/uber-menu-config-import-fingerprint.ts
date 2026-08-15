import { createHash } from 'crypto';

export type UberMenuConfigFingerprintValue =
  | null
  | boolean
  | number
  | string
  | UberMenuConfigFingerprintValue[]
  | { [key: string]: UberMenuConfigFingerprintValue };

export const fingerprintUberMenuConfigState = (
  state: UberMenuConfigFingerprintValue,
) => createHash('sha256').update(JSON.stringify(state)).digest('hex');
