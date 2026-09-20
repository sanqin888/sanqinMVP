import { ConflictException } from '@nestjs/common';
import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
  AccountingProviderFinancialCorrectionReason,
  AccountingProviderFinancialReviewStatus,
} from './accounting-contracts';
import { AccountingProviderFinancialReviewService } from './accounting-provider-financial-review.service';

const sourceDocument = {
  id: 'document-db-id',
  documentStableId: 'acctfindoc_july',
  provider: AccountingFinancialProvider.UBER_EATS,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  businessIdentityKey: 'uber:statement:july-2026',
  revision: 1,
  lines: [
    {
      lineStableId: 'line_sales_tax',
      lineNo: 1,
      rawCode: null,
      rawName: 'Tax on Sales',
      component: AccountingFinancialComponent.SALES_TAX,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      taxRole: AccountingFinancialTaxRole.SALES_TAX,
      amountCents: 260336,
    },
  ],
};

const reviewDtoRow = {
  reviewRevisionStableId: 'acctfinreview_1',
  revision: 1,
  status: AccountingProviderFinancialReviewStatus.DRAFT,
  reviewHash: 'a'.repeat(64),
  note: 'Correct source pairing',
  createdByUserStableId: 'user_admin_1',
  confirmedByUserStableId: null,
  confirmedAt: null,
  createdAt: new Date('2026-09-20T13:00:00.000Z'),
  updatedAt: new Date('2026-09-20T13:00:00.000Z'),
  corrections: [
    {
      correctionStableId: 'acctfincorr_1',
      sourceLineStableId: 'line_sales_tax',
      reason: AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
      note: 'Source PDF shows $338.48',
      effectiveRawCode: null,
      effectiveRawName: 'Tax on Sales',
      effectiveComponent: AccountingFinancialComponent.SALES_TAX,
      effectivePostingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      effectiveTaxRole: AccountingFinancialTaxRole.SALES_TAX,
      effectiveAmountCents: 33848,
    },
  ],
};

