import {
  AccountingArtifactKind,
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxStatus,
} from '@prisma/client';
import { AccountingExpenseService } from './accounting-expense.service';

function withTransaction<T extends object>(tx: T) {
  return {
    ...tx,
    $transaction: jest.fn((callback: (client: T) => Promise<unknown>) =>
      callback(tx),
    ),
  };
}

describe('AccountingExpenseService provider-financial expense guard', () => {
  it('requires an explicit expense classification before provider-suggested evidence can be confirmed as an expense', async () => {
    const prisma = withTransaction({
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification:
            AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
          selectedProvider: AccountingFinancialProvider.CLOVER,
          materializedEntityType: null,
          materializedEntityStableId: null,
          artifact: {
            artifactStableId: 'acctart_pre_history',
            acquisitionMode: 'MANUAL_UPLOAD',
            storedUrl: '/api/v1/accounting/files/inbox/clover-may.pdf',
            bodyText: null,
            emailSubject: null,
            metadataJson: {},
            parseRuns: [
              {
                resultJson: {
                  providerFinancial: true,
                  excludedBeforeFinancialHistory: true,
                  financialHistoryRequiredFrom: '2026-06-01',
                },
              },
            ],
          },
        }),
      },
    });
    const service = new AccountingExpenseService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.confirmUnifiedInboxExpense(
        'acctinbox_pre_history',
        {
          occurredAt: '2026-05-31',
          totalCents: 100,
          splits: [
            {
              categoryStableId: 'expense_other',
              amountCents: 100,
              taxCents: 0,
              paidFromAccountStableId: null,
            },
          ],
        },
        'user_operator',
      ),
    ).rejects.toThrow(
      'inbox item must be classified as an expense before confirmation',
    );
  });

  it('rejects multi-row structured expense CSV evidence from the single-expense confirmation path', async () => {
    const prisma = withTransaction({
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          artifact: {
            artifactStableId: 'acctart_expense_batch',
            acquisitionMode: 'MANUAL_UPLOAD',
            kind: AccountingArtifactKind.CSV,
            storedUrl: '/api/v1/accounting/files/inbox/history.csv',
            bodyText: null,
            emailSubject: null,
            metadataJson: {},
            parseRuns: [
              {
                resultJson: {
                  structuredExpenseCsv: true,
                  structuredExpenseRowCount: 2,
                  requiresBatchExpenseImport: true,
                },
              },
            ],
          },
        }),
      },
    });
    const service = new AccountingExpenseService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.confirmUnifiedInboxExpense(
        'acctinbox_expense_batch',
        {
          occurredAt: '2026-07-28',
          totalCents: 8469,
          splits: [
            {
              categoryStableId: 'expense_telecom',
              amountCents: 8469,
              taxCents: 0,
              paidFromAccountStableId: null,
            },
          ],
        },
        'user_operator',
      ),
    ).rejects.toThrow(
      'structured expense CSV batch cannot be confirmed as a single expense',
    );
  });

  it('rejects direct Expense confirmation of a source file that is linked under a notification card', async () => {
    const prisma = withTransaction({
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          expenseEvidenceSourceLink: {
            linkStableId: 'acctexplink_1',
            notificationInboxItem: {
              inboxItemStableId: 'acctinbox_notification',
            },
          },
          expenseEvidenceNotificationLink: null,
          artifact: {
            artifactStableId: 'acctart_bill_pdf',
            acquisitionMode: 'MANUAL_UPLOAD',
            kind: AccountingArtifactKind.PDF,
            contentHash: 'bill-hash',
            storedUrl: '/api/v1/accounting/files/inbox/bill.pdf',
            bodyText: null,
            emailSubject: null,
            metadataJson: {},
            parseRuns: [{ resultJson: { totalCents: 24757 } }],
          },
        }),
      },
    });
    const service = new AccountingExpenseService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.confirmUnifiedInboxExpense(
        'acctinbox_bill_pdf',
        {
          occurredAt: '2026-09-24',
          totalCents: 24757,
          splits: [
            {
              categoryStableId: 'expense_utilities',
              amountCents: 24757,
              taxCents: 0,
              paidFromAccountStableId: null,
            },
          ],
        },
        'user_operator',
      ),
    ).rejects.toThrow(
      'linked expense source evidence must be confirmed through its notification inbox item',
    );
  });

  it('keeps a bill-notification email in Pending until formal source evidence is supplied', async () => {
    const prisma = withTransaction({
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          expenseEvidenceSourceLink: null,
          expenseEvidenceNotificationLink: null,
          artifact: {
            artifactStableId: 'acctart_metergy_notification',
            acquisitionMode: 'EMAIL',
            kind: AccountingArtifactKind.EMAIL_BODY,
            contentHash: 'metergy-body-hash',
            storedUrl: null,
            bodyText: [
              'Your monthly bill is now ready to view',
              'Total Balance Due: $247.57',
              'Date Due: 2026-10-13',
            ].join('\n'),
            emailSubject: 'Metergy Solutions - Your e-bill is ready',
            metadataJson: { gmailMessageId: 'gmail-metergy-1' },
            parseRuns: [
              {
                resultJson: {
                  inputKind: 'EMAIL_BODY',
                  reviewDisposition: 'LIKELY_BILL',
                  date: '2026-10-13',
                  totalCents: 24757,
                  financialConsistency: 'INSUFFICIENT',
                  confidence: 'MEDIUM',
                },
              },
            ],
          },
        }),
      },
    });
    const service = new AccountingExpenseService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.beginUnifiedInboxExpenseReview(
        'acctinbox_metergy_notification',
        'user_operator',
      ),
    ).rejects.toThrow(
      'formal expense source evidence is required before review',
    );
  });

  it('rejects a bill-notification email even when the operator supplies balanced booking values', async () => {
    const prisma = withTransaction({
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          expenseEvidenceNotificationLink: null,
          artifact: {
            artifactStableId: 'acctart_metergy_notification',
            acquisitionMode: 'EMAIL',
            kind: AccountingArtifactKind.EMAIL_BODY,
            contentHash: 'metergy-body-hash',
            storedUrl: null,
            bodyText: [
              'Your monthly bill is now ready to view',
              'Total Balance Due: $247.57',
              'Date Due: 2026-10-13',
            ].join('\n'),
            emailSubject: 'Metergy Solutions - Your e-bill is ready',
            metadataJson: { gmailMessageId: 'gmail-metergy-1' },
            parseRuns: [
              {
                resultJson: {
                  inputKind: 'EMAIL_BODY',
                  reviewDisposition: 'LIKELY_BILL',
                  reviewReason: 'BILL_SIGNALS',
                  date: '2026-10-13',
                  totalCents: 24757,
                  financialConsistency: 'INSUFFICIENT',
                  confidence: 'MEDIUM',
                },
              },
            ],
          },
        }),
      },
    });
    const service = new AccountingExpenseService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.confirmUnifiedInboxExpense(
        'acctinbox_metergy_notification',
        {
          occurredAt: '2026-10-13',
          totalCents: 24757,
          splits: [
            {
              categoryStableId: 'expense_utilities',
              amountCents: 24757,
              taxCents: 0,
              paidFromAccountStableId: null,
            },
          ],
        },
        'user_operator',
      ),
    ).rejects.toThrow(
      'formal expense source document is required before confirmation',
    );
  });
});
