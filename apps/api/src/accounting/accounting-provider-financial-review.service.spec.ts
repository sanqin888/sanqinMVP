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
    const documentStableId = 'acctfindoc_clover_june';
    const document = {
      id: 'document-clover-db-id',
      artifactId: 'artifact-clover-db-id',
      documentStableId,
      provider: AccountingFinancialProvider.CLOVER,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      businessIdentityKey:
        'clover:statement:29351880018:2026-06-01:2026-06-30',
      revision: 1,
      providerMerchantRef: '29351880018',
      providerDocumentRef: '29351880018:2026-06-01:2026-06-30',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-06-30T00:00:00.000Z'),
      currency: 'CAD',
      parserName: 'accounting-provider-financial',
      parserVersion: '6',
      artifact: {
        artifactStableId: 'acctart_clover_june',
        originalFilename: 'clover_062026.pdf',
        emailSubject: null,
      },
    };
    db.accountingProviderFinancialDocument.findUnique.mockResolvedValue(document);
    db.accountingProviderFinancialDocument.findFirst.mockResolvedValue({
      documentStableId,
      revision: 1,
    });
    db.accountingJournalEntry.findFirst.mockResolvedValue(null);
    db.accountingSourceArtifact.findUnique.mockResolvedValue({
      id: 'artifact-clover-db-id',
    });
    db.accountingProviderFinancialReviewRevision.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    db.accountingParseRun.findMany.mockResolvedValue([
      {
        id: 'parse-run-db-id',
        parseRunStableId: 'acctparserun_clover_recognition',
        parserName: 'accounting-provider-recognition',
        parserVersion: 'acct_recognition_clover_statement:v1',
        resultHash: 'c'.repeat(64),
        resultJson: {
          extractedText: `
MERCHANT CARD PROCESSING STATEMENT
StatementPeriod 06/01/26 - 06/30/26
Merchant Number 29351880018
LOCATION
SUMMARY
Total Amount Submitted 3,362.10
Third-Party Transactions 0.00
Adjustments 0.00
Interchange Charges 0.00
Service Charges -62.64
Fees -35.75
Chargebacks/Reversals 0.00
Total Amount Funded 3,263.71
All amounts shown are in CAD funds
SERVICE CHARGES
Date Invoice Description Tax Total
06/30/26 000086953 DISCOUNT FEES HST:0.00 -62.64
Total HST:0.00 -62.64
FEES
Date Invoice Description Tax Total
06/17/26 011981361 MONTHLY EQUIPMENT BILL HST:-3.90 -33.90
06/25/26 000069239 MC LICENSE VOLUME FEE HST:0.00 -0.04
06/25/26 000069240 MC-AUTH DIGITAL ENABLEMENT MIN HST:0.00 -0.25
06/25/26 000069241 MC CLEARING CONNECTIVITY FEE HST:0.00 -0.50
06/25/26 000069242 MC AUTH CONNECTIVITY FEE HST:0.00 -0.53
06/25/26 000069243 MC ACQ CLEAR LARGE TICKET HST:0.00 -0.22
06/25/26 000069244 MC ACQ CLEAR SMALL TICKET HST:0.00 -0.31
Total HST:-3.90 -35.75
`,
        },
      },
    ]);
    db.accountingParseRun.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'parse-run-v7-db-id',
        parseRunStableId: 'acctparserun_clover_v7',
        resultHash: 'd'.repeat(64),
      });
    db.accountingParseRun.upsert.mockResolvedValue({
      parseRunStableId: 'acctparserun_clover_v7',
      status: 'SUCCESS',
      resultHash: 'd'.repeat(64),
      completedAt: new Date('2026-09-24T15:00:00.000Z'),
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
          reviewRevisionStableId: 'acctfinreview_clover_v7',
          revision: data.revision,
          status: data.status,
          reviewHash: data.reviewHash,
          note: data.note,
          effectiveSnapshotParserName: data.effectiveSnapshotParserName,
          effectiveSnapshotParserVersion: data.effectiveSnapshotParserVersion,
          effectiveSnapshotParseRun: {
            parseRunStableId: 'acctparserun_clover_v7',
          },
          effectiveSnapshotSourceParseRun: {
            parseRunStableId: 'acctparserun_clover_recognition',
          },
          createdByUserStableId: data.createdByUserStableId,
          confirmedByUserStableId: null,
          confirmedAt: null,
          createdAt: new Date('2026-09-24T15:00:00.000Z'),
          updatedAt: new Date('2026-09-24T15:00:00.000Z'),
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
        effectiveSnapshotParserVersion: '7',
        effectiveSnapshotParseRunStableId: 'acctparserun_clover_v7',
        effectiveSnapshotSourceParseRunStableId:
          'acctparserun_clover_recognition',
        corrections: [],
      }),
    );
    expect(result.effectiveLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawName: 'Fees',
          component: AccountingFinancialComponent.CONTROL_TOTAL,
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
          amountCents: -3575,
        }),
        expect.objectContaining({
          rawName: 'Monthly Equipment Bill',
          component: AccountingFinancialComponent.PLATFORM_OTHER_FEE,
          amountCents: -3000,
        }),
        expect.objectContaining({
          rawName: 'Monthly Equipment Bill HST',
          component: AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
          taxRole: AccountingFinancialTaxRole.INPUT_TAX,
          amountCents: -390,
        }),
        expect.objectContaining({
          rawName: 'Other Card/Network Fees',
          component: AccountingFinancialComponent.PROCESSING_FEE,
          amountCents: -185,
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
          effectiveSnapshotParserVersion: '7',
          effectiveSnapshotParseRunId: 'parse-run-v7-db-id',
          effectiveSnapshotSourceParseRunId: 'parse-run-db-id',
          effectiveLines: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                rawName: 'Monthly Equipment Bill',
                amountCents: -3000,
              }),
            ]),
          }),
        }) as unknown,
      }),
    );
    expect(db.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_PARSER_REEVALUATION_REVIEW_DRAFT',
        entityId: 'acctfinreview_clover_v7',
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
