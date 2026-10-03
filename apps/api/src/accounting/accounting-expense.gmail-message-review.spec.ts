import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import { AccountingExpenseService } from './accounting-expense.service';

describe('AccountingExpenseService Gmail message-level review handoff', () => {
  it('uses the single PDF attachment as canonical Expense source and closes the email body support item', async () => {
    const gmailMessageId = 'gmail-grease-september';
    const body = {
      inboxItemStableId: 'acctinbox_body',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      selectedProvider: null,
      materializedEntityType: null,
      materializedEntityStableId: null,
      expenseEvidenceSourceLink: null,
      expenseEvidenceNotificationLink: null,
      artifact: {
        artifactStableId: 'acctart_body',
        acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
        kind: AccountingArtifactKind.EMAIL_BODY,
        contentHash: 'body-hash',
        storedUrl: null,
        bodyText: 'Please see attached invoice.',
        emailSubject: 'invoice for grease trap cleaning in September',
        metadataJson: { gmailMessageId, gmailAttachmentId: null },
        parseRuns: [{ resultJson: { reviewDisposition: 'UNRECOGNIZED' } }],
      },
    };
    const pdf = {
      inboxItemStableId: 'acctinbox_pdf',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.UNKNOWN,
      selectedProvider: null,
      materializedEntityType: null,
      materializedEntityStableId: null,
      artifact: {
        artifactStableId: 'acctart_pdf',
        acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
        kind: AccountingArtifactKind.PDF,
        contentHash: 'pdf-hash',
        storedUrl: '/api/v1/accounting/files/inbox/grease.pdf',
        bodyText: null,
        emailSubject: 'invoice for grease trap cleaning in September',
        metadataJson: {
          gmailMessageId,
          gmailAttachmentId: 'gmail-attachment-1',
        },
        parseRuns: [
          {
            resultJson: {
              date: '2026-09-30',
              totalCents: 22600,
              reviewDisposition: 'UNRECOGNIZED',
              financialConsistency: 'INSUFFICIENT',
              extractedText: 'Grease trap cleaning invoice',
            },
          },
        ],
      },
    };

    let createdDocumentStableId = '';
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(body)
      .mockResolvedValueOnce({
        id: 'pdf-inbox-db-id',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.UNKNOWN,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
      })
      .mockImplementation(() =>
        Promise.resolve({
          id: 'pdf-inbox-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType:
            AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
          materializedEntityStableId: createdDocumentStableId,
        }),
      );
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([body, pdf])
      .mockResolvedValueOnce([
        {
          id: 'body-inbox-db-id',
          inboxItemStableId: 'acctinbox_body',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
        },
      ]);
    const update = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createExpense = jest.fn(
      (args: { data: { documentStableId: string } }) => {
        createdDocumentStableId = args.data.documentStableId;
        return Promise.resolve({ id: 'expense-db-id' });
      },
    );
    const createAudit = jest.fn().mockResolvedValue({});

    const tx = {
      accountingInboxItem: {
        findUnique,
        findMany,
        update,
        updateMany,
      },
      accountingSourceArtifact: {
        findUnique: jest.fn().mockResolvedValue({
          contentHash: 'pdf-hash',
          inboxItem: {
            id: 'pdf-inbox-db-id',
            status: AccountingInboxStatus.PENDING_REVIEW,
            classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
            selectedProvider: null,
            materializedEntityType: null,
            materializedEntityStableId: null,
          },
        }),
      },
      accountingExpenseDocument: { create: createExpense },
      accountingAuditLog: { create: createAudit },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service, 'getExpenseDocument')
      .mockResolvedValue({ documentStableId: 'expense_review_1' } as never);

    const result = await service.beginUnifiedInboxExpenseReview(
      'acctinbox_body',
      'user_operator',
    );

    expect(result).toEqual({ documentStableId: 'expense_review_1' });
    expect(createExpense).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'GMAIL',
        fileHash: 'pdf-hash',
        gmailMessageId,
        gmailAttachmentId: 'gmail-attachment-1',
        attachmentUrls: ['/api/v1/accounting/files/inbox/grease.pdf'],
        extractedText: 'Grease trap cleaning invoice',
      }) as unknown,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'pdf-inbox-db-id' },
      data: {
        classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        version: { increment: 1 },
      },
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['body-inbox-db-id'] },
        }) as unknown,
        data: expect.objectContaining({
          status: AccountingInboxStatus.CONFIRMED,
          classification: AccountingInboxClassification.OTHER_DOCUMENT,
        }) as unknown,
      }),
    );
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'BEGIN_GMAIL_EXPENSE_REVIEW',
      }) as unknown,
    });
  });
});
