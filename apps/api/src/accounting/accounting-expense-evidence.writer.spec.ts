import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import {
  closeExpenseNotificationForReviewInTx,
  linkExpenseEvidenceSourceInTx,
  resolveLinkedExpenseEvidenceInTx,
  unlinkExpenseEvidenceSourceInTx,
} from './accounting-expense-evidence.writer';

describe('Accounting expense supplemental evidence writer', () => {
  it('links one pending retained file to a pending expense-notification email', async () => {
    const createLink = jest.fn().mockResolvedValue({});
    const createAudit = jest.fn().mockResolvedValue({});
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'notification-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          artifact: {
            kind: AccountingArtifactKind.EMAIL_BODY,
            acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
            storedUrl: null,
            bodyText:
              'Your monthly bill is now ready to view Total Balance Due: $247.57',
            emailSubject: 'Metergy Solutions - Your e-bill is ready',
            parseRuns: [
              {
                resultJson: {
                  date: '2026-10-13',
                  totalCents: 24757,
                  financialConsistency: 'INSUFFICIENT',
                  reviewDisposition: 'LIKELY_BILL',
                },
              },
            ],
          },
          expenseEvidenceNotificationLink: null,
        }),
      },
      accountingSourceArtifact: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'source-artifact-db-id',
          artifactStableId: 'acctart_bill_pdf',
          acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
          kind: AccountingArtifactKind.PDF,
          storedUrl: '/api/v1/accounting/files/inbox/metergy.pdf',
          inboxItem: {
            id: 'source-inbox-db-id',
            inboxItemStableId: 'acctinbox_bill_pdf',
            status: AccountingInboxStatus.PENDING_REVIEW,
            classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
            selectedProvider: null,
            materializedEntityType: null,
            materializedEntityStableId: null,
            expenseEvidenceSourceLink: null,
            artifact: {
              parseRuns: [
                {
                  resultJson: {
                    requiresBatchExpenseImport: false,
                  },
                },
              ],
            },
          },
        }),
      },
      accountingExpenseEvidenceLink: { create: createLink },
      accountingAuditLog: { create: createAudit },
    };

    const result = await linkExpenseEvidenceSourceInTx(
      tx as never,
      'acctinbox_notification',
      'acctart_bill_pdf',
      'user_operator',
    );

    expect(result).toEqual(
      expect.objectContaining({
        notificationInboxItemStableId: 'acctinbox_notification',
        sourceInboxItemStableId: 'acctinbox_bill_pdf',
        sourceArtifactStableId: 'acctart_bill_pdf',
        replayed: false,
      }),
    );
    expect(createLink).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notificationInboxItemId: 'notification-db-id',
        sourceInboxItemId: 'source-inbox-db-id',
        linkedByUserStableId: 'user_operator',
      }) as unknown,
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'LINK_EXPENSE_SOURCE_EVIDENCE',
        entityId: 'acctinbox_notification',
      }) as unknown,
    });
  });

  it('rejects supplemental linking when the email body is already sufficient standalone expense evidence', async () => {
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'notification-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          artifact: {
            kind: AccountingArtifactKind.EMAIL_BODY,
            acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
            storedUrl: null,
            bodyText:
              'Invoice Date: 2026-08-15 Subtotal $100.00 HST $13.00 Total $113.00',
            emailSubject: 'August invoice',
            parseRuns: [
              {
                resultJson: {
                  date: '2026-08-15',
                  totalCents: 11300,
                  financialConsistency: 'MATCHED',
                  reviewDisposition: 'LIKELY_BILL',
                },
              },
            ],
          },
          expenseEvidenceNotificationLink: null,
        }),
      },
      accountingSourceArtifact: {
        findUnique: jest.fn(),
      },
    };

    await expect(
      linkExpenseEvidenceSourceInTx(
        tx as never,
        'acctinbox_notification',
        'acctart_bill_pdf',
        'user_operator',
      ),
    ).rejects.toThrow(
      'expense email already has sufficient standalone source evidence',
    );
    expect(tx.accountingSourceArtifact.findUnique).not.toHaveBeenCalled();
  });

  it('unlinks and discards a pending manual source so the notification can accept a replacement bill', async () => {
    const deleteLink = jest.fn().mockResolvedValue({});
    const updateSource = jest.fn().mockResolvedValue({});
    const createAudit = jest.fn().mockResolvedValue({});
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'notification-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          expenseEvidenceNotificationLink: {
            id: 'link-db-id',
            linkStableId: 'acctexplink_1',
            sourceInboxItem: {
              id: 'source-inbox-db-id',
              inboxItemStableId: 'acctinbox_bill_pdf',
              status: AccountingInboxStatus.PENDING_REVIEW,
              materializedEntityType: null,
              materializedEntityStableId: null,
              artifact: {
                acquisitionMode:
                  AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
              },
            },
          },
        }),
        update: updateSource,
      },
      accountingExpenseEvidenceLink: { delete: deleteLink },
      accountingAuditLog: { create: createAudit },
    };

    const result = await unlinkExpenseEvidenceSourceInTx(
      tx as never,
      'acctinbox_notification',
      'user_operator',
    );

    expect(deleteLink).toHaveBeenCalledWith({ where: { id: 'link-db-id' } });
    expect(updateSource).toHaveBeenCalledWith({
      where: { id: 'source-inbox-db-id' },
      data: expect.objectContaining({
        status: AccountingInboxStatus.DISCARDED,
        reviewedByUserStableId: 'user_operator',
      }) as unknown,
    });
    expect(result).toEqual({
      notificationInboxItemStableId: 'acctinbox_notification',
      sourceInboxItemStableId: 'acctinbox_bill_pdf',
      unlinked: true,
      sourceDisposition: 'DISCARDED',
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UNLINK_EXPENSE_SOURCE_EVIDENCE',
        entityId: 'acctinbox_notification',
      }) as unknown,
    });
  });

  it('closes the notification when its linked source enters Expense review', async () => {
    const update = jest.fn().mockResolvedValue({});
    const createAudit = jest.fn().mockResolvedValue({});
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'notification-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          expenseEvidenceNotificationLink: {
            linkStableId: 'acctexplink_1',
            sourceInboxItem: {
              inboxItemStableId: 'acctinbox_bill_pdf',
              materializedEntityType:
                AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
              materializedEntityStableId: 'expense_1',
            },
          },
        }),
        update,
      },
      accountingAuditLog: { create: createAudit },
    };

    await closeExpenseNotificationForReviewInTx(tx as never, {
      notificationInboxItemStableId: 'acctinbox_notification',
      sourceInboxItemStableId: 'acctinbox_bill_pdf',
      documentStableId: 'expense_1',
      operatorUserStableId: 'user_operator',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'notification-db-id' },
      data: expect.objectContaining({
        status: AccountingInboxStatus.CONFIRMED,
        classification: AccountingInboxClassification.OTHER_DOCUMENT,
        reviewedByUserStableId: 'user_operator',
      }) as unknown,
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'BEGIN_EXPENSE_REVIEW_WITH_EVIDENCE',
        entityId: 'acctinbox_notification',
        afterJson: expect.objectContaining({
          sourceInboxItemStableId: 'acctinbox_bill_pdf',
          documentStableId: 'expense_1',
        }) as unknown,
      }) as unknown,
    });
  });

  it('confirms the linked source as the Expense and resolves the notification as reviewed Other evidence', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const createAudit = jest.fn().mockResolvedValue({});
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'notification-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          expenseEvidenceNotificationLink: {
            linkStableId: 'acctexplink_1',
            sourceInboxItem: {
              id: 'source-inbox-db-id',
              inboxItemStableId: 'acctinbox_bill_pdf',
            },
          },
        }),
        updateMany,
      },
      accountingAuditLog: { create: createAudit },
    };

    await resolveLinkedExpenseEvidenceInTx(tx as never, {
      notificationInboxItemStableId: 'acctinbox_notification',
      sourceInboxItemStableId: 'acctinbox_bill_pdf',
      documentStableId: 'expense_1',
      operatorUserStableId: 'user_operator',
    });

    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'source-inbox-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
        }) as unknown,
        data: expect.objectContaining({
          status: AccountingInboxStatus.CONFIRMED,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          materializedEntityType:
            AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
          materializedEntityStableId: 'expense_1',
        }) as unknown,
      }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'notification-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
        }) as unknown,
        data: expect.objectContaining({
          status: AccountingInboxStatus.CONFIRMED,
          classification: AccountingInboxClassification.OTHER_DOCUMENT,
        }) as unknown,
      }),
    );
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RESOLVE_EXPENSE_NOTIFICATION_WITH_EVIDENCE',
        entityId: 'acctinbox_notification',
        afterJson: expect.objectContaining({
          sourceInboxItemStableId: 'acctinbox_bill_pdf',
          documentStableId: 'expense_1',
        }) as unknown,
      }) as unknown,
    });
  });
});
