import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type {
  UberOrderOutboxPort,
  UberOrderOutboxItem,
  UberOrderStatusAuditPort,
} from '../../application/orders/uber-order-processing.ports';
import type { UberJsonValue } from '../../application/shared/uber-json-value';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildUberIdempotencyKey } from '../../application/orders/uber-idempotency-key';
import { UberWorkerConfigService } from '../workers/uber-worker-config.service';

@Injectable()
export class UberOrderOutboxPrismaAdapter implements UberOrderOutboxPort {
  private static readonly MAX_ATTEMPTS = 8;
  private readonly logger = new Logger(UberOrderOutboxPrismaAdapter.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: UberWorkerConfigService,
  ) {}

  enqueue(
    externalOrderId: string,
    action: UberOrderActionName,
    audit: { reasonCode?: string; reasonDetail?: string } = {},
  ) {
    const businessVersion = 'v1';
    const taskId = `${externalOrderId}:${action}`;
    return this.prisma.uberOrderAction.upsert({
      where: { externalOrderId_action: { externalOrderId, action } },
      create: {
        externalOrderId,
        action,
        status: 'PENDING',
        businessVersion,
        idempotencyKey: buildUberIdempotencyKey({
          taskId,
          resourceId: externalOrderId,
          action,
          businessVersion,
        }),
        ...audit,
      },
      update: {},
    });
  }

  claimDue(limit: number) {
    const leaseToken = randomUUID();
    return this.prisma.$queryRaw<
      Array<{
        taskId: string;
        leaseToken: string;
        externalOrderId: string;
        action: UberOrderActionName;
        reasonCode: string | null;
        reasonDetail: string | null;
        idempotencyKey: string;
        businessVersion: string;
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
        "leaseExpiresAt" = NOW() + (${this.config.workerLeaseDurationMs} * INTERVAL '1 millisecond'),
        "attemptCount" = action."attemptCount" + 1
      FROM candidates WHERE action.id = candidates.id
      RETURNING action.id AS "taskId", action."externalOrderId", action.action,
        action."reasonCode", action."reasonDetail", action."idempotencyKey", action."businessVersion",
        action."leaseToken"
    `;
  }

  async markSucceeded(item: UberOrderOutboxItem): Promise<boolean> {
    const result = await this.prisma.uberOrderAction.updateMany({
      where: {
        id: item.taskId,
        status: 'PROCESSING',
        leaseToken: item.leaseToken,
      },
      data: {
        status: 'SUCCEEDED',
        retryable: false,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return this.verifyLease(result.count, item);
  }

  async markFailed(
    item: UberOrderOutboxItem,
    error: unknown,
  ): Promise<boolean> {
    const result = await this.prisma.uberOrderAction.updateMany({
      where: {
        id: item.taskId,
        status: 'PROCESSING',
        leaseToken: item.leaseToken,
      },
      data: {
        status: 'FAILED',
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : String(error).slice(0, 500),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return this.verifyLease(result.count, item);
  }

  private verifyLease(count: number, item: UberOrderOutboxItem): boolean {
    if (count > 0) return true;
    this.logger.warn(
      `Uber order action lease lost; status update skipped (taskId=${item.taskId}, action=${item.action})`,
    );
    return false;
  }
}

@Injectable()
export class UberOrderStatusAuditPrismaAdapter implements UberOrderStatusAuditPort {
  constructor(private readonly prisma: PrismaService) {}
  async record(eventName: string, payload: UberJsonValue): Promise<void> {
    await this.prisma.opsEvent.create({
      data: {
        eventName,
        source: 'ubereats',
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      },
    });
  }
}
