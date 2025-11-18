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

@Injectable()
export class CheckoutIntentsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordIntent(params: {
    referenceId: string;
    checkoutSessionId?: string | null;
    amountCents: number;
    currency: string;
    locale?: string;
    metadata: HostedCheckoutMetadata;
  }): Promise<CheckoutIntentWithMetadata> {
    const data = {
      referenceId: params.referenceId,
      checkoutSessionId: params.checkoutSessionId ?? null,
      amountCents: params.amountCents,
      currency: params.currency,
      locale: params.locale ?? null,
      status: 'pending' as const,
      result: null as string | null,
      orderId: null as string | null,
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

    return record ? this.mapRecord(record) : null;
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
      },
    });
  }

  private mapRecord(record: CheckoutIntentRecord): CheckoutIntentWithMetadata {
    const metadata = record.metadataJson as HostedCheckoutMetadata;
    return { ...record, metadata } satisfies CheckoutIntentWithMetadata;
  }
}
