import { PrismaPaymentWebhookEventRepository } from './prisma-payment-webhook-event.repository';

const notification = {
  eventId: 'clover-event-1',
  provider: 'CLOVER' as const,
  merchantId: 'merchant-1',
  providerPaymentId: 'provider-payment-1',
  operation: 'UPDATE' as const,
  occurredAt: new Date('2026-09-13T16:00:00.000Z'),
};

describe('PrismaPaymentWebhookEventRepository', () => {
  it('freezes the provider occurrence time and exact refunded base delta for reverse-sync evidence', async () => {
    const create = jest.fn().mockResolvedValue({});
    const repository = new PrismaPaymentWebhookEventRepository({
      opsEvent: { create },
    } as never);

    await expect(
      repository.markCompleted({
        notification,
        processingResult: 'APPLIED',
        externalReversal: 'PARTIAL_REFUND',
        previousRefundedAmountCents: 200,
        refundedAmountCents: 700,
        attemptId: 'sale-attempt-1',
        paymentSource: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        currency: 'CAD',
        externalPaymentId: 'external-payment-1',
        failureCode: null,
        failureMessage: null,
      }),
    ).resolves.toBe(true);

    expect(create).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'payment-webhook:clover-event-1',
        eventName: 'payment.reverse-sync.completed',
        source: 'payments.provider-webhook',
        occurredAt: notification.occurredAt,
        payload: expect.objectContaining({
          providerEventId: 'clover-event-1',
          externalReversal: 'PARTIAL_REFUND',
          previousRefundedAmountCents: 200,
          refundedAmountCents: 700,
          refundedDeltaCents: 500,
          attemptId: 'sale-attempt-1',
          paymentSource: 'POS_TERMINAL',
          paymentMethod: 'CARD',
          currency: 'CAD',
        }),
      },
    });
  });

  it('fails closed rather than completing a reversal event with non-monotonic refund evidence', async () => {
    const repository = new PrismaPaymentWebhookEventRepository({
      opsEvent: { create: jest.fn() },
    } as never);

    await expect(
      repository.markCompleted({
        notification,
        processingResult: 'APPLIED',
        externalReversal: 'PARTIAL_REFUND',
        previousRefundedAmountCents: 700,
        refundedAmountCents: 200,
        attemptId: 'sale-attempt-1',
        paymentSource: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        currency: 'CAD',
      }),
    ).rejects.toThrow(
      'Payment reversal webhook completion requires monotonic refunded amount evidence',
    );
  });
});
