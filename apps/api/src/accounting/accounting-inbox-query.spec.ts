import {
  AccountingInboxClassification,
  AccountingInboxStatus,
} from './accounting-contracts';
import { listAccountingUnifiedInboxItems } from './accounting-inbox-query';

describe('Accounting Inbox exact materialized-entity filter', () => {
  it(
    'keeps a source-document deep-link independent of the bounded inbox window',
    async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const client = {
        accountingInboxItem: { findMany },
      };

      await listAccountingUnifiedInboxItems(client as never, {
        status: AccountingInboxStatus.CONFIRMED,
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
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
    },
  );
});
