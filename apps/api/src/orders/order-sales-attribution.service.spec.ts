import { Channel, PaymentMethod } from '@prisma/client';

import {
  buildOrderFinancialAdjustmentFact,
  serializeOrderFinancialChangeFactV1,
} from './order-financial-change-fact';
import { OrderSalesAttributionReaderService } from './order-sales-attribution.service';

const immutablePayload = (orderStableId = 'order_immutable_1') => ({
  version: 1,
  factStableId: orderStableId,
  orderStableId,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-09-22T14:00:00.000Z',
  sourceUpdatedAt: '2026-09-22T14:00:01.000Z',
  sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
  channel: 'web',
  paymentMethod: 'CARD',
  posCardExecutionEvidence: null,
  itemQuantity: 1,
  currency: 'CAD',
  pricingEvidence: 'COMPLETE',
  nominalSubtotalCents: 1000,
  effectiveSubtotalCents: 1000,
  discounts: {
    dailySpecialCents: 0,
    couponCents: 0,
    automaticPromotionCents: 0,
    posManualCents: 0,
    pointsRedemptionCents: 0,
    unattributedLegacyCents: 0,
    totalCents: 0,
  },
  subtotalAfterDiscountCents: 1000,
  taxCents: 130,
  deliveryRevenueCents: 0,
  cardSurchargeCents: 24,
  orderTotalCents: 1130,
  paymentTotalCents: 1154,
});

const changeFact = buildOrderFinancialAdjustmentFact({
  factStableId: 'change_1',
  occurredAt: new Date('2026-09-22T15:00:00.000Z'),
  action: 'RETENDER',
  before: {
    orderStableId: 'order_for_change',
    storeId: '4750_Yonge_Street',
    channel: Channel.in_store,
    paymentMethod: PaymentMethod.CARD,
    subtotalCents: 1000,
    subtotalAfterDiscountCents: 1000,
    taxCents: 130,
    deliveryFeeCents: 0,
    creditCardSurchargeCents: 24,
    totalCents: 1130,
    paymentTotalCents: 1154,
    items: [{ qty: 1, isDailySpecialApplied: false }],
  },
  after: {
    orderStableId: 'order_for_change',
    storeId: '4750_Yonge_Street',
    channel: Channel.in_store,
    paymentMethod: PaymentMethod.CASH,
    subtotalCents: 1000,
    subtotalAfterDiscountCents: 1000,
    taxCents: 130,
    deliveryFeeCents: 0,
    creditCardSurchargeCents: 0,
    totalCents: 1130,
    paymentTotalCents: 1130,
    items: [{ qty: 1, isDailySpecialApplied: false }],
  },
  declaredPaymentMethod: PaymentMethod.CASH,
  refundGrossCents: 1154,
  redeemReturnCents: 0,
  additionalChargeCents: 1130,
});
const persistedChange = serializeOrderFinancialChangeFactV1(changeFact);

