import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
} from '@prisma/client';
import {
  normalizeAccountingInboxArtifact,
  normalizeAccountingParseRun,
  normalizeAccountingTrustedSender,
  normalizeProviderFinancialDocument,
} from './accounting-inbox-core.policy';
import {
  AccountingInboxWriterConflictError,
  ensureProviderFinancialCoverageInTx,
  recordParseRunInTx,
  recordProviderFinancialDocumentInTx,
  registerInboxArtifactInTx,
  upsertTrustedSenderInTx,
} from './accounting-inbox-core.writer';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

describe('Accounting Inbox core persistence writer', () => {
  const makeTx = () => ({
    accountingSourceArtifact: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    accountingInboxItem: {
      create: jest.fn(),
      update: jest.fn(),
    },
    accountingParseRun: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    accountingTrustedSender: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    accountingProviderFinancialDocument: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    accountingProviderFinancialCoverage: {
      upsert: jest.fn(),
    },
    accountingAuditLog: {
      create: jest.fn(),
    },
  });

  it('creates a pending Inbox item for new trusted evidence', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue(null);
    tx.accountingSourceArtifact.findFirst.mockResolvedValue(null);
    tx.accountingSourceArtifact.create.mockResolvedValue({
      id: 'artifact-db-id',
      artifactStableId: 'acctart_stable_1',
    });
    tx.accountingInboxItem.create.mockResolvedValue({
      inboxItemStableId: 'acctinbox_stable_1',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.UNKNOWN,
      duplicateOfArtifact: null,
    });

    const result = await registerInboxArtifactInTx(
      tx as never,
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
        kind: AccountingArtifactKind.EMAIL_BODY,
        transportIdentity: 'gmail:message-1:body',
        contentHash: SHA_A,
        bodyText: 'closeout',
        senderEmail: 'trusted@example.com',
        trustDecision: AccountingInboxTrustDecision.TRUSTED,
      }),
    );

    expect(result).toEqual({
      artifactStableId: 'acctart_stable_1',
      contentHash: SHA_A,
      kind: AccountingArtifactKind.EMAIL_BODY,
      inboxItem: {
        inboxItemStableId: 'acctinbox_stable_1',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.UNKNOWN,
        duplicateOfArtifact: null,
      },
      duplicateOfArtifactStableId: null,
    });
    expect(tx.accountingInboxItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountingInboxStatus.PENDING_REVIEW,
          trustDecision: AccountingInboxTrustDecision.TRUSTED,
          duplicateOfArtifactId: null,
        }) as unknown,
      }) as unknown,
    );
  });

  it('preserves same-content re-acquisition as explicit duplicate evidence', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue(null);
    tx.accountingSourceArtifact.findFirst.mockResolvedValue({
      id: 'original-db-id',
      artifactStableId: 'acctart_original',
    });
    tx.accountingSourceArtifact.create.mockResolvedValue({
      id: 'duplicate-db-id',
      artifactStableId: 'acctart_duplicate',
    });
    tx.accountingInboxItem.create.mockResolvedValue({
      inboxItemStableId: 'acctinbox_duplicate',
      status: AccountingInboxStatus.DUPLICATE,
      classification: AccountingInboxClassification.UNKNOWN,
      duplicateOfArtifact: { artifactStableId: 'acctart_original' },
    });

    const result = await registerInboxArtifactInTx(
      tx as never,
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
        kind: AccountingArtifactKind.PDF,
        transportIdentity: 'manual:upload-2',
        contentHash: SHA_A,
        storedUrl: '/api/v1/accounting/files/inbox/statement.pdf',
        trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      }),
    );

    expect(result.duplicateOfArtifactStableId).toBe('acctart_original');
    expect(tx.accountingInboxItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountingInboxStatus.DUPLICATE,
          duplicateOfArtifactId: 'original-db-id',
        }) as unknown,
      }) as unknown,
    );
  });

  it('rejects transport identity reuse with changed content', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue({
      artifactStableId: 'acctart_existing',
      contentHash: SHA_A,
      kind: AccountingArtifactKind.CSV,
      inboxItem: null,
    });

    await expect(
      registerInboxArtifactInTx(
        tx as never,
        normalizeAccountingInboxArtifact({
          acquisitionMode: AccountingArtifactAcquisitionMode.PROVIDER_API,
          kind: AccountingArtifactKind.CSV,
          transportIdentity: 'uber:report-1:section-1',
          contentHash: SHA_B,
          storedUrl: '/api/v1/accounting/files/uber-reports/report.csv',
          trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
        }),
      ),
    ).rejects.toBeInstanceOf(AccountingInboxWriterConflictError);
  });

  it('keeps successful parse output immutable for the same parser version', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue({
      id: 'artifact-db-id',
    });
    tx.accountingParseRun.findUnique.mockResolvedValue({
      artifactId: 'artifact-db-id',
      status: AccountingParseStatus.SUCCESS,
      resultHash: SHA_A,
    });

    await expect(
      recordParseRunInTx(
        tx as never,
        normalizeAccountingParseRun({
          artifactStableId: 'acctart_stable_1',
          parserName: 'clover-closeout',
          parserVersion: 'v1',
          status: AccountingParseStatus.SUCCESS,
          resultHash: SHA_B,
        }),
      ),
    ).rejects.toBeInstanceOf(AccountingInboxWriterConflictError);
    expect(tx.accountingParseRun.upsert).not.toHaveBeenCalled();
  });

  it('audits trusted-sender changes with stable user identity', async () => {
    const tx = makeTx();
    tx.accountingTrustedSender.findUnique.mockResolvedValue(null);
    tx.accountingTrustedSender.upsert.mockResolvedValue({
      trustedSenderStableId: 'acctsender_1',
      email: 'owner@example.com',
      label: 'Owner',
      isActive: true,
    });
    tx.accountingAuditLog.create.mockResolvedValue({});

    await upsertTrustedSenderInTx(
      tx as never,
      normalizeAccountingTrustedSender({
        email: 'Owner@Example.com',
        label: 'Owner',
      }),
      'user_stable_1',
    );

    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'CREATE',
        entityType: 'ACCOUNTING_TRUSTED_SENDER',
        entityId: 'acctsender_1',
        operatorUserId: 'user_stable_1',
        afterJson: {
          trustedSenderStableId: 'acctsender_1',
          email: 'owner@example.com',
          label: 'Owner',
          isActive: true,
        },
      },
    });
  });

  it('creates a new provider-financial revision without posting a journal', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue({
      id: 'artifact-db-id-2',
      contentHash: SHA_B,
      inboxItem: {
        id: 'inbox-db-id',
        status: AccountingInboxStatus.PENDING_REVIEW,
      },
    });
    tx.accountingProviderFinancialDocument.findFirst.mockResolvedValue({
      id: 'document-db-id-1',
      documentStableId: 'acctfindoc_1',
      revision: 1,
      provider: AccountingFinancialProvider.CLOVER,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      artifact: { contentHash: SHA_A },
    });
    tx.accountingProviderFinancialDocument.create.mockResolvedValue({});
    tx.accountingInboxItem.update.mockResolvedValue({});

    const result = await recordProviderFinancialDocumentInTx(
      tx as never,
      normalizeProviderFinancialDocument({
        artifactStableId: 'acctart_revision_2',
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        businessIdentityKey: 'clover:merchant:2026-06',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        parserName: 'clover-statement',
        parserVersion: 'v1',
        lines: [
          {
            component: AccountingFinancialComponent.PROCESSING_FEE,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -1250,
          },
        ],
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        revision: 2,
        replayed: false,
      }),
    );
    expect(tx.accountingProviderFinancialDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          artifactId: 'artifact-db-id-2',
          revision: 2,
          supersedesDocumentId: 'document-db-id-1',
        }) as unknown,
      }) as unknown,
    );
    expect(tx.accountingInboxItem.update).toHaveBeenCalledWith({
      where: { id: 'inbox-db-id' },
      data: {
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        materializedEntityType:
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
        materializedEntityStableId: expect.stringMatching(
          /^acctfindoc_/,
        ) as unknown,
        version: { increment: 1 },
      },
    });
    expect('accountingJournalEntry' in tx).toBe(false);
  });

  it('persists the configured financial-history start without inventing a Store DB relation', async () => {
    const tx = makeTx();
    tx.accountingProviderFinancialCoverage.upsert.mockResolvedValue({
      coverageStableId: 'acctcoverage_1',
      provider: AccountingFinancialProvider.FANTUAN,
      storeStableId: '4750_Yonge_Street',
      financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
      financialCompleteThrough: null,
      liveOrderFactCutoverAt: null,
      orderDetailCoverageFrom: null,
    });

    const result = await ensureProviderFinancialCoverageInTx(
      tx as never,
      AccountingFinancialProvider.FANTUAN,
      '4750_Yonge_Street',
      new Date('2026-06-01T00:00:00.000Z'),
      'user_stable_1',
    );

    expect(result.financialHistoryRequiredFrom).toBe('2026-06-01');
    expect(tx.accountingProviderFinancialCoverage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: AccountingFinancialProvider.FANTUAN,
          storeStableId: '4750_Yonge_Street',
          updatedByUserStableId: 'user_stable_1',
        }) as unknown,
      }) as unknown,
    );
  });
});
