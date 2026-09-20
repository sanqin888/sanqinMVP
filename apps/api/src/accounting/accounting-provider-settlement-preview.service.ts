import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from './accounting-contracts';
import { DateTime } from 'luxon';
import {
  ORDER_FINANCIAL_FACTS_READER,
  type OrderFinancialFactsReaderPort,
} from '../orders/public-api';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import { AccountingChartService } from './accounting-chart.service';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';
import { DEFAULT_ACCOUNTING_ACCOUNTS } from './accounting-chart-of-accounts';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  buildProviderSettlementDocumentPlan,
  buildUberPreCutoverOrderReversalDraft,
  PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS,
  resolveProviderSalesAuthority,
  UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE,
} from './accounting-provider-settlement.policy';
import {
  FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
  FANTUAN_ADJUSTMENT_SUPPORTED_RAW_CODES,
} from './accounting-fantuan-adjustment-detail.contract';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PREVIEW_RANGE_DAYS = 370;
const DEFAULT_HISTORY_START_DATE = '2026-06-01';

export type ProviderSettlementShadowPreviewInput = {
  fromDate?: string;
  toDateExclusive: string;
  storeStableId: string;
  provider?: AccountingFinancialProvider;
};

type ProviderDocumentRow = Awaited<
  ReturnType<
    AccountingProviderSettlementQueryService['readProviderSettlementDocuments']
  >
>[number];
type AccountingAccountFact = Awaited<
  ReturnType<AccountingChartService['readAccountingAccountFacts']>
>[number];

const parseLocalDate = (
  raw: string,
  timezone: string,
  field: string,
): DateTime => {
  if (!ISO_DATE.test(raw)) {
    throw new BadRequestException(`${field} must use YYYY-MM-DD`);
  }
  const value = DateTime.fromISO(raw, { zone: timezone }).startOf('day');
  if (!value.isValid || value.toISODate() !== raw) {
    throw new BadRequestException(`Invalid ${field}: ${raw}`);
  }
  return value;
};

const isoDate = (value: Date | null): string | null =>
  value?.toISOString().slice(0, 10) ?? null;

const providerKey = (provider: AccountingFinancialProvider) => provider;
const providerDocumentIdentityKey = (row: ProviderDocumentRow): string =>
  `${row.provider}|${row.documentType}|${row.businessIdentityKey}`;

const latestDocuments = (
  rows: ProviderDocumentRow[],
): ProviderDocumentRow[] => {
  const latest = new Map<string, ProviderDocumentRow>();
  for (const row of rows) {
    const key = providerDocumentIdentityKey(row);
    const current = latest.get(key);
    if (!current || row.revision > current.revision) latest.set(key, row);
  }
  return Array.from(latest.values()).sort((left, right) =>
    [
      left.provider,
      left.documentType,
      left.businessIdentityKey,
      String(left.revision),
    ]
      .join('|')
      .localeCompare(
        [
          right.provider,
          right.documentType,
          right.businessIdentityKey,
          String(right.revision),
        ].join('|'),
      ),
  );
};

const documentOverlapsRange = (
  row: ProviderDocumentRow,
  fromInclusive: Date,
  toExclusive: Date,
): boolean =>
  Boolean(
    row.periodStart &&
    row.periodEnd &&
    row.periodStart < toExclusive &&
    row.periodEnd >= fromInclusive,
  );

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const confirmedReviewEvidence = (document: ProviderDocumentRow) => {
  const review = document.artifact.inboxItem;
  if (
    !review ||
    review.status !== AccountingInboxStatus.CONFIRMED ||
    review.materializedEntityType !==
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT ||
    review.materializedEntityStableId !== document.documentStableId ||
    !review.reviewedAt ||
    !review.reviewedByUserStableId
  ) {
    return null;
  }
  return {
    inboxItemStableId: review.inboxItemStableId,
    status: review.status,
    materializedEntityType: review.materializedEntityType,
    materializedEntityStableId: review.materializedEntityStableId,
    reviewedAt: review.reviewedAt.toISOString(),
    reviewedByUserStableId: review.reviewedByUserStableId,
    version: review.version,
  };
};