describe('OrderSalesAttributionReaderService', () => {
  it('returns immutable descriptive attribution without exposing monetary fields', async () => {
    const findManyEvents = jest
      .fn()
      .mockResolvedValueOnce([{ payload: immutablePayload() }]);
    const findManyOrders = jest.fn();
    const service = new OrderSalesAttributionReaderService({
      opsEvent: { findMany: findManyEvents },
      order: { findMany: findManyOrders },
    } as never);

    await expect(
      service.readBySourceFactStableIds([' order_immutable_1 ']),
    ).resolves.toEqual([
      {
        version: 1,
        sourceFactStableId: 'order_immutable_1',
        orderStableId: 'order_immutable_1',
        storeStableId: '4750_Yonge_Street',
        occurredAt: new Date('2026-09-22T14:00:00.000Z'),
        channel: 'web',
        primaryPaymentMethod: 'CARD',
        sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        primaryPaymentMethodEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
      },
    ]);

    expect(findManyEvents).toHaveBeenCalledWith({
      where: {
        source: 'orders.financial',
        eventName: 'order.financial_sale.v1',
        idempotencyKey: {
          in: ['order-financial-sale:order_immutable_1:v1'],
        },
      },
      select: { payload: true },
    });
    expect(findManyOrders).not.toHaveBeenCalled();
  });

  it('falls back to current Order dimensions only when immutable SALE evidence is absent', async () => {
    const findManyEvents = jest
      .fn()
      .mockResolvedValueOnce([
        { payload: immutablePayload('order_immutable_1') },
      ])
      .mockResolvedValueOnce([]);
    const findManyOrders = jest.fn().mockResolvedValue([
      {
        orderStableId: 'order_legacy_1',
        storeId: '4750_Yonge_Street',
        paidAt: new Date('2026-07-10T16:00:00.000Z'),
        channel: Channel.in_store,
        paymentMethod: PaymentMethod.WECHAT_ALIPAY,
      },
    ]);
    const service = new OrderSalesAttributionReaderService({
      opsEvent: { findMany: findManyEvents },
      order: { findMany: findManyOrders },
    } as never);

    await expect(
      service.readBySourceFactStableIds([
        ' order_legacy_1 ',
        'order_immutable_1',
        'order_legacy_1',
        '',
        'missing_order',
      ]),
    ).resolves.toEqual([
      {
        version: 1,
        sourceFactStableId: 'order_legacy_1',
        orderStableId: 'order_legacy_1',
        storeStableId: '4750_Yonge_Street',
        occurredAt: new Date('2026-07-10T16:00:00.000Z'),
        channel: 'in_store',
        primaryPaymentMethod: 'WECHAT_ALIPAY',
        sourceEvidence: 'LEGACY_CURRENT_ORDER',
        primaryPaymentMethodEvidence: 'LEGACY_CURRENT_ORDER',
      },
      {
        version: 1,
        sourceFactStableId: 'order_immutable_1',
        orderStableId: 'order_immutable_1',
        storeStableId: '4750_Yonge_Street',
        occurredAt: new Date('2026-09-22T14:00:00.000Z'),
        channel: 'web',
        primaryPaymentMethod: 'CARD',
        sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        primaryPaymentMethodEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
      },
    ]);

    expect(findManyOrders).toHaveBeenCalledWith({
      where: {
        orderStableId: {
          in: ['order_legacy_1', 'missing_order'],
        },
      },
      select: {
        orderStableId: true,
        storeId: true,
        paidAt: true,
        channel: true,
        paymentMethod: true,
      },
    });
  });

  it('attributes immutable change facts to the original SALE primary payment method', async () => {
    const findManyEvents = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload: persistedChange }])
      .mockResolvedValueOnce([
        {
          payload: {
            ...immutablePayload('order_for_change'),
            channel: 'in_store',
            paymentMethod: 'CARD',
            cardSurchargeCents: 24,
          },
        },
      ]);
    const findManyOrders = jest.fn();
    const service = new OrderSalesAttributionReaderService({
      opsEvent: { findMany: findManyEvents },
      order: { findMany: findManyOrders },
    } as never);

    await expect(
      service.readBySourceFactStableIds(['change_1']),
    ).resolves.toEqual([
      {
        version: 1,
        sourceFactStableId: 'change_1',
        orderStableId: 'order_for_change',
        storeStableId: '4750_Yonge_Street',
        occurredAt: new Date('2026-09-22T15:00:00.000Z'),
        channel: 'in_store',
        primaryPaymentMethod: 'CARD',
        sourceEvidence: 'IMMUTABLE_CHANGE_SNAPSHOT',
        primaryPaymentMethodEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
      },
    ]);
    expect(findManyOrders).not.toHaveBeenCalled();
  });

  it('uses explicit legacy SALE evidence for a change attribution when no immutable SALE snapshot exists', async () => {
    const findManyEvents = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload: persistedChange }])
      .mockResolvedValueOnce([]);
    const findManyOrders = jest.fn().mockResolvedValueOnce([
      {
        orderStableId: 'order_for_change',
        storeId: '4750_Yonge_Street',
        paidAt: new Date('2026-07-10T16:00:00.000Z'),
        channel: Channel.in_store,
        paymentMethod: PaymentMethod.CARD,
      },
    ]);
    const service = new OrderSalesAttributionReaderService({
      opsEvent: { findMany: findManyEvents },
      order: { findMany: findManyOrders },
    } as never);

    await expect(
      service.readBySourceFactStableIds(['change_1']),
    ).resolves.toEqual([
      expect.objectContaining({
        sourceFactStableId: 'change_1',
        orderStableId: 'order_for_change',
        sourceEvidence: 'IMMUTABLE_CHANGE_SNAPSHOT',
        primaryPaymentMethod: 'CARD',
        primaryPaymentMethodEvidence: 'LEGACY_CURRENT_ORDER',
      }),
    ]);
  });

  it('does not reinterpret change before/after tender state when the original SALE attribution is missing', async () => {
    const findManyEvents = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload: persistedChange }])
      .mockResolvedValueOnce([]);
    const findManyOrders = jest.fn().mockResolvedValueOnce([]);
    const service = new OrderSalesAttributionReaderService({
      opsEvent: { findMany: findManyEvents },
      order: { findMany: findManyOrders },
    } as never);

    await expect(
      service.readBySourceFactStableIds(['change_1']),
    ).resolves.toEqual([]);
    expect(findManyOrders).toHaveBeenCalledTimes(1);
  });

  it('fails closed instead of replacing malformed immutable SALE evidence with a mutable Order row', async () => {
    const findManyOrders = jest.fn();
    const service = new OrderSalesAttributionReaderService({
      opsEvent: {
        findMany: jest.fn().mockResolvedValue([{ payload: { version: 1 } }]),
      },
      order: { findMany: findManyOrders },
    } as never);

    await expect(
      service.readBySourceFactStableIds(['order_bad_fact']),
    ).rejects.toThrow(
      'Malformed immutable Order financial fact for attribution',
    );
    expect(findManyOrders).not.toHaveBeenCalled();
  });

  it('fails closed when immutable SALE fact and Order identities diverge', async () => {
    const service = new OrderSalesAttributionReaderService({
      opsEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            payload: {
              ...immutablePayload('fact_identity'),
              orderStableId: 'different_order_identity',
            },
          },
        ]),
      },
      order: { findMany: jest.fn() },
    } as never);

    await expect(
      service.readBySourceFactStableIds(['fact_identity']),
    ).rejects.toThrow(
      'Immutable Order sales attribution fact/order identity mismatch: fact_identity',
    );
  });

  it('fails closed when an immutable SALE event does not match the requested source identity', async () => {
    const service = new OrderSalesAttributionReaderService({
      opsEvent: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ payload: immutablePayload('other_order') }]),
      },
      order: { findMany: jest.fn() },
    } as never);

    await expect(
      service.readBySourceFactStableIds(['requested_order']),
    ).rejects.toThrow(
      'Immutable Order sales attribution identity mismatch: other_order',
    );
  });

  it('fails closed on malformed immutable change evidence', async () => {
    const service = new OrderSalesAttributionReaderService({
      opsEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ payload: { version: 1 } }]),
      },
      order: { findMany: jest.fn() },
    } as never);

    await expect(
      service.readBySourceFactStableIds(['change_bad']),
    ).rejects.toThrow(
      'Malformed immutable Order financial change fact for attribution',
    );
  });

  it('returns no rows and does not query persistence for an empty identity set', async () => {
    const findManyEvents = jest.fn();
    const findManyOrders = jest.fn();
    const service = new OrderSalesAttributionReaderService({
      opsEvent: { findMany: findManyEvents },
      order: { findMany: findManyOrders },
    } as never);

    await expect(service.readBySourceFactStableIds([' ', ''])).resolves.toEqual(
      [],
    );
    expect(findManyEvents).not.toHaveBeenCalled();
    expect(findManyOrders).not.toHaveBeenCalled();
  });
});
