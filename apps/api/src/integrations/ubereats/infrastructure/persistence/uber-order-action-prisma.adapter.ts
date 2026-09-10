import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberOrderActionRepositoryPort,
  UberOrderActionTask,
} from '../../application/orders/uber-order.ports';

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
export class UberOrderActionPrismaAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: Omit<UberOrderActionTask, 'taskId' | 'leaseToken'>) {
    if (input.action === 'ACCEPT' || input.action === 'DENY') {
      return this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${input.externalOrderId})
          )::text AS "lockResult"
        `;
        const existingDecision = await tx.uberOrderAction.findFirst({
          where: {
            externalOrderId: input.externalOrderId,
            action: { in: ['ACCEPT', 'DENY'] },
          },
          select: { id: true, action: true },
          orderBy: { createdAt: 'asc' },
        });
        if (existingDecision) {
          if (existingDecision.action !== input.action) {
            throw new Error(
              `UBER_ORDER_DECISION_CONFLICT:${existingDecision.action}`,
            );
          }
          return { taskId: existingDecision.id, created: false };
        }
        const result = await tx.uberOrderAction.create({
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
      });
    }

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

  async completeWithinTransaction(
    transaction: unknown,
    input: Parameters<UberOrderActionRepositoryPort['complete']>[0],
  ): Promise<{
    externalOrderId: string;
    completedAt: Date;
    acceptanceConfirmed: boolean;
  } | null> {
    const tx = transaction as Prisma.TransactionClient;
    const claimed = await tx.uberOrderAction.findFirst({
      where: {
        id: input.taskId,
        status: 'PROCESSING',
        leaseToken: input.leaseToken,
      },
      select: { externalOrderId: true, action: true },
    });
    if (!claimed) return null;
    if (
      claimed.action === 'ACCEPT' &&
      input.transition &&
      input.transition.to !== 'paid'
    ) {
      throw new Error('Uber ACCEPT may only record local acceptance as paid');
    }

    const completedAt = new Date();
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
        uberHttpStatus: input.upstreamStatus ?? null,
        response: Prisma.DbNull,
      },
    });
    if (updated.count !== 1) return null;

    return {
      externalOrderId: claimed.externalOrderId,
      completedAt,
      acceptanceConfirmed: claimed.action === 'ACCEPT',
    };
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
