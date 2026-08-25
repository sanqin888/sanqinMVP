export type UberWorkerWakeTarget = 'webhookInbox' | 'orderAction';

/**
 * Best-effort hint that durable Uber work is available.
 * Correctness must never depend on delivery of this signal; polling remains the fallback.
 */
export interface UberWorkerWakePort {
  signal(target: UberWorkerWakeTarget): void;
}

export const UBER_WORKER_WAKE_PORT = Symbol('UBER_WORKER_WAKE_PORT');