const isFantuanAdjustmentDetail = (document: ProviderDocumentRow): boolean =>
  document.provider === AccountingFinancialProvider.FANTUAN &&
  document.documentType === AccountingFinancialDocumentType.OTHER &&
  jsonRecord(document.rawMetadata).evidenceKind ===
    FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND;

type ProviderSettlementSupplementaryEvidence = {
  documentStableId: string;
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  businessIdentityKey: string;
  revision: number;
  providerDocumentRef: string | null;
  storeStableId: string;
  periodStart: string;
  periodEnd: string;
  reviewEvidence: NonNullable<ReturnType<typeof confirmedReviewEvidence>>;
};

const resolveFantuanAdjustmentDetail = (
  statement: ProviderDocumentRow,
  candidateDocuments: ProviderDocumentRow[],
): {
  lines: ProviderDocumentRow['lines'];
  blockReasons: string[];
  supplementaryEvidenceDocuments: ProviderSettlementSupplementaryEvidence[];
} => {
  const summaryAdjustments = statement.lines.filter(
    (line) =>
      line.component === AccountingFinancialComponent.ADJUSTMENT &&
      line.amountCents !== 0,
  );
  if (
    statement.provider !== AccountingFinancialProvider.FANTUAN ||
    statement.documentType !== AccountingFinancialDocumentType.STATEMENT ||
    summaryAdjustments.length === 0
  ) {
    return {
      lines: statement.lines,
      blockReasons: [],
      supplementaryEvidenceDocuments: [],
    };
  }

  const controlLines = statement.lines.map((line) =>
    line.component === AccountingFinancialComponent.ADJUSTMENT
      ? {
          ...line,
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        }
      : line,
  );
  const periodStart = isoDate(statement.periodStart);
  const periodEnd = isoDate(statement.periodEnd);
  if (!periodStart || !periodEnd) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_PERIOD_MISSING'],
      supplementaryEvidenceDocuments: [],
    };
  }

  const details = candidateDocuments.filter(
    (document) =>
      isFantuanAdjustmentDetail(document) &&
      isoDate(document.periodStart) === periodStart &&
      isoDate(document.periodEnd) === periodEnd,
  );
  if (details.length === 0) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_REQUIRED'],
      supplementaryEvidenceDocuments: [],
    };
  }
  if (details.length !== 1) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_AMBIGUOUS'],
      supplementaryEvidenceDocuments: [],
    };
  }

  const detail = details[0];
  const reviewEvidence = confirmedReviewEvidence(detail);
  if (!reviewEvidence || !detail.storeStableId) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_NOT_CONFIRMED'],
      supplementaryEvidenceDocuments: [],
    };
  }

  const unsupportedLines = detail.lines.filter(
    (line) =>
      line.component !== AccountingFinancialComponent.ADJUSTMENT ||
      line.postingTreatment !==
        AccountingFinancialPostingTreatment.CONTROL_TOTAL ||
      !FANTUAN_ADJUSTMENT_SUPPORTED_RAW_CODES.has(line.rawCode ?? ''),
  );
  if (unsupportedLines.length > 0) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_UNSUPPORTED_FEE_TYPE'],
      supplementaryEvidenceDocuments: [],
    };
  }

  const summaryNetCents = summaryAdjustments.reduce(
    (sum, line) => sum + line.amountCents,
    0,
  );
  const detailNetCents = detail.lines.reduce(
    (sum, line) => sum + line.amountCents,
    0,
  );
  if (
    !Number.isSafeInteger(summaryNetCents) ||
    !Number.isSafeInteger(detailNetCents) ||
    summaryNetCents !== detailNetCents
  ) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_NET_MISMATCH'],
      supplementaryEvidenceDocuments: [],
    };
  }

  const detailPostingLines = detail.lines.map((line, index) => ({
    ...line,
    lineNo: statement.lines.length + index + 1,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
  }));
  return {
    lines: [...controlLines, ...detailPostingLines],
    blockReasons: [],
    supplementaryEvidenceDocuments: [
      {
        documentStableId: detail.documentStableId,
        provider: detail.provider,
        documentType: detail.documentType,
        businessIdentityKey: detail.businessIdentityKey,
        revision: detail.revision,
        providerDocumentRef: detail.providerDocumentRef,
        storeStableId: detail.storeStableId,
        periodStart,
        periodEnd,
        reviewEvidence,
      },
    ],
  };
};

