import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, UberMenuPublishStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuPublicationAttempt,
  UberMenuPublicationLease,
  UberMenuPublicationRepositoryPort,
} from '../../application/menu/uber-menu-publication.ports';

type PublicationRow = Prisma.UberMenuPublishVersionGetPayload<object>;

function responseId(payload: Prisma.JsonValue | null, key: string) {
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object')
    return null;
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

@Injectable()
export class UberMenuPublicationPrismaAdapter implements UberMenuPublicationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async findLastSucceededPayload(storeId: string) {
    const row = await this.prisma.uberMenuPublishVersion.findFirst({
      where: { storeId, status: UberMenuPublishStatus.SUCCEEDED },
      orderBy: { createdAt: 'desc' },
      select: { payload: true },
    });
    return row?.payload as unknown as
      | import('../../domain/menu/uber-menu.types').UberMenuUploadPayload
      | null;
  }

  async listIntentionalPriceRestores(storeId: string) {
    const lastPublished = await this.prisma.uberMenuPublishVersion.findFirst({
      where: { storeId, status: UberMenuPublishStatus.SUCCEEDED },
      orderBy: { createdAt: 'desc' },
      select: { finishedAt: true, createdAt: true },
    });
    const events = await this.prisma.opsEvent.findMany({
      where: {
        eventName: 'ubereats_menu_price_restored',
        source: 'ubereats',
        ...(lastPublished
          ? {
              createdAt: {
                gt: lastPublished.finishedAt ?? lastPublished.createdAt,
              },
            }
          : {}),
      },
      select: { payload: true },
    });
    return new Set(
      events.flatMap((event) => {
        const payload = event.payload as {
          posStoreId?: unknown;
          menuItemStableId?: unknown;
        } | null;
        return payload?.posStoreId === storeId &&
          typeof payload.menuItemStableId === 'string'
          ? [payload.menuItemStableId]
          : [];
      }),
    );
  }

  async recordCriticalRiskAcknowledgement(input: {
    storeId: string;
    payloadHash: string;
    criticalCount: number;
  }) {
    await this.prisma.opsEvent.upsert({
      where: {
        idempotencyKey: `uber:publish-risk:${input.storeId}:${input.payloadHash}`,
      },
      create: {
        idempotencyKey: `uber:publish-risk:${input.storeId}:${input.payloadHash}`,
        eventName: 'ubereats_menu_publish_risk_acknowledged',
        source: 'ubereats',
        payload: {
          posStoreId: input.storeId,
          criticalCount: input.criticalCount,
        },
      },
      update: {},
    });
  }
  async markPublishVersionSucceeded(
    attemptId: string,
    responsePayload: Record<string, unknown>,
  ) {
    await this.prisma.uberMenuPublishVersion.update({
      where: { id: attemptId },
      data: {
        status: UberMenuPublishStatus.SUCCEEDED,
        responsePayload: responsePayload as Prisma.InputJsonValue,
        errorMessage: null,
        errorDetails: undefined,
        finishedAt: new Date(),
      },
    });
  }
  async markPublishVersionFailed(
    attemptId: string,
    errorMessage: string,
    errors: Array<Record<string, unknown>> = [],
  ) {
    await this.prisma.uberMenuPublishVersion.update({
      where: { id: attemptId },
      data: {
        status: UberMenuPublishStatus.FAILED,
        errorMessage,
        errorDetails: errors as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  }
  private dto(row: PublicationRow): UberMenuPublicationAttempt {
    return {
      attemptId: row.id,
      storeId: row.storeId,
      idempotencyKey: row.idempotencyKey || '',
      businessVersion: row.businessVersion,
      status: row.status,
      uberRequestId: responseId(row.responsePayload, 'request_id'),
      uberResourceId:
        responseId(row.responsePayload, 'resource_id') ??
        responseId(row.responsePayload, 'id'),
    };
  }
  async findSucceededAttempt(idempotencyKey: string) {
    const row = await this.prisma.uberMenuPublishVersion.findFirst({
      where: { idempotencyKey, status: UberMenuPublishStatus.SUCCEEDED },
    });
    return row ? this.dto(row) : null;
  }
  async createAttempt(
    input: Parameters<UberMenuPublicationRepositoryPort['createAttempt']>[0],
  ) {
    const row = await this.prisma.uberMenuPublishVersion.create({
      data: {
        id: randomUUID(),
        versionStableId: randomUUID(),
        storeId: input.storeId,
        uberStoreId: input.uberStoreId,
        idempotencyKey: input.idempotencyKey,
        businessVersion: input.businessVersion,
        status: UberMenuPublishStatus.SUBMITTED,
        totalItems: input.totalItems,
        changedItems: input.totalItems,
        requestPayload: input.payload as Prisma.InputJsonValue,
        payload: input.payload as Prisma.InputJsonValue,
        checksum: input.payloadHash,
      },
    });
    return this.dto(row);
  }
  async markSubmitted(
    attemptId: string,
    input: { uberRequestId: string | null; uberResourceId: string | null },
  ) {
    const result = await this.prisma.uberMenuPublishVersion.updateMany({
      where: { id: attemptId, status: UberMenuPublishStatus.SUBMITTED },
      data: {
        responsePayload: {
          request_id: input.uberRequestId,
          resource_id: input.uberResourceId,
        },
        errorMessage: null,
      },
    });
    return result.count === 1;
  }
  async markFailed(
    attemptId: string,
    input: { errorCode: string; errorMessage: string; retryable: boolean },
  ) {
    const result = await this.prisma.uberMenuPublishVersion.updateMany({
      where: { id: attemptId },
      data: {
        status: UberMenuPublishStatus.FAILED,
        errorMessage: input.errorMessage,
        errorDetails: input,
        finishedAt: new Date(),
      },
    });
    return result.count === 1;
  }
  async claimDueConfirmations(
    limit: number,
    lease: { owner: string; durationMs: number; now: Date },
  ) {
    return this.claim(limit, lease, {
      status: UberMenuPublishStatus.SUBMITTED,
      responsePayload: { not: Prisma.DbNull },
      AND: [
        {
          OR: [
            { nextConfirmationAt: null },
            { nextConfirmationAt: { lte: lease.now } },
          ],
        },
        {
          OR: [
            { confirmationLeaseExpiresAt: null },
            { confirmationLeaseExpiresAt: { lte: lease.now } },
          ],
        },
      ],
    });
  }
  async markConfirmed(
    attemptId: string,
    leaseToken: string,
    input: {
      status: 'SUCCEEDED' | 'FAILED';
      uberRequestId: string | null;
      uberResourceId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
    },
  ) {
    const result = await this.prisma.uberMenuPublishVersion.updateMany({
      where: {
        id: attemptId,
        status: UberMenuPublishStatus.SUBMITTED,
        confirmationLeaseToken: leaseToken,
        confirmationLeaseExpiresAt: { gt: new Date() },
      } as never,
      data: {
        status: input.status,
        responsePayload: {
          request_id: input.uberRequestId,
          resource_id: input.uberResourceId,
        },
        errorMessage: input.errorMessage,
        errorDetails: input.errorCode ? { code: input.errorCode } : undefined,
        finishedAt: new Date(),
        confirmationLeaseToken: null,
        confirmationLeaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }

  async rescheduleConfirmation(
    attemptId: string,
    leaseToken: string,
    nextConfirmationAt: Date,
  ) {
    const result = await this.prisma.uberMenuPublishVersion.updateMany({
      where: {
        id: attemptId,
        status: UberMenuPublishStatus.SUBMITTED,
        confirmationLeaseToken: leaseToken,
        confirmationLeaseExpiresAt: { gt: new Date() },
      } as never,
      data: {
        nextConfirmationAt,
        confirmationLeaseToken: null,
        confirmationLeaseExpiresAt: null,
      } as never,
    });
    return result.count === 1;
  }

  async claimTimedOutConfirmations(
    cutoff: Date,
    limit: number,
    lease: { owner: string; durationMs: number; now: Date },
  ) {
    return this.claim(limit, lease, {
      status: UberMenuPublishStatus.SUBMITTED,
      startedAt: { lt: cutoff },
      OR: [
        { confirmationLeaseExpiresAt: null },
        { confirmationLeaseExpiresAt: { lte: lease.now } },
      ],
    });
  }

  async markConfirmationTimedOut(attemptId: string, leaseToken: string) {
    return this.markConfirmed(attemptId, leaseToken, {
      status: 'FAILED',
      uberRequestId: null,
      uberResourceId: null,
      errorCode: 'CONFIRMATION_TIMEOUT',
      errorMessage: '菜单发布确认超时；需要人工检查 Uber 后台状态后重试',
    });
  }

  private async claim(
    limit: number,
    lease: { owner: string; durationMs: number; now: Date },
    where: Record<string, unknown>,
  ) {
    const claimed: UberMenuPublicationLease[] = [];
    const expiresAt = new Date(lease.now.getTime() + lease.durationMs);
    await this.prisma.$transaction(async (tx) => {
      const candidates = await tx.uberMenuPublishVersion.findMany({
        where: where as never,
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      for (const row of candidates) {
        const leaseToken = `${lease.owner}:${randomUUID()}`;
        const result = await tx.uberMenuPublishVersion.updateMany({
          where: {
            id: row.id,
            status: UberMenuPublishStatus.SUBMITTED,
            OR: [
              { confirmationLeaseExpiresAt: null },
              { confirmationLeaseExpiresAt: { lte: lease.now } },
            ],
          } as never,
          data: {
            confirmationLeaseToken: leaseToken,
            confirmationLeaseExpiresAt: expiresAt,
          } as never,
        });
        if (result.count === 1) claimed.push({ ...this.dto(row), leaseToken });
      }
    });
    return claimed;
  }
}
