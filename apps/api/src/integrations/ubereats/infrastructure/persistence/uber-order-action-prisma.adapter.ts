import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderFulfillmentTiming, OrderStatus, Prisma } from '@prisma/client';
import {
  ORDER_ACCEPTED_LIFECYCLE_EVENT,
  ORDER_LIFECYCLE_OUTBOX_SOURCE,
  orderAcceptedIdempotencyKey,
} from '../../../../orders/order-lifecycle';
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

  async requeue(input: Omit<UberOrderActionTask, 'taskId' | 'leaseToken'>) {
    const existing = await this.prisma.uberOrderAction.findUnique({
      where: {
        externalOrderId_action: {
          externalOrderId: input.externalOrderId,
          action: input.action,
        },
      },
      select: { id: true, idempotencyKey: true, status: true },
    });
    if (!existing) return this.enqueue(input);
    if (existing.idempotencyKey === input.idempotencyKey) {
      return { taskId: existing.id, created: false };
    }
    if (existing.status !== 'SUCCEEDED' && existing.status !== 'FAILED') {
      throw new Error(
        `Uber action ${input.action} cannot enter a new phase while ${existing.status}`,
      );
    }

    const updated = await this.prisma.uberOrderAction.updateMany({
      where: {
        id: existing.id,
        idempotencyKey: existing.idempotencyKey,
        status: { in: ['SUCCEEDED', 'FAILED'] },
      },
      data: {
        idempotencyKey: input.idempotencyKey,
        businessVersion: input.businessVersion,
        reasonCode: input.reasonCode,
        reasonDetail: input.reasonDetail,
        status: 'PENDING',
        retryable: true,
        nextRetryAt: new Date(),
        completedAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        uberHttpStatus: null,
        response: Prisma.DbNull,
      },
    });
    if (updated.count === 1) {
      return { taskId: existing.id, created: true };
    }

    const current = await this.prisma.uberOrderAction.findUniqueOrThrow({
      where: {
        externalOrderId_action: {
          externalOrderId: input.externalOrderId,
          action: input.action,
        },
      },
      select: { id: true, idempotencyKey: true },
    });
    if (current.idempotencyKey === input.idempotencyKey) {
      return { taskId: current.id, created: false };
    }
    throw new Error(`Uber action ${input.action} phase changed concurrently`);
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

  async getOrderContext(externalOrderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId: `ubereats:${externalOrderId}` },
      select: {
        status: true,
        totalCents: true,
        paidAt: true,
        createdAt: true,
        fulfillmentTiming: true,
        scheduledReadyAt: true,
        externalEstimatedReadyAt: true,
      },
    });
    if (!order) return null;
    return {
      status: order.status as UberOrderStatus,
      totalCents: order.totalCents,
      referenceAt: order.paidAt ?? order.createdAt,
      fulfillmentTiming:
        order.fulfillmentTiming === OrderFulfillmentTiming.SCHEDULED
          ? ('SCHEDULED' as const)
          : ('IMMEDIATE' as const),
      scheduledReadyAt: order.scheduledReadyAt,
      externalEstimatedReadyAt: order.externalEstimatedReadyAt,
    };
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
      if (
        claimed.action === 'ACCEPT' &&
        input.transition &&
        input.transition.to !== OrderStatus.paid
      ) {
        throw new Error('Uber ACCEPT may only record local acceptance as paid');
      }

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
          uberHttpStatus: null,
          response: Prisma.DbNull,
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

        if (order && reachedTarget && claimed.action === 'ACCEPT') {
          // ACCEPT records acceptance only. Orders owns the separate decision to
          // start preparation and will append order.prep_started transactionally.
          await tx.opsEvent.createMany({
            data: {
              idempotencyKey: orderAcceptedIdempotencyKey(order.id),
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
    input: Parameters<UberOrderActionRepositoryPort['markFailed']>[2],
  ): Promise<boolean> {
    const result = await this.prisma.uberOrderAction.updateMany({
      where: { id: taskId, status: 'PROCESSING', leaseToken },
      data: {
        status: 'FAILED',
        retryable: input.retryable,
        lastError: `${input.code}: ${input.message}`.slice(0, 2_000),
        uberHttpStatus: input.upstreamStatus ?? null,
        response:
          input.responseBody === null || input.responseBody === undefined
            ? Prisma.DbNull
            : (input.responseBody as Prisma.InputJsonValue),
        nextRetryAt: input.retryable ? new Date(Date.now() + 1_000) : null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }
}
