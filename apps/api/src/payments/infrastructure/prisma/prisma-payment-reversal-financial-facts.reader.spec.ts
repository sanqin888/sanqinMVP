import {
  PaymentOperation,
  PaymentProvider,
  PaymentSource,
  PaymentTransactionMethod,
  PaymentTransactionStatus,
} from '@prisma/client';

import { PrismaPaymentTransactionRepository } from './prisma-payment-transaction.repository';

const saleRow = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  attemptId: 'sale-attempt-1',
  provider: PaymentProvider.CLOVER,
  source: PaymentSource.POS_TERMINAL,
  paymentMethod: PaymentTransactionMethod.CARD,
  operation: PaymentOperation.SALE,
  amountCents: 1000,
  surchargeCents: 24,
  chargedTotalCents: 1024,
  refundedAmountCents: 0,
  currency: 'CAD',
  status: PaymentTransactionStatus.SUCCEEDED,
  externalPaymentId: 'external-payment-1',
  providerPaymentId: 'provider-payment-1',
  providerRefundId: null,
  completedAt: new Date('2026-09-13T14:00:00.000Z'),
  updatedAt: new Date('2026-09-13T14:00:01.000Z'),
  ...overrides,
});

const refundRow = (overrides: Record<string, unknown> = {}) => ({
  ...saleRow(),
  id: '22222222-2222-4222-8222-222222222222',
  attemptId: 'refund-attempt-1',
  operation: PaymentOperation.REFUND,
  amountCents: 1000,
  refundedAmountCents: 1000,
  chargedTotalCents: 1024,
  providerRefundId: 'provider-refund-1',
  completedAt: new Date('2026-09-13T15:00:00.000Z'),
  updatedAt: new Date('2026-09-13T15:00:01.000Z'),
  ...overrides,
});

const checkoutIdentity = {
  paymentTransactionId: saleRow().id,
  orderStableId: 'order-stable-1',
  storeId: '4750_Yonge_Street',
};

const webhookPayload = (overrides: Record<string, unknown> = {}) => ({
  providerEventId: 'clover-event-1',
  provider: 'CLOVER',
  providerPaymentId: 'provider-payment-1',
  processingResult: 'APPLIED',
  externalReversal: 'FULL_REFUND',
  previousRefundedAmountCents: 0,
  refundedAmountCents: 1000,
  refundedDeltaCents: 1000,
  attemptId: 'sale-attempt-1',
  paymentSource: 'POS_TERMINAL',
  paymentMethod: 'CARD',
  currency: 'CAD',
  externalPaymentId: 'external-payment-1',
  ...overrides,
});

describe('PrismaPaymentTransactionRepository reversal financial facts', () => {
  it('publishes a managed refund with original stable identity and exact provider refund totals', async () => {
    const service = new PrismaPaymentTransactionRepository({
      paymentTransaction: {
        findFirst: jest.fn().mockResolvedValue(refundRow()),
        findMany: jest.fn().mockResolvedValue([saleRow()]),
      },
      paymentCheckoutAttempt: {
        findMany: jest.fn().mockResolvedValue([checkoutIdentity]),
      },
    } as never);

    await expect(
      service.readReversalFactByStableId(
        'payment-reversal:managed:refund-attempt-1:v1',
      ),
    ).resolves.toEqual({
      version: 1,
      factStableId: 'payment-reversal:managed:refund-attempt-1:v1',
      originalSaleAttemptId: 'sale-attempt-1',
      reversalAttemptId: 'refund-attempt-1',
      providerEventId: null,
      orderStableId: 'order-stable-1',
      storeStableId: '4750_Yonge_Street',
      occurredAt: new Date('2026-09-13T15:00:00.000Z'),
      evidence: 'MANAGED_TRANSACTION',
      provider: 'CLOVER',
      originalPaymentSource: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      kind: 'FULL_REFUND',
      originalSaleBaseAmountCents: 1000,
      originalSaleCustomerTotalCents: 1024,
      baseRefundCents: 1000,
      additionalChargeRefundCents: 24,
      customerRefundTotalCents: 1024,
      currency: 'CAD',
      externalPaymentId: 'external-payment-1',
      providerPaymentId: 'provider-payment-1',
      providerRefundId: 'provider-refund-1',
    });
  });

  it('publishes only the provider-webhook base-refund delta and leaves unproven surcharge refund totals null', async () => {
    const eventOccurredAt = new Date('2026-09-13T16:00:00.000Z');
    const paymentFindUnique = jest.fn().mockResolvedValue(saleRow());
    const paymentFindFirst = jest.fn().mockResolvedValue(null);
    const service = new PrismaPaymentTransactionRepository({
      paymentTransaction: {
        findUnique: paymentFindUnique,
        findFirst: paymentFindFirst,
      },
      paymentCheckoutAttempt: {
        findMany: jest.fn().mockResolvedValue([checkoutIdentity]),
      },
      opsEvent: {
        findUnique: jest.fn().mockResolvedValue({
          source: 'payments.provider-webhook',
          eventName: 'payment.reverse-sync.completed',
          occurredAt: eventOccurredAt,
          payload: webhookPayload({
            previousRefundedAmountCents: 400,
            refundedAmountCents: 1000,
            refundedDeltaCents: 600,
          }),
        }),
      },
    } as never);

    await expect(
      service.readReversalFactByStableId(
        'payment-reversal:webhook:clover-event-1:v1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        factStableId: 'payment-reversal:webhook:clover-event-1:v1',
        evidence: 'PROVIDER_WEBHOOK',
        kind: 'PARTIAL_REFUND',
        baseRefundCents: 600,
        additionalChargeRefundCents: null,
        customerRefundTotalCents: null,
        occurredAt: eventOccurredAt,
        orderStableId: 'order-stable-1',
        storeStableId: '4750_Yonge_Street',
        providerRefundId: null,
      }),
    );
  });

  it('does not publish a zero-delta webhook as a second reversal money fact', async () => {
    const service = new PrismaPaymentTransactionRepository({
      opsEvent: {
        findUnique: jest.fn().mockResolvedValue({
          source: 'payments.provider-webhook',
          eventName: 'payment.reverse-sync.completed',
          occurredAt: new Date('2026-09-13T16:00:00.000Z'),
          payload: webhookPayload({
            previousRefundedAmountCents: 1000,
            refundedAmountCents: 1000,
            refundedDeltaCents: 0,
          }),
        }),
      },
    } as never);

    await expect(
      service.readReversalFactByStableId(
        'payment-reversal:webhook:clover-event-1:v1',
      ),
    ).resolves.toBeNull();
  });

  it('suppresses provider-webhook reversal evidence when a succeeded managed reversal already owns the same provider payment', async () => {
    const service = new PrismaPaymentTransactionRepository({
      paymentTransaction: {
        findUnique: jest.fn().mockResolvedValue(saleRow()),
        findFirst: jest.fn().mockResolvedValue({ id: refundRow().id }),
      },
      opsEvent: {
        findUnique: jest.fn().mockResolvedValue({
          source: 'payments.provider-webhook',
          eventName: 'payment.reverse-sync.completed',
          occurredAt: new Date('2026-09-13T16:00:00.000Z'),
          payload: webhookPayload(),
        }),
      },
    } as never);

    await expect(
      service.readReversalFactByStableId(
        'payment-reversal:webhook:clover-event-1:v1',
      ),
    ).resolves.toBeNull();
  });
});
