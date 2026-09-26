import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingDocumentSource,
  AccountingDocumentStatus,
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
  normalizeAccountingInboxExpenseMaterialization,
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
import {
  discardInboxItemInTx,
  materializeInboxExpenseInTx,
} from './accounting-inbox-expense.writer';

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
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    accountingExpenseDocument: {
      findUnique: jest.fn(),
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
      storedUrl: null,
      inboxItem: {
        inboxItemStableId: 'acctinbox_stable_1',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.UNKNOWN,
        duplicateOfArtifact: null,
      },
      duplicateOfArtifactStableId: null,
      replayed: false,
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
    expect(result.storedUrl).toBeNull();
    expect(tx.accountingSourceArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storedUrl: null }) as unknown,
      }) as unknown,
    );
    expect(tx.accountingInboxItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountingInboxStatus.DUPLICATE,
          duplicateOfArtifactId: 'original-db-id',
        }) as unknown,
      }) as unknown,
    );
  });

  it('does not create image retention storage state for a duplicate manual image', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue(null);
    tx.accountingSourceArtifact.findFirst.mockResolvedValue({
      id: 'original-image-db-id',
      artifactStableId: 'acctart_original_image',
    });
    let artifactCreateDataKeys: string[] = [];
    tx.accountingSourceArtifact.create.mockImplementationOnce(
      (input: { data: Record<string, unknown> }) => {
        artifactCreateDataKeys = Object.keys(input.data);
        return Promise.resolve({
          id: 'duplicate-image-db-id',
          artifactStableId: 'acctart_duplicate_image',
        });
      },
    );
    tx.accountingInboxItem.create.mockResolvedValue({
      inboxItemStableId: 'acctinbox_duplicate_image',
      status: AccountingInboxStatus.DUPLICATE,
      classification: AccountingInboxClassification.UNKNOWN,
      duplicateOfArtifact: { artifactStableId: 'acctart_original_image' },
    });

    const result = await registerInboxArtifactInTx(
      tx as never,
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
        kind: AccountingArtifactKind.IMAGE,
        transportIdentity: 'manual:duplicate-image',
        contentHash: SHA_A,
        storedUrl: '/api/v1/accounting/files/inbox/duplicate.jpg',
        trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      }),
    );

    expect(result.storedUrl).toBeNull();
    expect(tx.accountingSourceArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storedUrl: null,
        }) as unknown,
      }) as unknown,
    );
    expect(artifactCreateDataKeys).not.toContain('binaryRetention');
  });

  it('creates ORIGINAL_PRESENT retention state with a new image source artifact', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue(null);
    tx.accountingSourceArtifact.findFirst.mockResolvedValue(null);
    tx.accountingSourceArtifact.create.mockResolvedValue({
      id: 'artifact-image-db-id',
      artifactStableId: 'acctart_image_1',
    });
    tx.accountingInboxItem.create.mockResolvedValue({
      inboxItemStableId: 'acctinbox_image_1',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.UNKNOWN,
      duplicateOfArtifact: null,
    });

    await registerInboxArtifactInTx(
      tx as never,
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
        kind: AccountingArtifactKind.IMAGE,
        transportIdentity: 'manual:image-1',
        contentHash: SHA_A,
        mimeType: 'image/jpeg',
        originalFilename: 'receipt.jpg',
        byteSize: 123_456,
        storedUrl: '/api/v1/accounting/files/inbox/receipt.jpg',
        trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      }),
    );

    expect(tx.accountingSourceArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: AccountingArtifactKind.IMAGE,
          contentHash: SHA_A,
          binaryRetention: { create: {} },
        }) as unknown,
      }) as unknown,
    );
  });

  it('promotes a quarantined transport replay after the sender becomes trusted', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue({
      artifactStableId: 'acctart_existing',
      contentHash: SHA_A,
      kind: AccountingArtifactKind.EMAIL_BODY,
      inboxItem: {
        id: 'inbox-db-id',
        inboxItemStableId: 'acctinbox_existing',
        status: AccountingInboxStatus.QUARANTINED,
        classification: AccountingInboxClassification.UNKNOWN,
        trustDecision: AccountingInboxTrustDecision.UNTRUSTED,
        materializedEntityType: null,
        materializedEntityStableId: null,
        duplicateOfArtifact: null,
      },
    });
    tx.accountingInboxItem.update.mockResolvedValue({
      inboxItemStableId: 'acctinbox_existing',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.UNKNOWN,
      trustDecision: AccountingInboxTrustDecision.TRUSTED,
      materializedEntityType: null,
      materializedEntityStableId: null,
      duplicateOfArtifact: null,
    });

    const result = await registerInboxArtifactInTx(
      tx as never,
      normalizeAccountingInboxArtifact({
        acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
        kind: AccountingArtifactKind.EMAIL_BODY,
        transportIdentity: 'gmail:message-1:body',
        contentHash: SHA_A,
        bodyText: 'invoice total $12.34',
        senderEmail: 'trusted@example.com',
        trustDecision: AccountingInboxTrustDecision.TRUSTED,
      }),
    );

    expect(result.replayed).toBe(true);
    expect(result.inboxItem?.status).toBe(AccountingInboxStatus.PENDING_REVIEW);
    expect(tx.accountingInboxItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inbox-db-id' },
        data: expect.objectContaining({
          status: AccountingInboxStatus.PENDING_REVIEW,
          trustDecision: AccountingInboxTrustDecision.TRUSTED,
        }) as unknown,
      }) as unknown,
    );
  });

  it('materializes a pending Inbox artifact to a legacy ExpenseDocument only on explicit review', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue({
      contentHash: SHA_A,
      inboxItem: {
        id: 'inbox-db-id',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
      },
    });
    tx.accountingExpenseDocument.create.mockResolvedValue({});
    tx.accountingInboxItem.update.mockResolvedValue({});

    const result = await materializeInboxExpenseInTx(
      tx as never,
      normalizeAccountingInboxExpenseMaterialization({
        artifactStableId: 'acctart_expense',
        source: AccountingDocumentSource.GMAIL,
        occurredAt: '2026-09-12',
        subtotalCents: 1000,
        taxCents: 130,
        totalCents: 1130,
        gmailMessageId: 'gmail-message-1',
        gmailAttachmentId: 'attachment-1',
        attachmentUrls: ['/api/v1/accounting/files/inbox/invoice.pdf'],
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({ replayed: false }) as unknown,
    );
    expect(tx.accountingExpenseDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: AccountingDocumentSource.GMAIL,
          status: AccountingDocumentStatus.PENDING_REVIEW,
          fileHash: SHA_A,
          gmailMessageId: 'gmail-message-1',
        }) as unknown,
      }) as unknown,
    );
    expect(tx.accountingInboxItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          materializedEntityType:
            AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
        }) as unknown,
      }) as unknown,
    );
    expect('accountingJournalEntry' in tx).toBe(false);
  });

  it('clears a pending expense materialization before marking its Inbox item discarded', async () => {
    const tx = makeTx();
    tx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-db-id',
      status: AccountingInboxStatus.PENDING_REVIEW,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
      materializedEntityStableId: 'expense_1',
    });
    tx.accountingExpenseDocument.findUnique.mockResolvedValue({
      id: 'expense-db-id',
      status: AccountingDocumentStatus.PENDING_REVIEW,
    });
    tx.accountingExpenseDocument.update.mockResolvedValue({});
    tx.accountingInboxItem.update.mockResolvedValue({});
    tx.accountingAuditLog.create.mockResolvedValue({});

    await discardInboxItemInTx(tx as never, 'acctinbox_1', 'user_stable_1');

    expect(tx.accountingExpenseDocument.update).toHaveBeenCalledWith({
      where: { id: 'expense-db-id' },
      data: { status: AccountingDocumentStatus.DISCARDED },
    });
    expect(tx.accountingInboxItem.update).toHaveBeenCalledWith({
      where: { id: 'inbox-db-id' },
      data: expect.objectContaining({
        status: AccountingInboxStatus.DISCARDED,
        classification: AccountingInboxClassification.UNKNOWN,
        materializedEntityType: null,
        materializedEntityStableId: null,
      }) as unknown,
    });
  });

  it('allows abandoning a manual-upload error but keeps non-manual error behavior unchanged', async () => {
    const manualTx = makeTx();
    manualTx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-manual-error',
      status: AccountingInboxStatus.ERROR,
      materializedEntityType: null,
      materializedEntityStableId: null,
      artifact: {
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
      },
    });
    manualTx.accountingInboxItem.update.mockResolvedValue({});
    manualTx.accountingAuditLog.create.mockResolvedValue({});

    await expect(
      discardInboxItemInTx(
        manualTx as never,
        'acctinbox_manual_error',
        'user_stable_1',
      ),
    ).resolves.toEqual({
      inboxItemStableId: 'acctinbox_manual_error',
      discarded: true,
      replayed: false,
    });

    const emailTx = makeTx();
    emailTx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-email-error',
      status: AccountingInboxStatus.ERROR,
      materializedEntityType: null,
      materializedEntityStableId: null,
      artifact: { acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL },
    });

    await expect(
      discardInboxItemInTx(
        emailTx as never,
        'acctinbox_email_error',
        'user_stable_1',
      ),
    ).rejects.toBeInstanceOf(AccountingInboxWriterConflictError);
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
        operatorActorRef: 'user_stable_1',
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
        selectedProvider: AccountingFinancialProvider.CLOVER,
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

  it('fails closed when a Clover Batch ID is reused with different content', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue({
      id: 'artifact-db-id-batch-2',
      contentHash: SHA_B,
      inboxItem: {
        id: 'inbox-db-id',
        status: AccountingInboxStatus.PENDING_REVIEW,
      },
    });
    tx.accountingProviderFinancialDocument.findFirst.mockResolvedValue({
      id: 'document-db-id-batch-1',
      documentStableId: 'acctfindoc_batch_1',
      revision: 1,
      provider: AccountingFinancialProvider.CLOVER,
      documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
      artifact: { contentHash: SHA_A },
    });

    await expect(
      recordProviderFinancialDocumentInTx(
        tx as never,
        normalizeProviderFinancialDocument({
          artifactStableId: 'acctart_batch_conflict',
          provider: AccountingFinancialProvider.CLOVER,
          documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
          businessIdentityKey: 'clover:batch:097NYJ27P2HZM',
          providerDocumentRef: '097NYJ27P2HZM',
          periodStart: '2026-09-06',
          periodEnd: '2026-09-06',
          parserName: 'accounting-provider-financial',
          parserVersion: '9',
          lines: [
            {
              component: AccountingFinancialComponent.SALES,
              postingTreatment:
                AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
              amountCents: 5721,
            },
          ],
        }),
      ),
    ).rejects.toThrow(AccountingInboxWriterConflictError);
    expect(tx.accountingProviderFinancialDocument.create).not.toHaveBeenCalled();
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
