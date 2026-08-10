import { Injectable } from '@nestjs/common';
import type { UberOrderActionName } from './uber-order.types';
import { UberOrderActionService } from './uber-order-action.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';

/** Selects retryable action rows and reconstructs their idempotent request payloads. */
@Injectable()
export class UberOrderOutboxService {
  constructor(
    private readonly prismaAccess: UberPrismaAccessService,
    private readonly actions: UberOrderActionService,
  ) {}
  async processPending(
    limit: number,
    execute: (
      externalOrderId: string,
      action: UberOrderActionName,
      payload: Record<string, unknown>,
    ) => Promise<unknown>,
  ) {
    const rows = await this.prismaAccess.uberOrderActionDelegate.findMany({
      where: {
        OR: [{ status: 'PENDING' }, { status: 'FAILED', retryable: true }],
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    return Promise.all(
      rows.map((row) =>
        execute(
          row.externalOrderId,
          row.action,
          row.action === 'DENY'
            ? this.actions.buildDenyPayload(
                row.reasonCode ?? 'OTHER',
                row.reasonDetail ?? undefined,
              )
            : {},
        ),
      ),
    );
  }
}
