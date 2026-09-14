import { Channel, PaymentMethod } from '@prisma/client';

import {
  buildOrderFinancialAdjustmentFact,
  serializeOrderFinancialChangeFactV1,
} from './order-financial-change-fact';
import { OrderFinancialChangeFactsReaderService } from './order-financial-change-facts-reader.service';

const fact = buildOrderFinancialAdjustmentFact({
  factStableId: 'amendment-stable-1',
  occurredAt: new Date('2026-09-13T20:00:00.000Z'),
  action: 'SWAP_ITEM',
  before: {
    orderStableId: 'order-stable-1',
    storeId: '4750_Yonge_Street',
    channel: Channel.in_store,
    paymentMethod: PaymentMethod.CARD,
    subtotalCents: 1_000,
    subtotalAfterDiscountCents: 1_000,
    taxCents: 130,
    deliveryFeeCents: 0,
    creditCardSurchargeCents: 0,
    totalCents: 1_130,
    paymentTotalCents: 1_130,
    items: [{ qty: 1, isDailySpecialApplied: false }],
  },
  after: {
    orderStableId: 'order-stable-1',
    storeId: '4750_Yonge_Street',
    channel: Channel.in_store,
    paymentMethod: PaymentMethod.CARD,
    subtotalCents: 1_350,
    subtotalAfterDiscountCents: 1_350,
    taxCents: 176,
    deliveryFeeCents: 0,
    creditCardSurchargeCents: 0,
    totalCents: 1_526,
    paymentTotalCents: 1_526,
    items: [{ qty: 1, isDailySpecialApplied: false }],
  },
  declaredPaymentMethod: PaymentMethod.CARD,
  refundGrossCents: 0,
  redeemReturnCents: 0,
  additionalChargeCents: 396,
});

const persisted = serializeOrderFinancialChangeFactV1(fact);

describe('OrderFinancialChangeFactsReaderService', () => {
  it('reads one immutable fact by stable fact identity', async () => {
    const findFirst = jest.fn().mockResolvedValue({ payload: persisted });
    const service = new OrderFinancialChangeFactsReaderService({
      opsEvent: { findFirst },
    } as never);

    await expect(
      service.readFactByStableId('amendment-stable-1'),
    ).resolves.toEqual(fact);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        source: 'orders.financial',
        eventName: {
          in: ['order.financial_adjustment.v1', 'order.financial_reversal.v1'],
        },
        payload: { path: ['factStableId'], equals: 'amendment-stable-1' },
      },
      select: { payload: true },
    });
  });

  it('supports store-scoped occurrence-time range reads without exposing Order persistence', async () => {
    const findMany = jest.fn().mockResolvedValue([{ payload: persisted }]);
    const service = new OrderFinancialChangeFactsReaderService({
      opsEvent: { findMany },
    } as never);
    const fromInclusive = new Date('2026-09-13T04:00:00.000Z');
    const toExclusive = new Date('2026-09-14T04:00:00.000Z');

    await expect(
      service.readFactsForRange({
        fromInclusive,
        toExclusive,
        storeStableId: '4750_Yonge_Street',
      }),
    ).resolves.toEqual([fact]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        source: 'orders.financial',
        eventName: {
          in: ['order.financial_adjustment.v1', 'order.financial_reversal.v1'],
        },
        occurredAt: { gte: fromInclusive, lt: toExclusive },
        payload: { path: ['storeStableId'], equals: '4750_Yonge_Street' },
      },
      select: { payload: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('batch reads immutable change facts by stable Order identity without a temporal window', async () => {
    const findMany = jest.fn().mockResolvedValue([{ payload: persisted }]);
    const service = new OrderFinancialChangeFactsReaderService({
      opsEvent: { findMany },
    } as never);

    await expect(
      service.readFactsByOrderStableIds([
        ' order-stable-1 ',
        'order-stable-1',
      ]),
    ).resolves.toEqual([fact]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        source: 'orders.financial',
        eventName: {
          in: ['order.financial_adjustment.v1', 'order.financial_reversal.v1'],
        },
        OR: [
          {
            payload: { path: ['orderStableId'], equals: 'order-stable-1' },
          },
        ],
      },
      select: { payload: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('fails closed when persisted change evidence is malformed', async () => {
    const service = new OrderFinancialChangeFactsReaderService({
      opsEvent: {
        findMany: jest.fn().mockResolvedValue([{ payload: { version: 1 } }]),
      },
    } as never);

    await expect(
      service.readFactsByOrderStableId('order-stable-1'),
    ).rejects.toThrow('Malformed immutable Order financial change fact');
  });
});
