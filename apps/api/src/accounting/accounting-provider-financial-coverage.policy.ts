// financialCompleteThrough is an inclusive, monotonic evidence frontier.
// It may advance only when posted provider-statement intervals continuously
// cover every date after the previously proven frontier.
export type ProviderFinancialCoverageInterval = {
  documentStableId: string;
  periodStart: string;
  periodEnd: string;
};

export type ProviderFinancialCoverageFrontier = {
  financialCompleteThrough: string | null;
  evidenceDocumentStableIds: string[];
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnlyMillis(value: string, field: string): number {
  if (!DATE_ONLY_RE.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD`);
  }
  const millis = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(millis) ||
    new Date(millis).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} must be a valid calendar date`);
  }
  return millis;
}

function dateOnlyFromMillis(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10);
}

export function resolveProviderFinancialCoverageFrontier(params: {
  financialHistoryRequiredFrom: string;
  financialCompleteThrough: string | null;
  intervals: ProviderFinancialCoverageInterval[];
}): ProviderFinancialCoverageFrontier {
  const requiredFromMillis = dateOnlyMillis(
    params.financialHistoryRequiredFrom,
    'financialHistoryRequiredFrom',
  );
  const currentCompleteMillis = params.financialCompleteThrough
    ? dateOnlyMillis(
        params.financialCompleteThrough,
        'financialCompleteThrough',
      )
    : null;
  if (
    currentCompleteMillis !== null &&
    currentCompleteMillis < requiredFromMillis
  ) {
    throw new Error(
      'financialCompleteThrough cannot precede financialHistoryRequiredFrom',
    );
  }

  const intervals = params.intervals
    .map((interval) => {
      const periodStartMillis = dateOnlyMillis(
        interval.periodStart,
        `periodStart:${interval.documentStableId}`,
      );
      const periodEndMillis = dateOnlyMillis(
        interval.periodEnd,
        `periodEnd:${interval.documentStableId}`,
      );
      if (periodEndMillis < periodStartMillis) {
        throw new Error(
          `provider coverage interval ends before it starts: ${interval.documentStableId}`,
        );
      }
      return {
        ...interval,
        periodStartMillis,
        periodEndMillis,
      };
    })
    .sort(
      (left, right) =>
        left.periodStartMillis - right.periodStartMillis ||
        right.periodEndMillis - left.periodEndMillis ||
        left.documentStableId.localeCompare(right.documentStableId),
    );

  let frontierMillis =
    currentCompleteMillis ?? requiredFromMillis - DAY_MS;
  const evidenceDocumentStableIds: string[] = [];

  for (const interval of intervals) {
    if (interval.periodEndMillis <= frontierMillis) continue;
    if (interval.periodStartMillis > frontierMillis + DAY_MS) break;

    frontierMillis = interval.periodEndMillis;
    evidenceDocumentStableIds.push(interval.documentStableId);
  }

  return {
    financialCompleteThrough:
      frontierMillis >= requiredFromMillis
        ? dateOnlyFromMillis(frontierMillis)
        : null,
    evidenceDocumentStableIds,
  };
}
