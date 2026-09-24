import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import type {
  BusinessOperationsAnomalyV1,
  BusinessOperationsComparisonConfidenceV1,
  BusinessOperationsDimensionRowV1,
  BusinessOperationsReportQueryV1,
  BusinessOperationsReportV1,
  BusinessOperationsSummaryDeltaV1,
  BusinessOperationsSummaryV1,
} from './business-operations-report.contract';
import {
  REPORTING_BUSINESS_ORDER_FACTS_QUERY,
  type ReportingBusinessOrderFactV1,
  type ReportingBusinessOrderFactsQueryPort,
  type ReportingBusinessOrderItemFactV1,
} from './reporting-business-order-facts-query.contract';
import {
  REPORTING_STORE_OPERATING_CONTEXT_QUERY,
  type ReportingStoreOperatingContextQueryPort,
} from './reporting-store-operating-context.contract';

const BASELINE_WEEKS = 8;
const COVERAGE_PROBE_WEEKS = 4;
const MINIMUM_COMPARABLE_PERIODS = 4;
const MINIMUM_CURRENT_PREP_SAMPLES = 3;
const MAD_MULTIPLIER = 3;
const RELATIVE_DEVIATION_FLOOR = 0.25;
const ABSOLUTE_FLOORS = {
  orderCount: 3,
  orderTotalCents: 5000,
  averageOrderTotalCents: 300,
  prepP90Minutes: 5,
} as const;
const MAX_RANGE_DAYS = 90;
const RECENT_QUEUE_WINDOW_HOURS = 6;

type TimeWindow = {
  date: string;
  start: Date;
  end: Date;
};

type BaselinePeriod = {
  windows: TimeWindow[];
  orders: ReportingBusinessOrderFactV1[];
  items: ReportingBusinessOrderItemFactV1[];
};

type ItemAggregate = {
  name: string;
  quantity: number;
  orderStableIds: Set<string>;
};

function emptySummary(): BusinessOperationsSummaryV1 {
  return {
    orderTotalCents: 0,
    orderCount: 0,
    averageOrderTotalCents: 0,
    customerDeliveryFeeCents: 0,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint];
  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function medianNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? median(present) : null;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];

  const fraction = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

