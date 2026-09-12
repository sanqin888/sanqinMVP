import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import { confirmProviderFinancialInboxItemInTx } from './accounting-provider-financial-review.writer';

describe('provider financial review writer', () => {
  it('confirms materialized provider evidence with stable audit identity and no journal mutation', async () => {
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-db-id',
          status: AccountingInboxStatus.PENDING_REVIEW,
          materializedEntityType:
            AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
          materializedEntityStableId: 'acctfindoc_1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      accountingProviderFinancialDocument: {
        findUnique: jest.fn().mockResolvedValue({
          documentStableId: 'acctfindoc_1',
          provider: AccountingFinancialProvider.CLOVER,
          documentType: AccountingFinancialDocumentType.STATEMENT,
          revision: 1,
        }),
      },
      accountingAuditLog: { create: jest.fn().mockResolvedValue({}) },
      accountingJournalEntry: { create: jest.fn() },
      accountingJournalLine: { create: jest.fn() },
    };

    await expect(
      confirmProviderFinancialInboxItemInTx(
        tx as never,
        'acctinbox_1',
        'user_stable_admin',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        documentStableId: 'acctfindoc_1',
        confirmed: true,
        replayed: false,
      }) as unknown,
    );
    expect(tx.accountingInboxItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountingInboxStatus.CONFIRMED,
          reviewedByUserStableId: 'user_stable_admin',
        }) as unknown,
      }),
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: 'acctfindoc_1',
          operatorUserId: 'user_stable_admin',
        }) as unknown,
      }),
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
    expect(tx.accountingJournalLine.create).not.toHaveBeenCalled();
  });
});
