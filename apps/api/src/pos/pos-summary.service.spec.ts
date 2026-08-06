import { Channel, FulfillmentType, PaymentMethod } from '@prisma/client';
import { PosSummaryService } from './pos-summary.service';

describe('PosSummaryService financial amendments', () => {
  const order = {
    id: 'order-db-id',
    orderStableId: 'order_1',
    clientRequestId: 'ubereats:ue_1',
    paidAt: new Date('2026-08-05T12:00:00.000Z'),
    channel: Channel.ubereats,
    fulfillmentType: FulfillmentType.pickup,
    status: 'refunded',
    subtotalCents: 1000,
    subtotalAfterDiscountCents: 1000,
    totalCents: 1130,
    taxCents: 130,
    deliveryFeeCents: 0,
    deliveryCostCents: 0,
    loyaltyRedeemCents: 0,
    couponDiscountCents: 0,
    paymentMethod: PaymentMethod.UBEREATS,
  };

  function setup(refundCents: number, additionalChargeCents = 0) {
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([order]) },
      orderAmendment: {
        groupBy: jest.fn().mockResolvedValue([
          {
            orderId: order.id,
            _sum: { refundCents, additionalChargeCents },
          },
        ]),
      },
    };
    return new PosSummaryService(prisma as never);
  }

  it('默认小结将 Uber 全额取消计入退款并冲减净额', async () => {
    const result = await setup(1130).summary({
      timeMin: '2026-08-05T00:00:00.000Z',
      timeMax: '2026-08-06T00:00:00.000Z',
    });
    expect(result.totals.refundCents).toBe(1130);
    expect(result.totals.netCents).toBe(0);
    expect(result.orders).toHaveLength(1);
  });

  it('部分退款及补收使用 原净额 - 退款 + 补收', async () => {
    const result = await setup(300, 50).summary({
      timeMin: '2026-08-05T00:00:00.000Z',
      timeMax: '2026-08-06T00:00:00.000Z',
    });
    expect(result.orders[0].netCents).toBe(880);
  });
});
