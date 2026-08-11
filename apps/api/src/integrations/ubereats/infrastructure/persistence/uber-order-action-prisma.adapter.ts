import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberOrderActionRepositoryPort,
  UberOrderActionTask,
} from '../../application/ports/uber-order.ports';

type ClaimedRow = Omit<UberOrderActionTask, 'taskId'> & { id: string };

/** Durable order-command queue. Prisma records are translated at this boundary. */
@Injectable()
export class UberOrderActionPrismaAdapter implements UberOrderActionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: Omit<UberOrderActionTask, 'taskId' | 'leaseToken'>) {
    try {
      const result = await this.prisma.uberOrderAction.create({
        data: {
          externalOrderId: input.externalOrderId,
          action: input.action,
          idempotencyKey: input.idempotencyKey,
          businessVersion: input.businessVersion,
          reasonCode: input.reasonCode,
          reasonDetail: input.reasonDetail,
          status: 'PENDING',
          retryable: true,
          nextRetryAt: new Date(),
        },
        select: { id: true },
      });
      return { taskId: result.id, created: true };
    } catch (error) {
      if (this.errorCode(error) !== 'P2002') throw error;
      const existing = await this.prisma.uberOrderAction.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      return { taskId: existing.id, created: false };
    }
  }

  private errorCode(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }

  async claim(input: {
    limit: number;
    owner: string;
    now: Date;
    leaseDurationMs: number;
  }): Promise<UberOrderActionTask[]> {
    const leaseToken = `${input.owner}:${randomUUID()}`;
    const expiresAt = new Date(input.now.getTime() + input.leaseDurationMs);
    const rows = await this.prisma.$queryRawUnsafe<ClaimedRow[]>(
      `WITH candidates AS (
        SELECT id FROM "UberOrderAction"
        WHERE
          (status = 'PENDING' AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= $1))
          OR (status = 'FAILED' AND retryable = true AND "nextRetryAt" <= $1)
          OR (status = 'PROCESSING' AND "leaseExpiresAt" < $1)
        ORDER BY "updatedAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      UPDATE "UberOrderAction" action
      SET status = 'PROCESSING', "leaseToken" = $3 || ':' || action.id,
          "leaseExpiresAt" = $4, "attemptCount" = "attemptCount" + 1,
          "updatedAt" = $1
      FROM candidates WHERE action.id = candidates.id
      RETURNING action.id, action."leaseToken", action."externalOrderId", action.action,
        action."idempotencyKey", action."businessVersion", action."reasonCode", action."reasonDetail"`,
      input.now,
      input.limit,
      leaseToken,
      expiresAt,
    );
    return rows.map(({ id, ...row }) => ({ taskId: id, ...row }));
  }

  async markSucceeded(taskId: string, leaseToken: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.uberOrderAction.findFirst({
        where: { id: taskId, status: 'PROCESSING', leaseToken },
        select: { externalOrderId: true, action: true },
      });
      if (!claimed) return false;
      const completedAt = new Date();
      const updated = await tx.uberOrderAction.updateMany({
        where: { id: taskId, status: 'PROCESSING', leaseToken },
        data: {
          status: 'SUCCEEDED',
          retryable: false,
          completedAt,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
      if (updated.count !== 1) return false;
      if (claimed.action === 'ACCEPT') {
        await tx.order.updateMany({
          where: {
            clientRequestId: `ubereats:${claimed.externalOrderId}`,
            status: { in: [OrderStatus.pending, OrderStatus.paid] },
          },
          data: { status: OrderStatus.making, makingAt: completedAt },
        });
      } else if (claimed.action === 'READY_FOR_PICKUP') {
        await tx.order.updateMany({
          where: {
            clientRequestId: `ubereats:${claimed.externalOrderId}`,
            status: { in: [OrderStatus.paid, OrderStatus.making] },
          },
          data: { status: OrderStatus.ready, readyAt: completedAt },
        });
      }
      return true;
    });
  }

  async markFailed(
    taskId: string,
    leaseToken: string,
    input: { retryable: boolean; code: string; message: string },
  ): Promise<boolean> {
    const result = await this.prisma.uberOrderAction.updateMany({
      where: { id: taskId, status: 'PROCESSING', leaseToken },
      data: {
        status: 'FAILED',
        retryable: input.retryable,
        lastError: `${input.code}: ${input.message}`.slice(0, 2_000),
        nextRetryAt: input.retryable ? new Date(Date.now() + 1_000) : null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }
}
