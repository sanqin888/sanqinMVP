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
  effectiveSnapshotParserName: null,
  effectiveSnapshotParserVersion: null,
  effectiveSnapshotParseRun: null,
  effectiveSnapshotSourceParseRun: null,
  createdByUserStableId: 'user_admin_1',
  confirmedByUserStableId: null,
  confirmedAt: null,
  createdAt: new Date('2026-09-20T13:00:00.000Z'),
  updatedAt: new Date('2026-09-20T13:00:00.000Z'),
  effectiveLines: [],
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
    accountingSourceArtifact: {
      findUnique: jest.fn(),
    },
    accountingParseRun: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
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

  it('creates a parser re-evaluation draft as a full immutable effective snapshot', async () => {
    const db = makeDb();
    const documentStableId = 'acctfindoc_uber_august';
    const document = {
      id: 'document-uber-db-id',
      artifactId: 'artifact-uber-db-id',
      documentStableId,
      provider: AccountingFinancialProvider.UBER_EATS,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      businessIdentityKey: 'uber:statement:3F0FE63E',
      revision: 1,
      providerMerchantRef: null,
      providerDocumentRef: '3F0FE63E',
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      currency: 'CAD',
      parserName: 'accounting-provider-financial',
      parserVersion: '7',
      artifact: {
        artifactStableId: 'acctart_uber_august',
        originalFilename: 'uber_082026.pdf',
        emailSubject: null,
      },
    };
    db.accountingProviderFinancialDocument.findUnique.mockResolvedValue(
      document,
    );
    db.accountingProviderFinancialDocument.findFirst.mockResolvedValue({
      documentStableId,
      revision: 1,
    });
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingSourceArtifact.findUnique.mockResolvedValue({
      id: 'artifact-uber-db-id',
    });
    db.accountingProviderFinancialReviewRevision.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    db.accountingParseRun.findMany.mockResolvedValue([
      {
        id: 'parse-run-db-id',
        parseRunStableId: 'acctparserun_uber_recognition',
        parserName: 'accounting-provider-recognition',
        parserVersion: 'acct_recognition_uber_monthly_statement:v1',
        resultHash: 'c'.repeat(64),
        resultJson: {
          extractedText: `
Monthly Statement
Statement Number #3F0FE63E
Date Aug 01-31, 2026
Consolidated Monthly Summary
Sales (106 Orders) $3,300.67
Tax on Sales $429.19
Tips $0.00
Total Earnings $3,729.86
Marketplace Fees -$767.88
Tax on Marketplace Fees -$99.81
Total Uber Fees -$867.69
Total Marketing Spends $0.00
Total Amendments $0.00
Net Total $2,862.17
`,
        },
      },
    ]);
    db.accountingParseRun.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'parse-run-v8-db-id',
        parseRunStableId: 'acctparserun_uber_v8',
        resultHash: 'd'.repeat(64),
      });
    db.accountingParseRun.upsert.mockResolvedValue({
      parseRunStableId: 'acctparserun_uber_v8',
      status: 'SUCCESS',
      resultHash: 'd'.repeat(64),
      completedAt: new Date('2026-09-25T15:00:00.000Z'),
    });
    db.accountingProviderFinancialReviewRevision.updateMany.mockResolvedValue({
      count: 0,
    });
    db.accountingProviderFinancialReviewRevision.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        const effectiveLineWrite = data.effectiveLines as
          | { create: Array<Record<string, unknown>> }
          | undefined;
        const effectiveLines =
          effectiveLineWrite?.create.map((line, index) => ({
            reviewedLineStableId: `acctfinreviewline_${index + 1}`,
            ...line,
          })) ?? [];
        return {
          reviewRevisionStableId: 'acctfinreview_uber_v8',
          revision: data.revision,
          status: data.status,
          reviewHash: data.reviewHash,
          note: data.note,
          effectiveSnapshotParserName: data.effectiveSnapshotParserName,
          effectiveSnapshotParserVersion: data.effectiveSnapshotParserVersion,
          effectiveSnapshotParseRun: {
            parseRunStableId: 'acctparserun_uber_v8',
          },
          effectiveSnapshotSourceParseRun: {
            parseRunStableId: 'acctparserun_uber_recognition',
          },
          createdByUserStableId: data.createdByUserStableId,
          confirmedByUserStableId: null,
          confirmedAt: null,
          createdAt: new Date('2026-09-25T15:00:00.000Z'),
          updatedAt: new Date('2026-09-25T15:00:00.000Z'),
          effectiveLines,
          corrections: [],
        };
      },
    );
    db.accountingAuditLog.create.mockResolvedValue({});

    const service = new AccountingProviderFinancialReviewService(db as never);
    const result = await service.createParserReevaluationDraft(
      documentStableId,
      'user_admin_1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        revision: 1,
        status: AccountingProviderFinancialReviewStatus.DRAFT,
        effectiveSnapshotParserName: 'accounting-provider-financial',
        effectiveSnapshotParserVersion: '10',
        effectiveSnapshotParseRunStableId: 'acctparserun_uber_v8',
        effectiveSnapshotSourceParseRunStableId:
          'acctparserun_uber_recognition',
        corrections: [],
      }),
    );
    expect(result.effectiveLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawName: 'Sales',
          component: AccountingFinancialComponent.SALES,
          amountCents: 330067,
        }),
        expect.objectContaining({
          rawName: 'Tax on Sales',
          component: AccountingFinancialComponent.SALES_TAX,
          amountCents: 42919,
        }),
        expect.objectContaining({
          rawName: 'Marketplace Fees',
          component: AccountingFinancialComponent.COMMISSION,
          amountCents: -76788,
        }),
      ]),
    );
    expect(
      db.accountingProviderFinancialReviewRevision.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: document.id,
          effectiveSnapshotParserName: 'accounting-provider-financial',
          effectiveSnapshotParserVersion: '10',
          effectiveSnapshotParseRunId: 'parse-run-v8-db-id',
          effectiveSnapshotSourceParseRunId: 'parse-run-db-id',
          effectiveLines: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                rawName: 'Sales',
                amountCents: 330067,
              }),
            ]) as unknown,
          }) as unknown,
        }) as unknown,
      }),
    );
    expect(db.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_PARSER_REEVALUATION_REVIEW_DRAFT',
        entityId: 'acctfinreview_uber_v8',
        operatorActorRef: 'user_admin_1',
      }) as unknown,
    });
  });

  it('refuses to confirm an inconsistent parser effective snapshot', async () => {
    const db = makeDb();
    const expectedHash = 'e'.repeat(64);
    db.accountingProviderFinancialReviewRevision.findUnique.mockResolvedValue({
      id: 'review-snapshot-db-id',
      reviewRevisionStableId: 'acctfinreview_snapshot_bad',
      revision: 1,
      status: AccountingProviderFinancialReviewStatus.DRAFT,
      reviewHash: expectedHash,
      documentId: sourceDocument.id,
      effectiveSnapshotParserName: 'accounting-provider-financial',
      effectiveSnapshotParserVersion: '7',
      effectiveSnapshotParseRun: {
        parseRunStableId: 'acctparserun_v6',
        artifactId: 'artifact-db-id',
        parserName: 'accounting-provider-financial',
        parserVersion: '6',
        status: 'SUCCESS',
        resultJson: { rawMetadata: {} },
      },
      effectiveSnapshotSourceParseRun: {
        parseRunStableId: 'acctparserun_source',
        artifactId: 'artifact-db-id',
        status: 'SUCCESS',
      },
      effectiveLines: [{ id: 'reviewed-line-db-id' }],
      corrections: [],
      document: {
        documentStableId: sourceDocument.documentStableId,
        artifactId: 'artifact-db-id',
        provider: sourceDocument.provider,
        documentType: sourceDocument.documentType,
        businessIdentityKey: sourceDocument.businessIdentityKey,
        revision: 1,
      },
    });

    const service = new AccountingProviderFinancialReviewService(db as never);

    await expect(
      service.confirmRevision(
        sourceDocument.documentStableId,
        'acctfinreview_snapshot_bad',
        expectedHash,
        'user_admin_2',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      db.accountingProviderFinancialReviewRevision.update,
    ).not.toHaveBeenCalled();
    expect(db.accountingAuditLog.create).not.toHaveBeenCalled();
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
      effectiveSnapshotParserName: null,
      effectiveSnapshotParserVersion: null,
      effectiveSnapshotParseRun: null,
      effectiveSnapshotSourceParseRun: null,
      effectiveLines: [],
      corrections: [],
      document: {
        documentStableId: sourceDocument.documentStableId,
        artifactId: 'artifact-db-id',
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
