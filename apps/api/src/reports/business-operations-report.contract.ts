export type BusinessOperationsReportQueryV1 = {
  storeStableId: string;
  from?: string;
  to?: string;
};

export type BusinessOperationsSummaryV1 = {
  orderTotalCents: number;
  orderCount: number;
  averageOrderTotalCents: number;
  customerDeliveryFeeCents: number;
};

export type BusinessOperationsSummaryDeltaV1 = {
  orderTotalCents: number;
  orderCount: number;
  averageOrderTotalCents: number;
  customerDeliveryFeeCents: number;
};

export type BusinessOperationsComparisonConfidenceV1 =
  | 'SUFFICIENT'
  | 'LOW_SAMPLE'
  | 'OPERATING_CONTEXT_PARTIAL';

export type BusinessOperationsDimensionRowV1 = {
  key: string;
  current: BusinessOperationsSummaryV1;
  expected: BusinessOperationsSummaryV1;
  delta: BusinessOperationsSummaryDeltaV1;
};

export type BusinessOperationsDailyPointV1 = {
  date: string;
  current: BusinessOperationsSummaryV1;
  expected: BusinessOperationsSummaryV1;
  comparableDays: number;
};

export type BusinessOperationsHourlyPacePointV1 = {
  hour: number;
  currentCumulativeOrderCount: number;
  currentCumulativeOrderTotalCents: number;
  expectedCumulativeOrderCount: number;
  expectedCumulativeOrderTotalCents: number;
};

export type BusinessOperationsCommercialItemV1 = {
  productStableId: string;
  name: string;
  quantity: number;
  orderCount: number;
  orderPenetrationRate: number;
  expectedQuantity: number;
  deltaQuantity: number;
};

export type BusinessOperationsProductionItemV1 = {
  productStableId: string;
  name: string;
  quantity: number;
  expectedQuantity: number;
  deltaQuantity: number;
};

export type BusinessOperationsPrepByChannelV1 = {
  channel: string;
  sampleCount: number;
  p50Minutes: number | null;
  p90Minutes: number | null;
};

export type BusinessOperationsPrepV1 = {
  sampleCount: number;
  p50Minutes: number | null;
  p90Minutes: number | null;
  expectedP50Minutes: number | null;
  expectedP90Minutes: number | null;
  byChannel: BusinessOperationsPrepByChannelV1[];
};

export type BusinessOperationsRecentQueueV1 = {
  available: boolean;
  windowHours: number;
  makingCount: number;
  readyCount: number;
  oldestMakingCreatedAt: string | null;
  oldestReadyCreatedAt: string | null;
};

export type BusinessOperationsAnomalyMetricV1 =
  | 'ORDER_COUNT'
  | 'ORDER_TOTAL'
  | 'AVERAGE_ORDER_TOTAL'
  | 'PREP_P90';

export type BusinessOperationsAnomalyV1 = {
  metric: BusinessOperationsAnomalyMetricV1;
  current: number;
  expected: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  materialityFloor: number;
  mad: number | null;
  comparableSamples: number;
  confidence: BusinessOperationsComparisonConfidenceV1;
  rangeFrom: string;
  rangeTo: string;
  direction: 'ABOVE_EXPECTED' | 'BELOW_EXPECTED';
  contributors: Array<{
    dimension: 'CHANNEL' | 'FULFILLMENT' | 'HOUR';
    key: string;
    delta: number;
  }>;
};

export type BusinessOperationsReportV1 = {
  version: '1';
  storeStableId: string;
  timezone: string;
  generatedAt: string;
  range: {
    from: string;
    to: string;
    fromInclusive: string;
    toExclusive: string;
    includesCurrentDay: boolean;
    currentDayElapsedMinutes: number | null;
  };
  coverage: {
    orders: 'AVAILABLE';
    baselineProbeFrom: string;
    firstObservedOrderInProbe: string | null;
    prepTiming: 'AVAILABLE';
    storeOperatingContext: 'CURRENT_CONFIGURATION_ONLY';
    printHealth: 'UNAVAILABLE';
  };
  population: {
    dateField: 'createdAt';
    includedStatuses: ['paid', 'making', 'ready', 'completed'];
    refundedIncluded: false;
  };
  storeContext: {
    isActive: boolean;
    currentStatus: {
      isOpenBySchedule: boolean;
      isTemporarilyClosed: boolean;
      today: {
        date: string;
        closeMinutes: number | null;
      };
    };
    currentConfiguration: {
      businessHours: Array<{
        weekday: number;
        openMinutes: number | null;
        closeMinutes: number | null;
        isClosed: boolean;
      }>;
      holidays: Array<{
        date: string;
        name: string | null;
        isClosed: boolean;
        openMinutes: number | null;
        closeMinutes: number | null;
      }>;
    };
  };
  anomalyPolicy: {
    baselineKind: 'SAME_WEEKDAY_ROLLING';
    baselineWeeks: number;
    minimumComparablePeriods: number;
    minimumCurrentPrepSamples: number;
    madMultiplier: number;
    relativeDeviationFloor: number;
    absoluteFloors: {
      orderCount: number;
      orderTotalCents: number;
      averageOrderTotalCents: number;
      prepP90Minutes: number;
    };
  };
  summary: BusinessOperationsSummaryV1;
  comparison: {
    comparablePeriods: number;
    confidence: BusinessOperationsComparisonConfidenceV1;
    expected: BusinessOperationsSummaryV1;
    delta: BusinessOperationsSummaryDeltaV1;
    variability: {
      orderCountMad: number | null;
      orderTotalCentsMad: number | null;
    };
  };
  decomposition: {
    orderTotalChangeCents: number;
    volumeEffectCents: number;
    averageOrderEffectCents: number;
  };
  timeline: BusinessOperationsDailyPointV1[];
  hourlyPace: BusinessOperationsHourlyPacePointV1[];
  byChannel: BusinessOperationsDimensionRowV1[];
  byPrimaryPaymentMethod: BusinessOperationsDimensionRowV1[];
  byFulfillment: BusinessOperationsDimensionRowV1[];
  commercialItems: BusinessOperationsCommercialItemV1[];
  productionItems: BusinessOperationsProductionItemV1[];
  operations: {
    prep: BusinessOperationsPrepV1;
    recentQueue: BusinessOperationsRecentQueueV1;
  };
  anomalies: BusinessOperationsAnomalyV1[];
};
