import { Injectable } from '@nestjs/common';

import {
  PAYMENT_PROVIDER_WEBHOOK_EVENT_SOURCE,
  PAYMENT_REVERSE_SYNC_COMPLETED_EVENT,
  paymentWebhookEventIdempotencyKey,
  type CompletePaymentWebhookEventInput,
  type PaymentWebhookEventRepository,
} from '../../application/payment-webhook-event.repository';
import { PrismaService } from '../../../prisma/prisma.service';

const isUniqueConflict = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
  );

const reversalDeltaCents = (
  input: CompletePaymentWebhookEventInput,
): number | null => {
  if (input.externalReversal === 'NONE') return null;
  const previous = input.previousRefundedAmountCents;
  const current = input.refundedAmountCents;
  if (
    previous === null ||
    previous === undefined ||
    !Number.isSafeInteger(previous) ||
    previous < 0 ||
    current === null ||
    current === undefined ||
    !Number.isSafeInteger(current) ||
    current < previous
  ) {
    throw new Error(
      'Payment reversal webhook completion requires monotonic refunded amount evidence',
    );
  }
  return current - previous;
};

@Injectable()
export class PrismaPaymentWebhookEventRepository implements PaymentWebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isCompleted(eventId: string): Promise<boolean> {
    const existing = await this.prisma.opsEvent.findUnique({
      where: { idempotencyKey: paymentWebhookEventIdempotencyKey(eventId) },
      select: { id: true },
    });
    return Boolean(existing);
  }

  async markCompleted(
    input: CompletePaymentWebhookEventInput,
  ): Promise<boolean> {
    const refundedDeltaCents = reversalDeltaCents(input);
    try {
      await this.prisma.opsEvent.create({
        data: {
          idempotencyKey: paymentWebhookEventIdempotencyKey(
            input.notification.eventId,
          ),
          eventName: PAYMENT_REVERSE_SYNC_COMPLETED_EVENT,
          source: PAYMENT_PROVIDER_WEBHOOK_EVENT_SOURCE,
          occurredAt: input.notification.occurredAt,
          payload: {
            providerEventId: input.notification.eventId,
            provider: input.notification.provider,
            merchantId: input.notification.merchantId,
            providerPaymentId: input.notification.providerPaymentId,
            operation: input.notification.operation,
            processingResult: input.processingResult,
            externalReversal: input.externalReversal,
            previousRefundedAmountCents:
              input.previousRefundedAmountCents ?? null,
            refundedAmountCents: input.refundedAmountCents ?? null,
            refundedDeltaCents,
            attemptId: input.attemptId ?? null,
            paymentSource: input.paymentSource ?? null,
            paymentMethod: input.paymentMethod ?? null,
            currency: input.currency ?? null,
            externalPaymentId: input.externalPaymentId ?? null,
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
