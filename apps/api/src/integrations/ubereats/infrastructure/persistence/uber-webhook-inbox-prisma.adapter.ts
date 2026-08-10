import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type {
  UberWebhookInboxItem,
  UberWebhookInboxPort,
} from '../../application/ports/uber-order-processing.ports';
import { redactUberLogText } from '../../domain/shared/uber-integration.utils';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';
import { buildUberIdempotencyKey } from '../../application/idempotency/uber-idempotency-key';
import { UberConfigService } from '../config/uber-config.service';

@Injectable()
export class UberWebhookInboxPrismaAdapter implements UberWebhookInboxPort {
  private static readonly MAX_ATTEMPTS = 8;
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: UberPrismaAccessService,
    private readonly config: UberConfigService,
  ) {}
  async enqueue(input: {
    eventId: string;
    eventType: string;
    externalOrderId: string | null;
    payload: unknown;
  }): Promise<boolean> {
    try {
      const businessVersion = 'v1';
      await this.access.uberWebhookInboxRepository.create({
        data: {
          ...input,
          status: 'PENDING',
          businessVersion,
          idempotencyKey: buildUberIdempotencyKey({
            taskId: input.eventId,
            resourceId: input.externalOrderId ?? input.eventId,
            action: input.eventType,
            businessVersion,
          }),
          payload: JSON.parse(
            JSON.stringify(input.payload ?? null),
          ) as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002'
      )
        return false;
      throw error;
    }
  }
  async claimDue(limit: number): Promise<UberWebhookInboxItem[]> {
    const leaseToken = randomUUID();
    const rows = await this.prisma.$queryRaw<
      Array<{
        eventId: string;
        eventType: string;
        payload: unknown;
        idempotencyKey: string;
        businessVersion: string;
      }>
    >`
      WITH candidates AS (
        SELECT id FROM "UberWebhookInbox"
        WHERE ((status IN ('PENDING', 'FAILED') AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())) OR (status = 'PROCESSING' AND "leaseExpiresAt" <= NOW()))
          AND "attemptCount" < ${UberWebhookInboxPrismaAdapter.MAX_ATTEMPTS}
        ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      UPDATE "UberWebhookInbox" inbox SET status = 'PROCESSING', "processingAt" = NOW(), "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = NOW() + (${this.config.workerLeaseDurationMs} * INTERVAL '1 millisecond'), "attemptCount" = inbox."attemptCount" + 1
      FROM candidates WHERE inbox.id = candidates.id RETURNING inbox."eventId", inbox."eventType", inbox.payload,
        inbox."idempotencyKey", inbox."businessVersion"
    `;
    return rows.map((row) => ({ ...row, leaseToken }));
  }
  async markSucceeded(item: UberWebhookInboxItem): Promise<void> {
    await this.access.uberWebhookInboxRepository.updateMany({
      where: {
        eventId: item.eventId,
        status: 'PROCESSING',
        leaseToken: item.leaseToken,
      },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        errorSummary: null,
        nextRetryAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        structuredError: Prisma.DbNull,
      },
    });
  }
  async markFailed(
    item: UberWebhookInboxItem,
    error: unknown,
    retryable: boolean,
  ): Promise<void> {
    const current = await this.access.uberWebhookInboxRepository.findUnique({
      where: { eventId: item.eventId },
      select: { attemptCount: true },
    });
    const attempts = current?.attemptCount ?? 1;
    const dead =
      !retryable || attempts >= UberWebhookInboxPrismaAdapter.MAX_ATTEMPTS;
    const summary = redactUberLogText(
      error instanceof Error ? error.message : String(error),
    ).slice(0, 500);
    await this.access.uberWebhookInboxRepository.updateMany({
      where: {
        eventId: item.eventId,
        status: 'PROCESSING',
        leaseToken: item.leaseToken,
      },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        errorSummary: summary || 'unknown error',
        structuredError: { message: summary, retryable },
        nextRetryAt: dead
          ? null
          : new Date(
              Date.now() +
                Math.min(
                  this.config.workerPolicies.webhookInbox.maxBackoffMs,
                  this.config.workerPolicies.webhookInbox.initialBackoffMs *
                    2 ** (attempts - 1),
                ),
            ),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  }
  async setStoreProvisioned(
    storeId: string,
    isProvisioned: boolean,
  ): Promise<boolean> {
    const result = await this.access.uberStoreMappingRepository.updateMany({
      where: { uberStoreId: storeId },
      data: { isProvisioned, provisionedAt: isProvisioned ? new Date() : null },
    });
    return result.count > 0;
  }
}
