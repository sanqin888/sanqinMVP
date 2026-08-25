import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, UberMenuPublishStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuPublicationAttempt,
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
    const publishedAt = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.uberMenuPublishVersion.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (existing.status !== UberMenuPublishStatus.FAILED) return existing;
        return tx.uberMenuPublishVersion.update({
          where: { id: existing.id },
          data: {
            status: UberMenuPublishStatus.SUBMITTED,
            requestPayload: input.payload as Prisma.InputJsonValue,
            payload: input.payload as Prisma.InputJsonValue,
            totalItems: input.totalItems,
            changedItems: input.totalItems,
            checksum: input.payloadHash,
            responsePayload: Prisma.DbNull,
            errorMessage: null,
            errorDetails: Prisma.DbNull,
            startedAt: publishedAt,
            finishedAt: null,
          },
        });
      }
      const created = await tx.uberMenuPublishVersion.create({
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
      if (input.publishedItems.length)
        await tx.uberPublishedMenuItem.createMany({
          data: input.publishedItems.map((item) => ({
            publishVersionId: created.id,
            storeId: input.storeId,
            uberStoreId: input.uberStoreId,
            uberItemId: item.uberItemId,
            menuItemStableId: item.menuItemStableId,
            publishedPriceCents: item.publishedPriceCents,
            publishedIsAvailable: item.publishedIsAvailable,
            publishedName: item.publishedName,
            publishedAt,
          })),
        });
      return created;
    });
    return this.dto(row);
  }
  async markFailed(
    attemptId: string,
    input: Parameters<UberMenuPublicationRepositoryPort['markFailed']>[1],
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
}
