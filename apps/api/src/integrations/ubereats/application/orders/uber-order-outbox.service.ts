import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import { type UberOrderOutboxPort } from './uber-order-processing.ports';

/** Selects retryable action rows and reconstructs their idempotent request payloads. */
export class UberOrderOutboxService {
  constructor(private readonly outbox: UberOrderOutboxPort) {}

  async enqueue(
    externalOrderId: string,
    action: UberOrderActionName,
    audit: { reasonCode?: string; reasonDetail?: string } = {},
  ) {
    return this.outbox.enqueue(externalOrderId, action, audit);
  }

  async processPending(
    limit: number,
    execute: (
      externalOrderId: string,
      action: UberOrderActionName,
      payload: Record<string, unknown>,
      idempotencyKey: string,
    ) => Promise<unknown>,
  ) {
    const rows = await this.outbox.claimDue(limit);
    return Promise.all(
      rows.map(async (row) => {
        try {
          const result = await execute(
            row.externalOrderId,
            row.action,
            row.action === 'DENY'
              ? {
                  reasonCode: row.reasonCode ?? 'OTHER',
                  reasonDetail: row.reasonDetail ?? undefined,
                }
              : {},
            row.idempotencyKey,
          );
          const committed = await this.outbox.markSucceeded(row);
          if (!committed) {
            throw new Error(
              `Uber order action lease lost before success commit: ${row.taskId}`,
            );
          }
          return result;
        } catch (error) {
          await this.outbox.markFailed(row, error);
          throw error;
        }
      }),
    );
  }
}
