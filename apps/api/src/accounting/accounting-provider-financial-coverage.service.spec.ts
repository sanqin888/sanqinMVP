import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingJournalSource,
  AccountingProviderFinancialReviewStatus,
} from './accounting-contracts';
import { AccountingProviderFinancialCoverageService } from './accounting-provider-financial-coverage.service';

const coverageRow = (
  completeThrough: Date | null = null,
  providerPaymentFactCutoverAt: Date | null = null,
) => ({
  id: 'coverage-db-id',
  coverageStableId: 'coverage_uber',
  financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
  financialCompleteThrough: completeThrough,
  providerPaymentFactCutoverAt,
});

const confirmedInbox = (documentStableId: string) => ({
  status: AccountingInboxStatus.CONFIRMED,
  materializedEntityType:
    AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
  materializedEntityStableId: documentStableId,
  reviewedAt: new Date('2026-09-20T12:00:00.000Z'),
  reviewedByUserStableId: 'user_admin_1',
});

type ReviewRevision = {
  status: AccountingProviderFinancialReviewStatus;
  confirmedAt: Date | null;
  confirmedByUserStableId: string | null;
};

const statement = (
  documentStableId: string,
  periodStart: string,
  periodEnd: string,
  revision = 1,
  reviewRevisions: ReviewRevision[] = [],
  businessIdentityKey = documentStableId,
) => ({
  documentStableId,
  businessIdentityKey,
  revision,
  periodStart: new Date(`${periodStart}T00:00:00.000Z`),
  periodEnd: new Date(`${periodEnd}T00:00:00.000Z`),
  artifact: {
    inboxItem: confirmedInbox(documentStableId),
  },
  reviewRevisions,
});

const journal = (
  documentStableId: string,
  revision = 1,
  storeStableId = '4750_Yonge_Street',
) => ({
  entryStableId: `journal_${documentStableId}`,
  sourceFactStableId: documentStableId,
  sourceFactVersion: revision,
  storeStableId,
});

function makeService(params?: {
  coverage?: ReturnType<typeof coverageRow> | null;
  documents?: ReturnType<typeof statement>[];
  journals?: ReturnType<typeof journal>[];
}) {
  const tx = {
    accountingProviderFinancialCoverage: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          params?.coverage === undefined ? coverageRow() : params.coverage,
        ),
      update: jest.fn().mockResolvedValue({}),
    },
    accountingProviderFinancialDocument: {
      findMany: jest.fn().mockResolvedValue(params?.documents ?? []),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockResolvedValue(params?.journals ?? []),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  return {
    service: new AccountingProviderFinancialCoverageService(prisma as never),
    tx,
    prisma,
  };
}

const input = {
  provider: AccountingFinancialProvider.UBER_EATS,
  storeStableId: '4750_Yonge_Street',
  operatorActorRef: 'system:accounting-provider-settlement',
};

