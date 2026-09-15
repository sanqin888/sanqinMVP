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
});
