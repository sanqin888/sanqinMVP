import { Inject, Injectable } from '@nestjs/common';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import {
  UBER_ORDER_OUTBOX_PORT,
  type UberOrderOutboxPort,
} from '../ports/uber-order-processing.ports';

/** Selects retryable action rows and reconstructs their idempotent request payloads. */
@Injectable()
export class UberOrderOutboxService {
  constructor(
    @Inject(UBER_ORDER_OUTBOX_PORT)
    private readonly outbox: UberOrderOutboxPort,
  ) {}

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
