import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AccountingFinancialProvider,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';

@Injectable()
export class AccountingProviderSettlementQueryService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async readProviderSettlementDocuments(params: {
    storeStableId: string;
    provider?: AccountingFinancialProvider;
  }) {
    return this.prisma.accountingProviderFinancialDocument.findMany({
      where: {
        storeStableId: params.storeStableId,
        ...(params.provider ? { provider: params.provider } : {}),
      },
      select: {
        documentStableId: true,
        provider: true,
        documentType: true,
        businessIdentityKey: true,
        revision: true,
        supersedesDocumentId: true,
        storeStableId: true,
        providerDocumentRef: true,
        periodStart: true,
        periodEnd: true,
        settledAt: true,
        payoutAt: true,
        currency: true,
        rawMetadata: true,
        artifact: {
          select: {
            inboxItem: {
              select: {
                inboxItemStableId: true,
                status: true,
                materializedEntityType: true,
                materializedEntityStableId: true,
                reviewedAt: true,
                reviewedByUserStableId: true,
                version: true,
              },
            },
          },
        },
        lines: {
          select: {
            lineStableId: true,
            lineNo: true,
            rawCode: true,
            rawName: true,
            component: true,
            postingTreatment: true,
            taxRole: true,
            amountCents: true,
            occurredAt: true,
          },
          orderBy: { lineNo: 'asc' },
        },
      },
      orderBy: [
        { provider: 'asc' },
        { businessIdentityKey: 'asc' },
        { revision: 'desc' },
      ],
    });
  }

  async readProviderDocumentPostingStates(documentStableIds: string[]) {
    const stableIds = Array.from(new Set(documentStableIds));
    if (stableIds.length === 0) return [];

    const journals = await this.readSettlementShadowExistingJournals({
      providerDocumentStableIds: stableIds,
      uberOrderEntryStableIds: [],
    });
    const journalByDocumentStableId = new Map(
      journals.flatMap((journal) =>
        journal.sourceFactStableId
          ? [[journal.sourceFactStableId, journal.entryStableId] as const]
          : [],
      ),
    );

    return stableIds.map((documentStableId) => {
      const existingJournalEntryStableId =
        journalByDocumentStableId.get(documentStableId) ?? null;
      return {
        documentStableId,
        postingState: existingJournalEntryStableId
          ? ('POSTED' as const)
          : ('NOT_POSTED' as const),
        existingJournalEntryStableId,
      };
    });
  }

  async readProviderFinancialCoverage(params: {
    storeStableId: string;
    providers: AccountingFinancialProvider[];
  }) {
    if (params.providers.length === 0) return [];
    return this.prisma.accountingProviderFinancialCoverage.findMany({
      where: {
        storeStableId: params.storeStableId,
        provider: { in: params.providers },
      },
      select: {
        coverageStableId: true,
        provider: true,
        storeStableId: true,
        financialHistoryRequiredFrom: true,
        financialCompleteThrough: true,
        liveOrderFactCutoverAt: true,
        orderDetailCoverageFrom: true,
        updatedAt: true,
      },
      orderBy: { provider: 'asc' },
    });
  }

  async readOrderSaleJournalsByFactStableIds(factStableIds: string[]) {
    if (factStableIds.length === 0) return [];
    return this.prisma.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        source: AccountingJournalSource.ORDER,
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: { in: factStableIds },
      },
      select: {
        entryStableId: true,
        idempotencyKey: true,
        idempotencyHash: true,
        version: true,
        sourceFactStableId: true,
        storeStableId: true,
        occurredAt: true,
        currency: true,
        lines: {
          select: {
            debitCents: true,
            creditCents: true,
            memo: true,
            account: { select: { accountStableId: true } },
            category: { select: { categoryStableId: true } },
          },
          orderBy: { lineNo: 'asc' },
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { entryStableId: 'asc' }],
    });
  }

  async readSettlementShadowExistingJournals(params: {
    providerDocumentStableIds: string[];
    uberOrderEntryStableIds: string[];
  }) {
    const filters: Prisma.AccountingJournalEntryWhereInput[] = [];
    if (params.providerDocumentStableIds.length > 0) {
      filters.push({
        sourceFactType: 'accounting.provider_financial_document.v1',
        sourceFactStableId: { in: params.providerDocumentStableIds },
      });
    }
    if (params.uberOrderEntryStableIds.length > 0) {
      filters.push({
        sourceFactType: 'accounting.uber_pre_cutover_order_reversal.v1',
        sourceFactStableId: { in: params.uberOrderEntryStableIds },
      });
    }
    if (filters.length === 0) return [];
    return this.prisma.accountingJournalEntry.findMany({
      where: { deletedAt: null, OR: filters },
      select: {
        entryStableId: true,
        idempotencyKey: true,
        sourceFactType: true,
        sourceFactStableId: true,
        sourceFactVersion: true,
      },
      orderBy: { entryStableId: 'asc' },
    });
  }
}
