import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import type {
  MarketingOverviewActivityV1,
  MarketingOverviewAssociatedSalesEvidenceV1,
  MarketingOverviewMetricV1,
  MarketingOverviewReportV1,
  MarketingOverviewWindowKeyV1,
  MarketingOverviewWindowMetricsV1,
  MarketingOverviewWindowV1,
} from './marketing-overview-report.contract';
import {
  REPORTING_MARKETING_CAMPAIGNS_QUERY,
  type ReportingMarketingCampaignFactV1,
  type ReportingMarketingCampaignsQueryPort,
} from './reporting-marketing-campaigns-query.contract';
import {
  REPORTING_MARKETING_USAGE_QUERY,
  type ReportingMarketingMetricEvidenceV1,
  type ReportingMarketingUsageFactV1,
  type ReportingMarketingUsageQueryPort,
} from './reporting-marketing-usage-query.contract';
import {
  REPORTING_STORE_OPERATING_CONTEXT_QUERY,
  type ReportingStoreOperatingContextQueryPort,
} from './reporting-store-operating-context.contract';

type NormalizedCampaignUsage = {
  campaignStableId: string;
  orderStableId: string;
  occurredAt: Date;
  affectedItemQuantity: number | null;
  affectedItemQuantityEvidence: ReportingMarketingMetricEvidenceV1;
  discountCents: number | null;
  discountEvidence: ReportingMarketingMetricEvidenceV1;
  associatedSalesCents: number;
  includesLegacySaleEvidence: boolean;
};

type ResolvedWindow = {
  fromInclusive: DateTime;
  toExclusive: DateTime;
};

function resolveStoreCalendarDate(value: Date, zoneName: string): DateTime {
  return DateTime.fromObject(
    {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    },
    { zone: zoneName },
  );
}

function isCurrentCampaign(
  campaign: ReportingMarketingCampaignFactV1,
  now: DateTime,
): boolean {
  if (campaign.lifecycleStatus !== 'ACTIVE') return false;

  if (campaign.kind === 'DAILY_SPECIAL' || campaign.kind === 'PROMOTION_RULE') {
    const zoneName = now.zoneName ?? 'UTC';
    const startDate = campaign.validFrom
      ? resolveStoreCalendarDate(campaign.validFrom, zoneName).startOf('day')
      : null;
    const endDate = campaign.validTo
      ? resolveStoreCalendarDate(campaign.validTo, zoneName).endOf('day')
      : null;
    if (startDate && now < startDate) return false;
    if (endDate && now > endDate) return false;
    return true;
  }

  const nowMillis = now.toMillis();
  if (campaign.validFrom && campaign.validFrom.getTime() > nowMillis) {
    return false;
  }
  if (campaign.validTo && campaign.validTo.getTime() <= nowMillis) {
    return false;
  }
  return true;
}

function resolveWindows(
  now: DateTime,
): Record<MarketingOverviewWindowKeyV1, ResolvedWindow> {
  const today = now.startOf('day');
  return {
    today: { fromInclusive: today, toExclusive: now },
    last7Days: {
      fromInclusive: today.minus({ days: 6 }),
      toExclusive: now,
    },
    last30Days: {
      fromInclusive: today.minus({ days: 29 }),
      toExclusive: now,
    },
    last90Days: {
      fromInclusive: today.minus({ days: 89 }),
      toExclusive: now,
    },
  };
}

function serializeWindow(window: ResolvedWindow): MarketingOverviewWindowV1 {
  return {
    fromInclusive: window.fromInclusive.toUTC().toISO()!,
    toExclusive: window.toExclusive.toUTC().toISO()!,
  };
}

function withinWindow(occurredAt: Date, window: ResolvedWindow): boolean {
  const timestamp = occurredAt.getTime();
  return (
    timestamp >= window.fromInclusive.toMillis() &&
    timestamp < window.toExclusive.toMillis()
  );
}

function mergeMetricEvidence(
  facts: readonly ReportingMarketingUsageFactV1[],
  field: 'affectedItemQuantity' | 'discountCents',
  evidenceField: 'affectedItemQuantityEvidence' | 'discountEvidence',
): {
  value: number | null;
  evidence: ReportingMarketingMetricEvidenceV1;
} {
  const evidences = facts.map((fact) => fact[evidenceField]);
  if (evidences.every((evidence) => evidence === 'NOT_APPLICABLE')) {
    return { value: null, evidence: 'NOT_APPLICABLE' };
  }
  if (evidences.some((evidence) => evidence === 'UNAVAILABLE')) {
    return { value: null, evidence: 'UNAVAILABLE' };
  }
  if (evidences.some((evidence) => evidence === 'NOT_APPLICABLE')) {
    return { value: null, evidence: 'UNAVAILABLE' };
  }

  return {
    value: facts.reduce((sum, fact) => sum + (fact[field] ?? 0), 0),
    evidence: 'COMPLETE',
  };
}

