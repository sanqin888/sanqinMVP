import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  UberOrderOutboxPort,
  UberOrderStatusAuditPort,
} from '../../application/ports/uber-order-processing.ports';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';

@Injectable()
export class UberOrderOutboxPrismaAdapter implements UberOrderOutboxPort {
  private static readonly MAX_ATTEMPTS = 8;
  private static readonly LEASE_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prismaAccess: UberPrismaAccessService,
  ) {}

  enqueue(
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

  claimDue(limit: number) {
    const leaseToken = randomUUID();
    return this.prisma.$queryRaw<
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
          AND "attemptCount" < ${UberOrderOutboxPrismaAdapter.MAX_ATTEMPTS}
        ORDER BY "updatedAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      UPDATE "UberOrderAction" action SET status = 'PROCESSING',
        "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = NOW() + (${UberOrderOutboxPrismaAdapter.LEASE_MS} * INTERVAL '1 millisecond'),
        "attemptCount" = action."attemptCount" + 1
      FROM candidates WHERE action.id = candidates.id
      RETURNING action."externalOrderId", action.action, action."reasonCode", action."reasonDetail"
    `;
  }

  async markSucceeded(externalOrderId: string, action: UberOrderActionName) {
    await this.prismaAccess.uberOrderActionRepository.updateMany({
      where: { externalOrderId, action, status: 'PROCESSING' },
      data: { status: 'SUCCEEDED', retryable: false, leaseToken: null, leaseExpiresAt: null },
    });
  }

  async markFailed(externalOrderId: string, action: UberOrderActionName, error: unknown) {
    await this.prismaAccess.uberOrderActionRepository.updateMany({
      where: { externalOrderId, action, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  }
}

@Injectable()
export class UberOrderStatusAuditPrismaAdapter
  implements UberOrderStatusAuditPort
{
  constructor(private readonly prisma: PrismaService) {}
  async record(eventName: string, payload: any): Promise<void> {
    await this.prisma.opsEvent.create({
      data: { eventName, source: 'ubereats', payload },
    });
  }
}