type ProviderSettlementAccountRequirement = {
  accountClass: AccountingAccountFact['accountClass'];
  currency: string;
  isActive: boolean;
};

const ACCOUNT_REQUIREMENTS: Readonly<
  Record<string, ProviderSettlementAccountRequirement>
> = PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS;

const SYSTEM_ACCOUNT_REQUIREMENTS: Readonly<
  Record<string, ProviderSettlementAccountRequirement>
> = Object.fromEntries(
  DEFAULT_ACCOUNTING_ACCOUNTS.map((account) => [
    account.accountStableId,
    {
      accountClass: account.accountClass,
      currency: 'CAD',
      isActive: true,
    },
  ]),
);

const journalTotals = (
  lines: Array<{ debitCents?: number; creditCents?: number }>,
): { debitCents: number; creditCents: number } =>
  lines.reduce<{ debitCents: number; creditCents: number }>(
    (totals, line) => ({
      debitCents: totals.debitCents + (line.debitCents ?? 0),
      creditCents: totals.creditCents + (line.creditCents ?? 0),
    }),
    { debitCents: 0, creditCents: 0 },
  );

@Injectable()
export class AccountingProviderSettlementPreviewService {
  constructor(
    private readonly settlementQuery: AccountingProviderSettlementQueryService,
    private readonly chart: AccountingChartService,
    private readonly period: AccountingPeriodService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
    @Inject(ORDER_FINANCIAL_FACTS_READER)
    private readonly orderFinancialFacts: OrderFinancialFactsReaderPort,
  ) {}

  async previewRange(input: ProviderSettlementShadowPreviewInput) {
    const storeStableId = input.storeStableId.trim();
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }
    const store = await this.storeConfig.getStoreSnapshot(storeStableId);
    const timezone = store.timezone.trim() || 'America/Toronto';
    const accountingStartDate =
      (await this.period.getAccountingStartDate()) ??
      DEFAULT_HISTORY_START_DATE;
    const requestedFrom = input.fromDate ?? accountingStartDate;
    const effectiveFrom =
      requestedFrom < accountingStartDate ? accountingStartDate : requestedFrom;
    const fromLocal = parseLocalDate(effectiveFrom, timezone, 'fromDate');
    const toLocal = parseLocalDate(
      input.toDateExclusive,
      timezone,
      'toDateExclusive',
    );
    if (toLocal.toMillis() <= fromLocal.toMillis()) {
      throw new BadRequestException('toDateExclusive must be after fromDate');
    }
    if (toLocal.diff(fromLocal, 'days').days > MAX_PREVIEW_RANGE_DAYS) {
      throw new BadRequestException(
        `provider settlement preview range cannot exceed ${MAX_PREVIEW_RANGE_DAYS} days`,
      );
    }

