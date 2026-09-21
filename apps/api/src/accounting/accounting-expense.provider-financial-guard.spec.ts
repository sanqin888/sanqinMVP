import {
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
    const service = new AccountingExpenseService(prisma as never, {} as never);

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
            },
          ],
        },
        'user_operator',
      ),
    ).rejects.toThrow(
      'inbox item must be classified as an expense before confirmation',
    );
  });

  it('requires confirmed human review when machine-recognized expense amounts do not reconcile', async () => {
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-db-bell',
          version: 2,
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          artifact: {
            artifactStableId: 'acctart_bell_june',
            acquisitionMode: 'MANUAL_UPLOAD',
            kind: 'PDF',
            contentHash: 'a'.repeat(64),
            storedUrl: '/api/v1/accounting/files/inbox/bell-june.pdf',
            bodyText: null,
            emailSubject: null,
            metadataJson: {},
            parseRuns: [
              {
                parseRunStableId: 'acctparse_bell_june',
                resultHash: 'b'.repeat(64),
                resultJson: {
                  date: '2026-06-28',
                  subtotalCents: 7495,
                  taxCents: 18500,
                  totalCents: 8469,
                  financialConsistency: 'MISMATCH',
                  sourceCurrency: 'CAD',
                  suggestedCategoryStableId: 'expense_telecom',
                },
              },
            ],
          },
        }),
      },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-telecom-db-id',
            categoryStableId: 'expense_telecom',
          },
        ]),
      },
      accountingExpenseReviewRevision: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = withTransaction(tx);
    const period = {
      assertOnOrAfterAccountingStartDate: jest
        .fn()
        .mockResolvedValue(undefined),
      assertEditableForPeriod: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      period as never,
    );

    await expect(
      service.confirmUnifiedInboxExpense(
        'acctinbox_bell_june',
        {
          occurredAt: '2026-06-28',
          totalCents: 8469,
          sourceCurrency: 'CAD',
          splits: [
            {
              categoryStableId: 'expense_telecom',
              amountCents: 7495,
              taxCents: 974,
            },
          ],
        },
        'user_operator',
      ),
    ).rejects.toThrow(
      'machine extraction mismatch or operator correction requires a confirmed human expense review',
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
    const service = new AccountingExpenseService(prisma as never, {} as never);

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
            },
          ],
        },
        'user_operator',
      ),
    ).rejects.toThrow(
      'structured expense CSV batch cannot be confirmed as a single expense',
    );
  });
});
