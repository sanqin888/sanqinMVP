<<<<<<< HEAD
import { Injectable, Optional } from '@nestjs/common';
=======
import { Injectable } from '@nestjs/common';
>>>>>>> origin/main
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type {
  UberWebhookInboxItem,
  UberWebhookInboxPort,
<<<<<<< HEAD
} from '../../application/orders/uber-order-processing.ports';
import { redactUberLogText } from '../shared/uber-log.utils';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildUberIdempotencyKey } from '../../application/orders/uber-idempotency-key';
import { UberWorkerConfigService } from '../workers/uber-worker-config.service';
import { UberTelemetryService } from './uber-telemetry.service';
import { UberApplicationError } from '../../application/shared/uber-application.error';
import type { UberJsonValue } from '../../application/shared/uber-json-value';
=======
} from '../../application/ports/uber-order-processing.ports';
import { redactUberLogText } from '../../domain/shared/uber-integration.utils';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';
import { buildUberIdempotencyKey } from '../../application/idempotency/uber-idempotency-key';
import { UberConfigService } from '../config/uber-config.service';
>>>>>>> origin/main

@Injectable()
export class UberWebhookInboxPrismaAdapter implements UberWebhookInboxPort {
  private static readonly MAX_ATTEMPTS = 8;
<<<<<<< HEAD
  private readonly telemetry: UberTelemetryService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: UberWorkerConfigService,
    @Optional() telemetry?: UberTelemetryService,
  ) {
    this.telemetry = telemetry ?? new UberTelemetryService(prisma);
  }
=======
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: UberPrismaAccessService,
    private readonly config: UberConfigService,
  ) {}