describe('AccountingProviderFinancialCoverageService', () => {
  describe('recordProviderPaymentFactCutover', () => {
    const cutover = new Date('2026-10-01T14:30:00.000Z');
    const cutoverInput = {
      provider: AccountingFinancialProvider.CLOVER,
      storeStableId: '4750_Yonge_Street',
      providerPaymentFactCutoverAt: cutover,
      operatorActorRef: 'user:admin_1',
      operatorUserStableId: 'user_admin_1',
    };

    it('records the Clover payment-fact cutover exactly once with audit evidence', async () => {
      const { service, tx } = makeService();

      await expect(
        service.recordProviderPaymentFactCutover(cutoverInput),
      ).resolves.toEqual({
        status: 'RECORDED',
        provider: AccountingFinancialProvider.CLOVER,
        storeStableId: '4750_Yonge_Street',
        providerPaymentFactCutoverAt: cutover.toISOString(),
      });
      expect(
        tx.accountingProviderFinancialCoverage.update,
      ).toHaveBeenCalledWith({
        where: { id: 'coverage-db-id' },
        data: {
          providerPaymentFactCutoverAt: cutover,
          updatedByUserStableId: 'user_admin_1',
        },
      });
      expect(tx.accountingAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'RECORD_PROVIDER_PAYMENT_FACT_CUTOVER',
          entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_COVERAGE',
          entityId: 'coverage_uber',
          operatorActorRef: 'user:admin_1',
        }) as unknown,
      });
    });

    it('is idempotent only for the exact persisted cutover timestamp', async () => {
      const { service, tx } = makeService({
        coverage: coverageRow(null, cutover),
      });

      await expect(
        service.recordProviderPaymentFactCutover(cutoverInput),
      ).resolves.toEqual({
        status: 'UNCHANGED',
        provider: AccountingFinancialProvider.CLOVER,
        storeStableId: '4750_Yonge_Street',
        providerPaymentFactCutoverAt: cutover.toISOString(),
      });
      expect(
        tx.accountingProviderFinancialCoverage.update,
      ).not.toHaveBeenCalled();
      expect(tx.accountingAuditLog.create).not.toHaveBeenCalled();
    });

    it('rejects moving or rewriting an already-recorded cutover', async () => {
      const existing = new Date('2026-10-01T14:30:00.000Z');
      const { service, tx } = makeService({
        coverage: coverageRow(null, existing),
      });

      await expect(
        service.recordProviderPaymentFactCutover({
          ...cutoverInput,
          providerPaymentFactCutoverAt: new Date(
            '2026-10-01T15:00:00.000Z',
          ),
        }),
      ).rejects.toThrow(
        'provider payment-fact cutover is immutable once recorded',
      );
      expect(
        tx.accountingProviderFinancialCoverage.update,
      ).not.toHaveBeenCalled();
      expect(tx.accountingAuditLog.create).not.toHaveBeenCalled();
    });

    it('does not allow the Clover-specific cutover contract to be reused for another provider', async () => {
      const { service, prisma } = makeService();

      await expect(
        service.recordProviderPaymentFactCutover({
          ...cutoverInput,
          provider: AccountingFinancialProvider.UBER_EATS,
        }),
      ).rejects.toThrow(
        'provider payment-fact cutover is currently supported only for CLOVER',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('advances only across confirmed STATEMENT documents with exact active canonical Journal anchors', async () => {
    const june = statement('doc_june', '2026-06-01', '2026-06-30');
    const july = statement('doc_july', '2026-07-01', '2026-07-31', 1, [
      {
        status: AccountingProviderFinancialReviewStatus.CONFIRMED,
        confirmedAt: new Date('2026-09-21T05:03:53.924Z'),
        confirmedByUserStableId: 'user_admin_1',
      },
    ]);
    const august = statement('doc_august', '2026-08-01', '2026-08-31', 2);
    const { service, tx } = makeService({
      documents: [june, july, august],
      journals: [
        journal('doc_june'),
        journal('doc_july'),
        journal('doc_august', 1),
      ],
    });

    await expect(service.reconcilePostedCoverage(input)).resolves.toEqual({
      status: 'ADVANCED',
      provider: AccountingFinancialProvider.UBER_EATS,
      storeStableId: '4750_Yonge_Street',
      financialHistoryRequiredFrom: '2026-06-01',
      previousFinancialCompleteThrough: null,
      financialCompleteThrough: '2026-07-31',
      evidenceDocumentStableIds: ['doc_june', 'doc_july'],
    });

    expect(
      tx.accountingProviderFinancialDocument.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: AccountingFinancialProvider.UBER_EATS,
          storeStableId: '4750_Yonge_Street',
          documentType: AccountingFinancialDocumentType.STATEMENT,
        }) as unknown,
      }),
    );
    expect(tx.accountingJournalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          source: AccountingJournalSource.PLATFORM_STATEMENT,
          sourceFactType: 'accounting.provider_financial_document.v1',
        }) as unknown,
      }),
    );
    expect(tx.accountingProviderFinancialCoverage.update).toHaveBeenCalledWith({
      where: { id: 'coverage-db-id' },
      data: {
        financialCompleteThrough: new Date('2026-07-31T00:00:00.000Z'),
        updatedByUserStableId: null,
      },
    });
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ADVANCE_FINANCIAL_COMPLETE_THROUGH',
        entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_COVERAGE',
        entityId: 'coverage_uber',
        operatorActorRef: 'system:accounting-provider-settlement',
      }) as unknown,
    });
  });

  it('does not jump a gap when the first posted statement starts after required history', async () => {
    const { service, tx } = makeService({
      documents: [statement('doc_july', '2026-07-01', '2026-07-31')],
      journals: [journal('doc_july')],
    });

    await expect(service.reconcilePostedCoverage(input)).resolves.toEqual(
      expect.objectContaining({
        status: 'UNCHANGED',
        financialCompleteThrough: null,
        evidenceDocumentStableIds: [],
      }),
    );
    expect(
      tx.accountingProviderFinancialCoverage.update,
    ).not.toHaveBeenCalled();
    expect(tx.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('continues from a previously proven frontier without requiring old documents to be rescanned', async () => {
    const { service } = makeService({
      coverage: coverageRow(new Date('2026-06-30T00:00:00.000Z')),
      documents: [statement('doc_july', '2026-07-01', '2026-07-31')],
      journals: [journal('doc_july')],
    });

    await expect(service.reconcilePostedCoverage(input)).resolves.toEqual(
      expect.objectContaining({
        status: 'ADVANCED',
        previousFinancialCompleteThrough: '2026-06-30',
        financialCompleteThrough: '2026-07-31',
        evidenceDocumentStableIds: ['doc_july'],
      }),
    );
  });

  it('does not advance from a posted statement revision after a newer document revision exists', async () => {
    const juneV1 = statement(
      'doc_june_v1',
      '2026-06-01',
      '2026-06-30',
      1,
      [],
      'uber:statement:june',
    );
    const juneV2 = statement(
      'doc_june_v2',
      '2026-06-01',
      '2026-06-30',
      2,
      [],
      'uber:statement:june',
    );
    const { service, tx } = makeService({
      documents: [juneV1, juneV2],
      journals: [journal('doc_june_v1', 1)],
    });

    await expect(service.reconcilePostedCoverage(input)).resolves.toEqual(
      expect.objectContaining({
        status: 'UNCHANGED',
        financialCompleteThrough: null,
      }),
    );
    expect(
      tx.accountingProviderFinancialCoverage.update,
    ).not.toHaveBeenCalled();
  });

  it('requires the latest Human Review revision to be confirmed when Human Review exists', async () => {
    const june = statement('doc_june', '2026-06-01', '2026-06-30', 1, [
      {
        status: AccountingProviderFinancialReviewStatus.DRAFT,
        confirmedAt: null,
        confirmedByUserStableId: null,
      },
    ]);
    const { service, tx } = makeService({
      documents: [june],
      journals: [journal('doc_june')],
    });

    await expect(service.reconcilePostedCoverage(input)).resolves.toEqual(
      expect.objectContaining({
        status: 'UNCHANGED',
        financialCompleteThrough: null,
      }),
    );
    expect(
      tx.accountingProviderFinancialCoverage.update,
    ).not.toHaveBeenCalled();
  });

  it('fails conservative when a confirmed document is not linked to the exact materialized provider document', async () => {
    const june = statement('doc_june', '2026-06-01', '2026-06-30');
    june.artifact.inboxItem.materializedEntityStableId = 'different_doc';
    const { service, tx } = makeService({
      documents: [june],
      journals: [journal('doc_june')],
    });

    await expect(service.reconcilePostedCoverage(input)).resolves.toEqual(
      expect.objectContaining({
        status: 'UNCHANGED',
        financialCompleteThrough: null,
      }),
    );
    expect(
      tx.accountingProviderFinancialCoverage.update,
    ).not.toHaveBeenCalled();
  });

  it('returns NOT_PROVISIONED without inventing a coverage row', async () => {
    const { service, tx } = makeService({ coverage: null });

    await expect(service.reconcilePostedCoverage(input)).resolves.toEqual({
      status: 'NOT_PROVISIONED',
      provider: AccountingFinancialProvider.UBER_EATS,
      storeStableId: '4750_Yonge_Street',
      financialHistoryRequiredFrom: null,
      previousFinancialCompleteThrough: null,
      financialCompleteThrough: null,
      evidenceDocumentStableIds: [],
    });
    expect(
      tx.accountingProviderFinancialDocument.findMany,
    ).not.toHaveBeenCalled();
  });
});
