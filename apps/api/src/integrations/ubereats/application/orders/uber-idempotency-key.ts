import { createHash } from 'crypto';

/**
 * Builds a bounded, opaque key from durable task identity and business version.
 * Lease tokens, worker ids, request ids and attempt numbers must never be inputs.
 */
export function buildUberIdempotencyKey(input: {
  taskId: string;
  resourceId: string;
  action: string;
  businessVersion: string;
}): string {
  const canonical = [
    input.taskId,
    input.resourceId,
    input.action,
    input.businessVersion,
  ]
    .map((value) => value.trim())
    .join('\0');
  return `sanqin-uber-${createHash('sha256').update(canonical).digest('hex')}`;
}
