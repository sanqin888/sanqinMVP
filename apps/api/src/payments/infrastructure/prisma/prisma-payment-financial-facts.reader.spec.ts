import {
  PaymentOperation,
  PaymentProvider,
  PaymentSource,
  PaymentTransactionMethod,
  PaymentTransactionStatus,
} from '@prisma/client';

import { PrismaPaymentTransactionRepository } from './prisma-payment-transaction.repository';

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
  status: PaymentTransactionStatus.SUCCEEDED,
  externalPaymentId: 'external-payment-1',
  providerPaymentId: 'provider-payment-1',
  providerRefundId: null,
  completedAt: new Date('2026-09-12T14:00:00.000Z'),
  updatedAt: new Date('2026-09-12T14:01:00.000Z'),
  ...overrides,
});

const checkoutIdentity = {
  paymentTransactionId: paymentRow().id,
  orderStableId: 'order-stable-1',
  storeId: '4750_Yonge_Street',
};

describe('PrismaPaymentTransactionRepository financial facts', () => {
  it('exposes only stable/business payment identity and final succeeded money truth', async () => {
    const transactionFindFirst = jest.fn().mockResolvedValue(paymentRow());
    const checkoutFindMany = jest.fn().mockResolvedValue([checkoutIdentity]);
    const service = new PrismaPaymentTransactionRepository({
      paymentTransaction: { findFirst: transactionFindFirst },
      paymentCheckoutAttempt: { findMany: checkoutFindMany },
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
    expect(checkoutFindMany).toHaveBeenCalledWith({
      where: { paymentTransactionId: { in: [paymentRow().id] } },
      select: {
        paymentTransactionId: true,
        orderStableId: true,
        storeId: true,
      },
    });
  });

  it('uses completedAt for inclusive/exclusive replay and filters by resolved stable Store identity without joining Orders', async () => {
    const checkoutFindMany = jest.fn().mockResolvedValue([checkoutIdentity]);
    const transactionFindMany = jest.fn().mockResolvedValue([paymentRow()]);
    const service = new PrismaPaymentTransactionRepository({
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

    expect(transactionFindMany).toHaveBeenCalledWith({
      where: {
        status: PaymentTransactionStatus.SUCCEEDED,
        completedAt: {
          not: null,
          gte: fromInclusive,
          lt: toExclusive,
        },
      },
      orderBy: [{ completedAt: 'asc' }, { attemptId: 'asc' }],
    });
  });

  it('correlates a managed REFUND fact back through the original provider payment to stable Order/Store identity', async () => {
    const sale = paymentRow();
    const refund = paymentRow({
      id: '22222222-2222-4222-8222-222222222222',
      attemptId: 'refund-attempt-1',
      operation: PaymentOperation.REFUND,
      amountCents: 1500,
      refundedAmountCents: 1500,
      chargedTotalCents: 1536,
      surchargeCents: 36,
      providerRefundId: 'provider-refund-1',
      completedAt: new Date('2026-09-12T15:00:00.000Z'),
      updatedAt: new Date('2026-09-12T15:00:01.000Z'),
    });
    const transactionFindFirst = jest.fn().mockResolvedValue(refund);
    const transactionFindMany = jest.fn().mockResolvedValue([sale]);
    const checkoutFindMany = jest.fn().mockResolvedValue([checkoutIdentity]);
    const service = new PrismaPaymentTransactionRepository({
      paymentTransaction: {
        findFirst: transactionFindFirst,
        findMany: transactionFindMany,
      },
      paymentCheckoutAttempt: { findMany: checkoutFindMany },
    } as never);

    await expect(
      service.readFactByAttemptId('refund-attempt-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        attemptId: 'refund-attempt-1',
        operation: 'REFUND',
        orderStableId: 'order-stable-1',
        storeStableId: '4750_Yonge_Street',
        providerPaymentId: 'provider-payment-1',
        providerRefundId: 'provider-refund-1',
      }),
    );
  });

  it('keeps a correlated REFUND inside store-scoped range reads even though checkout is bound to the original SALE', async () => {
    const sale = paymentRow();
    const refund = paymentRow({
      id: '22222222-2222-4222-8222-222222222222',
      attemptId: 'refund-attempt-range',
      operation: PaymentOperation.REFUND,
      amountCents: 1500,
      refundedAmountCents: 1500,
      chargedTotalCents: 1536,
      providerRefundId: 'provider-refund-range',
      completedAt: new Date('2026-09-12T15:00:00.000Z'),
    });
    const transactionFindMany = jest
      .fn()
      .mockResolvedValueOnce([refund])
      .mockResolvedValueOnce([sale]);
    const service = new PrismaPaymentTransactionRepository({
      paymentTransaction: { findMany: transactionFindMany },
      paymentCheckoutAttempt: {
        findMany: jest.fn().mockResolvedValue([checkoutIdentity]),
      },
    } as never);

    await expect(
      service.readFactsForRange({
        fromInclusive: new Date('2026-09-12T04:00:00.000Z'),
        toExclusive: new Date('2026-09-13T04:00:00.000Z'),
        storeStableId: '4750_Yonge_Street',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        attemptId: 'refund-attempt-range',
        operation: 'REFUND',
        orderStableId: 'order-stable-1',
        storeStableId: '4750_Yonge_Street',
      }),
    ]);
  });

  it('reads final money facts by stable Order identity without a temporal matching window', async () => {
    const checkoutFindMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          paymentTransactionId: paymentRow().id,
          orderStableId: 'order-stable-1',
          storeId: '4750_Yonge_Street',
        },
      ])
      .mockResolvedValueOnce([checkoutIdentity]);
    const transactionFindMany = jest
      .fn()
      .mockResolvedValueOnce([paymentRow()])
      .mockResolvedValueOnce([]);
    const service = new PrismaPaymentTransactionRepository({
      paymentTransaction: { findMany: transactionFindMany },
      paymentCheckoutAttempt: { findMany: checkoutFindMany },
    } as never);

    await expect(
      service.readFactsByOrderStableIds([' order-stable-1 ', 'order-stable-1']),
    ).resolves.toEqual([
      expect.objectContaining({
        factStableId: 'payment-attempt-1',
        orderStableId: 'order-stable-1',
        storeStableId: '4750_Yonge_Street',
        operation: 'SALE',
      }),
    ]);

    expect(checkoutFindMany).toHaveBeenNthCalledWith(1, {
      where: {
        orderStableId: { in: ['order-stable-1'] },
        paymentTransactionId: { not: null },
      },
      select: { paymentTransactionId: true },
    });
    expect(transactionFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [paymentRow().id] },
          operation: PaymentOperation.SALE,
          status: PaymentTransactionStatus.SUCCEEDED,
        }) as unknown,
      }),
    );
  });

  it('does not publish a non-final transaction as a canonical money fact', async () => {
    const service = new PrismaPaymentTransactionRepository({
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(
      service.readFactByAttemptId('payment-attempt-pending'),
    ).resolves.toBeNull();
  });
});
