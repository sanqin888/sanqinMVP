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

import type { ProviderSettlementReplacementGroupAuthorityV1 } from './accounting-provider-settlement-write-authority';
import { AccountingService } from './accounting.service';

const originalEntryStableId = 'journal_sale_1';
const originalIdempotencyHash = 'c'.repeat(64);

const documentJournal = {
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

const reversalJournal = {
  idempotencyKey: `uber-pre-cutover-order-reversal:${originalEntryStableId}:v1`,
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.SYSTEM,
  sourceFactType: 'accounting.uber_pre_cutover_order_reversal.v1',
  sourceFactStableId: originalEntryStableId,
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-06-10T16:00:00.000Z',
  currency: 'CAD',
  memo: `Reverse pre-cutover manual Uber SALE ${originalEntryStableId}`,
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
};

const authority: ProviderSettlementReplacementGroupAuthorityV1 = {
  version: 1,
  expectedPlanHash: 'a'.repeat(64),
  provider: AccountingFinancialProvider.UBER_EATS,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  businessIdentityKey: 'uber:statement:june-2026',
  documentStableId: 'provider_doc_june',
  revision: 1,
  providerDocumentRef: 'june-2026',
  storeStableId: '4750_Yonge_Street',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  salesAuthority: 'STATEMENT_AUTHORITATIVE',
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
    },
  ],
  historicalReversalAnchors: [
    {
      originalJournalEntryStableId: originalEntryStableId,
      idempotencyKey: 'canonical-sale:order-uber-1:v1',
      idempotencyHash: originalIdempotencyHash,
      version: 1,
      sourceFactStableId: 'order-uber-1',
    },
  ],
};

const accountRows = [
  {
    id: 'acct-hst-db',
    accountStableId: 'account_hst_payable',
    accountClass: AccountingAccountClass.LIABILITY,
    currency: 'CAD',
    isActive: true,
  },
  {
    id: 'acct-sales-db',
    accountStableId: 'account_sales_revenue',
    accountClass: AccountingAccountClass.REVENUE,
    currency: 'CAD',
    isActive: true,
  },
  {
    id: 'acct-uber-db',
    accountStableId: 'account_uber_pending',
    accountClass: AccountingAccountClass.ASSET,
    currency: 'CAD',
    isActive: true,
  },
];

const journalRow = (entryStableId: string, sourceFactStableId: string) => ({
  entryStableId,
  idempotencyKey: `key:${entryStableId}`,
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.SYSTEM,
  sourceFactType: 'test',
  sourceFactStableId,
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: new Date('2026-06-10T16:00:00.000Z'),
  currency: 'CAD',
  memo: null,
  createdByActorRef: 'system:accounting-provider-settlement',
  updatedByActorRef: 'system:accounting-provider-settlement',
  createdAt: new Date('2026-09-15T12:00:00.000Z'),
  updatedAt: new Date('2026-09-15T12:00:00.000Z'),
  version: 1,
  deletedAt: null,
  lines: [],
});

