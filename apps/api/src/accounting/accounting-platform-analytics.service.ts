import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from './accounting-contracts';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import type {
  AccountingPlatformAnalyticsAvailablePeriodV1,
  AccountingPlatformAnalyticsFeeV1,
  AccountingPlatformAnalyticsPeriodV1,
  AccountingPlatformAnalyticsProviderKeyV1,
  AccountingPlatformAnalyticsProviderV1,
  AccountingPlatformAnalyticsReportV1,
} from './accounting-platform-analytics.contract';
import {
  AccountingProviderFinancialReviewPolicyError,
  resolveProviderFinancialEffectiveLines,
  type ProviderFinancialEffectiveLine,
} from './accounting-provider-financial-review.policy';
import {
  buildProviderControlTotalChecks,
  requiresUberOtherEarningsSemanticReview,
  UBER_OTHER_EARNINGS_SEMANTIC_REVIEW_REASON,
} from './accounting-provider-settlement.policy';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  currentProviderEffectiveLines,
  readProviderCurrentAuthority,
} from './accounting-provider-settlement-current-authority.policy';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';
import {
  accountingPostedCorrectionTargetKey,
  readAccountingPostedCorrectionProjections,
  type AccountingPostedCorrectionProjectionV1,
} from './accounting-posted-correction-read-model';
import { AccountingPostedCorrectionTargetKind } from './accounting-posted-financial-correction.contract';

type ProviderDocumentRow = Awaited<
  ReturnType<
    AccountingProviderSettlementQueryService['readProviderSettlementDocuments']
  >
>[number];

const PLATFORM_PROVIDERS = [
  AccountingFinancialProvider.UBER_EATS,
  AccountingFinancialProvider.FANTUAN,
] as const;

const PLATFORM_FEE_COMPONENTS = new Set<AccountingFinancialComponent>([
  AccountingFinancialComponent.PROCESSING_FEE,
  AccountingFinancialComponent.PROMOTION,
  AccountingFinancialComponent.SUBSIDY,
  AccountingFinancialComponent.ADVERTISING,
  AccountingFinancialComponent.ADVERTISING_CREDIT,
  AccountingFinancialComponent.CHARGEBACK,
  AccountingFinancialComponent.PLATFORM_OTHER_FEE,
  AccountingFinancialComponent.ADJUSTMENT,
]);

const isoDate = (value: Date | null): string | null =>
  value?.toISOString().slice(0, 10) ?? null;

const documentIdentityKey = (document: ProviderDocumentRow): string =>
  [document.provider, document.documentType, document.businessIdentityKey].join(
    '|',
  );

const latestDocumentRevisions = (
  documents: ProviderDocumentRow[],
): ProviderDocumentRow[] => {
  const latest = new Map<string, ProviderDocumentRow>();
  for (const document of documents) {
    const key = documentIdentityKey(document);
    const current = latest.get(key);
    if (!current || document.revision > current.revision) {
      latest.set(key, document);
    }
  }
  return Array.from(latest.values());
};

const isConfirmedProviderDocument = (
  document: ProviderDocumentRow,
): boolean => {
  const review = document.artifact.inboxItem;
  return Boolean(
    review &&
    review.status === AccountingInboxStatus.CONFIRMED &&
    review.materializedEntityType ===
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT &&
    review.materializedEntityStableId === document.documentStableId &&
    review.reviewedAt &&
    review.reviewedByUserStableId,
  );
};

const statementMonth = (document: ProviderDocumentRow): string | null => {
  const start = isoDate(document.periodStart);
  const end = isoDate(document.periodEnd);
  if (!start || !end) return null;
  const startMonth = start.slice(0, 7);
  const endMonth = end.slice(0, 7);
  return startMonth === endMonth ? startMonth : null;
};