function normalizeUsage(
  facts: readonly ReportingMarketingUsageFactV1[],
  couponProgramByCouponStableId: ReadonlyMap<string, string>,
): {
  usage: NormalizedCampaignUsage[];
  unattributedCouponUsageOccurredAt: Date[];
} {
  const mapped: Array<
    ReportingMarketingUsageFactV1 & { campaignStableId: string }
  > = [];
  const unattributedCouponUsageOccurredAt: Date[] = [];

  for (const fact of facts) {
    if (fact.source !== 'COUPON') {
      mapped.push({ ...fact, campaignStableId: fact.activityStableId });
      continue;
    }

    const programStableId = couponProgramByCouponStableId.get(
      fact.activityStableId,
    );
    if (!programStableId) {
      unattributedCouponUsageOccurredAt.push(fact.occurredAt);
      continue;
    }
    mapped.push({ ...fact, campaignStableId: programStableId });
  }

  const grouped = new Map<string, typeof mapped>();
  for (const fact of mapped) {
    const key = `${fact.campaignStableId}\u0000${fact.orderStableId}`;
    const current = grouped.get(key) ?? [];
    current.push(fact);
    grouped.set(key, current);
  }

  const usage = Array.from(grouped.values()).map((group) => {
    const first = group[0];
    const quantity = mergeMetricEvidence(
      group,
      'affectedItemQuantity',
      'affectedItemQuantityEvidence',
    );
    const discount = mergeMetricEvidence(
      group,
      'discountCents',
      'discountEvidence',
    );
    return {
      campaignStableId: first.campaignStableId,
      orderStableId: first.orderStableId,
      occurredAt: first.occurredAt,
      affectedItemQuantity: quantity.value,
      affectedItemQuantityEvidence: quantity.evidence,
      discountCents: discount.value,
      discountEvidence: discount.evidence,
      associatedSalesCents: first.associatedSalesCents,
      includesLegacySaleEvidence: group.some(
        (fact) => fact.associatedSalesEvidence === 'LEGACY_CURRENT_ORDER',
      ),
    } satisfies NormalizedCampaignUsage;
  });

  return { usage, unattributedCouponUsageOccurredAt };
}

function summarizeMetric(
  usage: readonly NormalizedCampaignUsage[],
  field: 'affectedItemQuantity' | 'discountCents',
  evidenceField: 'affectedItemQuantityEvidence' | 'discountEvidence',
  forceNotApplicable: boolean,
): MarketingOverviewMetricV1 {
  if (forceNotApplicable) {
    return {
      value: null,
      coverage: 'NOT_APPLICABLE',
      coveredUses: 0,
      totalUses: usage.length,
    };
  }

  if (usage.length === 0) {
    return { value: 0, coverage: 'COMPLETE', coveredUses: 0, totalUses: 0 };
  }

  const complete = usage.filter(
    (fact) => fact[evidenceField] === 'COMPLETE' && fact[field] !== null,
  );
  const notApplicable = usage.filter(
    (fact) => fact[evidenceField] === 'NOT_APPLICABLE',
  );

  if (notApplicable.length === usage.length) {
    return {
      value: null,
      coverage: 'NOT_APPLICABLE',
      coveredUses: 0,
      totalUses: usage.length,
    };
  }

  const value = complete.reduce((sum, fact) => sum + (fact[field] ?? 0), 0);
  if (complete.length === usage.length) {
    return {
      value,
      coverage: 'COMPLETE',
      coveredUses: complete.length,
      totalUses: usage.length,
    };
  }
  if (complete.length > 0) {
    return {
      value,
      coverage: 'PARTIAL',
      coveredUses: complete.length,
      totalUses: usage.length,
    };
  }
  return {
    value: null,
    coverage: 'UNAVAILABLE',
    coveredUses: 0,
    totalUses: usage.length,
  };
}

function summarizeWindow(
  campaign: ReportingMarketingCampaignFactV1,
  usage: readonly NormalizedCampaignUsage[],
): MarketingOverviewWindowMetricsV1 {
  const loyaltyMultiplier =
    campaign.kind === 'PROMOTION_RULE' &&
    campaign.subtype === 'LOYALTY_MULTIPLIER';
  const associatedSalesEvidence: MarketingOverviewAssociatedSalesEvidenceV1 =
    usage.length === 0
      ? 'NO_USAGE'
      : usage.some((fact) => fact.includesLegacySaleEvidence)
        ? 'INCLUDES_LEGACY_CURRENT_ORDER'
        : 'IMMUTABLE_ONLY';

  return {
    uses: usage.length,
    affectedItemQuantity: summarizeMetric(
      usage,
      'affectedItemQuantity',
      'affectedItemQuantityEvidence',
      loyaltyMultiplier,
    ),
    discountCents: summarizeMetric(
      usage,
      'discountCents',
      'discountEvidence',
      loyaltyMultiplier,
    ),
    associatedSalesCents: usage.reduce(
      (sum, fact) => sum + fact.associatedSalesCents,
      0,
    ),
    associatedSalesEvidence,
  };
}

