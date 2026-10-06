import type {
  AccountingPlatformAnalyticsAvailablePeriod,
  AccountingPlatformAnalyticsProvider,
} from '@/lib/contracts/accounting-platform-analytics';

export function availablePlatformPeriods(
  provider: AccountingPlatformAnalyticsProvider,
): AccountingPlatformAnalyticsAvailablePeriod[] {
  return provider.periods.filter(
    (
      period,
    ): period is AccountingPlatformAnalyticsAvailablePeriod =>
      period.status === 'AVAILABLE',
  );
}

export function orderedPlatformFeeCategoryKeys(
  provider: AccountingPlatformAnalyticsProvider,
): string[] {
  const periods = availablePlatformPeriods(provider);
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const period of periods) {
    for (const fee of period.fees) {
      if (seen.has(fee.categoryKey)) continue;
      seen.add(fee.categoryKey);
      if (
        periods.some((candidatePeriod) =>
          candidatePeriod.fees.some(
            (candidateFee) =>
              candidateFee.categoryKey === fee.categoryKey &&
              candidateFee.costImpactCents !== 0,
          ),
        )
      ) {
        keys.push(fee.categoryKey);
      }
    }
  }
  return keys;
}

export function platformFeeName(
  provider: AccountingPlatformAnalyticsProvider,
  categoryKey: string,
): string {
  for (const period of availablePlatformPeriods(provider)) {
    const fee = period.fees.find(
      (candidate) => candidate.categoryKey === categoryKey,
    );
    if (fee) return fee.rawName;
  }
  return categoryKey;
}

export function platformCommissionName(
  provider: AccountingPlatformAnalyticsProvider,
): string | null {
  for (const period of availablePlatformPeriods(provider)) {
    if (period.commission.rawNames.length > 0) {
      return period.commission.rawNames.join(' / ');
    }
  }
  return null;
}
