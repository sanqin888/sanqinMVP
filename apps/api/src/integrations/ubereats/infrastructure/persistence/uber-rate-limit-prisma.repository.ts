import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  UberRateLimitAcquireCommand,
  UberRateLimitAcquireResult,
  UberRateLimitCoordinationRepositoryPort,
} from '../../application/shared/uber-rate-limiter.port';
import { PrismaService } from '../../../../prisma/prisma.service';

type StateRow = {
  tokens: number;
  lastRefillAt: Date;
  cooldownUntil: Date | null;
};

/** PostgreSQL adapter; the transaction-scoped advisory lock is partition-local. */
@Injectable()
export class UberRateLimitPrismaRepository implements UberRateLimitCoordinationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  tryAcquire(
    command: UberRateLimitAcquireCommand,
  ): Promise<UberRateLimitAcquireResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockPartition(tx, command.partitionKey);
      await tx.uberRateLimitState.upsert({
        where: { partitionKey: command.partitionKey },
        create: {
          partitionKey: command.partitionKey,
          tokens: command.burst,
          lastRefillAt: command.now,
        },
        update: {},
      });
      const rows = await tx.$queryRaw<StateRow[]>`
        SELECT tokens, "lastRefillAt", "cooldownUntil"
        FROM "UberRateLimitState"
        WHERE "partitionKey" = ${command.partitionKey}
        FOR UPDATE
      `;
      const state = rows[0];
      if (!state) throw new Error('Uber rate limit state 初始化失败');

      await tx.uberRateLimitLease.deleteMany({
        where: {
          partitionKey: command.partitionKey,
          expiresAt: { lte: command.now },
        },
      });
      const active = await tx.uberRateLimitLease.count({
        where: { partitionKey: command.partitionKey },
      });
      const elapsedMs = Math.max(
        0,
        command.now.getTime() - state.lastRefillAt.getTime(),
      );
      const tokens = Math.min(
        command.burst,
        Number(state.tokens) + (elapsedMs * command.ratePerSecond) / 1_000,
      );
      const cooldownMs = Math.max(
        0,
        (state.cooldownUntil?.getTime() ?? 0) - command.now.getTime(),
      );
      const tokenWaitMs = Math.ceil(
        (Math.max(0, command.weight - tokens) * 1_000) / command.ratePerSecond,
      );
      const acquired =
        cooldownMs === 0 &&
        active < command.concurrencyLimit &&
        tokens >= command.weight;

      await tx.uberRateLimitState.update({
        where: { partitionKey: command.partitionKey },
        data: {
          tokens: acquired ? tokens - command.weight : tokens,
          lastRefillAt: command.now,
        },
      });
      if (!acquired) {
        return {
          acquired: false,
          retryAfterMs: Math.max(cooldownMs, tokenWaitMs, 25),
        };
      }
      await tx.uberRateLimitLease.create({
        data: {
          id: command.leaseId,
          partitionKey: command.partitionKey,
          expiresAt: command.leaseExpiresAt,
        },
      });
      return { acquired: true };
    });
  }

  async release(leaseId: string): Promise<void> {
    await this.prisma.uberRateLimitLease.deleteMany({ where: { id: leaseId } });
  }

  async extendCooldown(
    partitionKey: string,
    cooldownUntil: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockPartition(tx, partitionKey);
      await tx.uberRateLimitState.upsert({
        where: { partitionKey },
        create: {
          partitionKey,
          tokens: 0,
          lastRefillAt: new Date(),
          cooldownUntil,
        },
        update: {},
      });
      await tx.$executeRaw`
        UPDATE "UberRateLimitState"
        SET "cooldownUntil" = GREATEST(
          COALESCE("cooldownUntil", ${cooldownUntil}),
          ${cooldownUntil}
        ), "updatedAt" = NOW()
        WHERE "partitionKey" = ${partitionKey}
      `;
    });
  }

  private async lockPartition(
    tx: Prisma.TransactionClient,
    partitionKey: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${partitionKey}, 824731)
      )::text AS "lockResult"
    `;
  }
}