function mad(values: number[]): number | null {
  if (values.length === 0) return null;
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarizeOrders(
  orders: ReportingBusinessOrderFactV1[],
): BusinessOperationsSummaryV1 {
  const orderTotalCents = orders.reduce(
    (sum, order) => sum + order.totalCents,
    0,
  );
  const customerDeliveryFeeCents = orders.reduce(
    (sum, order) => sum + order.customerDeliveryFeeCents,
    0,
  );
  const orderCount = orders.length;

  return {
    orderTotalCents,
    orderCount,
    averageOrderTotalCents:
      orderCount > 0 ? Math.round(orderTotalCents / orderCount) : 0,
    customerDeliveryFeeCents,
  };
}

function expectedSummary(
  summaries: BusinessOperationsSummaryV1[],
): BusinessOperationsSummaryV1 {
  if (summaries.length === 0) return emptySummary();

  const orderTotalCents = Math.round(
    median(summaries.map((summary) => summary.orderTotalCents)),
  );
  const orderCount = roundMetric(
    median(summaries.map((summary) => summary.orderCount)),
  );
  const customerDeliveryFeeCents = Math.round(
    median(summaries.map((summary) => summary.customerDeliveryFeeCents)),
  );

  return {
    orderTotalCents,
    orderCount,
    averageOrderTotalCents: Math.round(
      median(summaries.map((summary) => summary.averageOrderTotalCents)),
    ),
    customerDeliveryFeeCents,
  };
}

function deltaSummary(
  current: BusinessOperationsSummaryV1,
  expected: BusinessOperationsSummaryV1,
): BusinessOperationsSummaryDeltaV1 {
  return {
    orderTotalCents: current.orderTotalCents - expected.orderTotalCents,
    orderCount: roundMetric(current.orderCount - expected.orderCount),
    averageOrderTotalCents:
      current.averageOrderTotalCents - expected.averageOrderTotalCents,
    customerDeliveryFeeCents:
      current.customerDeliveryFeeCents - expected.customerDeliveryFeeCents,
  };
}

function isWithinWindow(date: Date, window: TimeWindow): boolean {
  const timestamp = date.getTime();
  return (
    timestamp >= window.start.getTime() && timestamp < window.end.getTime()
  );
}

function filterOrdersByWindows(
  orders: ReportingBusinessOrderFactV1[],
  windows: TimeWindow[],
): ReportingBusinessOrderFactV1[] {
  return orders.filter((order) =>
    windows.some((window) => isWithinWindow(order.createdAt, window)),
  );
}

function filterItemsByWindows(
  items: ReportingBusinessOrderItemFactV1[],
  windows: TimeWindow[],
): ReportingBusinessOrderItemFactV1[] {
  return items.filter((item) =>
    windows.some((window) => isWithinWindow(item.orderCreatedAt, window)),
  );
}

function resolveItemName(
  item: Pick<
    ReportingBusinessOrderItemFactV1,
    'productStableId' | 'displayName' | 'nameEn' | 'nameZh'
  >,
): string {
  return item.displayName || item.nameZh || item.nameEn || item.productStableId;
}

function confidenceForSamples(
  sampleCount: number,
): BusinessOperationsComparisonConfidenceV1 {
  if (sampleCount < MINIMUM_COMPARABLE_PERIODS) return 'LOW_SAMPLE';
  return 'OPERATING_CONTEXT_PARTIAL';
}

@Injectable()
export class BusinessOperationsReportService {
  constructor(
    @Inject(REPORTING_BUSINESS_ORDER_FACTS_QUERY)
    private readonly orderFacts: ReportingBusinessOrderFactsQueryPort,
    @Inject(REPORTING_STORE_OPERATING_CONTEXT_QUERY)
    private readonly storeContext: ReportingStoreOperatingContextQueryPort,
  ) {}

  async getReport(
    query: BusinessOperationsReportQueryV1,
  ): Promise<BusinessOperationsReportV1> {
    const storeStableId = query.storeStableId?.trim();
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }

    const context =
      await this.storeContext.getStoreOperatingContext(storeStableId);
    const zone = context.timezone;
    const now = DateTime.now().setZone(zone);
    const today = now.startOf('day');

    const explicitFrom = query.from
      ? this.parseLocalDate(query.from, zone, today)
      : null;
    const explicitTo = query.to
      ? this.parseLocalDate(query.to, zone, today)
      : null;
    const fromDay = explicitFrom ?? explicitTo ?? today;
    const toDay = explicitTo ?? explicitFrom ?? today;

    if (toDay < fromDay) {
      throw new BadRequestException('to must be on or after from');
    }
    if (toDay > today) {
      throw new BadRequestException('future report dates are not supported');
    }

    const selectedDayCount = Math.floor(toDay.diff(fromDay, 'days').days) + 1;
    if (selectedDayCount > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `report range cannot exceed ${MAX_RANGE_DAYS} days`,
      );
    }

    const includesCurrentDay = toDay.hasSame(today, 'day');
    const targetDays = this.listDays(fromDay, toDay);
    const targetWindows = targetDays.map((day) =>
      this.buildTargetWindow(day, today, now),
    );
    const effectiveToExclusive = includesCurrentDay
      ? now
      : toDay.plus({ days: 1 }).startOf('day');
    const queryFrom = fromDay
      .minus({ weeks: BASELINE_WEEKS + COVERAGE_PROBE_WEEKS })
      .startOf('day');

    const [allOrders, allItems] = await Promise.all([
      this.orderFacts.readOperationalOrdersForRange({
        storeStableId,
        fromInclusive: queryFrom.toJSDate(),
        toExclusive: effectiveToExclusive.toJSDate(),
      }),
      this.orderFacts.readOperationalItemsForRange({
        storeStableId,
        fromInclusive: queryFrom.toJSDate(),
        toExclusive: effectiveToExclusive.toJSDate(),
      }),
    ]);

    const observedOrdersFrom = this.resolveObservedOrdersFrom(allOrders, zone);
    const baselinePeriods = this.buildBaselinePeriods({
      targetDays,
      today,
      now,
      observedOrdersFrom,
      allOrders,
      allItems,
    });

    const targetOrders = filterOrdersByWindows(allOrders, targetWindows);
    const targetItems = filterItemsByWindows(allItems, targetWindows);
    const currentSummary = summarizeOrders(targetOrders);
    const periodSummaries = baselinePeriods.map((period) =>
      summarizeOrders(period.orders),
    );
    const baselineExpected = expectedSummary(periodSummaries);
    const summaryDelta = deltaSummary(currentSummary, baselineExpected);
    const comparisonConfidence = confidenceForSamples(baselinePeriods.length);

    const timeline = targetDays.map((day, index) => {
      const window = targetWindows[index];
      const current = summarizeOrders(
        filterOrdersByWindows(allOrders, [window]),
      );
      const comparatorSummaries = this.buildDayComparatorWindows({
        day,
        today,
        now,
        observedOrdersFrom,
      }).map((comparatorWindow) =>
        summarizeOrders(filterOrdersByWindows(allOrders, [comparatorWindow])),
      );

      return {
        date: window.date,
        current,
        expected: expectedSummary(comparatorSummaries),
        comparableDays: comparatorSummaries.length,
      };
    });

    const byChannel = this.buildDimensionRows(
      targetOrders,
      baselinePeriods,
      (order) => order.channel,
    );
    const byPrimaryPaymentMethod = this.buildDimensionRows(
      targetOrders,
      baselinePeriods,
      (order) => order.primaryPaymentMethod,
    );
    const byFulfillment = this.buildDimensionRows(
      targetOrders,
      baselinePeriods,
      (order) => order.fulfillmentType,
    );
    const byHour = this.buildDimensionRows(
      targetOrders,
      baselinePeriods,
      (order) =>
        DateTime.fromJSDate(order.createdAt).setZone(zone).toFormat('HH:00'),
    );

    const commercialItems = this.buildCommercialItems(
      targetItems,
      currentSummary.orderCount,
      baselinePeriods,
    );
    const productionItems = this.buildProductionItems(
      targetItems,
      baselinePeriods,
    );
    const prep = this.buildPrep(targetOrders, baselinePeriods);
    const recentQueue = this.buildRecentQueue({
      isCurrentSingleDay:
        targetDays.length === 1 && targetDays[0].hasSame(today, 'day'),
      allOrders,
      now,
    });
    const hourlyPace =
      targetDays.length === 1
        ? this.buildHourlyPace({
            targetWindow: targetWindows[0],
            targetDay: targetDays[0],
            today,
            now,
            zone,
            observedOrdersFrom,
            allOrders,
          })
        : [];

    const decomposition = this.buildOrderTotalDecomposition(
      currentSummary,
      baselineExpected,
    );

    const anomalies = this.buildAnomalies({
      currentSummary,
      baselineExpected,
      periodSummaries,
      comparisonConfidence,
      rangeFrom: fromDay.toISODate()!,
      rangeTo: toDay.toISODate()!,
      byChannel,
      byFulfillment,
      byHour,
      prep,
      baselinePeriods,
    });

    return {
      version: '1',
      storeStableId: context.storeStableId,
      timezone: zone,
      generatedAt: now.toISO()!,
      range: {
        from: fromDay.toISODate()!,
        to: toDay.toISODate()!,
        fromInclusive: fromDay.toISO()!,
        toExclusive: effectiveToExclusive.toISO()!,
        includesCurrentDay,
        currentDayElapsedMinutes: includesCurrentDay
          ? Math.floor(now.diff(today, 'minutes').minutes)
          : null,
      },
      coverage: {
        orders: 'AVAILABLE',
        baselineProbeFrom: queryFrom.toISODate()!,
        firstObservedOrderInProbe: observedOrdersFrom,
        prepTiming: 'AVAILABLE',
        storeOperatingContext: context.historyCoverage,
        printHealth: 'UNAVAILABLE',
      },
      population: {
        dateField: 'createdAt',
        includedStatuses: ['paid', 'making', 'ready', 'completed'],
        refundedIncluded: false,
      },
      storeContext: {
        isActive: context.isActive,
        currentStatus: {
          isOpenBySchedule: context.currentStatus.isOpenBySchedule,
          isTemporarilyClosed: context.currentStatus.isTemporarilyClosed,
          today: { ...context.currentStatus.today },
        },
        currentConfiguration: {
          businessHours: context.businessHours.map((hour) => ({ ...hour })),
          holidays: context.holidays.map((holiday) => ({ ...holiday })),
        },
      },
      anomalyPolicy: {
        baselineKind: 'SAME_WEEKDAY_ROLLING',
        baselineWeeks: BASELINE_WEEKS,
        minimumComparablePeriods: MINIMUM_COMPARABLE_PERIODS,
        minimumCurrentPrepSamples: MINIMUM_CURRENT_PREP_SAMPLES,
        madMultiplier: MAD_MULTIPLIER,
        relativeDeviationFloor: RELATIVE_DEVIATION_FLOOR,
        absoluteFloors: { ...ABSOLUTE_FLOORS },
      },
      summary: currentSummary,
      comparison: {
        comparablePeriods: baselinePeriods.length,
        confidence: comparisonConfidence,
        expected: baselineExpected,
        delta: summaryDelta,
        variability: {
          orderCountMad: mad(
            periodSummaries.map((summary) => summary.orderCount),
          ),
          orderTotalCentsMad: mad(
            periodSummaries.map((summary) => summary.orderTotalCents),
          ),
        },
      },
      decomposition,
      timeline,
      hourlyPace,
      byChannel,
      byPrimaryPaymentMethod,
      byFulfillment,
      commercialItems,
      productionItems,
      operations: {
        prep,
        recentQueue,
      },
      anomalies,
    };
  }

  private parseLocalDate(
    value: string | undefined,
    zone: string,
    fallback: DateTime,
  ): DateTime {
    if (!value) return fallback.startOf('day');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('report dates must use YYYY-MM-DD');
    }

    const parsed = DateTime.fromISO(value, { zone }).startOf('day');
    if (!parsed.isValid || parsed.toISODate() !== value) {
      throw new BadRequestException('invalid report date');
    }
    return parsed;
  }

  private listDays(fromDay: DateTime, toDay: DateTime): DateTime[] {
    const days: DateTime[] = [];
    let cursor = fromDay.startOf('day');
    while (cursor <= toDay) {
      days.push(cursor);
      cursor = cursor.plus({ days: 1 }).startOf('day');
    }
    return days;
  }

  private buildTargetWindow(
    day: DateTime,
    today: DateTime,
    now: DateTime,
  ): TimeWindow {
    const start = day.startOf('day');
    const end = day.hasSame(today, 'day')
      ? now
      : day.plus({ days: 1 }).startOf('day');
    return {
      date: day.toISODate()!,
      start: start.toJSDate(),
      end: end.toJSDate(),
    };
  }

  private buildComparatorWindow(
    comparatorDay: DateTime,
    targetDay: DateTime,
    today: DateTime,
    now: DateTime,
  ): TimeWindow {
    const start = comparatorDay.startOf('day');
    const end = targetDay.hasSame(today, 'day')
      ? comparatorDay.startOf('day').set({
          hour: now.hour,
          minute: now.minute,
          second: now.second,
          millisecond: now.millisecond,
        })
      : comparatorDay.plus({ days: 1 }).startOf('day');

    return {
      date: comparatorDay.toISODate()!,
      start: start.toJSDate(),
      end: end.toJSDate(),
    };
  }

  private resolveObservedOrdersFrom(
    orders: ReportingBusinessOrderFactV1[],
    zone: string,
  ): string | null {
    if (orders.length === 0) return null;
    const earliest = orders.reduce((current, order) =>
      order.createdAt < current.createdAt ? order : current,
    );
    return DateTime.fromJSDate(earliest.createdAt).setZone(zone).toISODate();
  }

  private isComparatorCovered(
    comparatorDay: DateTime,
    observedOrdersFrom: string | null,
  ): boolean {
    if (!observedOrdersFrom) return false;
    return comparatorDay.toISODate()! > observedOrdersFrom;
  }

  private buildDayComparatorWindows(args: {
    day: DateTime;
    today: DateTime;
    now: DateTime;
    observedOrdersFrom: string | null;
  }): TimeWindow[] {
    const windows: TimeWindow[] = [];
    for (let weekOffset = 1; weekOffset <= BASELINE_WEEKS; weekOffset += 1) {
      const comparatorDay = args.day.minus({ weeks: weekOffset });
      if (!this.isComparatorCovered(comparatorDay, args.observedOrdersFrom)) {
        continue;
      }
      windows.push(
        this.buildComparatorWindow(
          comparatorDay,
          args.day,
          args.today,
          args.now,
        ),
      );
    }
    return windows;
  }

  private buildBaselinePeriods(args: {
    targetDays: DateTime[];
    today: DateTime;
    now: DateTime;
    observedOrdersFrom: string | null;
    allOrders: ReportingBusinessOrderFactV1[];
    allItems: ReportingBusinessOrderItemFactV1[];
  }): BaselinePeriod[] {
    const periods: BaselinePeriod[] = [];

    for (let weekOffset = 1; weekOffset <= BASELINE_WEEKS; weekOffset += 1) {
      const windows: TimeWindow[] = [];
      let covered = true;

      for (const targetDay of args.targetDays) {
        const comparatorDay = targetDay.minus({ weeks: weekOffset });
        if (!this.isComparatorCovered(comparatorDay, args.observedOrdersFrom)) {
          covered = false;
          break;
        }
        windows.push(
          this.buildComparatorWindow(
            comparatorDay,
            targetDay,
            args.today,
            args.now,
          ),
        );
      }

      if (!covered) continue;
      periods.push({
        windows,
        orders: filterOrdersByWindows(args.allOrders, windows),
        items: filterItemsByWindows(args.allItems, windows),
      });
    }

    return periods;
  }

  private buildDimensionRows(
    currentOrders: ReportingBusinessOrderFactV1[],
    baselinePeriods: BaselinePeriod[],
    keyOf: (order: ReportingBusinessOrderFactV1) => string,
  ): BusinessOperationsDimensionRowV1[] {
    const currentByKey = this.summarizeByKey(currentOrders, keyOf);
    const baselineByPeriod = baselinePeriods.map((period) =>
      this.summarizeByKey(period.orders, keyOf),
    );
    const keys = new Set<string>(currentByKey.keys());
    for (const period of baselineByPeriod) {
      for (const key of period.keys()) keys.add(key);
    }

    return Array.from(keys)
      .map((key) => {
        const current = currentByKey.get(key) ?? emptySummary();
        const expected = expectedSummary(
          baselineByPeriod.map((period) => period.get(key) ?? emptySummary()),
        );
        return {
          key,
          current,
          expected,
          delta: deltaSummary(current, expected),
        };
      })
      .sort(
        (a, b) =>
          b.current.orderTotalCents - a.current.orderTotalCents ||
          Math.abs(b.delta.orderTotalCents) -
            Math.abs(a.delta.orderTotalCents) ||
          a.key.localeCompare(b.key),
      );
  }

  private summarizeByKey(
    orders: ReportingBusinessOrderFactV1[],
    keyOf: (order: ReportingBusinessOrderFactV1) => string,
  ): Map<string, BusinessOperationsSummaryV1> {
    const grouped = new Map<string, ReportingBusinessOrderFactV1[]>();
    for (const order of orders) {
      const key = keyOf(order);
      const group = grouped.get(key) ?? [];
      group.push(order);
      grouped.set(key, group);
    }

    return new Map(
      Array.from(grouped.entries()).map(([key, group]) => [
        key,
        summarizeOrders(group),
      ]),
    );
  }

  private buildCommercialItems(
    currentItems: ReportingBusinessOrderItemFactV1[],
    currentOrderCount: number,
    baselinePeriods: BaselinePeriod[],
  ): BusinessOperationsReportV1['commercialItems'] {
    const current = this.aggregateCommercialItems(currentItems);
    const baselines = baselinePeriods.map((period) =>
      this.aggregateCommercialItems(period.items),
    );
    const keys = new Set(current.keys());
    for (const baseline of baselines) {
      for (const key of baseline.keys()) keys.add(key);
    }

    return Array.from(keys)
      .map((productStableId) => {
        const currentEntry = current.get(productStableId);
        const baselineEntries = baselines.map((baseline) =>
          baseline.get(productStableId),
        );
        const expectedQuantity = roundMetric(
          median(baselineEntries.map((entry) => entry?.quantity ?? 0)),
        );
        const fallbackName = baselineEntries.find(Boolean)?.name;

        return {
          productStableId,
          name: currentEntry?.name ?? fallbackName ?? productStableId,
          quantity: currentEntry?.quantity ?? 0,
          orderCount: currentEntry?.orderStableIds.size ?? 0,
          orderPenetrationRate:
            currentOrderCount > 0
              ? roundMetric(
                  (currentEntry?.orderStableIds.size ?? 0) / currentOrderCount,
                )
              : 0,
          expectedQuantity,
          deltaQuantity: roundMetric(
            (currentEntry?.quantity ?? 0) - expectedQuantity,
          ),
        };
      })
      .sort(
        (a, b) =>
          b.quantity - a.quantity ||
          Math.abs(b.deltaQuantity) - Math.abs(a.deltaQuantity) ||
          a.name.localeCompare(b.name),
      );
  }

  private aggregateCommercialItems(
    items: ReportingBusinessOrderItemFactV1[],
  ): Map<string, ItemAggregate> {
    const result = new Map<string, ItemAggregate>();

    for (const item of items) {
      const current = result.get(item.productStableId) ?? {
        name: resolveItemName(item),
        quantity: 0,
        orderStableIds: new Set<string>(),
      };
      current.quantity += item.qty;
      current.orderStableIds.add(item.orderStableId);
      result.set(item.productStableId, current);
    }

    return result;
  }

  private buildProductionItems(
    currentItems: ReportingBusinessOrderItemFactV1[],
    baselinePeriods: BaselinePeriod[],
  ): BusinessOperationsReportV1['productionItems'] {
    const current = this.aggregateProductionItems(currentItems);
    const baselines = baselinePeriods.map((period) =>
      this.aggregateProductionItems(period.items),
    );
    const keys = new Set(current.keys());
    for (const baseline of baselines) {
      for (const key of baseline.keys()) keys.add(key);
    }

    return Array.from(keys)
      .map((productStableId) => {
        const currentEntry = current.get(productStableId);
        const baselineEntries = baselines.map((baseline) =>
          baseline.get(productStableId),
        );
        const expectedQuantity = roundMetric(
          median(baselineEntries.map((entry) => entry?.quantity ?? 0)),
        );
        const fallbackName = baselineEntries.find(Boolean)?.name;

        return {
          productStableId,
          name: currentEntry?.name ?? fallbackName ?? productStableId,
          quantity: currentEntry?.quantity ?? 0,
          expectedQuantity,
          deltaQuantity: roundMetric(
            (currentEntry?.quantity ?? 0) - expectedQuantity,
          ),
        };
      })
      .sort(
        (a, b) =>
          b.quantity - a.quantity ||
          Math.abs(b.deltaQuantity) - Math.abs(a.deltaQuantity) ||
          a.name.localeCompare(b.name),
      );
  }

  private aggregateProductionItems(
    items: ReportingBusinessOrderItemFactV1[],
  ): Map<string, ItemAggregate> {
    const result = new Map<string, ItemAggregate>();

    const add = (
      productStableId: string,
      name: string,
      quantity: number,
      orderStableId: string,
    ) => {
      const current = result.get(productStableId) ?? {
        name,
        quantity: 0,
        orderStableIds: new Set<string>(),
      };
      current.quantity += quantity;
      current.orderStableIds.add(orderStableId);
      result.set(productStableId, current);
    };

    for (const item of items) {
      if (item.components.length === 0) {
        add(
          item.productStableId,
          resolveItemName(item),
          item.qty,
          item.orderStableId,
        );
        continue;
      }

      for (const component of item.components) {
        add(
          component.productStableId,
          component.nameZh || component.nameEn || component.productStableId,
          item.qty * component.quantityPerParent,
          item.orderStableId,
        );
      }
    }

    return result;
  }

  private prepDurations(orders: ReportingBusinessOrderFactV1[]): number[] {
    return orders
      .filter(
        (
          order,
        ): order is ReportingBusinessOrderFactV1 & {
          makingAt: Date;
          readyAt: Date;
        } => order.makingAt !== null && order.readyAt !== null,
      )
      .map(
        (order) => (order.readyAt.getTime() - order.makingAt.getTime()) / 60000,
      )
      .filter((minutes) => minutes >= 0);
  }

  private buildPrep(
    currentOrders: ReportingBusinessOrderFactV1[],
    baselinePeriods: BaselinePeriod[],
  ): BusinessOperationsReportV1['operations']['prep'] {
    const currentDurations = this.prepDurations(currentOrders);
    const baselineP50 = baselinePeriods.map((period) =>
      percentile(this.prepDurations(period.orders), 0.5),
    );
    const baselineP90 = baselinePeriods.map((period) =>
      percentile(this.prepDurations(period.orders), 0.9),
    );

    const channels = new Map<string, ReportingBusinessOrderFactV1[]>();
    for (const order of currentOrders) {
      const group = channels.get(order.channel) ?? [];
      group.push(order);
      channels.set(order.channel, group);
    }

    return {
      sampleCount: currentDurations.length,
      p50Minutes: this.roundNullable(percentile(currentDurations, 0.5)),
      p90Minutes: this.roundNullable(percentile(currentDurations, 0.9)),
      expectedP50Minutes: this.roundNullable(medianNullable(baselineP50)),
      expectedP90Minutes: this.roundNullable(medianNullable(baselineP90)),
      byChannel: Array.from(channels.entries())
        .map(([channel, orders]) => {
          const durations = this.prepDurations(orders);
          return {
            channel,
            sampleCount: durations.length,
            p50Minutes: this.roundNullable(percentile(durations, 0.5)),
            p90Minutes: this.roundNullable(percentile(durations, 0.9)),
          };
        })
        .sort((a, b) => a.channel.localeCompare(b.channel)),
    };
  }

  private roundNullable(value: number | null): number | null {
    return value === null ? null : roundMetric(value);
  }

  private buildRecentQueue(args: {
    isCurrentSingleDay: boolean;
    allOrders: ReportingBusinessOrderFactV1[];
    now: DateTime;
  }): BusinessOperationsReportV1['operations']['recentQueue'] {
    if (!args.isCurrentSingleDay) {
      return {
        available: false,
        windowHours: RECENT_QUEUE_WINDOW_HOURS,
        makingCount: 0,
        readyCount: 0,
        oldestMakingCreatedAt: null,
        oldestReadyCreatedAt: null,
      };
    }

    const cutoff = args.now
      .minus({ hours: RECENT_QUEUE_WINDOW_HOURS })
      .toJSDate();
    const recent = args.allOrders.filter(
      (order) => order.createdAt >= cutoff && order.createdAt < args.now.toJSDate(),
    );
    const making = recent
      .filter((order) => order.status === 'making')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const ready = recent
      .filter((order) => order.status === 'ready')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return {
      available: true,
      windowHours: RECENT_QUEUE_WINDOW_HOURS,
      makingCount: making.length,
      readyCount: ready.length,
      oldestMakingCreatedAt: making[0]?.createdAt.toISOString() ?? null,
      oldestReadyCreatedAt: ready[0]?.createdAt.toISOString() ?? null,
    };
  }

  private buildHourlyPace(args: {
    targetWindow: TimeWindow;
    targetDay: DateTime;
    today: DateTime;
    now: DateTime;
    zone: string;
    observedOrdersFrom: string | null;
    allOrders: ReportingBusinessOrderFactV1[];
  }): BusinessOperationsReportV1['hourlyPace'] {
    const comparatorWindows = this.buildDayComparatorWindows({
      day: args.targetDay,
      today: args.today,
      now: args.now,
      observedOrdersFrom: args.observedOrdersFrom,
    });
    const targetStart = DateTime.fromJSDate(args.targetWindow.start).setZone(
      args.zone,
    );
    const targetEnd = DateTime.fromJSDate(args.targetWindow.end).setZone(
      args.zone,
    );
    const maxHour = args.targetDay.hasSame(args.today, 'day')
      ? args.now.hour
      : 23;
    const points: BusinessOperationsReportV1['hourlyPace'] = [];

    for (let hour = 0; hour <= maxHour; hour += 1) {
      const nominalEnd = targetStart.plus({ hours: hour + 1 });
      const currentCutoff = nominalEnd < targetEnd ? nominalEnd : targetEnd;
      const current = summarizeOrders(
        args.allOrders.filter(
          (order) =>
            order.createdAt >= args.targetWindow.start &&
            order.createdAt < currentCutoff.toJSDate(),
        ),
      );

      const comparatorSummaries = comparatorWindows.map((window) => {
        const comparatorStart = DateTime.fromJSDate(window.start).setZone(
          args.zone,
        );
        const isPartialFinalHour =
          args.targetDay.hasSame(args.today, 'day') && hour === args.now.hour;
        const comparatorCutoff = isPartialFinalHour
          ? DateTime.fromJSDate(window.end).setZone(args.zone)
          : comparatorStart.plus({ hours: hour + 1 });
        return summarizeOrders(
          args.allOrders.filter(
            (order) =>
              order.createdAt >= window.start &&
              order.createdAt < comparatorCutoff.toJSDate(),
          ),
        );
      });
      const expected = expectedSummary(comparatorSummaries);

      points.push({
        hour,
        currentCumulativeOrderCount: current.orderCount,
        currentCumulativeOrderTotalCents: current.orderTotalCents,
        expectedCumulativeOrderCount: expected.orderCount,
        expectedCumulativeOrderTotalCents: expected.orderTotalCents,
      });
    }

    return points;
  }

  private buildOrderTotalDecomposition(
    current: BusinessOperationsSummaryV1,
    expected: BusinessOperationsSummaryV1,
  ): BusinessOperationsReportV1['decomposition'] {
    const orderTotalChangeCents =
      current.orderTotalCents - expected.orderTotalCents;
    const currentAverageExact =
      current.orderCount > 0 ? current.orderTotalCents / current.orderCount : 0;
    const expectedAverageExact =
      expected.orderCount > 0
        ? expected.orderTotalCents / expected.orderCount
        : 0;
    const volumeEffectCents = Math.round(
      (current.orderCount - expected.orderCount) *
        ((currentAverageExact + expectedAverageExact) / 2),
    );

    return {
      orderTotalChangeCents,
      volumeEffectCents,
      averageOrderEffectCents: orderTotalChangeCents - volumeEffectCents,
    };
  }

  private buildAnomalies(args: {
    currentSummary: BusinessOperationsSummaryV1;
    baselineExpected: BusinessOperationsSummaryV1;
    periodSummaries: BusinessOperationsSummaryV1[];
    comparisonConfidence: BusinessOperationsComparisonConfidenceV1;
    rangeFrom: string;
    rangeTo: string;
    byChannel: BusinessOperationsDimensionRowV1[];
    byFulfillment: BusinessOperationsDimensionRowV1[];
    byHour: BusinessOperationsDimensionRowV1[];
    prep: BusinessOperationsReportV1['operations']['prep'];
    baselinePeriods: BaselinePeriod[];
  }): BusinessOperationsAnomalyV1[] {
    const anomalies: BusinessOperationsAnomalyV1[] = [];

    this.maybeAddAnomaly({
      anomalies,
      metric: 'ORDER_COUNT',
      current: args.currentSummary.orderCount,
      expected: args.baselineExpected.orderCount,
      samples: args.periodSummaries.map((summary) => summary.orderCount),
      absoluteFloor: ABSOLUTE_FLOORS.orderCount,
      confidence: args.comparisonConfidence,
      rangeFrom: args.rangeFrom,
      rangeTo: args.rangeTo,
      contributors: this.dimensionContributors(
        args.byChannel,
        args.byFulfillment,
        args.byHour,
        'orderCount',
      ),
    });
    this.maybeAddAnomaly({
      anomalies,
      metric: 'ORDER_TOTAL',
      current: args.currentSummary.orderTotalCents,
      expected: args.baselineExpected.orderTotalCents,
      samples: args.periodSummaries.map((summary) => summary.orderTotalCents),
      absoluteFloor: ABSOLUTE_FLOORS.orderTotalCents,
      confidence: args.comparisonConfidence,
      rangeFrom: args.rangeFrom,
      rangeTo: args.rangeTo,
      contributors: this.dimensionContributors(
        args.byChannel,
        args.byFulfillment,
        args.byHour,
        'orderTotalCents',
      ),
    });
    this.maybeAddAnomaly({
      anomalies,
      metric: 'AVERAGE_ORDER_TOTAL',
      current: args.currentSummary.averageOrderTotalCents,
      expected: args.baselineExpected.averageOrderTotalCents,
      samples: args.periodSummaries.map(
        (summary) => summary.averageOrderTotalCents,
      ),
      absoluteFloor: ABSOLUTE_FLOORS.averageOrderTotalCents,
      confidence: args.comparisonConfidence,
      rangeFrom: args.rangeFrom,
      rangeTo: args.rangeTo,
      contributors: this.dimensionContributors(
        args.byChannel,
        args.byFulfillment,
        args.byHour,
        'averageOrderTotalCents',
      ),
    });

    const baselinePrepP90 = args.baselinePeriods
      .map((period) => percentile(this.prepDurations(period.orders), 0.9))
      .filter((value): value is number => value !== null);
    if (
      args.prep.sampleCount >= MINIMUM_CURRENT_PREP_SAMPLES &&
      args.prep.p90Minutes !== null &&
      args.prep.expectedP90Minutes !== null
    ) {
      this.maybeAddAnomaly({
        anomalies,
        metric: 'PREP_P90',
        current: args.prep.p90Minutes,
        expected: args.prep.expectedP90Minutes,
        samples: baselinePrepP90,
        absoluteFloor: ABSOLUTE_FLOORS.prepP90Minutes,
        confidence: confidenceForSamples(baselinePrepP90.length),
        rangeFrom: args.rangeFrom,
        rangeTo: args.rangeTo,
        contributors: [],
      });
    }

    return anomalies;
  }

  private maybeAddAnomaly(args: {
    anomalies: BusinessOperationsAnomalyV1[];
    metric: BusinessOperationsAnomalyV1['metric'];
    current: number;
    expected: number;
    samples: number[];
    absoluteFloor: number;
    confidence: BusinessOperationsComparisonConfidenceV1;
    rangeFrom: string;
    rangeTo: string;
    contributors: BusinessOperationsAnomalyV1['contributors'];
  }): void {
    if (args.samples.length < MINIMUM_COMPARABLE_PERIODS) return;

    const absoluteDelta = args.current - args.expected;
    const absoluteMagnitude = Math.abs(absoluteDelta);
    const materialFloor = Math.max(
      args.absoluteFloor,
      Math.abs(args.expected) * RELATIVE_DEVIATION_FLOOR,
    );
    if (absoluteMagnitude < materialFloor) return;

    const dispersion = mad(args.samples);
    if (
      dispersion !== null &&
      dispersion > 0 &&
      absoluteMagnitude < dispersion * MAD_MULTIPLIER
    ) {
      return;
    }

    args.anomalies.push({
      metric: args.metric,
      current: roundMetric(args.current),
      expected: roundMetric(args.expected),
      absoluteDelta: roundMetric(absoluteDelta),
      percentageDelta:
        args.expected !== 0
          ? roundMetric((absoluteDelta / Math.abs(args.expected)) * 100)
          : null,
      materialityFloor: roundMetric(materialFloor),
      mad: dispersion === null ? null : roundMetric(dispersion),
      comparableSamples: args.samples.length,
      confidence: args.confidence,
      rangeFrom: args.rangeFrom,
      rangeTo: args.rangeTo,
      direction: absoluteDelta >= 0 ? 'ABOVE_EXPECTED' : 'BELOW_EXPECTED',
      contributors: args.contributors.slice(0, 5),
    });
  }

  private dimensionContributors(
    byChannel: BusinessOperationsDimensionRowV1[],
    byFulfillment: BusinessOperationsDimensionRowV1[],
    byHour: BusinessOperationsDimensionRowV1[],
    metric: 'orderCount' | 'orderTotalCents' | 'averageOrderTotalCents',
  ): BusinessOperationsAnomalyV1['contributors'] {
    const rows: BusinessOperationsAnomalyV1['contributors'] = [
      ...byChannel.map((row) => ({
        dimension: 'CHANNEL' as const,
        key: row.key,
        delta: row.delta[metric],
      })),
      ...byFulfillment.map((row) => ({
        dimension: 'FULFILLMENT' as const,
        key: row.key,
        delta: row.delta[metric],
      })),
      ...byHour.map((row) => ({
        dimension: 'HOUR' as const,
        key: row.key,
        delta: row.delta[metric],
      })),
    ];

    return rows
      .filter((row) => row.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
}
