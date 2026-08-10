import type { UberHealthResponse } from '../contracts/responses/ubereats.responses';
export const presentWebhookHealth = (): UberHealthResponse => ({ ok: true });
