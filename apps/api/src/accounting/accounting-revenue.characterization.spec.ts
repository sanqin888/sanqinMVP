import {
  AccountingSourceType,
  AccountingTxType,
  Channel,
  OrderStatus,
  PaymentMethod,
} from '@prisma/client';
import { AccountingService } from './accounting.service';

describe('AccountingService order-revenue accrual characterization', () => {
  const makeService = () => {
    const prisma = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingCategory: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'income-category-db-id',
          type: AccountingTxType.INCOME,
          isActive: true,
        }),
      },
      accountingTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new AccountingService(
      prisma as never,
      brandStoreConfigReader as never,
    );
    return { service, prisma };
  };

  it('DAILY mode keeps the current provisional totalCents sum and one day-level idempotency key', async () => {
    const { service, prisma } = makeService();
    prisma.order.findMany.mockResolvedValue([
      {
        orderStableId: 'order_1',
        totalCents: 2146,
        paidAt: new Date('2026-09-10T14:00:00.000Z'),
        channel: Channel.in_store,
        paymentMethod: PaymentMethod.CASH,
      },
      {
        orderStableId: 'order_2',
        totalCents: 507,
        paidAt: new Date('2026-09-10T15:00:00.000Z'),
        channel: Channel.in_store,
        paymentMethod: PaymentMethod.CARD,
      },
    ]);
    const createTx = jest
      .spyOn(service, 'createTx')
      .mockResolvedValue({} as never);

    await expect(
      service.autoAccrueOrderRevenue(
        {
          date: '2026-09-10',
          categoryStableId: 'income_sales',
          mode: 'DAILY',
        },
        'user_stable_1',
      ),
    ).resolves.toEqual({
      mode: 'DAILY',
      date: '2026-09-10',
      created: 1,
      skipped: 0,
      amountCents: 2653,
      orderCount: 2,
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              OrderStatus.paid,
              OrderStatus.making,
              OrderStatus.ready,
              OrderStatus.completed,
            ],
          },
        }),
        orderBy: { paidAt: 'asc' },
      }),
    );
    expect(createTx).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AccountingTxType.INCOME,
        source: AccountingSourceType.ORDER,
        amountCents: 2653,
        categoryStableId: 'income_sales',
        orderId: 'order_1',
        idempotencyKey: 'AUTO_ORDER_DAILY:2026-09-10',
        memo: '自动入账 2026-09-10（2 单）',
      }),
      'user_stable_1',
    );
  });

  it('DAILY replay skips all candidate orders when the day-level ledger entry already exists', async () => {
    const { service, prisma } = makeService();
    prisma.order.findMany.mockResolvedValue([
      {
        orderStableId: 'order_1',
        totalCents: 2146,
        paidAt: new Date('2026-09-10T14:00:00.000Z'),
        channel: Channel.in_store,
        paymentMethod: PaymentMethod.CASH,
      },
    ]);
    prisma.accountingTransaction.findUnique.mockResolvedValue({
      txStableId: 'accttx_existing',
    });
    const createTx = jest.spyOn(service, 'createTx');

    await expect(
      service.autoAccrueOrderRevenue(
        {
          date: '2026-09-10',
          categoryStableId: 'income_sales',
          mode: 'DAILY',
        },
        'user_stable_1',
      ),
    ).resolves.toEqual({
      mode: 'DAILY',
      date: '2026-09-10',
      created: 0,
      skipped: 1,
      amountCents: 0,
    });

    expect(createTx).not.toHaveBeenCalled();
  });

  it('PER_ORDER mode keeps provider classification and stable-order idempotency per order', async () => {
    const { service, prisma } = makeService();
    prisma.order.findMany.mockResolvedValue([
      {
        orderStableId: 'uber_order',
        totalCents: 1800,
        paidAt: new Date('2026-09-10T16:00:00.000Z'),
        channel: Channel.ubereats,
        paymentMethod: PaymentMethod.UBEREATS,
      },
      {
        orderStableId: 'store_order',
        totalCents: 950,
        paidAt: new Date('2026-09-10T17:00:00.000Z'),
        channel: Channel.in_store,
        paymentMethod: PaymentMethod.CARD,
      },
    ]);
    prisma.accountingTransaction.findUnique.mockResolvedValue(null);
    const createTx = jest
      .spyOn(service, 'createTx')
      .mockResolvedValue({} as never);

    await expect(
      service.autoAccrueOrderRevenue(
        {
          date: '2026-09-10',
          categoryStableId: 'income_sales',
          mode: 'PER_ORDER',
        },
        'user_stable_2',
      ),
    ).resolves.toEqual({
      mode: 'PER_ORDER',
      date: '2026-09-10',
      created: 2,
      skipped: 0,
      amountCents: 2750,
      orderCount: 2,
    });

    expect(createTx).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source: AccountingSourceType.UBER,
        amountCents: 1800,
        orderId: 'uber_order',
        idempotencyKey: 'AUTO_ORDER:uber_order',
      }),
      'user_stable_2',
    );
    expect(createTx).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: AccountingSourceType.ORDER,
        amountCents: 950,
        orderId: 'store_order',
        idempotencyKey: 'AUTO_ORDER:store_order',
      }),
      'user_stable_2',
    );
  });
});
