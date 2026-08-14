import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
<<<<<<< HEAD
import { OrderStatus, Prisma } from '@prisma/client';
=======
import { OrderStatus } from '@prisma/client';
>>>>>>> origin/main
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberOrderActionRepositoryPort,
  UberOrderActionTask,
<<<<<<< HEAD
} from '../../application/orders/uber-order.ports';
import type { UberOrderStatus } from '../../domain/orders/uber-order.types';

type ClaimedRow = {
  id: string;
  leaseToken: string;
  externalOrderId: string;
  action: UberOrderActionTask['action'];
  idempotencyKey: string;
  businessVersion: string;
  reasonCode: string | null;
  reasonDetail: string | null;
};
=======
} from '../../application/ports/uber-order.ports';

type ClaimedRow = Omit<UberOrderActionTask, 'taskId'> & { id: string };
>>>>>>> origin/main

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
<<<<<<< HEAD
    const claimable = Prisma.sql`
      (status = 'PENDING' AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= ${input.now}))
      OR (status = 'FAILED' AND retryable = true AND "nextRetryAt" <= ${input.now})
      OR (status = 'PROCESSING' AND "leaseExpiresAt" < ${input.now})
    `;
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      WITH candidates AS (
        SELECT id FROM "UberOrderAction"
        WHERE (${claimable})
        ORDER BY "updatedAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE "UberOrderAction" action
      SET status = 'PROCESSING', "leaseToken" = ${leaseToken} || ':' || action.id,
          "leaseExpiresAt" = ${expiresAt}, "attemptCount" = "attemptCount" + 1,
          "updatedAt" = ${input.now}
      FROM candidates WHERE action.id = candidates.id
      RETURNING action.id, action."leaseToken", action."externalOrderId", action.action,
        action."idempotencyKey", action."businessVersion", action."reasonCode", action."reasonDetail"
    `;
    return rows.map(
      (row): UberOrderActionTask => ({
        taskId: row.id,
        leaseToken: row.leaseToken,
        externalOrderId: row.externalOrderId,
        action: row.action,
        idempotencyKey: row.idempotencyKey,
        businessVersion: row.businessVersion,
        reasonCode: row.reasonCode,
        reasonDetail: row.reasonDetail,
      }),
    );
  }

  async getOrderStatus(
    externalOrderId: string,
  ): Promise<UberOrderStatus | null> {
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId: `ubereats:${externalOrderId}` },
      select: { status: true },
    });
    return (order?.status as UberOrderStatus | undefined) ?? null;
  }

  async complete(input: {
    taskId: string;
    leaseToken: string;
    transition: { from: UberOrderStatus; to: UberOrderStatus } | null;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.uberOrderAction.findFirst({
        where: {
          id: input.taskId,
          status: 'PROCESSING',
          leaseToken: input.leaseToken,
        },
        select: { externalOrderId: true },
=======
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
>>>>>>> origin/main
      });
      if (!claimed) return false;
      const completedAt = new Date();
      const updated = await tx.uberOrderAction.updateMany({
<<<<<<< HEAD
        where: {
          id: input.taskId,
          status: 'PROCESSING',
          leaseToken: input.leaseToken,
        },
=======
        where: { id: taskId, status: 'PROCESSING', leaseToken },
>>>>>>> origin/main
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
<<<<<<< HEAD
      if (input.transition) {
        const timestamps = {
          makingAt:
            input.transition.to === OrderStatus.making
              ? completedAt
              : undefined,
          readyAt:
            input.transition.to === OrderStatus.ready ? completedAt : undefined,
        };
        await tx.order.updateMany({
          where: {
            clientRequestId: `ubereats:${claimed.externalOrderId}`,
            status: input.transition.from as OrderStatus,
          },
          data: {
            status: input.transition.to as OrderStatus,
            ...timestamps,
          },
=======
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
>>>>>>> origin/main
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