    const documentFrom = DateTime.fromISO(effectiveFrom, { zone: 'UTC' })
      .startOf('day')
      .toJSDate();
    const documentTo = DateTime.fromISO(input.toDateExclusive, { zone: 'UTC' })
      .startOf('day')
      .toJSDate();
    const allDocuments =
      await this.settlementQuery.readProviderSettlementDocuments({
        storeStableId,
        ...(input.provider ? { provider: input.provider } : {}),
      });
    const candidateIdentityKeys = new Set(
      allDocuments
        .filter((document) =>
          documentOverlapsRange(document, documentFrom, documentTo),
        )
        .map(providerDocumentIdentityKey),
    );
    const documents = latestDocuments(allDocuments).filter((document) =>
      candidateIdentityKeys.has(providerDocumentIdentityKey(document)),
    );
    const includeUber =
      !input.provider ||
      input.provider === AccountingFinancialProvider.UBER_EATS;
    const providers = Array.from(
      new Set([
        ...documents.map((document) => document.provider),
        ...(input.provider ? [input.provider] : []),
        ...(includeUber ? [AccountingFinancialProvider.UBER_EATS] : []),
      ]),
    ).sort();
    const coverageRows =
      await this.settlementQuery.readProviderFinancialCoverage({
        storeStableId,
        providers,
      });
    const coverageByProvider = new Map(
      coverageRows.map((row) => [providerKey(row.provider), row] as const),
    );
    const accountFactsByStableId = new Map<string, AccountingAccountFact>(
      (await this.chart.readAccountingAccountFacts()).map((account) => [
        account.accountStableId,
        account,
      ]),
    );

    const existingSettlementJournals =
      await this.settlementQuery.readSettlementShadowExistingJournals({
        providerDocumentStableIds: allDocuments.map(
          (document) => document.documentStableId,
        ),
        uberOrderEntryStableIds: [],
      });
    const existingByDocumentStableId = new Map<
      string,
      (typeof existingSettlementJournals)[number]
    >();
    for (const journal of existingSettlementJournals) {
      if (
        journal.sourceFactType ===
          'accounting.provider_financial_document.v1' &&
        journal.sourceFactStableId
      ) {
        existingByDocumentStableId.set(journal.sourceFactStableId, journal);
      }
    }
    const revisionsByBusinessIdentity = new Map<
      string,
      ProviderDocumentRow[]
    >();
    for (const document of allDocuments) {
      const key = providerDocumentIdentityKey(document);
      revisionsByBusinessIdentity.set(key, [
        ...(revisionsByBusinessIdentity.get(key) ?? []),
        document,
      ]);
    }

