import {
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from './accounting-contracts';
import { listAccountingUnifiedInboxItems } from './accounting-inbox-query';

describe('Accounting Inbox exact materialized-entity filter', () => {
  it('keeps materialized expense reviews out of the default Pending Inbox', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const client = {
      accountingInboxItem: { findMany },
    };

    await listAccountingUnifiedInboxItems(client as never, { limit: 100 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              AccountingInboxStatus.PENDING_REVIEW,
              AccountingInboxStatus.QUARANTINED,
            ],
          },
          expenseEvidenceSourceLink: { is: null },
          NOT: {
            materializedEntityType:
              AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
          },
        }) as unknown,
      }),
    );
  });

  it('keeps a source-document deep-link independent of the bounded inbox window', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const client = {
      accountingInboxItem: { findMany },
    };

    await listAccountingUnifiedInboxItems(client as never, {
      status: AccountingInboxStatus.CONFIRMED,
      classification: AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityStableId: 'provider_doc_1',
      limit: 200,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: [AccountingInboxStatus.CONFIRMED] },
          classification:
            AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
          materializedEntityStableId: 'provider_doc_1',
        },
        take: 200,
      }),
    );
  });
});
