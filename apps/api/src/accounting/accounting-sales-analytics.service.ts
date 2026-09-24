import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import {
  ORDER_SALES_ATTRIBUTION_READER,
  type OrderSalesAttributionReaderPort,
  type OrderSalesAttributionV1,
} from '../orders/public-api';
import {
  AccountingFinancialProvider,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';
import type {
  AccountingSalesAnalyticsChannelV1,
  AccountingSalesAnalyticsCoverageRowV1,
  AccountingSalesAnalyticsDimensionRowV1,
  AccountingSalesAnalyticsPrimaryPaymentMethodV1,
  AccountingSalesAnalyticsReportV1,
  AccountingSalesAnalyticsSourceBucketV1,
} from './accounting-sales-analytics.contract';
import {
  ACCOUNTING_SALES_SOURCE_FACT_TYPES,
  type AccountingSalesAttributionQualityV1,
  type AccountingSalesComponentAmountV1,
  type AccountingSalesProviderCoverageStatusV1,
  type AccountingSalesSummaryV1,
  type AccountingSalesTenderBucketV1,
  isAccountingSalesSourceFactType,
  projectAccountingSalesComponentLine,
  projectAccountingSalesTenderLine,
  resolveAccountingSalesAttributionQuality,
  resolveAccountingSalesProviderCoverage,
  summarizeAccountingSalesComponents,
} from './accounting-sales-analytics.policy';

const MAX_REPORT_DAYS = 370;

const ZERO_SUMMARY = (): AccountingSalesSummaryV1 =>
  summarizeAccountingSalesComponents([]);

type JournalRow = {
  entryStableId: string;
  source: string;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  storeStableId: string | null;
  occurredAt: Date;
  lines: Array<{
    debitCents: number;
    creditCents: number;
    account: { accountStableId: string };
  }>;
};

type JournalAttribution = {
  channel: AccountingSalesAnalyticsChannelV1;
  primaryPaymentMethod: AccountingSalesAnalyticsPrimaryPaymentMethodV1;
  quality: AccountingSalesAttributionQualityV1 | null;
};

const expectedJournalSource = (sourceFactType: string): string | null => {
  if (
    sourceFactType === 'order.financial_sale.v1' ||
    sourceFactType === 'order.financial_adjustment.v1' ||
    sourceFactType === 'order.financial_reversal.v1'
  ) {
    return AccountingJournalSource.ORDER;
  }
  if (sourceFactType === 'accounting.provider_financial_document.v1') {
    return AccountingJournalSource.PLATFORM_STATEMENT;
  }
  if (sourceFactType === 'accounting.uber_pre_cutover_order_reversal.v1') {
    return AccountingJournalSource.SYSTEM;
  }
  return null;
};

const sourceBucket = (
  sourceFactType: string,
): AccountingSalesAnalyticsSourceBucketV1 => {
  if (sourceFactType === 'order.financial_sale.v1') return 'ORDER_SALE';
  if (
    sourceFactType === 'order.financial_adjustment.v1' ||
    sourceFactType === 'order.financial_reversal.v1'
  ) {
    return 'ORDER_CHANGE';
  }
  if (sourceFactType === 'accounting.provider_financial_document.v1') {
    return 'PROVIDER_STATEMENT';
  }
  return 'HISTORICAL_REPLACEMENT_REVERSAL';
};

const providerAttribution = (
  provider: AccountingFinancialProvider,
): JournalAttribution => {
  switch (provider) {
    case AccountingFinancialProvider.UBER_EATS:
      return {
        channel: 'ubereats',
        primaryPaymentMethod: 'UBEREATS',
        quality: null,
      };
    case AccountingFinancialProvider.FANTUAN:
      return {
        channel: 'fantuan',
        primaryPaymentMethod: 'FANTUAN',
        quality: null,
      };
    case AccountingFinancialProvider.CLOVER:
      return {
        channel: 'UNATTRIBUTED_PROVIDER',
        primaryPaymentMethod: 'CARD',
        quality: null,
      };
    default:
      throw new ConflictException(
        `Unsupported Accounting financial provider: ${String(provider)}`,
      );
  }
};

const addSummary = (
  target: AccountingSalesSummaryV1,
  source: AccountingSalesSummaryV1,
): void => {
  for (const key of Object.keys(target) as Array<
    keyof AccountingSalesSummaryV1
  >) {
    target[key] += source[key];
  }
};

const buildComponents = (
  journal: Pick<JournalRow, 'lines'>,
): AccountingSalesComponentAmountV1[] =>
  journal.lines.flatMap((line) => {
    const projected = projectAccountingSalesComponentLine({
      accountStableId: line.account.accountStableId,
      debitCents: line.debitCents,
      creditCents: line.creditCents,
    });
    return projected ? [projected] : [];
  });

@Injectable()
export class AccountingSalesAnalyticsService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
    private readonly settlementQuery: AccountingProviderSettlementQueryService,
    @Inject(ORDER_SALES_ATTRIBUTION_READER)
    private readonly orderAttribution: OrderSalesAttributionReaderPort,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  async report(query: {
    from?: string;
    to?: string;
  }): Promise<AccountingSalesAnalyticsReportV1> {
    const store = await this.storeConfig.getConfiguredStoreSnapshot();
    const timezone = store.timezone.trim() || 'America/Toronto';
    const range = await this.resolveRange(query, timezone);
    const journals = await this.readSalesJournals({
      storeStableId: store.storeStableId,
      fromInclusive: range.fromInclusive,
      toExclusive: range.toExclusive,
    });

    this.assertJournalAuthority(journals);

    const providerDocumentIds = journals.flatMap((journal) =>
      journal.sourceFactType === 'accounting.provider_financial_document.v1' &&
      journal.sourceFactStableId
        ? [journal.sourceFactStableId]
        : [],
    );
    const providerDocuments =
      providerDocumentIds.length === 0
        ? []
        : await this.prisma.accountingProviderFinancialDocument.findMany({
            where: { documentStableId: { in: providerDocumentIds } },
            select: { documentStableId: true, provider: true },
          });
    const providerByDocument = new Map(
      providerDocuments.map((document) => [
        document.documentStableId,
        document.provider,
      ]),
    );
    const distinctProviderDocumentIds = new Set(providerDocumentIds);
    if (providerByDocument.size !== distinctProviderDocumentIds.size) {
      throw new ConflictException(
        'Canonical Sales provider Journal references a missing provider document',
      );
    }

    const historicalReversalOriginalEntryIds = journals.flatMap((journal) =>
      journal.sourceFactType ===
        'accounting.uber_pre_cutover_order_reversal.v1' &&
      journal.sourceFactStableId
        ? [journal.sourceFactStableId]
        : [],
    );
    const originalJournals =
      historicalReversalOriginalEntryIds.length === 0
        ? []
        : await this.prisma.accountingJournalEntry.findMany({
            where: {
              entryStableId: { in: historicalReversalOriginalEntryIds },
              deletedAt: null,
            },
            select: {
              entryStableId: true,
              source: true,
              sourceFactType: true,
              sourceFactStableId: true,
            },
          });
    const originalJournalByEntry = new Map(
      originalJournals.map((journal) => [journal.entryStableId, journal]),
    );
    const distinctOriginalEntryIds = new Set(
      historicalReversalOriginalEntryIds,
    );
    if (originalJournalByEntry.size !== distinctOriginalEntryIds.size) {
      throw new ConflictException(
        'Canonical Uber replacement reversal references a missing original Journal',
      );
    }
    for (const entryStableId of distinctOriginalEntryIds) {
      const original = originalJournalByEntry.get(entryStableId);
      if (
        original?.source !== AccountingJournalSource.ORDER ||
        original.sourceFactType !== 'order.financial_sale.v1' ||
        !original.sourceFactStableId
      ) {
        throw new ConflictException(
          `Canonical Uber replacement reversal original Journal authority mismatch: ${entryStableId}`,
        );
      }
    }

    const directOrderSourceIds = journals.flatMap((journal) =>
      journal.sourceFactType?.startsWith('order.financial_') &&
      journal.sourceFactStableId
        ? [journal.sourceFactStableId]
        : [],
    );
    const historicalOrderSourceIds = historicalReversalOriginalEntryIds.flatMap(
      (entryStableId) => {
        const original = originalJournalByEntry.get(entryStableId);
        if (
          original?.source === AccountingJournalSource.ORDER &&
          original.sourceFactType === 'order.financial_sale.v1' &&
          original.sourceFactStableId
        ) {
          return [original.sourceFactStableId];
        }
        return [];
      },
    );
    const requestedAttributionIds = Array.from(
      new Set([...directOrderSourceIds, ...historicalOrderSourceIds]),
    );
    const attributionRows =
      await this.orderAttribution.readBySourceFactStableIds(
        requestedAttributionIds,
      );
    const attributionBySourceFactStableId = new Map(
      attributionRows.map((row) => [row.sourceFactStableId, row]),
    );

    const overallComponents: AccountingSalesComponentAmountV1[] = [];
    const channelRows = new Map<
      AccountingSalesAnalyticsChannelV1,
      AccountingSalesAnalyticsDimensionRowV1<AccountingSalesAnalyticsChannelV1>
    >();
    const paymentRows = new Map<
      AccountingSalesAnalyticsPrimaryPaymentMethodV1,
      AccountingSalesAnalyticsDimensionRowV1<AccountingSalesAnalyticsPrimaryPaymentMethodV1>
    >();
    const sourceRows = new Map<
      AccountingSalesAnalyticsSourceBucketV1,
      AccountingSalesAnalyticsDimensionRowV1<AccountingSalesAnalyticsSourceBucketV1>
    >();
    const dailyRows = new Map<
      string,
      {
        date: string;
        journalEntryCount: number;
        summary: AccountingSalesSummaryV1;
      }
    >();
    const tenderTotals = new Map<AccountingSalesTenderBucketV1, number>();

    let immutableOrderAttributedJournalEntries = 0;
    let legacyOrderAttributedJournalEntries = 0;
    let missingOrderAttributedJournalEntries = 0;

    for (const journal of journals) {
      const sourceFactType = journal.sourceFactType;
      if (!sourceFactType || !isAccountingSalesSourceFactType(sourceFactType)) {
        throw new ConflictException(
          `Unexpected Sales Journal source fact type: ${String(sourceFactType)}`,
        );
      }
      const components = buildComponents(journal);
      overallComponents.push(...components);
      const summary = summarizeAccountingSalesComponents(components);
      const attribution = this.resolveJournalAttribution({
        journal,
        providerByDocument,
        originalJournalByEntry,
        attributionBySourceFactStableId,
      });
      if (attribution.quality === 'IMMUTABLE') {
        immutableOrderAttributedJournalEntries += 1;
      }
      if (attribution.quality === 'LEGACY_CURRENT_ORDER') {
        legacyOrderAttributedJournalEntries += 1;
      }
      if (attribution.quality === 'MISSING') {
        missingOrderAttributedJournalEntries += 1;
      }

      this.addDimensionRow(channelRows, attribution.channel, summary);
      this.addDimensionRow(
        paymentRows,
        attribution.primaryPaymentMethod,
        summary,
      );
      this.addDimensionRow(sourceRows, sourceBucket(sourceFactType), summary);

      const localDate = DateTime.fromJSDate(journal.occurredAt, {
        zone: timezone,
      }).toISODate();
      if (!localDate) {
        throw new ConflictException(
          `Cannot bucket Sales Journal date: ${journal.entryStableId}`,
        );
      }
      const daily = dailyRows.get(localDate) ?? {
        date: localDate,
        journalEntryCount: 0,
        summary: ZERO_SUMMARY(),
      };
      daily.journalEntryCount += 1;
      addSummary(daily.summary, summary);
      dailyRows.set(localDate, daily);

      for (const line of journal.lines) {
        const tender = projectAccountingSalesTenderLine({
          accountStableId: line.account.accountStableId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
        });
        if (!tender) continue;
        tenderTotals.set(
          tender.tender,
          (tenderTotals.get(tender.tender) ?? 0) + tender.amountCents,
        );
      }
    }

    const coverage = await this.buildCoverage({
      storeStableId: store.storeStableId,
      from: range.from,
      to: range.to,
      providerDocuments,
      channelRows,
      paymentRows,
      tenderTotals,
    });

    return {
      version: 1,
      storeStableId: store.storeStableId,
      timezone,
      accountingStartDate: range.accountingStartDate,
      from: range.from,
      to: range.to,
      summary: summarizeAccountingSalesComponents(overallComponents),
      daily: Array.from(dailyRows.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      byChannel: Array.from(channelRows.values()).sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
      byPrimaryPaymentMethod: Array.from(paymentRows.values()).sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
      tenderMix: Array.from(tenderTotals.entries())
        .filter(([, amountCents]) => amountCents !== 0)
        .map(([tender, amountCents]) => ({ tender, amountCents }))
        .sort((a, b) => a.tender.localeCompare(b.tender)),
      bySource: Array.from(sourceRows.values()).sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
      attribution: {
        immutableOrderAttributedJournalEntries,
        legacyOrderAttributedJournalEntries,
        missingOrderAttributedJournalEntries,
        worstQuality:
          immutableOrderAttributedJournalEntries +
            legacyOrderAttributedJournalEntries +
            missingOrderAttributedJournalEntries ===
          0
            ? null
            : missingOrderAttributedJournalEntries > 0
              ? 'MISSING'
              : legacyOrderAttributedJournalEntries > 0
                ? 'LEGACY_CURRENT_ORDER'
                : 'IMMUTABLE',
      },
      providerCoverage: coverage,
      journalEntryCount: journals.length,
    };
  }

  private async readSalesJournals(params: {
    storeStableId: string;
    fromInclusive: Date;
    toExclusive: Date;
  }) {
    return this.prisma.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        storeStableId: params.storeStableId,
        sourceFactType: { in: [...ACCOUNTING_SALES_SOURCE_FACT_TYPES] },
        occurredAt: {
          gte: params.fromInclusive,
          lt: params.toExclusive,
        },
      },
      select: {
        entryStableId: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        storeStableId: true,
        occurredAt: true,
        lines: {
          select: {
            debitCents: true,
            creditCents: true,
            account: { select: { accountStableId: true } },
          },
          orderBy: { lineNo: 'asc' },
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { entryStableId: 'asc' }],
    });
  }

  private assertJournalAuthority(journals: JournalRow[]): void {
    for (const journal of journals) {
      if (!journal.sourceFactType || !journal.sourceFactStableId) {
        throw new ConflictException(
          `Sales Journal is missing canonical source identity: ${journal.entryStableId}`,
        );
      }
      const expected = expectedJournalSource(journal.sourceFactType);
      if (!expected || journal.source !== expected) {
        throw new ConflictException(
          `Sales Journal source authority mismatch: ${journal.entryStableId}`,
        );
      }
    }
  }

  private resolveJournalAttribution(params: {
    journal: JournalRow;
    providerByDocument: Map<string, AccountingFinancialProvider>;
    originalJournalByEntry: Map<
      string,
      {
        entryStableId: string;
        source: string;
        sourceFactType: string | null;
        sourceFactStableId: string | null;
      }
    >;
    attributionBySourceFactStableId: Map<string, OrderSalesAttributionV1>;
  }): JournalAttribution {
    const sourceFactType = params.journal.sourceFactType;
    const sourceFactStableId = params.journal.sourceFactStableId;
    if (!sourceFactType || !sourceFactStableId) {
      return {
        channel: 'UNATTRIBUTED',
        primaryPaymentMethod: 'UNATTRIBUTED',
        quality: 'MISSING',
      };
    }

    if (sourceFactType === 'accounting.provider_financial_document.v1') {
      const provider = params.providerByDocument.get(sourceFactStableId);
      if (!provider) {
        throw new ConflictException(
          `Canonical Sales provider Journal is missing provider attribution: ${params.journal.entryStableId}`,
        );
      }
      return providerAttribution(provider);
    }

    let attributionSourceFactStableId = sourceFactStableId;
    if (sourceFactType === 'accounting.uber_pre_cutover_order_reversal.v1') {
      const original = params.originalJournalByEntry.get(sourceFactStableId);
      attributionSourceFactStableId =
        original?.sourceFactStableId ?? sourceFactStableId;
    }
    const attribution =
      params.attributionBySourceFactStableId.get(
        attributionSourceFactStableId,
      ) ?? null;
    if (!attribution) {
      return {
        channel:
          sourceFactType === 'accounting.uber_pre_cutover_order_reversal.v1'
            ? 'ubereats'
            : 'UNATTRIBUTED',
        primaryPaymentMethod:
          sourceFactType === 'accounting.uber_pre_cutover_order_reversal.v1'
            ? 'UBEREATS'
            : 'UNATTRIBUTED',
        quality: 'MISSING',
      };
    }
    return {
      channel: attribution.channel,
      primaryPaymentMethod: attribution.primaryPaymentMethod,
      quality: resolveAccountingSalesAttributionQuality(
        attribution.primaryPaymentMethodEvidence,
      ),
    };
  }

  private addDimensionRow<T extends string>(
    rows: Map<T, AccountingSalesAnalyticsDimensionRowV1<T>>,
    key: T,
    summary: AccountingSalesSummaryV1,
  ): void {
    const row = rows.get(key) ?? {
      key,
      journalEntryCount: 0,
      summary: ZERO_SUMMARY(),
    };
    row.journalEntryCount += 1;
    addSummary(row.summary, summary);
    rows.set(key, row);
  }

  private async buildCoverage(params: {
    storeStableId: string;
    from: string;
    to: string;
    providerDocuments: Array<{
      documentStableId: string;
      provider: AccountingFinancialProvider;
    }>;
    channelRows: Map<
      AccountingSalesAnalyticsChannelV1,
      AccountingSalesAnalyticsDimensionRowV1<AccountingSalesAnalyticsChannelV1>
    >;
    paymentRows: Map<
      AccountingSalesAnalyticsPrimaryPaymentMethodV1,
      AccountingSalesAnalyticsDimensionRowV1<AccountingSalesAnalyticsPrimaryPaymentMethodV1>
    >;
    tenderTotals: Map<AccountingSalesTenderBucketV1, number>;
  }): Promise<{
    overall: AccountingSalesProviderCoverageStatusV1;
    providers: AccountingSalesAnalyticsCoverageRowV1[];
  }> {
    const providers = [
      AccountingFinancialProvider.CLOVER,
      AccountingFinancialProvider.UBER_EATS,
      AccountingFinancialProvider.FANTUAN,
    ];
    const coverageRows =
      await this.settlementQuery.readProviderFinancialCoverage({
        storeStableId: params.storeStableId,
        providers,
      });
    const coverageByProvider = new Map(
      coverageRows.map((row) => [row.provider, row]),
    );
    const providerDocumentActivity = new Set(
      params.providerDocuments.map((document) => document.provider),
    );

    const hasChannel = (channel: AccountingSalesAnalyticsChannelV1) =>
      (params.channelRows.get(channel)?.journalEntryCount ?? 0) > 0;
    const hasPayment = (
      payment: AccountingSalesAnalyticsPrimaryPaymentMethodV1,
    ) => (params.paymentRows.get(payment)?.journalEntryCount ?? 0) > 0;
    const hasTender = (tender: AccountingSalesTenderBucketV1) =>
      (params.tenderTotals.get(tender) ?? 0) !== 0;

    const result = providers.map((provider) => {
      const coverage = coverageByProvider.get(provider) ?? null;
      const coverageStartsInRange = Boolean(
        coverage &&
        params.to >=
          coverage.financialHistoryRequiredFrom.toISOString().slice(0, 10),
      );
      const applicable =
        coverageStartsInRange ||
        providerDocumentActivity.has(provider) ||
        (provider === AccountingFinancialProvider.CLOVER &&
          (hasPayment('CARD') || hasTender('CLOVER_CARD'))) ||
        (provider === AccountingFinancialProvider.UBER_EATS &&
          (hasChannel('ubereats') ||
            hasPayment('UBEREATS') ||
            hasTender('UBER_EATS'))) ||
        (provider === AccountingFinancialProvider.FANTUAN &&
          (hasChannel('fantuan') ||
            hasPayment('FANTUAN') ||
            hasTender('FANTUAN')));

      const row: AccountingSalesAnalyticsCoverageRowV1 = {
        provider,
        status: resolveAccountingSalesProviderCoverage({
          requestedFrom: params.from,
          requestedTo: params.to,
          applicable,
          coverage: coverage
            ? {
                financialHistoryRequiredFrom:
                  coverage.financialHistoryRequiredFrom
                    .toISOString()
                    .slice(0, 10),
                financialCompleteThrough:
                  coverage.financialCompleteThrough
                    ?.toISOString()
                    .slice(0, 10) ?? null,
              }
            : null,
        }),
        financialHistoryRequiredFrom:
          coverage?.financialHistoryRequiredFrom.toISOString().slice(0, 10) ??
          null,
        financialCompleteThrough:
          coverage?.financialCompleteThrough?.toISOString().slice(0, 10) ??
          null,
      };
      return row;
    });

    return {
      overall: this.worstCoverage(result.map((row) => row.status)),
      providers: result,
    };
  }

  private worstCoverage(
    statuses: AccountingSalesProviderCoverageStatusV1[],
  ): AccountingSalesProviderCoverageStatusV1 {
    if (statuses.includes('UNKNOWN')) return 'UNKNOWN';
    if (statuses.includes('INCOMPLETE')) return 'INCOMPLETE';
    if (statuses.includes('COMPLETE')) return 'COMPLETE';
    return 'NOT_APPLICABLE';
  }

  private async resolveRange(
    query: { from?: string; to?: string },
    timezone: string,
  ): Promise<{
    accountingStartDate: string;
    from: string;
    to: string;
    fromInclusive: Date;
    toExclusive: Date;
  }> {
    const now = DateTime.now().setZone(timezone);
    if (!now.isValid) {
      throw new ConflictException(`Invalid business timezone: ${timezone}`);
    }
    const requestedFrom =
      query.from?.trim() || now.startOf('month').toISODate();
    const requestedTo = query.to?.trim() || now.toISODate();
    if (!requestedFrom || !requestedTo) {
      throw new ConflictException('Unable to resolve Sales report date range');
    }

    const fromLocal = this.parseDateOnly(requestedFrom, timezone, 'from');
    const toLocal = this.parseDateOnly(requestedTo, timezone, 'to');
    if (toLocal.toMillis() < fromLocal.toMillis()) {
      throw new BadRequestException('to must be on or after from');
    }
    if (toLocal.diff(fromLocal, 'days').days > MAX_REPORT_DAYS) {
      throw new BadRequestException(
        `Sales report range cannot exceed ${MAX_REPORT_DAYS} days`,
      );
    }

    const accountingStartAt =
      await this.period.requireCanonicalFinancialPostingStartAt();
    const accountingStartDate = DateTime.fromJSDate(accountingStartAt, {
      zone: 'UTC',
    })
      .setZone(timezone)
      .toISODate();
    if (!accountingStartDate) {
      throw new ConflictException(
        'Unable to resolve accountingStartDate in business timezone',
      );
    }
    const effectiveFromMillis = Math.max(
      fromLocal.startOf('day').toUTC().toMillis(),
      accountingStartAt.getTime(),
    );
    const toExclusive = toLocal.plus({ days: 1 }).startOf('day').toUTC();
    if (toExclusive.toMillis() <= effectiveFromMillis) {
      throw new BadRequestException(
        'Sales report range is before accountingStartDate',
      );
    }
    const effectiveFrom = DateTime.fromMillis(effectiveFromMillis, {
      zone: 'UTC',
    }).setZone(timezone);

    return {
      accountingStartDate,
      from: effectiveFrom.toISODate() ?? requestedFrom,
      to: requestedTo,
      fromInclusive: new Date(effectiveFromMillis),
      toExclusive: toExclusive.toJSDate(),
    };
  }

  private parseDateOnly(raw: string, timezone: string, field: string) {
    const parsed = DateTime.fromISO(raw, { zone: timezone });
    if (!parsed.isValid || parsed.toISODate() !== raw) {
      throw new BadRequestException(`Invalid ${field} date: ${raw}`);
    }
    return parsed;
  }
}
