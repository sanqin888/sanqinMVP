import { ConflictException } from '@nestjs/common';
import {
  AccountingAccountClass,
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';

import {
  AccountingProviderSettlementExecutionService,
  PROVIDER_SETTLEMENT_SYSTEM_ACTOR,
} from './accounting-provider-settlement-execution.service';

const PLAN_HASH = 'a'.repeat(64);
const OTHER_PLAN_HASH = 'b'.repeat(64);

const statementJournal = {
  idempotencyKey: 'provider-settlement:provider_doc_june:r1:v1',
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.PLATFORM_STATEMENT,
  sourceFactType: 'accounting.provider_financial_document.v1',
  sourceFactStableId: 'provider_doc_june',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-07-01T03:59:59.999Z',
  currency: 'CAD',
  memo: 'UBER_EATS settlement provider_doc_june r1',
  lines: [
    {
      accountStableId: 'account_uber_pending',
      debitCents: 1130,
      creditCents: 0,
    },
    {
      accountStableId: 'account_sales_revenue',
      debitCents: 0,
      creditCents: 1000,
    },
    {
      accountStableId: 'account_hst_payable',
      debitCents: 0,
      creditCents: 130,
    },
  ],
};

const reversalJournal = (entryStableId: string) => ({
  idempotencyKey: `uber-pre-cutover-order-reversal:${entryStableId}:v1`,
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.SYSTEM,
  sourceFactType: 'accounting.uber_pre_cutover_order_reversal.v1',
  sourceFactStableId: entryStableId,
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-06-10T16:00:00.000Z',
  currency: 'CAD',
  memo: `Reverse pre-cutover manual Uber SALE ${entryStableId}`,
  lines: [
    {
      accountStableId: 'account_sales_revenue',
      debitCents: 1000,
      creditCents: 0,
    },
    {
      accountStableId: 'account_hst_payable',
      debitCents: 130,
      creditCents: 0,
    },
    {
      accountStableId: 'account_uber_pending',
      debitCents: 0,
      creditCents: 1130,
    },
  ],
});

const makeDocument = (status = 'READY') => ({
  documentStableId: 'provider_doc_june',
  provider: AccountingFinancialProvider.UBER_EATS,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  businessIdentityKey: 'uber:statement:june-2026',
  revision: 1,
  providerDocumentRef: 'june-2026',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  currency: 'CAD',
  salesAuthority: 'STATEMENT_AUTHORITATIVE' as const,
  latestRevisionInRequestedRange: true,
  reviewEvidence: {
    inboxItemStableId: 'inbox_june',
    status: AccountingInboxStatus.CONFIRMED,
    materializedEntityType:
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
    materializedEntityStableId: 'provider_doc_june',
    reviewedAt: '2026-09-15T12:00:00.000Z',
    reviewedByUserStableId: 'user_admin_1',
    version: 2,
  },
  coverageEvidence: {
    coverageStableId: 'coverage_uber',
    financialHistoryRequiredFrom: '2026-06-01',
    financialCompleteThrough: null,
    liveOrderFactCutoverAt: null,
    orderDetailCoverageFrom: null,
    updatedAt: '2026-09-15T12:00:00.000Z',
  },
  status,
  blockReasons: [],
  accountPrerequisites: [
    {
      accountStableId: 'account_hst_payable',
      expected: {
        accountClass: AccountingAccountClass.LIABILITY,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: AccountingAccountClass.LIABILITY,
        currency: 'CAD',
        isActive: true,
      },
      status: 'READY',
      blockReasons: [],
    },
    {
      accountStableId: 'account_uber_pending',
      expected: {
        accountClass: AccountingAccountClass.ASSET,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: AccountingAccountClass.ASSET,
        currency: 'CAD',
        isActive: true,
      },
      status: 'READY',
      blockReasons: [],
    },
    {
      accountStableId: 'account_sales_revenue',
      expected: {
        accountClass: AccountingAccountClass.REVENUE,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: AccountingAccountClass.REVENUE,
        currency: 'CAD',
        isActive: true,
      },
      status: 'READY',
      blockReasons: [],
    },
  ],
  missingRequiredAccounts: [],
  invalidRequiredAccounts: [],
  existingJournalEntryStableId: null,
  priorPostedRevision: null,
  decisions: [],
  draftJournal: status === 'READY' ? statementJournal : null,
  debitCents: status === 'READY' ? 1130 : 0,
  creditCents: status === 'READY' ? 1130 : 0,
});

const makeReversal = (
  originalJournalEntryStableId: string,
  status = 'READY',
) => ({
  originalJournalEntryStableId,
  originalJournalAnchor: {
    idempotencyKey: `canonical-sale:${originalJournalEntryStableId}:v1`,
    idempotencyHash: 'c'.repeat(64),
    version: 1,
    sourceFactStableId: `sale_fact_${originalJournalEntryStableId}`,
  },
  orderStableId: `order_${originalJournalEntryStableId}`,
  occurredAt: '2026-06-10T16:00:00.000Z',
  status,
  blockReasons: [],
  accountPrerequisites: [
    {
      accountStableId: 'account_hst_payable',
      expected: {
        accountClass: AccountingAccountClass.LIABILITY,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: AccountingAccountClass.LIABILITY,
        currency: 'CAD',
        isActive: true,
      },
      status: 'READY',
      blockReasons: [],
    },
    {
      accountStableId: 'account_sales_revenue',
      expected: {
        accountClass: AccountingAccountClass.REVENUE,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: AccountingAccountClass.REVENUE,
        currency: 'CAD',
        isActive: true,
      },
      status: 'READY',
      blockReasons: [],
    },
    {
      accountStableId: 'account_uber_pending',
      expected: {
        accountClass: AccountingAccountClass.ASSET,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: AccountingAccountClass.ASSET,
        currency: 'CAD',
        isActive: true,
      },
      status: 'READY',
      blockReasons: [],
    },
  ],
  coveringDocumentStableIds: ['provider_doc_june'],
  coveredByDocumentStableId: 'provider_doc_june',
  draftJournal:
    status === 'READY' ? reversalJournal(originalJournalEntryStableId) : null,
  debitCents: status === 'READY' ? 1130 : 0,
  creditCents: status === 'READY' ? 1130 : 0,
});

const makeReport = (params?: {
  documentStatus?: string;
  reversals?: ReturnType<typeof makeReversal>[];
}) => {
  const document = makeDocument(params?.documentStatus ?? 'READY');
  const reversals = params?.reversals ?? [
    makeReversal('journal_sale_1'),
    makeReversal('journal_sale_2'),
  ];
  const readyReversals = reversals.filter((item) => item.status === 'READY');
  return {
    version: 3,
    planHash: PLAN_HASH,
    range: {
      timezone: 'America/Toronto',
      accountingStartDate: '2026-06-01',
      fromDate: '2026-06-01',
      toDateExclusive: '2026-07-01',
      fromInclusive: '2026-06-01T04:00:00.000Z',
      toExclusive: '2026-07-01T04:00:00.000Z',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.UBER_EATS,
    },
    policy: {},
    coverage: [],
    counts: {},
    amounts: {
      readyProviderDebitCents: document.status === 'READY' ? 1130 : 0,
      readyProviderCreditCents: document.status === 'READY' ? 1130 : 0,
      readyUberReversalDebitCents: readyReversals.length * 1130,
      readyUberReversalCreditCents: readyReversals.length * 1130,
    },
    providerDocuments: [document],
    uberPreCutoverOrderReversals: reversals,
  };
};

const makeService = (report = makeReport()) => {
  const preview = { previewRange: jest.fn().mockResolvedValue(report) };
  const accounting = {
    assertNoLegacyOrderRevenueAccrual: jest.fn().mockResolvedValue(undefined),
    createProviderSettlementReplacementGroup: jest
      .fn()
      .mockResolvedValue([{}, {}, {}]),
  };
  return {
    service: new AccountingProviderSettlementExecutionService(
      preview as never,
      accounting as never,
    ),
    preview,
    accounting,
  };
};

const input = {
  fromDate: '2026-06-01',
  toDateExclusive: '2026-07-01',
  storeStableId: '4750_Yonge_Street',
  provider: AccountingFinancialProvider.UBER_EATS,
  expectedPlanHash: PLAN_HASH,
};

describe('AccountingProviderSettlementExecutionService', () => {
  it('rejects a stale plan hash before exercising any settlement write authority', async () => {
    const { service, accounting } = makeService();

    await expect(
      service.executeRange({ ...input, expectedPlanHash: OTHER_PLAN_HASH }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(accounting.assertNoLegacyOrderRevenueAccrual).not.toHaveBeenCalled();
    expect(
      accounting.createProviderSettlementReplacementGroup,
    ).not.toHaveBeenCalled();
  });

  it('writes one READY provider document and all of its covered Uber reversals as one replacement group', async () => {
    const { service, accounting } = makeService();

    const result = await service.executeRange(input);

    expect(accounting.assertNoLegacyOrderRevenueAccrual).toHaveBeenCalledTimes(1);
    expect(accounting.createProviderSettlementReplacementGroup).toHaveBeenCalledTimes(
      1,
    );
    expect(accounting.createProviderSettlementReplacementGroup).toHaveBeenCalledWith(
      {
        documentJournal: statementJournal,
        uberPreCutoverReversals: [
          {
            journal: reversalJournal('journal_sale_1'),
            originalJournalEntryStableId: 'journal_sale_1',
          },
          {
            journal: reversalJournal('journal_sale_2'),
            originalJournalEntryStableId: 'journal_sale_2',
          },
        ],
      },
      PROVIDER_SETTLEMENT_SYSTEM_ACTOR,
      expect.objectContaining({
        version: 1,
        expectedPlanHash: PLAN_HASH,
        documentStableId: 'provider_doc_june',
        revision: 1,
        storeStableId: '4750_Yonge_Street',
        historicalReversalAnchors: [
          expect.objectContaining({
            originalJournalEntryStableId: 'journal_sale_1',
            idempotencyHash: 'c'.repeat(64),
          }),
          expect.objectContaining({
            originalJournalEntryStableId: 'journal_sale_2',
            idempotencyHash: 'c'.repeat(64),
          }),
        ],
      }),
    );
    expect(result.execution).toEqual(
      expect.objectContaining({
        replacementGroupsExecuted: 1,
        journalEntriesPostedOrReplayed: 3,
        providerDocumentsPostedOrReplayed: 1,
        uberReversalsPostedOrReplayed: 2,
      }),
    );
  });

  it('fails closed when a READY Uber reversal is not owned by a READY provider document', async () => {
    const report = makeReport({ documentStatus: 'BLOCKED' });
    const { service, accounting } = makeService(report);

    await expect(service.executeRange(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      accounting.createProviderSettlementReplacementGroup,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when an otherwise READY document already has an Uber reversal outside the atomic replacement group', async () => {
    const report = makeReport({
      reversals: [
        makeReversal('journal_sale_1'),
        makeReversal('journal_sale_2', 'ALREADY_REVERSED'),
      ],
    });
    const { service, accounting } = makeService(report);

    await expect(service.executeRange(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      accounting.createProviderSettlementReplacementGroup,
    ).not.toHaveBeenCalled();
  });

  it('rejects a narrow replay range that only overlaps a READY provider document period', async () => {
    const report = makeReport();
    report.range.fromDate = '2026-06-10';
    report.range.toDateExclusive = '2026-06-20';
    const { service, accounting } = makeService(report);

    await expect(
      service.executeRange({
        ...input,
        fromDate: '2026-06-10',
        toDateExclusive: '2026-06-20',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      accounting.createProviderSettlementReplacementGroup,
    ).not.toHaveBeenCalled();
  });

  it('fails closed before writing when READY totals are not balanced', async () => {
    const report = makeReport();
    report.amounts.readyProviderCreditCents = 1129;
    const { service, accounting } = makeService(report);

    await expect(service.executeRange(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(accounting.assertNoLegacyOrderRevenueAccrual).not.toHaveBeenCalled();
    expect(
      accounting.createProviderSettlementReplacementGroup,
    ).not.toHaveBeenCalled();
  });
});