    const documentPlans = documents.map((document) => {
      const coverage =
        coverageByProvider.get(providerKey(document.provider)) ?? null;
      const periodStart = isoDate(document.periodStart);
      const periodEnd = isoDate(document.periodEnd);
      const salesAuthority = resolveProviderSalesAuthority({
        provider: document.provider,
        documentType: document.documentType,
        periodStart,
        periodEnd,
        liveOrderFactCutoverAt: coverage?.liveOrderFactCutoverAt ?? null,
        timezone,
      });
      const occurrenceDate = document.periodEnd
        ? DateTime.fromISO(document.periodEnd.toISOString().slice(0, 10), {
            zone: timezone,
          })
            .endOf('day')
            .toUTC()
            .toJSDate()
        : null;
      const fantuanAdjustmentResolution = resolveFantuanAdjustmentDetail(
        document,
        documents,
      );
      const basePlan = occurrenceDate
        ? buildProviderSettlementDocumentPlan({
            document: {
              documentStableId: document.documentStableId,
              revision: document.revision,
              provider: document.provider,
              documentType: document.documentType,
              storeStableId: document.storeStableId,
              periodStart,
              periodEnd,
              currency: document.currency,
              lines: fantuanAdjustmentResolution.lines,
            },
            salesAuthority,
            occurredAt: occurrenceDate,
          })
        : null;
      const identityKey = providerDocumentIdentityKey(document);
      const revisions = revisionsByBusinessIdentity.get(identityKey) ?? [];
      const priorPostedRevision = revisions
        .filter((revision) => revision.revision < document.revision)
        .find((revision) =>
          existingByDocumentStableId.has(revision.documentStableId),
        );
      const currentPosting = existingByDocumentStableId.get(
        document.documentStableId,
      );
      const supplementaryEvidenceDocuments =
        fantuanAdjustmentResolution.supplementaryEvidenceDocuments;
      const review = document.artifact.inboxItem;
      const reviewEvidence = review
        ? {
            inboxItemStableId: review.inboxItemStableId,
            status: review.status,
            materializedEntityType: review.materializedEntityType,
            materializedEntityStableId: review.materializedEntityStableId,
            reviewedAt: review.reviewedAt?.toISOString() ?? null,
            reviewedByUserStableId: review.reviewedByUserStableId,
            version: review.version,
          }
        : null;
      const reviewLinkMatches = Boolean(
        review &&
        review.materializedEntityType ===
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT &&
        review.materializedEntityStableId === document.documentStableId,
      );
      const reviewBlocks = !review
        ? ['PROVIDER_DOCUMENT_REVIEW_EVIDENCE_MISSING']
        : !reviewLinkMatches
          ? ['PROVIDER_DOCUMENT_REVIEW_LINK_MISMATCH']
          : review.status !== AccountingInboxStatus.CONFIRMED
            ? ['PROVIDER_DOCUMENT_NOT_CONFIRMED']
            : !review.reviewedAt || !review.reviewedByUserStableId
              ? ['PROVIDER_DOCUMENT_REVIEW_EVIDENCE_INCOMPLETE']
              : [];
      const accountPrerequisites = (
        basePlan?.requiredAccountStableIds ?? []
      ).map((accountStableId) => {
        const expected = ACCOUNT_REQUIREMENTS[accountStableId] ?? null;
        const actual = accountFactsByStableId.get(accountStableId) ?? null;
        const classMismatch =
          expected !== null &&
          actual !== null &&
          actual.accountClass !== expected.accountClass;
        const blockReasons = [
          ...(!expected
            ? [`ACCOUNT_POLICY_NOT_DEFINED:${accountStableId}`]
            : []),
          ...(!actual ? [`ACCOUNT_NOT_PROVISIONED:${accountStableId}`] : []),
          ...(classMismatch
            ? [`ACCOUNT_CLASS_MISMATCH:${accountStableId}`]
            : []),
          ...(expected && actual && actual.currency !== expected.currency
            ? [`ACCOUNT_CURRENCY_MISMATCH:${accountStableId}`]
            : []),
          ...(expected && actual && actual.isActive !== expected.isActive
            ? [`ACCOUNT_ACTIVE_STATE_MISMATCH:${accountStableId}`]
            : []),
        ];
        return {
          accountStableId,
          expected,
          actual: actual
            ? {
                accountClass: actual.accountClass,
                currency: actual.currency,
                isActive: actual.isActive,
              }
            : null,
          status: blockReasons.length > 0 ? 'BLOCKED' : 'READY',
          blockReasons,
        };
      });
      const missingRequiredAccounts = accountPrerequisites
        .filter((account) => account.actual === null)
        .map((account) => account.accountStableId);
      const invalidRequiredAccounts = accountPrerequisites
        .filter(
          (account) => account.actual !== null && account.status === 'BLOCKED',
        )
        .map((account) => account.accountStableId);
      const latestRevisionInRequestedRange = documentOverlapsRange(
        document,
        documentFrom,
        documentTo,
      );
      const requiresMutationAuthority = basePlan?.status === 'READY';
      const extraBlocks = [
        ...(!occurrenceDate ? ['MISSING_PERIOD_END'] : []),
        ...(!latestRevisionInRequestedRange
          ? ['LATEST_REVISION_OUTSIDE_REQUESTED_RANGE']
          : []),
        ...(requiresMutationAuthority && !coverage
          ? ['PROVIDER_FINANCIAL_COVERAGE_NOT_PROVISIONED']
          : []),
        ...(requiresMutationAuthority ? reviewBlocks : []),
        ...(priorPostedRevision ? ['SUPERSEDED_REVISION_ALREADY_POSTED'] : []),
        ...fantuanAdjustmentResolution.blockReasons,
        ...accountPrerequisites.flatMap((account) => account.blockReasons),
      ];
      const status = currentPosting
        ? 'ALREADY_POSTED'
        : extraBlocks.length > 0 || basePlan?.status === 'BLOCKED'
          ? 'BLOCKED'
          : (basePlan?.status ?? 'BLOCKED');
      return {
        documentStableId: document.documentStableId,
        provider: document.provider,
        documentType: document.documentType,
        businessIdentityKey: document.businessIdentityKey,
        revision: document.revision,
        providerDocumentRef: document.providerDocumentRef,
        periodStart,
        periodEnd,
        currency: document.currency,
        salesAuthority,
        latestRevisionInRequestedRange,
        ...(supplementaryEvidenceDocuments.length > 0
          ? { supplementaryEvidenceDocuments }
          : {}),
        reviewEvidence,
        coverageEvidence: coverage
          ? {
              coverageStableId: coverage.coverageStableId,
              financialHistoryRequiredFrom: isoDate(
                coverage.financialHistoryRequiredFrom,
              ),
              financialCompleteThrough: isoDate(
                coverage.financialCompleteThrough,
              ),
              liveOrderFactCutoverAt:
                coverage.liveOrderFactCutoverAt?.toISOString() ?? null,
              orderDetailCoverageFrom: isoDate(
                coverage.orderDetailCoverageFrom,
              ),
              updatedAt: coverage.updatedAt.toISOString(),
            }
          : null,
        status,
        blockReasons: Array.from(
          new Set([...(basePlan?.blockReasons ?? []), ...extraBlocks]),
        ).sort(),
        accountPrerequisites,
        missingRequiredAccounts,
        invalidRequiredAccounts,
        existingJournalEntryStableId: currentPosting?.entryStableId ?? null,
        priorPostedRevision: priorPostedRevision?.revision ?? null,
        decisions: basePlan?.decisions ?? [],
        draftJournal:
          status === 'READY' ? (basePlan?.draftJournal ?? null) : null,
        debitCents: status === 'READY' ? (basePlan?.debitCents ?? 0) : 0,
        creditCents: status === 'READY' ? (basePlan?.creditCents ?? 0) : 0,
      };
    });

