///Users/apple/sanqinMVP/apps/api/src/clover/checkout-intents.service.ts
import { Injectable } from '@nestjs/common';
import { CheckoutIntent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HostedCheckoutMetadata } from './hco-metadata';

export type CheckoutIntentWithMetadata = CheckoutIntent & {
  metadata: HostedCheckoutMetadata;
};

type CheckoutIntentRecord = CheckoutIntent & {
  metadataJson: Prisma.JsonValue;
};

const PENDING_TTL_MINUTES = 20;

@Injectable()
export class CheckoutIntentsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildPendingExpiryDate(from = Date.now()): Date {
    return new Date(from + PENDING_TTL_MINUTES * 60 * 1000);
  }

  private isPendingExpired(record: CheckoutIntentRecord): boolean {
    return (
      record.status === 'pending' &&
      record.orderId === null &&
      !!record.expiresAt &&
      record.expiresAt.getTime() < Date.now()
    );
  }

  async recordIntent(params: {
    referenceId: string;
    checkoutSessionId?: string | null;
    amountCents: number;
    currency: string;
    locale?: string;
    metadata: HostedCheckoutMetadata;
  }): Promise<CheckoutIntentWithMetadata> {
    const expiresAt = this.buildPendingExpiryDate();
    const data = {
      referenceId: params.referenceId,
      checkoutSessionId: params.checkoutSessionId ?? null,
      amountCents: params.amountCents,
      currency: params.currency,
      locale: params.locale ?? null,
      status: 'pending' as const,
      result: null as string | null,
      orderId: null as string | null,
      processedAt: null as Date | null,
      expiresAt,
      metadataJson: params.metadata as Prisma.InputJsonValue,
    } satisfies Prisma.CheckoutIntentCreateInput;

    let record: CheckoutIntentRecord;

    if (params.checkoutSessionId) {
      record = (await this.prisma.checkoutIntent.upsert({
        where: { checkoutSessionId: params.checkoutSessionId },
        update: data,
        create: data,
      })) as CheckoutIntentRecord;
    } else {
      record = (await this.prisma.checkoutIntent.create({
        data,
      })) as CheckoutIntentRecord;
    }

    return this.mapRecord(record);
  }

  async findByIdentifiers(params: {
    checkoutSessionId?: string | null;
    referenceId?: string | null;
  }): Promise<CheckoutIntentWithMetadata | null> {
    const { checkoutSessionId, referenceId } = params;
    let record: CheckoutIntentRecord | null = null;

    if (checkoutSessionId) {
      record = (await this.prisma.checkoutIntent.findUnique({
        where: { checkoutSessionId },
      })) as CheckoutIntentRecord | null;
    }

    if (!record && referenceId) {
      record = (await this.prisma.checkoutIntent.findFirst({
        where: { referenceId },
        orderBy: { createdAt: 'desc' },
      })) as CheckoutIntentRecord | null;
    }

    if (!record) {
      return null;
    }

    if (this.isPendingExpired(record)) {
      await this.markExpired(record.id);
      const refreshed = (await this.prisma.checkoutIntent.findUnique({
        where: { id: record.id },
      })) as CheckoutIntentRecord | null;
      if (!refreshed) {
        return null;
      }
      return this.mapRecord(refreshed);
    }

    return this.mapRecord(record);
  }

  async markProcessed(params: {
    intentId: string;
    orderId: string;
    status?: string;
    result?: string;
  }): Promise<void> {
    await this.prisma.checkoutIntent.update({
      where: { id: params.intentId },
      data: {
        orderId: params.orderId,
        status: params.status ?? 'completed',
        result: params.result ?? 'SUCCESS',
        processedAt: new Date(),
      },
    });
  }

  async claimProcessing(intentId: string): Promise<boolean> {
    const claimed = await this.prisma.checkoutIntent.updateMany({
      where: {
        id: intentId,
        status: 'pending',
        orderId: null,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      data: {
        status: 'processing',
      },
    });

    return claimed.count > 0;
  }

  async markCompleted(params: {
    intentId: string;
    orderId: string;
    result?: string;
  }): Promise<void> {
    await this.prisma.checkoutIntent.updateMany({
      where: {
        id: params.intentId,
        status: { in: ['processing', 'creating_order'] },
      },
      data: {
        orderId: params.orderId,
        status: 'completed',
        result: params.result ?? 'SUCCESS',
        processedAt: new Date(),
      },
    });
  }

  async markFailed(params: {
    intentId: string;
    result?: string;
  }): Promise<void> {
    await this.prisma.checkoutIntent.updateMany({
      where: {
        id: params.intentId,
        status: { in: ['pending', 'processing', 'creating_order'] },
        orderId: null,
      },
      data: {
        status: 'failed',
        result: params.result ?? 'FAILED',
        processedAt: new Date(),
      },
    });
  }

  async markExpired(intentId: string): Promise<void> {
    await this.prisma.checkoutIntent.updateMany({
      where: {
        id: intentId,
        status: 'pending',
        orderId: null,
      },
      data: {
        status: 'expired',
        result: 'EXPIRED',
        processedAt: new Date(),
      },
    });
  }

  async resetForRetry(intentId: string): Promise<void> {
    await this.prisma.checkoutIntent.updateMany({
      where: {
        id: intentId,
        status: { in: ['failed', 'expired'] },
        orderId: null,
      },
      data: {
        status: 'pending',
        result: null,
        processedAt: null,
        expiresAt: this.buildPendingExpiryDate(),
      },
    });
  }

  async claimOrderCreation(intentId: string): Promise<boolean> {
    const claimed = await this.prisma.checkoutIntent.updateMany({
      where: {
        id: intentId,
        status: 'processing',
        orderId: null,
      },
      data: {
        status: 'creating_order',
      },
    });

    return claimed.count > 0;
  }

  async updateMetadata(
    intentId: string,
    metadata: HostedCheckoutMetadata & Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.checkoutIntent.update({
      where: { id: intentId },
      data: {
        metadataJson: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private mapRecord(record: CheckoutIntentRecord): CheckoutIntentWithMetadata {
    const metadata = record.metadataJson as HostedCheckoutMetadata;
    return { ...record, metadata } satisfies CheckoutIntentWithMetadata;
  }
}