>>>>>>> origin/main
  async enqueue(input: {
    eventId: string;
    eventType: string;
    externalOrderId: string | null;
    payload: unknown;
  }): Promise<boolean> {
    try {
      const businessVersion = 'v1';
<<<<<<< HEAD
      await this.prisma.uberWebhookInbox.create({
=======
      await this.access.uberWebhookInboxRepository.create({
>>>>>>> origin/main
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
<<<<<<< HEAD
        resultKind: 'CLAIMED' | 'AUTO_DEAD';
        eventId: string;
        eventType: string | null;
        payload: unknown;
        idempotencyKey: string | null;
        businessVersion: string | null;
        resourceKey: string | null;
      }>
    >`
      WITH exhausted AS (
        UPDATE "UberWebhookInbox" exhausted SET status = 'DEAD', "processingAt" = NULL,
          "leaseToken" = NULL, "leaseExpiresAt" = NULL, "nextRetryAt" = NULL,
          "errorSummary" = 'Maximum webhook processing attempts exhausted',
          "structuredError" = jsonb_build_object('message', 'Maximum webhook processing attempts exhausted', 'retryable', false, 'automatic', true)
        WHERE exhausted."attemptCount" >= ${UberWebhookInboxPrismaAdapter.MAX_ATTEMPTS}
          AND (exhausted.status IN ('PENDING', 'FAILED')
            OR (exhausted.status = 'PROCESSING' AND exhausted."leaseExpiresAt" <= NOW()))
        RETURNING exhausted."eventId"
      ), candidates AS (
=======
        eventId: string;
        eventType: string;
        payload: unknown;
        idempotencyKey: string;
        businessVersion: string;
      }>
    >`
      WITH candidates AS (
>>>>>>> origin/main
        SELECT candidate.id FROM "UberWebhookInbox" candidate
        WHERE ((candidate.status IN ('PENDING', 'FAILED') AND (candidate."nextRetryAt" IS NULL OR candidate."nextRetryAt" <= NOW())) OR (candidate.status = 'PROCESSING' AND candidate."leaseExpiresAt" <= NOW()))
          AND candidate."attemptCount" < ${UberWebhookInboxPrismaAdapter.MAX_ATTEMPTS}
          AND NOT EXISTS (
            SELECT 1 FROM "UberWebhookInbox" earlier
            WHERE earlier."externalOrderId" = candidate."externalOrderId"
              AND earlier.status NOT IN ('PROCESSED', 'DEAD')
<<<<<<< HEAD
              AND NOT (earlier."attemptCount" >= ${UberWebhookInboxPrismaAdapter.MAX_ATTEMPTS}
                AND (earlier.status IN ('PENDING', 'FAILED')
                  OR (earlier.status = 'PROCESSING' AND earlier."leaseExpiresAt" <= NOW())))
              AND (earlier."createdAt", earlier.id) < (candidate."createdAt", candidate.id)
          )
        ORDER BY candidate."createdAt" ASC, candidate.id ASC FOR UPDATE OF candidate SKIP LOCKED LIMIT ${limit}
      ), claimed AS (
=======
              AND (earlier."createdAt", earlier.id) < (candidate."createdAt", candidate.id)
          )
        ORDER BY candidate."createdAt" ASC, candidate.id ASC FOR UPDATE OF candidate SKIP LOCKED LIMIT ${limit}
      )
>>>>>>> origin/main
      UPDATE "UberWebhookInbox" inbox SET status = 'PROCESSING', "processingAt" = NOW(), "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = NOW() + (${this.config.workerLeaseDurationMs} * INTERVAL '1 millisecond'), "attemptCount" = inbox."attemptCount" + 1
      FROM candidates WHERE inbox.id = candidates.id RETURNING inbox."eventId", inbox."eventType", inbox.payload,
        inbox."idempotencyKey", inbox."businessVersion", inbox."externalOrderId" AS "resourceKey"
<<<<<<< HEAD
      )
      SELECT 'CLAIMED' AS "resultKind", claimed.* FROM claimed
      UNION ALL
      SELECT 'AUTO_DEAD' AS "resultKind", exhausted."eventId", NULL, NULL, NULL, NULL, NULL FROM exhausted
    `;
    const autoDeadRows = rows.filter((row) => row.resultKind === 'AUTO_DEAD');
    await Promise.allSettled(
      autoDeadRows.map((row) =>
        this.telemetry.captureEvent(
          'ubereats_webhook_inbox_auto_dead',
          {
            attempt: UberWebhookInboxPrismaAdapter.MAX_ATTEMPTS,
            reason: 'maximum_attempts_exhausted',
          },
          { eventId: row.eventId },
        ),
      ),
    );

    return rows
      .filter((row) => row.resultKind === 'CLAIMED')
      .map((row) => ({
        eventId: row.eventId,
        eventType: row.eventType!,
        payload: row.payload as UberJsonValue,
        idempotencyKey: row.idempotencyKey!,
        businessVersion: row.businessVersion!,
        resourceKey: row.resourceKey,
        leaseToken,
      }));
  }
  async markSucceeded(item: UberWebhookInboxItem): Promise<boolean> {
    const result = await this.prisma.uberWebhookInbox.updateMany({
=======
    `;
    return rows.map((row) => ({ ...row, leaseToken }));
  }
  async markSucceeded(item: UberWebhookInboxItem): Promise<void> {
    await this.access.uberWebhookInboxRepository.updateMany({
>>>>>>> origin/main
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
<<<<<<< HEAD
    return result.count === 1;
  }
  async markUnsupported(
    item: UberWebhookInboxItem,
    details: {
      code: 'UBER_WEBHOOK_EVENT_UNSUPPORTED';
      eventType: string;
      safeSummary: string;
      businessVersion: string;
    },
  ): Promise<boolean> {
    const result = await this.prisma.uberWebhookInbox.updateMany({
      where: {
        eventId: item.eventId,
        status: 'PROCESSING',
        leaseToken: item.leaseToken,
      },
      data: {
        status: 'DEAD',
        errorSummary: details.safeSummary,
        structuredError: { ...details, retryable: false },
        nextRetryAt: null,
        processingAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async requeueUnsupported(
    eventIds: string[],
    supportedEventTypes: string[],
    businessVersion: string,
  ): Promise<number> {
    if (!eventIds.length || !supportedEventTypes.length) return 0;
    return await this.prisma.$executeRaw`
      UPDATE "UberWebhookInbox"
      SET status = 'PENDING', "attemptCount" = 0, "errorSummary" = NULL,
        "structuredError" = NULL, "nextRetryAt" = NULL, "processingAt" = NULL,
        "leaseToken" = NULL, "leaseExpiresAt" = NULL, "processedAt" = NULL,
        "businessVersion" = ${businessVersion}, "updatedAt" = NOW()
      WHERE "eventId" IN (${Prisma.join(eventIds)})
        AND "eventType" IN (${Prisma.join(supportedEventTypes)})
        AND status = 'DEAD'
        AND "structuredError"->>'code' = 'UBER_WEBHOOK_EVENT_UNSUPPORTED'
    `;
=======
>>>>>>> origin/main
  }
  async markFailed(
    item: UberWebhookInboxItem,
    error: unknown,
    retryable: boolean,
<<<<<<< HEAD
  ): Promise<boolean> {
    const current = await this.prisma.uberWebhookInbox.findUnique({
=======
  ): Promise<void> {
    const current = await this.access.uberWebhookInboxRepository.findUnique({
>>>>>>> origin/main
      where: { eventId: item.eventId },
      select: { attemptCount: true },
    });
    const attempts = current?.attemptCount ?? 1;
    const dead =
      !retryable || attempts >= UberWebhookInboxPrismaAdapter.MAX_ATTEMPTS;
    const summary = redactUberLogText(
      error instanceof Error ? error.message : String(error),
    ).slice(0, 500);
<<<<<<< HEAD
    const result = await this.prisma.uberWebhookInbox.updateMany({
=======
    await this.access.uberWebhookInboxRepository.updateMany({
>>>>>>> origin/main
      where: {
        eventId: item.eventId,
        status: 'PROCESSING',
        leaseToken: item.leaseToken,
      },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        errorSummary: summary || 'unknown error',
<<<<<<< HEAD
        structuredError: {
          message: summary,
          retryable,
          ...(error instanceof UberApplicationError
            ? { code: error.code, operation: error.operation }
            : {}),
        },
=======
        structuredError: { message: summary, retryable },
>>>>>>> origin/main
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
<<<<<<< HEAD
    return result.count === 1;
=======
>>>>>>> origin/main
  }
  async setStoreProvisioned(
    storeId: string,
    isProvisioned: boolean,
  ): Promise<boolean> {
<<<<<<< HEAD
    const result = await this.prisma.uberStoreMapping.updateMany({
=======
    const result = await this.access.uberStoreMappingRepository.updateMany({
>>>>>>> origin/main
      where: { uberStoreId: storeId },
      data: { isProvisioned, provisionedAt: isProvisioned ? new Date() : null },
    });
    return result.count > 0;
  }
}