const makeDb = () => {
  const db = {
    $transaction: jest.fn(),
    accountingProviderFinancialDocument: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    accountingProviderFinancialReviewRevision: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    accountingJournalEntry: {
      findFirst: jest.fn(),
    },
    accountingAuditLog: {
      create: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(
    async (work: (tx: typeof db) => Promise<unknown>) => work(db),
  );
  return db;
};

describe('AccountingProviderFinancialReviewService', () => {
  it('creates an immutable review draft with a deterministic review hash', async () => {
    const db = makeDb();
    db.accountingProviderFinancialDocument.findUnique.mockResolvedValue(
      sourceDocument,
    );
    db.accountingProviderFinancialDocument.findFirst.mockResolvedValue({
      documentStableId: sourceDocument.documentStableId,
      revision: 1,
    });
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingProviderFinancialReviewRevision.findFirst.mockResolvedValue(
      null,
    );
    db.accountingProviderFinancialReviewRevision.updateMany.mockResolvedValue({
      count: 0,
    });
    db.accountingProviderFinancialReviewRevision.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...reviewDtoRow,
        reviewHash: data.reviewHash,
      }),
    );
    db.accountingAuditLog.create.mockResolvedValue({});

    const service = new AccountingProviderFinancialReviewService(db as never);
    const result = await service.createDraft(
      sourceDocument.documentStableId,
      {
        expectedDocumentRevision: 1,
        note: 'Correct source pairing',
        corrections: [
          {
            sourceLineStableId: 'line_sales_tax',
            reason:
              AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
            amountCents: 33848,
            note: 'Source PDF shows $338.48',
          },
        ],
      },
      'user_admin_1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        revision: 1,
        status: AccountingProviderFinancialReviewStatus.DRAFT,
        reviewHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
      }),
    );
    expect(
      db.accountingProviderFinancialReviewRevision.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: sourceDocument.id,
          revision: 1,
          status: AccountingProviderFinancialReviewStatus.DRAFT,
          createdByUserStableId: 'user_admin_1',
          corrections: {
            create: [
              expect.objectContaining({
                sourceLineStableId: 'line_sales_tax',
                effectiveAmountCents: 33848,
                effectiveComponent: AccountingFinancialComponent.SALES_TAX,
              }),
            ],
          },
        }) as unknown,
      }),
    );
    expect(db.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_REVIEW_DRAFT',
        entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_REVIEW_REVISION',
        operatorActorRef: 'user_admin_1',
      }) as unknown,
    });
  });

  it('refuses to create a review draft for an already-posted provider document', async () => {
    const db = makeDb();
    db.accountingProviderFinancialDocument.findUnique.mockResolvedValue(
      sourceDocument,
    );
    db.accountingProviderFinancialDocument.findFirst.mockResolvedValue({
      documentStableId: sourceDocument.documentStableId,
      revision: 1,
    });
    db.accountingJournalEntry.findFirst.mockResolvedValue({
      entryStableId: 'journal_posted_1',
    });

    const service = new AccountingProviderFinancialReviewService(db as never);

    await expect(
      service.createDraft(
        sourceDocument.documentStableId,
        {
          expectedDocumentRevision: 1,
          corrections: [
            {
              sourceLineStableId: 'line_sales_tax',
              reason:
                AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
              amountCents: 33848,
            },
          ],
        },
        'user_admin_1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      db.accountingProviderFinancialReviewRevision.create,
    ).not.toHaveBeenCalled();
  });

  it('confirms only the latest draft and supersedes the prior confirmed review', async () => {
    const db = makeDb();
    const expectedHash = 'b'.repeat(64);
    const draft = {
      id: 'review-db-id-2',
      reviewRevisionStableId: 'acctfinreview_2',
      revision: 2,
      status: AccountingProviderFinancialReviewStatus.DRAFT,
      reviewHash: expectedHash,
      documentId: sourceDocument.id,
      document: {
        documentStableId: sourceDocument.documentStableId,
        provider: sourceDocument.provider,
        documentType: sourceDocument.documentType,
        businessIdentityKey: sourceDocument.businessIdentityKey,
        revision: 1,
      },
    };
    const confirmedRow = {
      ...reviewDtoRow,
      reviewRevisionStableId: draft.reviewRevisionStableId,
      revision: 2,
      status: AccountingProviderFinancialReviewStatus.CONFIRMED,
      reviewHash: expectedHash,
      confirmedByUserStableId: 'user_admin_2',
      confirmedAt: new Date('2026-09-20T14:00:00.000Z'),
      updatedAt: new Date('2026-09-20T14:00:00.000Z'),
    };

    db.accountingProviderFinancialReviewRevision.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(confirmedRow);
    db.accountingProviderFinancialReviewRevision.findFirst.mockResolvedValue({
      reviewRevisionStableId: draft.reviewRevisionStableId,
      revision: 2,
      status: AccountingProviderFinancialReviewStatus.DRAFT,
    });
    db.accountingProviderFinancialDocument.findFirst.mockResolvedValue({
      documentStableId: sourceDocument.documentStableId,
      revision: 1,
    });
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingProviderFinancialReviewRevision.updateMany.mockResolvedValue({
      count: 1,
    });
    db.accountingProviderFinancialReviewRevision.update.mockResolvedValue({});
    db.accountingAuditLog.create.mockResolvedValue({});

    const service = new AccountingProviderFinancialReviewService(db as never);
    const result = await service.confirmRevision(
      sourceDocument.documentStableId,
      draft.reviewRevisionStableId,
      expectedHash,
      'user_admin_2',
    );

    expect(result).toEqual(
      expect.objectContaining({
        reviewRevisionStableId: draft.reviewRevisionStableId,
        revision: 2,
        status: AccountingProviderFinancialReviewStatus.CONFIRMED,
        confirmedByUserStableId: 'user_admin_2',
      }),
    );
    expect(
      db.accountingProviderFinancialReviewRevision.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        documentId: sourceDocument.id,
        status: AccountingProviderFinancialReviewStatus.CONFIRMED,
        NOT: { id: draft.id },
      },
      data: {
        status: AccountingProviderFinancialReviewStatus.SUPERSEDED,
      },
    });
    expect(db.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CONFIRM_REVIEW',
        entityId: draft.reviewRevisionStableId,
        operatorActorRef: 'user_admin_2',
      }) as unknown,
    });
  });
});