const makeService = () => {
  const tx = {
    accountingProviderFinancialDocument: {
      findUnique: jest.fn().mockResolvedValue({
        documentStableId: 'provider_doc_june',
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        businessIdentityKey: 'uber:statement:june-2026',
        revision: 1,
        storeStableId: '4750_Yonge_Street',
        providerDocumentRef: 'june-2026',
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T00:00:00.000Z'),
        currency: 'CAD',
        artifact: {
          inboxItem: {
            inboxItemStableId: 'inbox_june',
            status: AccountingInboxStatus.CONFIRMED,
            materializedEntityType:
              AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
            materializedEntityStableId: 'provider_doc_june',
            reviewedAt: new Date('2026-09-15T12:00:00.000Z'),
            reviewedByUserStableId: 'user_admin_1',
            version: 2,
          },
        },
      }),
      findFirst: jest.fn().mockResolvedValue({
        documentStableId: 'provider_doc_june',
        revision: 1,
      }),
    },
    accountingProviderFinancialCoverage: {
      findFirst: jest.fn().mockResolvedValue({
        coverageStableId: 'coverage_uber',
        financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
        financialCompleteThrough: null,
        liveOrderFactCutoverAt: null,
        orderDetailCoverageFrom: null,
        updatedAt: new Date('2026-09-15T12:00:00.000Z'),
      }),
    },
    accountingAutomationConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    accountingPeriodClose: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue(accountRows),
    },
    accountingCategory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    accountingJournalEntry: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          {
            entryStableId: originalEntryStableId,
            idempotencyKey: 'canonical-sale:order-uber-1:v1',
            idempotencyHash: originalIdempotencyHash,
            version: 1,
            source: AccountingJournalSource.ORDER,
            sourceFactType: 'order.financial_sale.v1',
            sourceFactStableId: 'order-uber-1',
            deletedAt: null,
          },
        ])
        .mockResolvedValueOnce([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValueOnce(
          journalRow('journal_statement', 'provider_doc_june'),
        )
        .mockResolvedValueOnce(
          journalRow('journal_reversal', originalEntryStableId),
        ),
    },
  };
  const transaction = jest.fn(
    (work: (transactionClient: typeof tx) => Promise<unknown>) => work(tx),
  );
  const prisma = {
    ...tx,
    $transaction: transaction,
  };
  const storeConfig = {
    getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
      timezone: 'America/Toronto',
    }),
  };
  return {
    service: new AccountingService(prisma as never, storeConfig as never),
    tx,
    transaction,
  };
};

const writeInput = {
  documentJournal,
  uberPreCutoverReversals: [
    {
      journal: reversalJournal,
      originalJournalEntryStableId: originalEntryStableId,
    },
  ],
};

describe('AccountingService provider settlement replacement group', () => {
  it('places the statement, all historical reversals, and their audits inside one Serializable transaction callback', async () => {
    const { service, tx, transaction } = makeService();

    await expect(
      service.createProviderSettlementReplacementGroup(
        writeInput,
        'system:accounting-provider-settlement',
        authority,
      ),
    ).resolves.toHaveLength(2);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(2);
    expect(tx.accountingAuditLog.create).toHaveBeenCalledTimes(2);
  });

  it('does not split the replacement group when a later Journal create fails', async () => {
    const { service, tx, transaction } = makeService();
    tx.accountingJournalEntry.create
      .mockReset()
      .mockResolvedValueOnce(
        journalRow('journal_statement', 'provider_doc_june'),
      )
      .mockRejectedValueOnce(new Error('simulated reversal write failure'));

    await expect(
      service.createProviderSettlementReplacementGroup(
        writeInput,
        'system:accounting-provider-settlement',
        authority,
      ),
    ).rejects.toThrow('simulated reversal write failure');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(2);
  });

  it('fails closed before creating anything when only part of a replacement group already exists', async () => {
    const { service, tx } = makeService();
    tx.accountingJournalEntry.findMany
      .mockReset()
      .mockResolvedValueOnce([
        {
          entryStableId: originalEntryStableId,
          idempotencyKey: 'canonical-sale:order-uber-1:v1',
          idempotencyHash: originalIdempotencyHash,
          version: 1,
          source: AccountingJournalSource.ORDER,
          sourceFactType: 'order.financial_sale.v1',
          sourceFactStableId: 'order-uber-1',
          deletedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          idempotencyKey: documentJournal.idempotencyKey,
        },
      ]);

    await expect(
      service.createProviderSettlementReplacementGroup(
        writeInput,
        'system:accounting-provider-settlement',
        authority,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed before mutation when the original SALE Journal anchor changed after preview', async () => {
    const { service, tx } = makeService();
    tx.accountingJournalEntry.findMany.mockReset().mockResolvedValueOnce([
      {
        entryStableId: originalEntryStableId,
        idempotencyKey: 'canonical-sale:order-uber-1:v1',
        idempotencyHash: 'd'.repeat(64),
        version: 2,
        source: AccountingJournalSource.ORDER,
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: 'order-uber-1',
        deletedAt: null,
      },
    ]);

    await expect(
      service.createProviderSettlementReplacementGroup(
        writeInput,
        'system:accounting-provider-settlement',
        authority,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});
