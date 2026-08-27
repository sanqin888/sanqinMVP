import { Injectable } from '@nestjs/common';

import type {
  CompletePaymentWebhookEventInput,
  PaymentWebhookEventRepository,
} from '../../application/payment-webhook-event.repository';
import { PrismaService } from '../../../prisma/prisma.service';

const EVENT_SOURCE = 'payments.provider-webhook';
const EVENT_NAME = 'payment.reverse-sync.completed';
const idempotencyKey = (eventId: string) => `payment-webhook:${eventId}`;

const isUniqueConflict = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
  );

@Injectable()
export class PrismaPaymentWebhookEventRepository implements PaymentWebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isCompleted(eventId: string): Promise<boolean> {
    const existing = await this.prisma.opsEvent.findUnique({
      where: { idempotencyKey: idempotencyKey(eventId) },
      select: { id: true },
    });
    return Boolean(existing);
  }

  async markCompleted(
    input: CompletePaymentWebhookEventInput,
  ): Promise<boolean> {
    try {
      await this.prisma.opsEvent.create({
        data: {
          idempotencyKey: idempotencyKey(input.notification.eventId),
          eventName: EVENT_NAME,
          source: EVENT_SOURCE,
          occurredAt: input.notification.occurredAt,
          payload: {
            provider: input.notification.provider,
            merchantId: input.notification.merchantId,
            providerPaymentId: input.notification.providerPaymentId,
            operation: input.notification.operation,
            processingResult: input.processingResult,
            attemptId: input.attemptId ?? null,
            externalPaymentId: input.externalPaymentId ?? null,
            refundedAmountCents: input.refundedAmountCents ?? null,
            failureCode: input.failureCode ?? null,
            failureMessage: input.failureMessage ?? null,
          },
        },
      });
      return true;
    } catch (error) {
      if (isUniqueConflict(error)) return false;
      throw error;
    }
  }
}
