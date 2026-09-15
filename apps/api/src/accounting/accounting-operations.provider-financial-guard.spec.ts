import {
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxStatus,
} from '@prisma/client';
import { AccountingOperationsService } from './accounting-operations.service';

describe('AccountingOperationsService provider-financial expense guard', () => {
  it('requires an explicit expense classification before provider-suggested evidence can be confirmed as an expense', async () => {
    const prisma = {
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
    };
    const service = new AccountingOperationsService(
      prisma as never,
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
    const prisma = {
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
    };
    const service = new AccountingOperationsService(
      prisma as never,
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
