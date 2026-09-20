import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';

describe('AccountingProviderSettlementQueryService posting states', () => {
  it('returns one posting state per requested document and reuses active Journal evidence', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        entryStableId: 'journal_posted_1',
        idempotencyKey: 'provider-settlement:doc_posted:r1:v1',
        sourceFactType: 'accounting.provider_financial_document.v1',
        sourceFactStableId: 'doc_posted',
        sourceFactVersion: 1,
      },
    ]);
    const service = new AccountingProviderSettlementQueryService({
      accountingJournalEntry: { findMany },
    } as never);

    await expect(
      service.readProviderDocumentPostingStates([
        'doc_pending',
        'doc_posted',
        'doc_pending',
      ]),
    ).resolves.toEqual([
      {
        documentStableId: 'doc_pending',
        postingState: 'NOT_POSTED',
        existingJournalEntryStableId: null,
      },
      {
        documentStableId: 'doc_posted',
        postingState: 'POSTED',
        existingJournalEntryStableId: 'journal_posted_1',
      },
    ]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            {
              sourceFactType: 'accounting.provider_financial_document.v1',
              sourceFactStableId: {
                in: ['doc_pending', 'doc_posted'],
              },
            },
          ],
        },
      }),
    );
  });

  it('returns an empty projection without querying persistence for an empty request', async () => {
    const findMany = jest.fn();
    const service = new AccountingProviderSettlementQueryService({
      accountingJournalEntry: { findMany },
    } as never);

    await expect(
      service.readProviderDocumentPostingStates([]),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
