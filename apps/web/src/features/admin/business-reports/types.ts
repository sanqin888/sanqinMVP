export type BusinessReportConfidence =
  | 'SUFFICIENT'
  | 'LOW_SAMPLE'
  | 'OPERATING_CONTEXT_PARTIAL';

export type BusinessReportSummary = {
  orderTotalCents: number;
  orderCount: number;
  averageOrderTotalCents: number;
};

export type BusinessReportSummaryDelta = BusinessReportSummary;

export type BusinessReportDimensionRow = {
  key: string;
  current: BusinessReportSummary;
  expected: BusinessReportSummary;
  delta: BusinessReportSummaryDelta;
};

export type BusinessReportAnomalyMetric =
  | 'ORDER_COUNT'
  | 'ORDER_TOTAL'
  | 'AVERAGE_ORDER_TOTAL'
  | 'PREP_P90';

export type BusinessReportAnomaly = {
  metric: BusinessReportAnomalyMetric;
  current: number;
  expected: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  materialityFloor: number;
  mad: number | null;
  comparableSamples: number;
  confidence: BusinessReportConfidence;
  direction: 'ABOVE_EXPECTED' | 'BELOW_EXPECTED';
  contributors: Array<{
    dimension: 'CHANNEL' | 'FULFILLMENT' | 'HOUR';
    key: string;
    delta: number;
  }>;
};

/**
 * Web-owned view shape for the subset of BusinessOperationsReportV1 rendered by
 * Admin Business Reports. This deliberately does not redefine the full public
 * Reporting DTO; unused Accounting/operational fields stay out of the browser
 * view model.
 */
export type BusinessOperationsReportView = {
  storeStableId: string;
  timezone: string;
  generatedAt: string;
  range: {
    from: string;
    to: string;
  };
  coverage: {
    orders: 'AVAILABLE';
    firstObservedOrderInProbe: string | null;
    prepTiming: 'AVAILABLE';
    storeOperatingContext: 'CURRENT_CONFIGURATION_ONLY';
    printHealth: 'UNAVAILABLE';
  };
  storeContext: {
    isActive: boolean;
    currentStatus: {
      isOpenBySchedule: boolean;
      isTemporarilyClosed: boolean;
    };
  };
  summary: BusinessReportSummary;
  comparison: {
    comparablePeriods: number;
    confidence: BusinessReportConfidence;
    expected: BusinessReportSummary;
    delta: BusinessReportSummaryDelta;
  };
  decomposition: {
    orderTotalChangeCents: number;
    volumeEffectCents: number;
    averageOrderEffectCents: number;
  };
  timeline: Array<{
    date: string;
    current: BusinessReportSummary;
    expected: BusinessReportSummary;
  }>;
  hourlyPace: Array<{
    hour: number;
    currentCumulativeOrderCount: number;
    currentCumulativeOrderTotalCents: number;
    expectedCumulativeOrderCount: number;
    expectedCumulativeOrderTotalCents: number;
  }>;
  byChannel: BusinessReportDimensionRow[];
  byFulfillment: BusinessReportDimensionRow[];
  commercialItems: Array<{
    productStableId: string;
    name: string;
    quantity: number;
    orderCount: number;
    orderPenetrationRate: number;
    expectedQuantity: number;
    deltaQuantity: number;
  }>;
  productionItems: Array<{
    productStableId: string;
    name: string;
    quantity: number;
    expectedQuantity: number;
    deltaQuantity: number;
  }>;
  operations: {
    prep: {
      sampleCount: number;
      p50Minutes: number | null;
      p90Minutes: number | null;
      expectedP50Minutes: number | null;
      expectedP90Minutes: number | null;
      byChannel: Array<{
        channel: string;
        sampleCount: number;
        p50Minutes: number | null;
        p90Minutes: number | null;
      }>;
    };
    recentQueue: {
      available: boolean;
      windowHours: number;
      makingCount: number;
      readyCount: number;
      oldestMakingCreatedAt: string | null;
      oldestReadyCreatedAt: string | null;
    };
  };
  anomalies: BusinessReportAnomaly[];
};
