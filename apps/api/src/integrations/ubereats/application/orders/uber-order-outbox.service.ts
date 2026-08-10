import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import { UberOrderActionService } from './uber-order-action.service';
import { UberPrismaAccessService } from '../../infrastructure/persistence/uber-prisma-access.service';

/** Selects retryable action rows and reconstructs their idempotent request payloads. */
@Injectable()
export class UberOrderOutboxService {
  static readonly MAX_ATTEMPTS = 8;
  static readonly LEASE_MS = 60_000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly prismaAccess: UberPrismaAccessService,
    private readonly actions: UberOrderActionService,
  ) {}

  async enqueue(
    externalOrderId: string,
    action: UberOrderActionName,
    audit: { reasonCode?: string; reasonDetail?: string } = {},
  ) {
    return this.prismaAccess.uberOrderActionRepository.upsert({
      where: { externalOrderId_action: { externalOrderId, action } },
      create: { externalOrderId, action, status: 'PENDING', ...audit },
      update: {},
    });
  }

  async processPending(
    limit: number,
    execute: (
      externalOrderId: string,
      action: UberOrderActionName,
      payload: Record<string, unknown>,
    ) => Promise<unknown>,
  ) {
    const leaseToken = randomUUID();
    const rows = await this.prisma.$queryRaw<
      Array<{
        externalOrderId: string;
        action: UberOrderActionName;
        reasonCode: string | null;
        reasonDetail: string | null;
      }>
    >`
      WITH candidates AS (
        SELECT id FROM "UberOrderAction"
        WHERE ((status = 'PENDING') OR
          (status = 'FAILED' AND retryable = true AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())) OR
          (status = 'PROCESSING' AND "leaseExpiresAt" <= NOW()))
          AND "attemptCount" < ${UberOrderOutboxService.MAX_ATTEMPTS}
        ORDER BY "updatedAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      UPDATE "UberOrderAction" action SET status = 'PROCESSING',
        "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = NOW() + (${UberOrderOutboxService.LEASE_MS} * INTERVAL '1 millisecond'),
        "attemptCount" = action."attemptCount" + 1
      FROM candidates WHERE action.id = candidates.id
      RETURNING action."externalOrderId", action.action, action."reasonCode", action."reasonDetail"
    `;
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