const shiftMonth = (month: string, offset: number): string => {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const shifted = new Date(Date.UTC(year, monthIndex + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1,
  ).padStart(2, '0')}`;
};

const shareOfSalesBps = (
  costImpactCents: number,
  salesCents: number,
): number | null => {
  if (salesCents === 0) return null;
  return Math.round((costImpactCents * 10_000) / salesCents);
};

const uniqueNames = (values: Array<string | null>): string[] =>
  Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );

@Injectable()
export class AccountingPlatformAnalyticsService {
  constructor(
    private readonly settlementQuery: AccountingProviderSettlementQueryService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
  ) {}

  async report(query: {
    storeStableId?: string;
  }): Promise<AccountingPlatformAnalyticsReportV1> {
    const requestedStoreStableId = query.storeStableId?.trim();
    const store = requestedStoreStableId
      ? await this.storeConfig.getStoreSnapshot(requestedStoreStableId)
      : await this.storeConfig.getConfiguredStoreSnapshot();
    const documents =
      await this.settlementQuery.readProviderSettlementDocuments({
        storeStableId: store.storeStableId,
      });
    const latestRevisions = latestDocumentRevisions(documents);
    const correctionProjections =
      await readAccountingPostedCorrectionProjections(
        this.prisma,
        latestRevisions.map((document) => ({
          targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
          targetStableId: document.documentStableId,
          targetVersion: document.revision,
        })),
      );

    return {
      version: 1,
      storeStableId: store.storeStableId,
      timezone: store.timezone,
      providers: PLATFORM_PROVIDERS.map((provider) =>
        this.projectProvider(provider, latestRevisions, correctionProjections),
      ),
    };
  }

  private projectProvider(
    provider: AccountingPlatformAnalyticsProviderKeyV1,
    documents: ProviderDocumentRow[],
    correctionProjections: Map<string, AccountingPostedCorrectionProjectionV1>,
  ): AccountingPlatformAnalyticsProviderV1 {
    const monthlyStatements = documents.filter(
      (document) =>
        document.provider === provider &&
        document.documentType === AccountingFinancialDocumentType.STATEMENT &&
        statementMonth(document) !== null,
    );

    const monthGroups = new Map<string, ProviderDocumentRow[]>();
    for (const document of monthlyStatements) {
      const month = statementMonth(document);
      if (!month) continue;
      monthGroups.set(month, [...(monthGroups.get(month) ?? []), document]);
    }

    const latestMonth =
      monthlyStatements
        .filter(isConfirmedProviderDocument)
        .map((document) => statementMonth(document))
        .filter((month): month is string => Boolean(month))
        .sort()
        .at(-1) ?? null;
    if (!latestMonth) {
      return {
        provider,
        latestMonth: null,
        coverage: 'EMPTY',
        periods: [],
      };
    }

    const months = [0, -1, -2].map((offset) => shiftMonth(latestMonth, offset));
    const periods = months.map((month) =>
      this.projectPeriod(
        month,
        monthGroups.get(month) ?? [],
        correctionProjections,
      ),
    );

    return {
      provider,
      latestMonth,
      coverage: periods.every((period) => period.status === 'AVAILABLE')
        ? 'COMPLETE'
        : 'PARTIAL',
      periods,
    };
  }

  private projectPeriod(
    month: string,
    documents: ProviderDocumentRow[],
    correctionProjections: Map<string, AccountingPostedCorrectionProjectionV1>,
  ): AccountingPlatformAnalyticsPeriodV1 {
    if (documents.length === 0) {
      return {
        month,
        status: 'MISSING',
        documentStableIds: [],
        issues: ['CONFIRMED_STATEMENT_MISSING'],
      };
    }
    if (documents.length !== 1) {
      return {
        month,
        status: 'AMBIGUOUS',
        documentStableIds: documents
          .map((document) => document.documentStableId)
          .sort(),
        issues: ['MULTIPLE_STATEMENTS_FOR_MONTH'],
      };
    }
    if (!isConfirmedProviderDocument(documents[0])) {
      return {
        month,
        status: 'MISSING',
        documentStableIds: [documents[0].documentStableId],
        issues: ['LATEST_STATEMENT_NOT_CONFIRMED'],
      };
    }

    const effectiveLines = this.currentEffectiveLines(
      documents[0],
      correctionProjections,
    );
    const integrityIssues = this.statementIntegrityIssues(
      documents[0],
      effectiveLines,
    );
    if (integrityIssues.length > 0) {
      return {
        month,
        status: 'INCOMPLETE',
        documentStableIds: [documents[0].documentStableId],
        issues: integrityIssues,
      };
    }

    return this.projectAvailablePeriod(month, documents[0], effectiveLines);
  }

  private projectAvailablePeriod(
    month: string,
    document: ProviderDocumentRow,
    effectiveLines: ProviderFinancialEffectiveLine[],
  ): AccountingPlatformAnalyticsAvailablePeriodV1 {
    const periodStart = isoDate(document.periodStart);
    const periodEnd = isoDate(document.periodEnd);
    if (!periodStart || !periodEnd) {
      throw new ConflictException(
        `platform statement is missing its period: ${document.documentStableId}`,
      );
    }

    const lines = effectiveLines.filter(
      (line) =>
        line.postingTreatment ===
          AccountingFinancialPostingTreatment.POSTABLE &&
        line.taxRole === AccountingFinancialTaxRole.NONE,
    );
    const salesCents = lines
      .filter((line) => line.component === AccountingFinancialComponent.SALES)
      .reduce((sum, line) => sum + line.amountCents, 0);
    const commissionLines = lines.filter(
      (line) => line.component === AccountingFinancialComponent.COMMISSION,
    );
    const commissionAmountCents = commissionLines.reduce(
      (sum, line) => sum + line.amountCents,
      0,
    );
    const commissionCostImpactCents = -commissionAmountCents;

    const feeBuckets = new Map<
      string,
      {
        rawName: string;
        component: AccountingFinancialComponent;
        amountCents: number;
      }
    >();
    for (const line of lines) {
      if (!PLATFORM_FEE_COMPONENTS.has(line.component)) {
        continue;
      }
      const rawName = line.rawName?.trim() || line.component;
      const categoryKey = `${line.component}:${rawName}`;
      const current = feeBuckets.get(categoryKey);
      feeBuckets.set(categoryKey, {
        rawName,
        component: line.component,
        amountCents: (current?.amountCents ?? 0) + line.amountCents,
      });
    }

    const fees: AccountingPlatformAnalyticsFeeV1[] = Array.from(
      feeBuckets.entries(),
    ).map(([categoryKey, fee]) => {
      const costImpactCents = -fee.amountCents;
      return {
        categoryKey,
        rawName: fee.rawName,
        component: fee.component,
        amountCents: fee.amountCents,
        costImpactCents,
        shareOfSalesBps: shareOfSalesBps(costImpactCents, salesCents),
        kind:
          costImpactCents > 0
            ? ('CHARGE' as const)
            : costImpactCents < 0
              ? ('CREDIT' as const)
              : ('NEUTRAL' as const),
      };
    });

    const totalPlatformCostExTaxCents =
      commissionCostImpactCents +
      fees.reduce((sum, fee) => sum + fee.costImpactCents, 0);

    return {
      month,
      status: 'AVAILABLE',
      documentStableId: document.documentStableId,
      periodStart,
      periodEnd,
      currency: document.currency,
      salesCents,
      commission: {
        rawNames: uniqueNames(commissionLines.map((line) => line.rawName)),
        amountCents: commissionAmountCents,
        costImpactCents: commissionCostImpactCents,
        shareOfSalesBps: shareOfSalesBps(commissionCostImpactCents, salesCents),
      },
      fees,
      totalPlatformCostExTaxCents,
      totalPlatformCostShareOfSalesBps: shareOfSalesBps(
        totalPlatformCostExTaxCents,
        salesCents,
      ),
    };
  }

  private statementIntegrityIssues(
    document: ProviderDocumentRow,
    lines: ProviderFinancialEffectiveLine[],
  ): string[] {
    const issues = buildProviderControlTotalChecks({
      documentStableId: document.documentStableId,
      revision: document.revision,
      provider: document.provider,
      documentType: document.documentType,
      storeStableId: document.storeStableId,
      periodStart: isoDate(document.periodStart),
      periodEnd: isoDate(document.periodEnd),
      currency: document.currency,
      lines,
    })
      .filter((check) => check.status !== 'MATCHED')
      .map((check) => `PROVIDER_CONTROL_${check.key}_${check.status}`);

    if (
      lines.some((line) =>
        requiresUberOtherEarningsSemanticReview({
          provider: document.provider,
          line,
        }),
      )
    ) {
      issues.push(UBER_OTHER_EARNINGS_SEMANTIC_REVIEW_REASON);
    }
    return Array.from(new Set(issues));
  }

  private currentEffectiveLines(
    document: ProviderDocumentRow,
    correctionProjections: Map<string, AccountingPostedCorrectionProjectionV1>,
  ): ProviderFinancialEffectiveLine[] {
    const key = accountingPostedCorrectionTargetKey({
      targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
      targetStableId: document.documentStableId,
      targetVersion: document.revision,
    });
    const latest =
      correctionProjections.get(key)?.latestPostedAuthority ?? null;
    if (!latest) {
      return this.effectiveLines(document);
    }
    let authority: ReturnType<typeof readProviderCurrentAuthority>;
    try {
      authority = readProviderCurrentAuthority({
        schema: latest.targetAuthoritySchema,
        targetJson: latest.targetJson,
        expectedHash: latest.targetAuthorityHash,
      });
    } catch (error) {
      throw new ConflictException(
        `latest POSTED Provider correction target is invalid: ${document.documentStableId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const target = authority.target;

    const periodStart = isoDate(document.periodStart);
    const periodEnd = isoDate(document.periodEnd);
    if (
      target.document.documentStableId !== document.documentStableId ||
      target.document.documentRevision !== document.revision ||
      target.document.provider !== document.provider ||
      target.document.documentType !== document.documentType ||
      target.document.businessIdentityKey !== document.businessIdentityKey ||
      target.document.providerDocumentRef !== document.providerDocumentRef ||
      target.document.storeStableId !== document.storeStableId ||
      target.document.periodStart !== periodStart ||
      target.document.periodEnd !== periodEnd ||
      target.document.currency !== document.currency
    ) {
      throw new ConflictException(
        `latest POSTED Provider correction immutable identity does not match source document: ${document.documentStableId}`,
      );
    }

    return currentProviderEffectiveLines(authority).map((line) => ({
      lineStableId: line.effectiveLineStableId,
      lineNo: line.effectiveLineNo,
      rawCode: line.rawCode,
      rawName: line.rawName,
      component: line.component,
      postingTreatment: line.postingTreatment,
      taxRole: line.taxRole,
      amountCents: line.amountCents,
      occurredAt: line.occurredAt ? new Date(line.occurredAt) : null,
    }));
  }

  private effectiveLines(document: ProviderDocumentRow) {
    const review = document.reviewRevisions?.[0] ?? null;
    try {
      return resolveProviderFinancialEffectiveLines({
        sourceLines: document.lines,
        review: review
          ? {
              effectiveSnapshotParserName: review.effectiveSnapshotParserName,
              effectiveLines: review.effectiveLines,
              corrections: review.corrections.map((correction) => ({
                sourceLineStableId: correction.sourceLineStableId,
                reason: correction.reason,
                note: correction.note,
                effectiveRawCode: correction.effectiveRawCode,
                effectiveRawName: correction.effectiveRawName,
                effectiveComponent: correction.effectiveComponent,
                effectivePostingTreatment: correction.effectivePostingTreatment,
                effectiveTaxRole: correction.effectiveTaxRole,
                effectiveAmountCents: correction.effectiveAmountCents,
              })),
            }
          : null,
      });
    } catch (error) {
      if (error instanceof AccountingProviderFinancialReviewPolicyError) {
        throw new ConflictException(
          `${error.message}: ${document.documentStableId}`,
        );
      }
      throw error;
    }
  }
}
