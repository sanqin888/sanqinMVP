import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

import { BusinessOperationsReportService } from './business-operations-report.service';
import type {
  ReportingBusinessOrderFactV1,
  ReportingBusinessOrderItemFactV1,
} from './reporting-business-order-facts-query.contract';

const ZONE = 'America/Toronto';
const STORE = '4750_Yonge_Street';

function atLocal(isoLocal: string): Date {
  return DateTime.fromISO(isoLocal, { zone: ZONE }).toJSDate();
}

function makeOrder(
  localCreatedAt: string,
  overrides: Partial<ReportingBusinessOrderFactV1> = {},
): ReportingBusinessOrderFactV1 {
  const createdAt = atLocal(localCreatedAt);
  return {
    orderStableId: `order-${localCreatedAt}`,
    storeStableId: STORE,
    status: 'completed',
    createdAt,
    paidAt: createdAt,
    makingAt: new Date(createdAt.getTime() + 5 * 60_000),
    readyAt: new Date(createdAt.getTime() + 15 * 60_000),
    totalCents: 2000,
    subtotalCents: 1770,
    taxCents: 230,
    customerDeliveryFeeCents: 0,
    channel: 'in_store',
    primaryPaymentMethod: 'CARD',
    fulfillmentType: 'dine_in',
    ...overrides,
  };
}

function makeItem(
  order: ReportingBusinessOrderFactV1,
  overrides: Partial<ReportingBusinessOrderItemFactV1> = {},
): ReportingBusinessOrderItemFactV1 {
  return {
    orderStableId: order.orderStableId,
    orderCreatedAt: order.createdAt,
    qty: 1,
    productStableId: 'combo_lunch',
    displayName: 'Lunch Combo',
    nameEn: 'Lunch Combo',
    nameZh: '午餐套餐',
    unitPriceCents: 2000,
    isDailySpecialApplied: false,
    components: [
      {
        productStableId: 'roujiamo',
        nameEn: 'Roujiamo',
        nameZh: '肉夹馍',
        quantityPerParent: 2,
      },
    ],
    ...overrides,
  };
}

function unavailableHistoryReaders() {
  return {
    storeHistory: {
      readOperatingHistoryForRange: jest.fn().mockResolvedValue(null),
    },
    catalogHistory: {
      readItemUnavailableHistoryForRange: jest.fn().mockResolvedValue(null),
    },
  };
}

function storeContext() {
  return {
    storeStableId: STORE,
    timezone: ZONE,
    isActive: true,
    historyCoverage: 'CURRENT_CONFIGURATION_ONLY' as const,
    businessHours: [
      {
        weekday: 4 as const,
        openMinutes: 480,
        closeMinutes: 1350,
        isClosed: false,
      },
    ],
    holidays: [],
    currentStatus: {
      isOpenBySchedule: true,
      isTemporarilyClosed: false,
      today: {
        date: '2026-09-24',
        closeMinutes: 1350,
      },
    },
  };
}