    const readyUberStatementCoverage = documentPlans.flatMap((plan) => {
      if (
        plan.provider !== AccountingFinancialProvider.UBER_EATS ||
        plan.status !== 'READY' ||
        plan.salesAuthority !== 'STATEMENT_AUTHORITATIVE' ||
        !plan.periodStart ||
        !plan.periodEnd ||
        !plan.decisions.some(
          (line) =>
            line.component === AccountingFinancialComponent.SALES &&
            line.disposition === 'POSTABLE',
        )
      ) {
        return [];
      }
      return [
        {
          documentStableId: plan.documentStableId,
          periodStart: plan.periodStart,
          periodEnd: plan.periodEnd,
        },
      ];
    });

    const uberCoverage = coverageByProvider.get(
      providerKey(AccountingFinancialProvider.UBER_EATS),
    );
    const orderFacts = includeUber
      ? await this.orderFinancialFacts.readFactsForRange({
          fromInclusive: fromLocal.toUTC().toJSDate(),
          toExclusive: toLocal.toUTC().toJSDate(),
          storeStableId,
        })
      : [];
    const preCutoverUberFacts = orderFacts.filter(
      (fact) =>
        fact.channel === 'ubereats' &&
        fact.paymentMethod === 'UBEREATS' &&
        (!uberCoverage?.liveOrderFactCutoverAt ||
          fact.occurredAt < uberCoverage.liveOrderFactCutoverAt),
    );
    const orderSaleJournals = includeUber
      ? await this.settlementQuery.readOrderSaleJournalsByFactStableIds(
          preCutoverUberFacts.map((fact) => fact.factStableId),
        )
      : [];
    const existingUberReversals =
      await this.settlementQuery.readSettlementShadowExistingJournals({
        providerDocumentStableIds: [],
        uberOrderEntryStableIds: orderSaleJournals.map(
          (journal) => journal.entryStableId,
        ),
      });
    const reversedEntryStableIds = new Set(
      existingUberReversals.flatMap((journal) =>
        journal.sourceFactType === UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE &&
        journal.sourceFactStableId
          ? [journal.sourceFactStableId]
          : [],
      ),
    );
    const uberOrderReversalPlans = orderSaleJournals.map((journal) => {
      const draft = buildUberPreCutoverOrderReversalDraft({
        entryStableId: journal.entryStableId,
        storeStableId: journal.storeStableId,
        occurredAt: journal.occurredAt,
        currency: journal.currency,
        lines: journal.lines.map((line) => ({
          accountStableId: line.account.accountStableId,
          categoryStableId: line.category?.categoryStableId ?? null,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          memo: line.memo,
        })),
      });
      const totals = journalTotals(draft.lines);
      const alreadyReversed = reversedEntryStableIds.has(journal.entryStableId);
      const localOrderDate = DateTime.fromJSDate(journal.occurredAt, {
        zone: timezone,
      }).toISODate();
      const coveringStatements = localOrderDate
        ? readyUberStatementCoverage.filter(
            (coverage) =>
              coverage.periodStart <= localOrderDate &&
              coverage.periodEnd >= localOrderDate,
          )
        : [];
      const coveringDocumentStableIds = coveringStatements
        .map((coverage) => coverage.documentStableId)
        .sort();
      const uniquelyCovered = coveringStatements.length === 1;
      const accountPrerequisites = Array.from(
        new Set(draft.lines.map((line) => line.accountStableId)),
      )
        .sort()
        .map((accountStableId) => {
          const expected = SYSTEM_ACCOUNT_REQUIREMENTS[accountStableId] ?? null;
          const actual = accountFactsByStableId.get(accountStableId) ?? null;
          const blockReasons = [
            ...(!expected
              ? [`ACCOUNT_POLICY_NOT_DEFINED:${accountStableId}`]
              : []),
            ...(!actual ? [`ACCOUNT_NOT_PROVISIONED:${accountStableId}`] : []),
            ...(expected &&
            actual &&
            actual.accountClass !== expected.accountClass
              ? [`ACCOUNT_CLASS_MISMATCH:${accountStableId}`]
              : []),
            ...(expected && actual && actual.currency !== expected.currency
              ? [`ACCOUNT_CURRENCY_MISMATCH:${accountStableId}`]
              : []),
            ...(expected && actual && actual.isActive !== expected.isActive
              ? [`ACCOUNT_ACTIVE_STATE_MISMATCH:${accountStableId}`]
              : []),
          ];
          return {
            accountStableId,
            expected,
            actual: actual
              ? {
                  accountClass: actual.accountClass,
                  currency: actual.currency,
                  isActive: actual.isActive,
                }
              : null,
            status: blockReasons.length > 0 ? 'BLOCKED' : 'READY',
            blockReasons,
          };
        });
      const accountBlockReasons = accountPrerequisites.flatMap(
        (account) => account.blockReasons,
      );
      const status = alreadyReversed
        ? 'ALREADY_REVERSED'
        : uberCoverage && uniquelyCovered && accountBlockReasons.length === 0
          ? 'READY'
          : 'BLOCKED';
      const coverageBlockReasons = !uberCoverage
        ? ['PROVIDER_FINANCIAL_COVERAGE_NOT_PROVISIONED']
        : coveringStatements.length > 1
          ? ['AMBIGUOUS_AUTHORITATIVE_STATEMENT_COVERAGE']
          : coveringStatements.length === 0
            ? ['NO_READY_AUTHORITATIVE_STATEMENT_COVERAGE']
            : [];
      const blockReasons =
        status === 'BLOCKED'
          ? Array.from(
              new Set([...coverageBlockReasons, ...accountBlockReasons]),
            ).sort()
          : [];
      return {
        originalJournalEntryStableId: journal.entryStableId,
        originalJournalAnchor: {
          idempotencyKey: journal.idempotencyKey,
          idempotencyHash: journal.idempotencyHash,
          version: journal.version,
          sourceFactStableId: journal.sourceFactStableId,
        },
        orderStableId: journal.sourceFactStableId,
        occurredAt: journal.occurredAt.toISOString(),
        status,
        blockReasons,
        accountPrerequisites,
        coveringDocumentStableIds,
        coveredByDocumentStableId: uniquelyCovered
          ? (coveringStatements[0]?.documentStableId ?? null)
          : null,
        draftJournal: status === 'READY' ? draft : null,
        debitCents: status === 'READY' ? totals.debitCents : 0,
        creditCents: status === 'READY' ? totals.creditCents : 0,
      };
    });

