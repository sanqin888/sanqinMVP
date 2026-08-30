///Users/apple/sanqinMVP/apps/api/src/common/utils
import { randomBytes } from 'node:crypto';

export {
  assertStableId,
  isStableId,
  normalizeStableId,
} from '@shared/foundation';

export function generateStableId(): string {
  const random = BigInt(`0x${randomBytes(16).toString('hex')}`)
    .toString(36)
    .padStart(24, '0')
    .slice(0, 24);
  return `c${random}`;
}
