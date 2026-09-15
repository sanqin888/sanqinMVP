import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  AccountingFinancialComponent,
  AccountingFinancialProvider,
} from '@prisma/client';
import { DateTime } from 'luxon';
import {
  ORDER_FINANCIAL_FACTS_READER,
  type OrderFinancialFactsReaderPort,
} from '../orders/public-api';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import { AccountingOperationsService } from './accounting-operations.service';
import { AccountingService } from './accounting.service';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  buildProviderSettlementDocumentPlan,
  buildUberPreCutoverOrderReversalDraft,
  resolveProviderSalesAuthority,
  UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE,
} from './accounting-provider-settlement.policy';

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
  ReturnType<AccountingOperationsService['readProviderSettlementDocuments']>
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

const latestDocuments = (
  rows: ProviderDocumentRow[],
): ProviderDocumentRow[] => {
  const latest = new Map<string, ProviderDocumentRow>();
  for (const row of rows) {
    const key = `${row.provider}|${row.documentType}|${row.businessIdentityKey}`;
    const current = latest.get(key);
    if (!current || row.revision > current.revision) latest.set(key, row);
  }
  return Array.from(latest.values()).sort((left, right) =>
    [left.provider, left.businessIdentityKey, String(left.revision)]
      .join('|')
      .localeCompare(
        [
          right.provider,
          right.businessIdentityKey,
          String(right.revision),
        ].join('|'),
      ),
  );
};

const journalTotals = (
  lines: Array<{ debitCents?: number; creditCents?: number }>,
) =>
  lines.reduce(
    (totals, line) => ({
      debitCents: totals.debitCents + (line.debitCents ?? 0),
      creditCents: totals.creditCents + (line.creditCents ?? 0),
    }),
    { debitCents: 0, creditCents: 0 },
  );

@Injectable()
export class AccountingProviderSettlementPreviewService {
  constructor(
    private readonly operations: AccountingOperationsService,
    private readonly accounting: AccountingService,
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
      (await this.accounting.getAccountingStartDate()) ??
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
    const allDocuments = await this.operations.readProviderSettlementDocuments({
      storeStableId,
      fromInclusive: documentFrom,
      toExclusive: documentTo,
      ...(input.provider ? { provider: input.provider } : {}),
    });
    const documents = latestDocuments(allDocuments);
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
    const coverageRows = await this.operations.readProviderFinancialCoverage({
      storeStableId,
      providers,
    });
    const coverageByProvider = new Map(
      coverageRows.map((row) => [providerKey(row.provider), row] as const),
    );
    const activeAccountIds = new Set(
      await this.operations.readActiveAccountingAccountStableIds(),
    );

    const existingSettlementJournals =
      await this.operations.readSettlementShadowExistingJournals({
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
        journal.sourceFactType === 'accounting.provider_financial_document.v1' &&
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
      const key = `${document.provider}|${document.documentType}|${document.businessIdentityKey}`;
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
              lines: document.lines,
            },
            salesAuthority,
            occurredAt: occurrenceDate,
          })
        : null;
      const identityKey = [
        document.provider,
        document.documentType,
        document.businessIdentityKey,
      ].join('|');
      const revisions = revisionsByBusinessIdentity.get(identityKey) ?? [];
      const priorPostedRevision = revisions
        .filter((revision) => revision.revision < document.revision)
        .find((revision) =>
          existingByDocumentStableId.has(revision.documentStableId),
        );
      const currentPosting = existingByDocumentStableId.get(
        document.documentStableId,
      );
      const missingRequiredAccounts = (
        basePlan?.requiredAccountStableIds ?? []
      ).filter((accountStableId) => !activeAccountIds.has(accountStableId));
      const extraBlocks = [
        ...(!occurrenceDate ? ['MISSING_PERIOD_END'] : []),
        ...(priorPostedRevision ? ['SUPERSEDED_REVISION_ALREADY_POSTED'] : []),
        ...missingRequiredAccounts.map(
          (accountStableId) => `ACCOUNT_NOT_PROVISIONED:${accountStableId}`,
        ),
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
        status,
        blockReasons: Array.from(
          new Set([...(basePlan?.blockReasons ?? []), ...extraBlocks]),
        ).sort(),
        missingRequiredAccounts,
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
      ? await this.operations.readOrderSaleJournalsByFactStableIds(
          preCutoverUberFacts.map((fact) => fact.factStableId),
        )
      : [];
    const existingUberReversals =
      await this.operations.readSettlementShadowExistingJournals({
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
      const coveringStatement = localOrderDate
        ? readyUberStatementCoverage.find(
            (coverage) =>
              coverage.periodStart <= localOrderDate &&
              coverage.periodEnd >= localOrderDate,
          )
        : undefined;
      const status = alreadyReversed
        ? 'ALREADY_REVERSED'
        : coveringStatement
          ? 'READY'
          : 'BLOCKED';
      return {
        originalJournalEntryStableId: journal.entryStableId,
        orderStableId: journal.sourceFactStableId,
        occurredAt: journal.occurredAt.toISOString(),
        status,
        blockReasons:
          status === 'BLOCKED'
            ? ['NO_READY_AUTHORITATIVE_STATEMENT_COVERAGE']
            : [],
        coveredByDocumentStableId: coveringStatement?.documentStableId ?? null,
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
      version: 1 as const,
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
        provider: coverage.provider,
        financialHistoryRequiredFrom: isoDate(
          coverage.financialHistoryRequiredFrom,
        ),
        financialCompleteThrough: isoDate(coverage.financialCompleteThrough),
        liveOrderFactCutoverAt:
          coverage.liveOrderFactCutoverAt?.toISOString() ?? null,
        orderDetailCoverageFrom: isoDate(coverage.orderDetailCoverageFrom),
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
          (sum, plan) => sum + plan.debitCents,
          0,
        ),
        readyProviderCreditCents: readyDocuments.reduce(
          (sum, plan) => sum + plan.creditCents,
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
