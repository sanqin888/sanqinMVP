import type { ReportingOrderFactsQueryPort } from './reporting-order-facts-query.contract';
import { ReportsService } from './reports.service';

describe('ReportsService KPI and business-day characterization', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('follows process.env.TZ for report-day boundaries before any later StoreConfig normalization', async () => {
    process.env.TZ = 'America/Vancouver';
    const readMetricsForRange = jest
      .fn<ReportingOrderFactsQueryPort['readMetricsForRange']>()
      .mockResolvedValue({
        totalCents: 0,
        subtotalCents: 0,
        taxCents: 0,
        deliveryFeeCents: 0,
        orderCount: 0,
        payment: [],
        fulfillment: [],
        timeline: [],
      });
    const readItemsForRange = jest
      .fn<ReportingOrderFactsQueryPort['readItemsForRange']>()
      .mockResolvedValue([]);
    const orderFacts: ReportingOrderFactsQueryPort = {
      readMetricsForRange,
      readItemsForRange,
    };
    const service = new ReportsService(orderFacts);

    await service.getReport({ from: '2026-09-02', to: '2026-09-02' });

    expect(readMetricsForRange).toHaveBeenCalledWith(
      new Date('2026-09-02T07:00:00.000Z'),
      new Date('2026-09-03T06:59:59.999Z'),
    );
    expect(readItemsForRange).toHaveBeenCalledWith(
      new Date('2026-09-02T07:00:00.000Z'),
      new Date('2026-09-03T06:59:59.999Z'),
    );
  });

  it('uses the configured process timezone and preserves current Order total KPI semantics', async () => {
    process.env.TZ = 'America/Toronto';
    const readMetricsForRange = jest
      .fn<ReportingOrderFactsQueryPort['readMetricsForRange']>()
      .mockResolvedValue({
        totalCents: 2653,
        subtotalCents: 2300,
        taxCents: 299,
        deliveryFeeCents: 54,
        orderCount: 2,
        payment: [
          { name: 'CASH', totalCents: 2146 },
          { name: 'CARD', totalCents: 507 },
        ],
        fulfillment: [{ name: 'DINE_IN', totalCents: 2653 }],
        timeline: [
          {
            createdAt: new Date('2026-09-02T04:30:00.000Z'),
            totalCents: 2146,
          },
          {
            createdAt: new Date('2026-09-02T15:00:00.000Z'),
            totalCents: 507,
          },
        ],
      });
    const readItemsForRange = jest
      .fn<ReportingOrderFactsQueryPort['readItemsForRange']>()
      .mockResolvedValue([
        {
          qty: 3,
          productStableId: 'item_noodle',
          displayName: 'Noodle',
          nameEn: 'Noodle',
          nameZh: '面',
          components: [],
        },
      ]);
    const orderFacts: ReportingOrderFactsQueryPort = {
      readMetricsForRange,
      readItemsForRange,
    };
    const service = new ReportsService(orderFacts);

    const report = await service.getReport({
      from: '2026-09-02',
      to: '2026-09-02',
    });

    expect(report).toEqual({
      summary: {
        totalSales: 26.53,
        subtotal: 23,
        tax: 2.99,
        deliveryFees: 0.54,
        orderCount: 2,
        averageOrderValue: 13.27,
      },
      chartData: [
        { date: '00:00', total: 21.46 },
        { date: '11:00', total: 5.07 },
      ],
      breakdown: {
        payment: [
          { name: 'CASH', value: 21.46 },
          { name: 'CARD', value: 5.07 },
        ],
        fulfillment: [{ name: 'DINE_IN', value: 26.53 }],
      },
      topItems: [{ name: 'Noodle', quantity: 3 }],
    });

    expect(readMetricsForRange).toHaveBeenCalledWith(
      new Date('2026-09-02T04:00:00.000Z'),
      new Date('2026-09-03T03:59:59.999Z'),
    );
    expect(readItemsForRange).toHaveBeenCalledWith(
      new Date('2026-09-02T04:00:00.000Z'),
      new Date('2026-09-03T03:59:59.999Z'),
    );
  });
});
