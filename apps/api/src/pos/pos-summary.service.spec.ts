import type { PosOrderFinancialSummaryRecord } from '../orders/public-api';
import { PosSummaryService } from './pos-summary.service';

const order = (
  overrides: Partial<PosOrderFinancialSummaryRecord> = {},
): PosOrderFinancialSummaryRecord => ({
  orderStableId: 'order_1',
  clientRequestId: 'ubereats:ue_1',
  paidAt: new Date('2026-08-05T12:00:00.000Z'),
  channel: 'ubereats',
  fulfillmentType: 'pickup',
  status: 'refunded',
  subtotalCents: 1000,
  subtotalAfterDiscountCents: 1000,
  totalCents: 1130,
  taxCents: 130,
  deliveryFeeCents: 0,
  deliveryCostCents: 0,
  paymentMethod: 'UBEREATS',
  refundCents: 0,
  additionalChargeCents: 0,
  ...overrides,
});

describe('PosSummaryService financial amendments', () => {
  function setup(refundCents: number, additionalChargeCents = 0) {
    const orderRead = {
      listFinancialSummaryOrders: jest.fn().mockResolvedValue([
        order({
          refundCents,
          additionalChargeCents,
        }),
      ]),
    };
    return {
      service: new PosSummaryService(orderRead as never),
      orderRead,
    };
  }

  it('默认小结将 Uber 全额取消计入退款并冲减净额', async () => {
    const result = await setup(1130).service.summary({
      storeStableId: '4750_Yonge_Street',
      timeMin: '2026-08-05T00:00:00.000Z',
      timeMax: '2026-08-06T00:00:00.000Z',
    });
    expect(result.totals.refundCents).toBe(1130);
    expect(result.totals.netCents).toBe(0);
    expect(result.orders).toHaveLength(1);
  });

  it('部分退款及补收使用 原净额 - 退款 + 补收', async () => {
    const result = await setup(300, 50).service.summary({
      storeStableId: '4750_Yonge_Street',
      timeMin: '2026-08-05T00:00:00.000Z',
      timeMax: '2026-08-06T00:00:00.000Z',
    });
    expect(result.orders[0].netCents).toBe(880);
  });

  it('只通过 Orders public read boundary 查询认证 POS 门店的订单', async () => {
    const orderRead = {
      listFinancialSummaryOrders: jest.fn().mockResolvedValue([]),
    };
    const service = new PosSummaryService(orderRead as never);

    await service.summary({
      storeStableId: '4750_Yonge_Street',
      timeMin: '2026-08-05T00:00:00.000Z',
      timeMax: '2026-08-06T00:00:00.000Z',
    });

    expect(orderRead.listFinancialSummaryOrders).toHaveBeenCalledWith({
      storeStableId: '4750_Yonge_Street',
      paidFrom: new Date('2026-08-05T00:00:00.000Z'),
      paidToExclusive: new Date('2026-08-06T00:00:00.000Z'),
    });
  });
});
