import {
  PaymentOperation,
  PaymentProvider,
  PaymentSource,
  PaymentTransactionMethod,
  PaymentTransactionStatus,
} from '@prisma/client';

import { PrismaPaymentFinancialFactsReader } from './prisma-payment-financial-facts.reader';

const paymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  attemptId: 'payment-attempt-1',
  provider: PaymentProvider.CLOVER,
  source: PaymentSource.POS_TERMINAL,
  paymentMethod: PaymentTransactionMethod.CARD,
  operation: PaymentOperation.SALE,
  amountCents: 1500,
  surchargeCents: 36,
  chargedTotalCents: 1536,
  refundedAmountCents: 0,
  currency: 'CAD',
  externalPaymentId: 'external-payment-1',
  providerPaymentId: 'provider-payment-1',
  providerRefundId: null,
  completedAt: new Date('2026-09-12T14:00:00.000Z'),
  updatedAt: new Date('2026-09-12T14:01:00.000Z'),
  ...overrides,
});

describe('PrismaPaymentFinancialFactsReader', () => {
  it('exposes only stable/business payment identity and final succeeded money truth', async () => {
    const transactionFindFirst = jest.fn().mockResolvedValue(paymentRow());
    const checkoutFindUnique = jest.fn().mockResolvedValue({
      orderStableId: 'order-stable-1',
      storeId: '4750_Yonge_Street',
    });
    const service = new PrismaPaymentFinancialFactsReader({
      paymentTransaction: { findFirst: transactionFindFirst },
      paymentCheckoutAttempt: { findUnique: checkoutFindUnique },
    } as never);

    await expect(
      service.readFactByAttemptId(' payment-attempt-1 '),
    ).resolves.toEqual({
      version: 1,
      factStableId: 'payment-attempt-1',
      attemptId: 'payment-attempt-1',
      orderStableId: 'order-stable-1',
      storeStableId: '4750_Yonge_Street',
      occurredAt: new Date('2026-09-12T14:00:00.000Z'),
      sourceUpdatedAt: new Date('2026-09-12T14:01:00.000Z'),
      provider: 'CLOVER',
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      operation: 'SALE',
      amountCents: 1500,
      surchargeCents: 36,
      chargedTotalCents: 1536,
      refundedAmountCents: 0,
      currency: 'CAD',
      externalPaymentId: 'external-payment-1',
      providerPaymentId: 'provider-payment-1',
      providerRefundId: null,
    });

    expect(transactionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          attemptId: 'payment-attempt-1',
          status: PaymentTransactionStatus.SUCCEEDED,
          completedAt: { not: null },
        },
      }),
    );
    expect(checkoutFindUnique).toHaveBeenCalledWith({
      where: { paymentTransactionId: paymentRow().id },
      select: { orderStableId: true, storeId: true },
    });
  });

  it('uses completedAt for inclusive/exclusive replay and can restrict the reader to a stable Store identity without joining Orders', async () => {
    const checkoutFindMany = jest
      .fn()
      .mockResolvedValueOnce([
        { paymentTransactionId: paymentRow().id },
      ])
      .mockResolvedValueOnce([
        {
          paymentTransactionId: paymentRow().id,
          orderStableId: 'order-stable-1',
          storeId: '4750_Yonge_Street',
        },
      ]);
    const transactionFindMany = jest.fn().mockResolvedValue([paymentRow()]);
    const service = new PrismaPaymentFinancialFactsReader({
      paymentTransaction: { findMany: transactionFindMany },
      paymentCheckoutAttempt: { findMany: checkoutFindMany },
    } as never);
    const fromInclusive = new Date('2026-09-12T04:00:00.000Z');
    const toExclusive = new Date('2026-09-13T04:00:00.000Z');

    await expect(
      service.readFactsForRange({
        fromInclusive,
        toExclusive,
        storeStableId: ' 4750_Yonge_Street ',
      }),
    ).resolves.toHaveLength(1);

    expect(transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: PaymentTransactionStatus.SUCCEEDED,
          completedAt: {
            not: null,
            gte: fromInclusive,
            lt: toExclusive,
          },
          id: { in: [paymentRow().id] },
        },
      }),
    );
  });

  it('does not publish a non-final transaction as a canonical money fact', async () => {
    const service = new PrismaPaymentFinancialFactsReader({
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(
      service.readFactByAttemptId('payment-attempt-pending'),
    ).resolves.toBeNull();
  });
});
