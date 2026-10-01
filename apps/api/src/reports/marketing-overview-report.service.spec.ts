import { MarketingOverviewReportService } from './marketing-overview-report.service';

describe('MarketingOverviewReportService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-30T20:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('projects active campaigns into Store-local Today/7d/30d/90d metrics with evidence', async () => {
    const campaigns = {
      readCampaigns: jest.fn().mockResolvedValue([
        {
          activityStableId: 'daily-monday',
          kind: 'DAILY_SPECIAL',
          scope: 'STORE',
          storeStableId: 'store-1',
          titleZh: '周一特价',
          titleEn: 'Monday Special',
          subtype: 'OVERRIDE_PRICE',
          lifecycleStatus: 'ACTIVE',
          validFrom: null,
          validTo: new Date('2026-09-30T00:00:00.000Z'),
          weekdays: [1],
          startMinutes: 660,
          endMinutes: 900,
        },
        {
          activityStableId: 'auto-bogo',
          kind: 'PROMOTION_RULE',
          scope: 'BRAND',
          storeStableId: null,
          titleZh: '买一送一',
          titleEn: 'BOGO',
          subtype: 'BUY_X_GET_Y',
          lifecycleStatus: 'ACTIVE',
          validFrom: new Date('2026-09-01T04:00:00.000Z'),
          validTo: null,
          weekdays: [],
          startMinutes: null,
          endMinutes: null,
        },
        {
          activityStableId: 'loyalty-2x',
          kind: 'PROMOTION_RULE',
          scope: 'BRAND',
          storeStableId: null,
          titleZh: '双倍积分',
          titleEn: '2x Points',
          subtype: 'LOYALTY_MULTIPLIER',
          lifecycleStatus: 'ACTIVE',
          validFrom: null,
          validTo: null,
          weekdays: [],
          startMinutes: null,
          endMinutes: null,
        },
        {
          activityStableId: 'welcome-program',
          kind: 'COUPON_PROGRAM',
          scope: 'BRAND',
          storeStableId: null,
          titleZh: '新人礼包',
          titleEn: 'Welcome Bundle',
          subtype: 'AUTOMATIC_TRIGGER',
          lifecycleStatus: 'ACTIVE',
          validFrom: null,
          validTo: null,
          weekdays: [],
          startMinutes: null,
          endMinutes: null,
        },
        {
          activityStableId: 'active-zero',
          kind: 'PROMOTION_RULE',
          scope: 'BRAND',
          storeStableId: null,
          titleZh: '零使用活动',
          titleEn: 'Zero-use campaign',
          subtype: 'PERCENTAGE_OFF',
          lifecycleStatus: 'ACTIVE',
          validFrom: null,
          validTo: null,
          weekdays: [],
          startMinutes: null,
          endMinutes: null,
        },
        {
          activityStableId: 'paused-rule',
          kind: 'PROMOTION_RULE',
          scope: 'BRAND',
          storeStableId: null,
          titleZh: '暂停',
          titleEn: null,
          subtype: 'PERCENTAGE_OFF',
          lifecycleStatus: 'PAUSED',
          validFrom: null,
          validTo: null,
          weekdays: [],
          startMinutes: null,
          endMinutes: null,
        },
        {
          activityStableId: 'future-rule',
          kind: 'PROMOTION_RULE',
          scope: 'BRAND',
          storeStableId: null,
          titleZh: '未来',
          titleEn: null,
          subtype: 'PERCENTAGE_OFF',
          lifecycleStatus: 'ACTIVE',
          validFrom: new Date('2026-10-01T04:00:00.000Z'),
          validTo: null,
          weekdays: [],
          startMinutes: null,
          endMinutes: null,
        },
      ]),
      readCouponProgramAttributions: jest.fn().mockResolvedValue([
        {
          couponStableId: 'coupon-a',
          programStableId: 'welcome-program',
        },
        {
          couponStableId: 'coupon-b',
          programStableId: 'welcome-program',
        },
      ]),
    };
    const usage = {
      readUsageFactsForRange: jest.fn().mockResolvedValue([
        {
          orderStableId: 'order-daily-now',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-30T15:00:00.000Z'),
          activityStableId: 'daily-monday',
          source: 'DAILY_SPECIAL',
          affectedItemQuantity: 2,
          affectedItemQuantityEvidence: 'COMPLETE',
          discountCents: 200,
          discountEvidence: 'COMPLETE',
          associatedSalesCents: 1000,
          associatedSalesEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
        {
          orderStableId: 'order-daily-legacy',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-08-01T16:00:00.000Z'),
          activityStableId: 'daily-monday',
          source: 'DAILY_SPECIAL',
          affectedItemQuantity: 1,
          affectedItemQuantityEvidence: 'COMPLETE',
          discountCents: null,
          discountEvidence: 'UNAVAILABLE',
          associatedSalesCents: 800,
          associatedSalesEvidence: 'LEGACY_CURRENT_ORDER',
        },
        {
          orderStableId: 'order-auto-now',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-30T16:00:00.000Z'),
          activityStableId: 'auto-bogo',
          source: 'AUTOMATIC_PROMOTION',
          affectedItemQuantity: 2,
          affectedItemQuantityEvidence: 'COMPLETE',
          discountCents: 500,
          discountEvidence: 'COMPLETE',
          associatedSalesCents: 2000,
          associatedSalesEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
        {
          orderStableId: 'order-auto-old',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-20T16:00:00.000Z'),
          activityStableId: 'auto-bogo',
          source: 'AUTOMATIC_PROMOTION',
          affectedItemQuantity: 1,
          affectedItemQuantityEvidence: 'COMPLETE',
          discountCents: 250,
          discountEvidence: 'COMPLETE',
          associatedSalesCents: 1000,
          associatedSalesEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
        {
          orderStableId: 'order-coupon',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-30T17:00:00.000Z'),
          activityStableId: 'coupon-a',
          source: 'COUPON',
          affectedItemQuantity: 1,
          affectedItemQuantityEvidence: 'COMPLETE',
          discountCents: 200,
          discountEvidence: 'COMPLETE',
          associatedSalesCents: 1500,
          associatedSalesEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
        {
          orderStableId: 'order-coupon',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-30T17:00:00.000Z'),
          activityStableId: 'coupon-b',
          source: 'COUPON',
          affectedItemQuantity: 2,
          affectedItemQuantityEvidence: 'COMPLETE',
          discountCents: 300,
          discountEvidence: 'COMPLETE',
          associatedSalesCents: 1500,
          associatedSalesEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
        {
          orderStableId: 'order-unmapped',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-30T18:00:00.000Z'),
          activityStableId: 'coupon-unmapped',
          source: 'COUPON',
          affectedItemQuantity: 1,
          affectedItemQuantityEvidence: 'COMPLETE',
          discountCents: 100,
          discountEvidence: 'COMPLETE',
          associatedSalesCents: 900,
          associatedSalesEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
        {
          orderStableId: 'order-loyalty',
          storeStableId: 'store-1',
          occurredAt: new Date('2026-09-30T19:00:00.000Z'),
          activityStableId: 'loyalty-2x',
          source: 'LOYALTY_PROMOTION',
          affectedItemQuantity: null,
          affectedItemQuantityEvidence: 'NOT_APPLICABLE',
          discountCents: 0,
          discountEvidence: 'COMPLETE',
          associatedSalesCents: 1200,
          associatedSalesEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
      ]),
    };
    const storeContext = {
      getStoreOperatingContext: jest.fn().mockResolvedValue({
        storeStableId: 'store-1',
        timezone: 'America/Toronto',
        isActive: true,
        historyCoverage: 'CURRENT_CONFIGURATION_ONLY',
        businessHours: [],
        holidays: [],
        currentStatus: {
          isOpenBySchedule: true,
          isTemporarilyClosed: false,
          today: { date: '2026-09-30', closeMinutes: 1260 },
        },
      }),
    };

    const service = new MarketingOverviewReportService(
      campaigns as never,
      usage as never,
      storeContext as never,
    );
    const report = await service.getReport('store-1');

    expect(usage.readUsageFactsForRange).toHaveBeenCalledWith({
      storeStableId: 'store-1',
      fromInclusive: new Date('2026-07-03T04:00:00.000Z'),
      toExclusive: new Date('2026-09-30T20:30:00.000Z'),
    });
    expect(report.windows).toEqual({
      today: {
        fromInclusive: '2026-09-30T04:00:00.000Z',
        toExclusive: '2026-09-30T20:30:00.000Z',
      },
      last7Days: {
        fromInclusive: '2026-09-24T04:00:00.000Z',
        toExclusive: '2026-09-30T20:30:00.000Z',
      },
      last30Days: {
        fromInclusive: '2026-09-01T04:00:00.000Z',
        toExclusive: '2026-09-30T20:30:00.000Z',
      },
      last90Days: {
        fromInclusive: '2026-07-03T04:00:00.000Z',
        toExclusive: '2026-09-30T20:30:00.000Z',
      },
    });
    expect(
      report.activities.map((activity) => activity.activityStableId),
    ).toEqual(
      expect.arrayContaining([
        'daily-monday',
        'auto-bogo',
        'loyalty-2x',
        'welcome-program',
        'active-zero',
      ]),
    );
    expect(
      report.activities.map((activity) => activity.activityStableId),
    ).not.toEqual(expect.arrayContaining(['paused-rule', 'future-rule']));

    const daily = report.activities.find(
      (activity) => activity.activityStableId === 'daily-monday',
    )!;
    expect(daily.metrics.today.uses).toBe(1);
    expect(daily.metrics.last90Days).toEqual(
      expect.objectContaining({
        uses: 2,
        affectedItemQuantity: {
          value: 3,
          coverage: 'COMPLETE',
          coveredUses: 2,
          totalUses: 2,
        },
        discountCents: {
          value: 200,
          coverage: 'PARTIAL',
          coveredUses: 1,
          totalUses: 2,
        },
        associatedSalesCents: 1800,
        associatedSalesEvidence: 'INCLUDES_LEGACY_CURRENT_ORDER',
      }),
    );

    const automatic = report.activities.find(
      (activity) => activity.activityStableId === 'auto-bogo',
    )!;
    expect(automatic.metrics.last7Days.uses).toBe(1);
    expect(automatic.metrics.last30Days.uses).toBe(2);
    expect(automatic.metrics.last30Days.associatedSalesCents).toBe(3000);

    const coupon = report.activities.find(
      (activity) => activity.activityStableId === 'welcome-program',
    )!;
    expect(coupon.metrics.today.uses).toBe(1);
    expect(coupon.metrics.today.affectedItemQuantity.value).toBe(3);
    expect(coupon.metrics.today.discountCents.value).toBe(500);
    expect(coupon.metrics.today.associatedSalesCents).toBe(1500);

    const loyalty = report.activities.find(
      (activity) => activity.activityStableId === 'loyalty-2x',
    )!;
    expect(loyalty.metrics.today.affectedItemQuantity.coverage).toBe(
      'NOT_APPLICABLE',
    );
    expect(loyalty.metrics.today.discountCents.coverage).toBe('NOT_APPLICABLE');
    expect(loyalty.metrics.today.associatedSalesCents).toBe(1200);

    const zeroUse = report.activities.find(
      (activity) => activity.activityStableId === 'active-zero',
    )!;
    expect(zeroUse.metrics.today).toEqual(
      expect.objectContaining({
        uses: 0,
        affectedItemQuantity: {
          value: 0,
          coverage: 'COMPLETE',
          coveredUses: 0,
          totalUses: 0,
        },
        discountCents: {
          value: 0,
          coverage: 'COMPLETE',
          coveredUses: 0,
          totalUses: 0,
        },
        associatedSalesCents: 0,
      }),
    );

    expect(zeroUse.metrics.today.associatedSalesEvidence).toBe('NO_USAGE');
    expect(report.coverage.unattributedCouponUsesInLast90Days).toBe(1);
  });

  it('reads far enough back for trailing windows when a new quarter starts', async () => {
    jest.setSystemTime(new Date('2026-10-01T20:30:00.000Z'));

    const campaigns = {
      readCampaigns: jest.fn().mockResolvedValue([]),
      readCouponProgramAttributions: jest.fn().mockResolvedValue([]),
    };
    const usage = {
      readUsageFactsForRange: jest.fn().mockResolvedValue([]),
    };
    const storeContext = {
      getStoreOperatingContext: jest.fn().mockResolvedValue({
        storeStableId: 'store-1',
        timezone: 'America/Toronto',
        isActive: true,
        historyCoverage: 'CURRENT_CONFIGURATION_ONLY',
        businessHours: [],
        holidays: [],
        currentStatus: {
          isOpenBySchedule: true,
          isTemporarilyClosed: false,
          today: { date: '2026-10-01', closeMinutes: 1260 },
        },
      }),
    };

    const service = new MarketingOverviewReportService(
      campaigns as never,
      usage as never,
      storeContext as never,
    );
    const report = await service.getReport('store-1');

    expect(usage.readUsageFactsForRange).toHaveBeenCalledWith({
      storeStableId: 'store-1',
      fromInclusive: new Date('2026-07-04T04:00:00.000Z'),
      toExclusive: new Date('2026-10-01T20:30:00.000Z'),
    });
    expect(report.windows.last30Days.fromInclusive).toBe(
      '2026-09-02T04:00:00.000Z',
    );
    expect(report.windows.last90Days.fromInclusive).toBe(
      '2026-07-04T04:00:00.000Z',
    );
  });

  it('rejects a missing Store context', async () => {
    const service = new MarketingOverviewReportService(
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getReport('  ')).rejects.toThrow(
      'storeStableId is required',
    );
  });
});