    const readyDocuments = documentPlans.filter(
      (plan) => plan.status === 'READY',
    );
    const blockedDocuments = documentPlans.filter(
      (plan) => plan.status === 'BLOCKED',
    );
    const readyReversals = uberOrderReversalPlans.filter(
      (plan) => plan.status === 'READY',
    );
    const blockedReversals = uberOrderReversalPlans.filter(
      (plan) => plan.status === 'BLOCKED',
    );
    const reportWithoutHash = {
      version: 3 as const,
      range: {
        timezone,
        accountingStartDate,
        fromDate: effectiveFrom,
        toDateExclusive: input.toDateExclusive,
        fromInclusive: fromLocal.toUTC().toISO(),
        toExclusive: toLocal.toUTC().toISO(),
        storeStableId,
        provider: input.provider ?? null,
      },
      policy: {
        historicalProviderFinancialStartDate: DEFAULT_HISTORY_START_DATE,
        preLiveUberOrderAuthority: 'STATEMENT_ONLY',
        postLiveUberOrderAuthority: 'CANONICAL_ORDER_FACTS',
        tipTreatment: 'NON_TAXABLE_STORE_REVENUE',
        tipAccountStableId: 'account_tip_revenue',
        providerSubsidyTreatment: 'CONTRA_PROMOTION_EXPENSE',
        unknownComponentTreatment: 'BLOCKED',
        payoutTreatment: 'CONTROL_ONLY_IN_6B',
      },
      coverage: coverageRows.map((coverage) => ({
        coverageStableId: coverage.coverageStableId,
        provider: coverage.provider,
        financialHistoryRequiredFrom: isoDate(
          coverage.financialHistoryRequiredFrom,
        ),
        financialCompleteThrough: isoDate(coverage.financialCompleteThrough),
        liveOrderFactCutoverAt:
          coverage.liveOrderFactCutoverAt?.toISOString() ?? null,
        orderDetailCoverageFrom: isoDate(coverage.orderDetailCoverageFrom),
        updatedAt: coverage.updatedAt.toISOString(),
      })),
      counts: {
        providerDocuments: documentPlans.length,
        readyProviderDocuments: readyDocuments.length,
        blockedProviderDocuments: blockedDocuments.length,
        preCutoverUberOrderFacts: preCutoverUberFacts.length,
        preCutoverUberSaleJournals: orderSaleJournals.length,
        readyUberOrderReversals: readyReversals.length,
        blockedUberOrderReversals: blockedReversals.length,
      },
      amounts: {
        readyProviderDebitCents: readyDocuments.reduce(
          (sum, plan) => sum + (plan.debitCents ?? 0),
          0,
        ),
        readyProviderCreditCents: readyDocuments.reduce(
          (sum, plan) => sum + (plan.creditCents ?? 0),
          0,
        ),
        readyUberReversalDebitCents: readyReversals.reduce(
          (sum, plan) => sum + plan.debitCents,
          0,
        ),
        readyUberReversalCreditCents: readyReversals.reduce(
          (sum, plan) => sum + plan.creditCents,
          0,
        ),
      },
      providerDocuments: documentPlans,
      uberPreCutoverOrderReversals: uberOrderReversalPlans,
    };

    return {
      ...reportWithoutHash,
      planHash: hashAccountingJson(reportWithoutHash),
    };
  }
}
