import {
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from './accounting-contracts';
import {
  countAccountingInboxReviewItems,
  listAccountingUnifiedInboxItems,
} from './accounting-inbox-query';

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
          OR: [
            { materializedEntityType: null },
            {
              materializedEntityType: {
                not: AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
              },
            },
          ],
        }) as unknown,
      }),
    );
  });

  it('uses the same NULL-safe visibility filter and counts one Gmail message once', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        inboxItemStableId: 'acctinbox_body',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.UNKNOWN,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
        artifact: {
          acquisitionMode: 'EMAIL',
          kind: 'EMAIL_BODY',
          storedUrl: null,
          metadataJson: { gmailMessageId: 'gmail-1' },
          parseRuns: [{ resultJson: {} }],
        },
      },
      {
        inboxItemStableId: 'acctinbox_pdf',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.UNKNOWN,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
        artifact: {
          acquisitionMode: 'EMAIL',
          kind: 'PDF',
          storedUrl: '/api/v1/accounting/files/inbox/invoice.pdf',
          metadataJson: { gmailMessageId: 'gmail-1' },
          parseRuns: [{ resultJson: {} }],
        },
      },
    ]);
    const client = {
      accountingInboxItem: { findMany },
    };

    await expect(countAccountingInboxReviewItems(client as never)).resolves.toBe(
      1,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            in: [
              AccountingInboxStatus.PENDING_REVIEW,
              AccountingInboxStatus.QUARANTINED,
            ],
          },
          expenseEvidenceSourceLink: { is: null },
          OR: [
            { materializedEntityType: null },
            {
              materializedEntityType: {
                not: AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
              },
            },
          ],
        },
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