@Injectable()
export class MarketingOverviewReportService {
  constructor(
    @Inject(REPORTING_MARKETING_CAMPAIGNS_QUERY)
    private readonly campaigns: ReportingMarketingCampaignsQueryPort,
    @Inject(REPORTING_MARKETING_USAGE_QUERY)
    private readonly usage: ReportingMarketingUsageQueryPort,
    @Inject(REPORTING_STORE_OPERATING_CONTEXT_QUERY)
    private readonly storeContext: ReportingStoreOperatingContextQueryPort,
  ) {}

  async getReport(
    storeStableIdInput: string,
  ): Promise<MarketingOverviewReportV1> {
    const storeStableId = storeStableIdInput.trim();
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }

    const store =
      await this.storeContext.getStoreOperatingContext(storeStableId);
    const now = DateTime.now().setZone(store.timezone);
    if (!now.isValid) {
      throw new BadRequestException('store timezone is invalid');
    }

    const windows = resolveWindows(now);
    const readFromInclusive = Object.values(windows).reduce(
      (earliest, window) =>
        window.fromInclusive.toMillis() < earliest.toMillis()
          ? window.fromInclusive
          : earliest,
      windows.today.fromInclusive,
    );
    const [campaigns, ownerUsage] = await Promise.all([
      this.campaigns.readCampaigns({ storeStableId }),
      this.usage.readUsageFactsForRange({
        storeStableId,
        fromInclusive: readFromInclusive.toUTC().toJSDate(),
        toExclusive: now.toUTC().toJSDate(),
      }),
    ]);

    const couponStableIds = Array.from(
      new Set(
        ownerUsage
          .filter((fact) => fact.source === 'COUPON')
          .map((fact) => fact.activityStableId),
      ),
    );
    const couponAttributions =
      await this.campaigns.readCouponProgramAttributions(couponStableIds);
    const couponProgramByCouponStableId = new Map(
      couponAttributions.map(
        (attribution) =>
          [attribution.couponStableId, attribution.programStableId] as const,
      ),
    );
    const normalized = normalizeUsage(
      ownerUsage,
      couponProgramByCouponStableId,
    );

    const currentCampaigns = campaigns.filter((campaign) =>
      isCurrentCampaign(campaign, now),
    );
    const activities: MarketingOverviewActivityV1[] = currentCampaigns.map(
      (campaign) => {
        const campaignUsage = normalized.usage.filter(
          (fact) => fact.campaignStableId === campaign.activityStableId,
        );
        const metrics = Object.fromEntries(
          (
            Object.entries(windows) as Array<
              [MarketingOverviewWindowKeyV1, ResolvedWindow]
            >
          ).map(([key, window]) => [
            key,
            summarizeWindow(
              campaign,
              campaignUsage.filter((fact) =>
                withinWindow(fact.occurredAt, window),
              ),
            ),
          ]),
        ) as Record<
          MarketingOverviewWindowKeyV1,
          MarketingOverviewWindowMetricsV1
        >;

        return {
          activityStableId: campaign.activityStableId,
          kind: campaign.kind,
          scope: campaign.scope,
          storeStableId: campaign.storeStableId,
          titleZh: campaign.titleZh,
          titleEn: campaign.titleEn,
          subtype: campaign.subtype,
          validFrom: campaign.validFrom?.toISOString() ?? null,
          validTo: campaign.validTo?.toISOString() ?? null,
          weekdays: [...campaign.weekdays],
          startMinutes: campaign.startMinutes,
          endMinutes: campaign.endMinutes,
          metrics,
        };
      },
    );

    activities.sort((left, right) => {
      const scopeDelta = left.scope.localeCompare(right.scope);
      if (scopeDelta !== 0) return scopeDelta;
      const kindDelta = left.kind.localeCompare(right.kind);
      if (kindDelta !== 0) return kindDelta;
      return left.activityStableId.localeCompare(right.activityStableId);
    });

    return {
      version: 1,
      storeStableId: store.storeStableId,
      timezone: store.timezone,
      generatedAt: now.toUTC().toISO(),
      windows: Object.fromEntries(
        (
          Object.entries(windows) as Array<
            [MarketingOverviewWindowKeyV1, ResolvedWindow]
          >
        ).map(([key, window]) => [key, serializeWindow(window)]),
      ) as Record<MarketingOverviewWindowKeyV1, MarketingOverviewWindowV1>,
      activities,
      coverage: {
        unattributedCouponUsesInLast90Days:
          normalized.unattributedCouponUsageOccurredAt.filter((occurredAt) =>
            withinWindow(occurredAt, windows.last90Days),
          ).length,
      },
    };
  }
}
