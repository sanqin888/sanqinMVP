import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberOrderActionRepositoryPort,
  UberOrderActionTask,
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

const ORDER_LIFECYCLE_OUTBOX_SOURCE = 'orders.lifecycle';
const ORDER_ACCEPTED_LIFECYCLE_EVENT = 'order.accepted';

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
        select: { externalOrderId: true, action: true },
      });
      if (!claimed) return false;

      const completedAt = new Date();
      // Fence the complete operation with the exact lease first. Because this
      // update, the local Order transition and lifecycle append share one
      // transaction, any downstream DB error rolls all three back together.
      const updated = await tx.uberOrderAction.updateMany({
        where: {
          id: input.taskId,
          status: 'PROCESSING',
          leaseToken: input.leaseToken,
        },
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

      if (input.transition) {
        const clientRequestId = `ubereats:${claimed.externalOrderId}`;
        const order = await tx.order.findUnique({
          where: { clientRequestId },
          select: { id: true, orderStableId: true, status: true },
        });
        let reachedTarget = order?.status === input.transition.to;

        if (order?.status === input.transition.from) {
          const timestamps = {
            makingAt:
              input.transition.to === OrderStatus.making
                ? completedAt
                : undefined,
            readyAt:
              input.transition.to === OrderStatus.ready
                ? completedAt
                : undefined,
          };
          const transition = await tx.order.updateMany({
            where: {
              id: order.id,
              status: input.transition.from as OrderStatus,
            },
            data: {
              status: input.transition.to as OrderStatus,
              ...timestamps,
            },
          });
          reachedTarget = transition.count === 1;
          if (!reachedTarget) {
            const current = await tx.order.findUnique({
              where: { id: order.id },
              select: { status: true },
            });
            reachedTarget = current?.status === input.transition.to;
          }
        }

        if (
          order &&
          reachedTarget &&
          claimed.action === 'ACCEPT' &&
          input.transition.to === OrderStatus.making
        ) {
          // Deterministic idempotencyKey makes an ACCEPT replay append the same
          // logical fact. The API process consumes it and owns POS fulfillment.
          await tx.opsEvent.createMany({
            data: {
              idempotencyKey: `order.accepted:${order.id}`,
              eventName: ORDER_ACCEPTED_LIFECYCLE_EVENT,
              source: ORDER_LIFECYCLE_OUTBOX_SOURCE,
              payload: {
                orderId: order.id,
                orderStableId: order.orderStableId,
              },
            },
            skipDuplicates: true,
          });
        }
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