describe('BusinessOperationsReportService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds a Today-first same-weekday baseline, retains covered zero days, and cuts historical pace at the same local time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T18:00:00.000Z'));

    const coverageProbe = makeOrder('2026-07-02T12:00:00');
    const currentMaking = makeOrder('2026-09-24T12:00:00', {
      orderStableId: 'current-making',
      status: 'making',
      makingAt: atLocal('2026-09-24T12:05:00'),
      readyAt: null,
    });
    const currentReady = makeOrder('2026-09-24T13:00:00', {
      orderStableId: 'current-ready',
      status: 'ready',
      makingAt: atLocal('2026-09-24T12:30:00'),
      readyAt: atLocal('2026-09-24T13:00:00'),
    });
    const currentCompletedFast = makeOrder('2026-09-24T10:00:00', {
      orderStableId: 'current-completed-fast',
      makingAt: atLocal('2026-09-24T10:05:00'),
      readyAt: atLocal('2026-09-24T10:25:00'),
    });
    const currentCompletedSlow = makeOrder('2026-09-24T11:00:00', {
      orderStableId: 'current-completed-slow',
      makingAt: atLocal('2026-09-24T11:05:00'),
      readyAt: atLocal('2026-09-24T11:45:00'),
    });

    const comparatorDates = [
      '2026-09-17',
      '2026-09-10',
      '2026-09-03',
      '2026-08-27',
      '2026-08-20',
      '2026-08-13',
      '2026-08-06',
      '2026-07-30',
    ];
    const comparatorOrders: ReportingBusinessOrderFactV1[] = [];
    const comparatorItems: ReportingBusinessOrderItemFactV1[] = [];

    comparatorDates.forEach((date, index) => {
      // Keep one real zero-Order comparator day. It must stay in the 8-sample baseline.
      if (index === 3) return;

      for (let orderIndex = 0; orderIndex < 8; orderIndex += 1) {
        const hour = 6 + orderIndex;
        const order = makeOrder(
          `${date}T${String(hour).padStart(2, '0')}:00:00`,
          { orderStableId: `${date}-${orderIndex}` },
        );
        comparatorOrders.push(order);
        if (orderIndex === 0) comparatorItems.push(makeItem(order));
      }

      // This Order exists on the comparator date but is after today's 14:00 cutoff.
      // It must not inflate an intraday baseline.
      comparatorOrders.push(
        makeOrder(`${date}T20:00:00`, {
          orderStableId: `${date}-after-cutoff`,
          totalCents: 99_999,
        }),
      );
    });

    const currentItems = [
      makeItem(currentMaking),
      makeItem(currentReady, {
        productStableId: 'drink_plum',
        displayName: 'Plum Drink',
        nameEn: 'Plum Drink',
        nameZh: '酸梅汤',
        components: [],
      }),
    ];
    const allOrders = [
      coverageProbe,
      ...comparatorOrders,
      currentMaking,
      currentReady,
      currentCompletedFast,
      currentCompletedSlow,
    ];
    const allItems = [...comparatorItems, ...currentItems];

    const orderFacts = {
      readOperationalOrdersForRange: jest.fn().mockResolvedValue(allOrders),
      readOperationalItemsForRange: jest.fn().mockResolvedValue(allItems),
    };
    const operatingContext = {
      getStoreOperatingContext: jest.fn().mockResolvedValue(storeContext()),
    };
    const readItemClassifications = jest.fn(
      (query: { storeStableId: string; itemStableIds: string[] }) => {
        void query;
        return Promise.resolve([
          { itemStableId: 'combo_lunch', itemKind: 'FOOD' as const },
          { itemStableId: 'drink_plum', itemKind: 'BEVERAGE' as const },
        ]);
      },
    );
    const catalogItemClassifications = { readItemClassifications };
    const histories = unavailableHistoryReaders();
    const service = new BusinessOperationsReportService(
      orderFacts as never,
      operatingContext as never,
      catalogItemClassifications as never,
      histories.storeHistory as never,
      histories.catalogHistory as never,
    );

    const report = await service.getReport({ storeStableId: STORE });

    expect(report.range).toMatchObject({
      from: '2026-09-24',
      to: '2026-09-24',
      includesCurrentDay: true,
      currentDayElapsedMinutes: 840,
    });
    expect(report.coverage).toEqual({
      orders: 'AVAILABLE',
      baselineProbeFrom: '2026-07-02',
      firstObservedOrderInProbe: '2026-07-02',
      prepTiming: 'AVAILABLE',
      storeOperatingContext: 'CURRENT_CONFIGURATION_ONLY',
      printHealth: 'UNAVAILABLE',
    });
    expect(report.operatingHistory).toEqual({
      coverage: {
        overall: 'UNAVAILABLE',
        store: 'UNAVAILABLE',
        catalog: 'UNAVAILABLE',
      },
      storeTrackingStartedAt: null,
      catalogTrackingStartedAt: null,
      days: [
        {
          date: '2026-09-24',
          coverage: 'UNAVAILABLE',
          scheduledMinutes: null,
          temporaryClosureMinutes: null,
          temporaryClosureIntervals: [],
          operatingMinutes: null,
          unavailableItemCount: null,
          unavailableItems: [],
        },
      ],
    });
    expect(report.summary).toMatchObject({
      orderCount: 4,
      orderTotalCents: 8000,
      averageOrderTotalCents: 2000,
    });
    expect(report.comparison.comparablePeriods).toBe(8);
    expect(report.comparison.confidence).toBe('OPERATING_CONTEXT_PARTIAL');
    expect(report.comparison.expected).toMatchObject({
      orderCount: 8,
      orderTotalCents: 16_000,
      averageOrderTotalCents: 2000,
    });
    expect(report.timeline).toHaveLength(1);
    expect(report.timeline[0].comparableDays).toBe(8);
    expect(report.hourlyPace.at(-1)).toMatchObject({
      currentCumulativeOrderCount: 4,
      expectedCumulativeOrderCount: 8,
      expectedCumulativeOrderTotalCents: 16_000,
    });

    expect(
      report.decomposition.volumeEffectCents +
        report.decomposition.averageOrderEffectCents,
    ).toBe(report.decomposition.orderTotalChangeCents);

    expect(
      report.commercialItems.find(
        (item) => item.productStableId === 'combo_lunch',
      ),
    ).toMatchObject({
      currentCatalogItemKind: 'FOOD',
      quantity: 1,
      expectedQuantity: 1,
    });
    expect(
      report.commercialItems.find(
        (item) => item.productStableId === 'drink_plum',
      ),
    ).toMatchObject({
      currentCatalogItemKind: 'BEVERAGE',
      quantity: 1,
    });
    expect(
      report.productionItems.find(
        (item) => item.productStableId === 'roujiamo',
      ),
    ).toMatchObject({
      quantity: 2,
      expectedQuantity: 2,
    });

    expect(report.operations.prep).toMatchObject({
      sampleCount: 3,
      p50Minutes: 30,
      p90Minutes: 38,
      expectedP90Minutes: 10,
    });
    expect(report.operations.recentQueue).toMatchObject({
      available: true,
      windowHours: 6,
      makingCount: 1,
      readyCount: 1,
    });

    expect(report.anomalies.map((anomaly) => anomaly.metric)).toEqual(
      expect.arrayContaining(['ORDER_COUNT', 'ORDER_TOTAL', 'PREP_P90']),
    );
    expect(
      report.anomalies.find((anomaly) => anomaly.metric === 'ORDER_COUNT'),
    ).toMatchObject({
      current: 4,
      expected: 8,
      absoluteDelta: -4,
      comparableSamples: 8,
      confidence: 'OPERATING_CONTEXT_PARTIAL',
      direction: 'BELOW_EXPECTED',
    });

    expect(readItemClassifications).toHaveBeenCalledTimes(1);
    expect(readItemClassifications.mock.calls[0][0].storeStableId).toBe(STORE);
    expect(readItemClassifications.mock.calls[0][0].itemStableIds).toEqual(
      expect.arrayContaining(['combo_lunch', 'drink_plum']),
    );
    expect(orderFacts.readOperationalOrdersForRange).toHaveBeenCalledWith(
      expect.objectContaining({
        storeStableId: STORE,
        fromInclusive: atLocal('2026-07-02T00:00:00'),
        toExclusive: new Date('2026-09-24T18:00:00.000Z'),
      }),
    );
  });

  it('projects historical schedule changes, Store closures, and MenuItem unavailability inside actual operating time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T18:00:00.000Z'));
    const trackingStartedAt = atLocal('2026-09-23T00:00:00');
    const storeHistory = {
      readOperatingHistoryForRange: jest.fn().mockResolvedValue({
        storeStableId: STORE,
        trackingStartedAt,
        scheduleVersions: [
          {
            revision: 1,
            effectiveFrom: trackingStartedAt,
            timezone: ZONE,
            businessHours: [
              {
                weekday: 4,
                openMinutes: 480,
                closeMinutes: 1200,
                isClosed: false,
              },
            ],
            holidays: [],
          },
          {
            revision: 2,
            effectiveFrom: atLocal('2026-09-24T13:00:00'),
            timezone: ZONE,
            businessHours: [
              {
                weekday: 4,
                openMinutes: 600,
                closeMinutes: 1320,
                isClosed: false,
              },
            ],
            holidays: [],
          },
        ],
        temporaryClosures: [
          {
            startedAt: atLocal('2026-09-24T14:00:00'),
            endedAt: atLocal('2026-09-24T15:00:00'),
          },
        ],
      }),
    };
    const catalogHistory = {
      readItemUnavailableHistoryForRange: jest.fn().mockResolvedValue({
        storeStableId: STORE,
        trackingStartedAt,
        intervals: [
          {
            menuItemStableId: 'item-1',
            nameEnSnapshot: 'Item One',
            nameZhSnapshot: '菜品一',
            startedAt: atLocal('2026-09-24T12:00:00'),
            endedAt: atLocal('2026-09-24T16:00:00'),
          },
          {
            menuItemStableId: 'outside-hours',
            nameEnSnapshot: 'Outside Hours',
            nameZhSnapshot: null,
            startedAt: atLocal('2026-09-24T06:00:00'),
            endedAt: atLocal('2026-09-24T07:00:00'),
          },
        ],
      }),
    };
    const service = new BusinessOperationsReportService(
      {
        readOperationalOrdersForRange: jest.fn().mockResolvedValue([]),
        readOperationalItemsForRange: jest.fn().mockResolvedValue([]),
      } as never,
      {
        getStoreOperatingContext: jest.fn().mockResolvedValue(storeContext()),
      } as never,
      {
        readItemClassifications: jest.fn(),
      } as never,
      storeHistory as never,
      catalogHistory as never,
    );

    const report = await service.getReport({
      storeStableId: STORE,
      from: '2026-09-24',
      to: '2026-09-24',
    });

    expect(report.operatingHistory).toEqual({
      coverage: {
        overall: 'AVAILABLE',
        store: 'AVAILABLE',
        catalog: 'AVAILABLE',
      },
      storeTrackingStartedAt: trackingStartedAt.toISOString(),
      catalogTrackingStartedAt: trackingStartedAt.toISOString(),
      days: [
        {
          date: '2026-09-24',
          coverage: 'AVAILABLE',
          scheduledMinutes: 840,
          temporaryClosureMinutes: 60,
          temporaryClosureIntervals: [
            {
              startedAt: atLocal('2026-09-24T14:00:00').toISOString(),
              endedAt: atLocal('2026-09-24T15:00:00').toISOString(),
            },
          ],
          operatingMinutes: 780,
          unavailableItemCount: 1,
          unavailableItems: [
            {
              menuItemStableId: 'item-1',
              nameEn: 'Item One',
              nameZh: '菜品一',
              unavailableMinutes: 180,
              unavailableIntervals: [
                {
                  startedAt: atLocal('2026-09-24T12:00:00').toISOString(),
                  endedAt: atLocal('2026-09-24T14:00:00').toISOString(),
                },
                {
                  startedAt: atLocal('2026-09-24T15:00:00').toISOString(),
                  endedAt: atLocal('2026-09-24T16:00:00').toISOString(),
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('clips Today operating history at report-generation time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T18:00:00.000Z'));
    const trackingStartedAt = atLocal('2026-09-20T00:00:00');
    const service = new BusinessOperationsReportService(
      {
        readOperationalOrdersForRange: jest.fn().mockResolvedValue([]),
        readOperationalItemsForRange: jest.fn().mockResolvedValue([]),
      } as never,
      {
        getStoreOperatingContext: jest.fn().mockResolvedValue(storeContext()),
      } as never,
      {
        readItemClassifications: jest.fn(),
      } as never,
      {
        readOperatingHistoryForRange: jest.fn().mockResolvedValue({
          storeStableId: STORE,
          trackingStartedAt,
          scheduleVersions: [
            {
              revision: 1,
              effectiveFrom: trackingStartedAt,
              timezone: ZONE,
              businessHours: [
                {
                  weekday: 4,
                  openMinutes: 480,
                  closeMinutes: 1350,
                  isClosed: false,
                },
              ],
              holidays: [],
            },
          ],
          temporaryClosures: [],
        }),
      } as never,
      {
        readItemUnavailableHistoryForRange: jest.fn().mockResolvedValue({
          storeStableId: STORE,
          trackingStartedAt,
          intervals: [],
        }),
      } as never,
    );

    const report = await service.getReport({ storeStableId: STORE });

    expect(report.operatingHistory.days).toEqual([
      {
        date: '2026-09-24',
        coverage: 'AVAILABLE',
        scheduledMinutes: 360,
        temporaryClosureMinutes: 0,
        temporaryClosureIntervals: [],
        operatingMinutes: 360,
        unavailableItemCount: 0,
        unavailableItems: [],
      },
    ]);
  });

  it('applies historical Holiday override before item-unavailability intersection', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-26T18:00:00.000Z'));
    const trackingStartedAt = atLocal('2026-12-20T00:00:00');
    const service = new BusinessOperationsReportService(
      {
        readOperationalOrdersForRange: jest.fn().mockResolvedValue([]),
        readOperationalItemsForRange: jest.fn().mockResolvedValue([]),
      } as never,
      {
        getStoreOperatingContext: jest.fn().mockResolvedValue(storeContext()),
      } as never,
      {
        readItemClassifications: jest.fn(),
      } as never,
      {
        readOperatingHistoryForRange: jest.fn().mockResolvedValue({
          storeStableId: STORE,
          trackingStartedAt,
          scheduleVersions: [
            {
              revision: 1,
              effectiveFrom: trackingStartedAt,
              timezone: ZONE,
              businessHours: [
                {
                  weekday: 5,
                  openMinutes: 600,
                  closeMinutes: 1200,
                  isClosed: false,
                },
              ],
              holidays: [
                {
                  date: '2026-12-25',
                  name: 'Christmas',
                  isClosed: true,
                  openMinutes: null,
                  closeMinutes: null,
                },
              ],
            },
          ],
          temporaryClosures: [],
        }),
      } as never,
      {
        readItemUnavailableHistoryForRange: jest.fn().mockResolvedValue({
          storeStableId: STORE,
          trackingStartedAt,
          intervals: [
            {
              menuItemStableId: 'item-1',
              nameEnSnapshot: 'Item One',
              nameZhSnapshot: null,
              startedAt: atLocal('2026-12-25T10:00:00'),
              endedAt: atLocal('2026-12-25T12:00:00'),
            },
          ],
        }),
      } as never,
    );

    const report = await service.getReport({
      storeStableId: STORE,
      from: '2026-12-25',
      to: '2026-12-25',
    });

    expect(report.operatingHistory.days).toEqual([
      {
        date: '2026-12-25',
        coverage: 'AVAILABLE',
        scheduledMinutes: 0,
        temporaryClosureMinutes: 0,
        temporaryClosureIntervals: [],
        operatingMinutes: 0,
        unavailableItemCount: 0,
        unavailableItems: [],
      },
    ]);
  });

  it('marks the forward-only cutover day PARTIAL instead of manufacturing full-day metrics', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T18:00:00.000Z'));
    const trackingStartedAt = atLocal('2026-09-24T12:00:00');
    const service = new BusinessOperationsReportService(
      {
        readOperationalOrdersForRange: jest.fn().mockResolvedValue([]),
        readOperationalItemsForRange: jest.fn().mockResolvedValue([]),
      } as never,
      {
        getStoreOperatingContext: jest.fn().mockResolvedValue(storeContext()),
      } as never,
      {
        readItemClassifications: jest.fn(),
      } as never,
      {
        readOperatingHistoryForRange: jest.fn().mockResolvedValue({
          storeStableId: STORE,
          trackingStartedAt,
          scheduleVersions: [
            {
              revision: 1,
              effectiveFrom: trackingStartedAt,
              timezone: ZONE,
              businessHours: [],
              holidays: [],
            },
          ],
          temporaryClosures: [],
        }),
      } as never,
      {
        readItemUnavailableHistoryForRange: jest.fn().mockResolvedValue({
          storeStableId: STORE,
          trackingStartedAt,
          intervals: [],
        }),
      } as never,
    );

    const report = await service.getReport({
      storeStableId: STORE,
      from: '2026-09-24',
      to: '2026-09-24',
    });

    expect(report.operatingHistory.days).toEqual([
      {
        date: '2026-09-24',
        coverage: 'PARTIAL',
        scheduledMinutes: null,
        temporaryClosureMinutes: null,
        temporaryClosureIntervals: [],
        operatingMinutes: null,
        unavailableItemCount: null,
        unavailableItems: [],
      },
    ]);
    expect(report.operatingHistory.coverage.overall).toBe('PARTIAL');
  });

  it('fails closed on future dates and ranges longer than 90 days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T18:00:00.000Z'));
    const histories = unavailableHistoryReaders();
    const service = new BusinessOperationsReportService(
      {
        readOperationalOrdersForRange: jest.fn(),
        readOperationalItemsForRange: jest.fn(),
      } as never,
      {
        getStoreOperatingContext: jest.fn().mockResolvedValue(storeContext()),
      } as never,
      {
        readItemClassifications: jest.fn(),
      } as never,
      histories.storeHistory as never,
      histories.catalogHistory as never,
    );

    await expect(
      service.getReport({
        storeStableId: STORE,
        from: '2026-09-25',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.getReport({
        storeStableId: STORE,
        from: '2026-01-01',
        to: '2026-09-24',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports low sample instead of manufacturing a baseline when prior coverage is absent', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T18:00:00.000Z'));
    const current = makeOrder('2026-09-24T12:00:00');
    const histories = unavailableHistoryReaders();
    const service = new BusinessOperationsReportService(
      {
        readOperationalOrdersForRange: jest.fn().mockResolvedValue([current]),
        readOperationalItemsForRange: jest.fn().mockResolvedValue([]),
      } as never,
      {
        getStoreOperatingContext: jest.fn().mockResolvedValue(storeContext()),
      } as never,
      {
        readItemClassifications: jest.fn(),
      } as never,
      histories.storeHistory as never,
      histories.catalogHistory as never,
    );

    const report = await service.getReport({ storeStableId: STORE });

    expect(report.comparison.comparablePeriods).toBe(0);
    expect(report.comparison.confidence).toBe('LOW_SAMPLE');
    expect(report.anomalies).toEqual([]);
  });
});
