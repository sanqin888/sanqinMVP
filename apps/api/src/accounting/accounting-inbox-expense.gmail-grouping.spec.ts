import {
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import {
  closeGmailMessageSupportingEvidenceInTx,
  prepareGmailExpenseSourceInTx,
} from './accounting-inbox-expense.writer';

describe('Accounting Inbox Gmail expense handoff writers', () => {
  it('promotes a pending Gmail attachment to Expense classification before materialization', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'source-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.UNKNOWN,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
        }),
        update,
      },
    };

    await prepareGmailExpenseSourceInTx(
      tx as never,
      'acctinbox_gmail_attachment',
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'source-db-id' },
      data: {
        classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        version: { increment: 1 },
      },
    });
  });

  it('closes same-message supporting Inbox rows after the primary attachment enters review', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createAudit = jest.fn().mockResolvedValue({});
    const tx = {
      accountingInboxItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'body-db-id',
            inboxItemStableId: 'acctinbox_body',
            status: AccountingInboxStatus.PENDING_REVIEW,
            classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
            selectedProvider: null,
            materializedEntityType: null,
            materializedEntityStableId: null,
          },
        ]),
        updateMany,
      },
      accountingAuditLog: { create: createAudit },
    };

    await closeGmailMessageSupportingEvidenceInTx(tx as never, {
      inboxItemStableIds: ['acctinbox_body'],
      documentStableId: 'expense_review_1',
      operatorUserStableId: 'user_operator',
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['body-db-id'] },
        status: AccountingInboxStatus.PENDING_REVIEW,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
        classification: {
          not: AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        },
      },
      data: expect.objectContaining({
        status: AccountingInboxStatus.CONFIRMED,
        classification: AccountingInboxClassification.OTHER_DOCUMENT,
        reviewedByUserStableId: 'user_operator',
      }) as unknown,
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'BEGIN_GMAIL_EXPENSE_REVIEW',
        afterJson: expect.objectContaining({
          documentStableId: 'expense_review_1',
          supportingInboxItemStableIds: ['acctinbox_body'],
        }) as unknown,
      }) as unknown,
    });
  });

  it('refuses to close Provider Financial siblings as ordinary Gmail support', async () => {
    const tx = {
      accountingInboxItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'provider-db-id',
            inboxItemStableId: 'acctinbox_provider',
            status: AccountingInboxStatus.PENDING_REVIEW,
            classification:
              AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
            selectedProvider: 'CLOVER',
            materializedEntityType: null,
            materializedEntityStableId: null,
          },
        ]),
        updateMany: jest.fn(),
      },
      accountingAuditLog: { create: jest.fn() },
    };

    await expect(
      closeGmailMessageSupportingEvidenceInTx(tx as never, {
        inboxItemStableIds: ['acctinbox_provider'],
        documentStableId: 'expense_review_1',
        operatorUserStableId: 'user_operator',
      }),
    ).rejects.toThrow(
      'gmail supporting evidence cannot be closed independently',
    );
    expect(tx.accountingInboxItem.updateMany).not.toHaveBeenCalled();
  });

  it('leaves an already materialized Expense source untouched by preparation', async () => {
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'source-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType:
            AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
          materializedEntityStableId: 'expense_existing',
        }),
        update: jest.fn(),
      },
    };

    await expect(
      prepareGmailExpenseSourceInTx(
        tx as never,
        'acctinbox_gmail_attachment',
      ),
    ).rejects.toThrow(
      'gmail expense source is not eligible for expense review',
    );
  });
});
