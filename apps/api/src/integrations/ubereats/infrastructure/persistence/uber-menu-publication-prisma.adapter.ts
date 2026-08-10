import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { UberMenuPublishStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuPublicationAttempt,
  UberMenuPublicationRepositoryPort,
} from '../../application/ports/uber-menu-publication.ports';

@Injectable()
export class UberMenuPublicationPrismaAdapter implements UberMenuPublicationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  private dto(row: any): UberMenuPublicationAttempt {
    return {
      attemptId: row.id,
      storeId: row.storeId,
      idempotencyKey: row.idempotencyKey || '',
      businessVersion: row.businessVersion,
      status: row.status,
      uberRequestId: row.responsePayload?.request_id ?? null,
      uberResourceId:
        row.responsePayload?.resource_id ?? row.responsePayload?.id ?? null,
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
  async claimDueConfirmations(limit: number) {
    const rows = await this.prisma.uberMenuPublishVersion.findMany({
      where: { status: UberMenuPublishStatus.SUBMITTED },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({
      ...this.dto(row),
      leaseToken: `${row.id}:${row.createdAt.getTime()}`,
    }));
  }
  async markConfirmed(
    attemptId: string,
    _leaseToken: string,
    input: {
      status: 'SUCCEEDED' | 'FAILED';
      uberRequestId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
    },
  ) {
    const result = await this.prisma.uberMenuPublishVersion.updateMany({
      where: { id: attemptId, status: UberMenuPublishStatus.SUBMITTED },
      data: {
        status: input.status,
        responsePayload: { request_id: input.uberRequestId },
        errorMessage: input.errorMessage,
        errorDetails: input.errorCode ? { code: input.errorCode } : undefined,
        finishedAt: new Date(),
      },
    });
    return result.count === 1;
  }
}
