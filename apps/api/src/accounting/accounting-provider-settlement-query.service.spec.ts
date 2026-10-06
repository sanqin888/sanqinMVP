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
        occurredAt: new Date('2026-09-30T12:00:00.000Z'),
        currency: 'CAD',
        memo: 'Fantuan September settlement',
        lines: [
          {
            lineNo: 1,
            debitCents: 686782,
            creditCents: 0,
            memo: 'Sales',
            account: {
              accountStableId: 'account_provider_clearing',
              name: 'Provider clearing',
            },
            category: null,
          },
          {
            lineNo: 2,
            debitCents: 0,
            creditCents: 686782,
            memo: 'Revenue',
            account: {
              accountStableId: 'account_sales_revenue',
              name: 'Sales revenue',
            },
            category: {
              categoryStableId: 'category_sales',
              name: 'Sales',
            },
          },
        ],
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
        journal: null,
      },
      {
        documentStableId: 'doc_posted',
        postingState: 'POSTED',
        existingJournalEntryStableId: 'journal_posted_1',
        journal: {
          entryStableId: 'journal_posted_1',
          occurredAt: '2026-09-30T12:00:00.000Z',
          currency: 'CAD',
          memo: 'Fantuan September settlement',
          lines: [
            {
              lineNo: 1,
              accountStableId: 'account_provider_clearing',
              accountName: 'Provider clearing',
              categoryStableId: null,
              categoryName: null,
              debitCents: 686782,
              creditCents: 0,
              memo: 'Sales',
            },
            {
              lineNo: 2,
              accountStableId: 'account_sales_revenue',
              accountName: 'Sales revenue',
              categoryStableId: 'category_sales',
              categoryName: 'Sales',
              debitCents: 0,
              creditCents: 686782,
              memo: 'Revenue',
            },
          ],
        },
      },
    ]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          sourceFactType: 'accounting.provider_financial_document.v1',
          sourceFactStableId: {
            in: ['doc_pending', 'doc_posted'],
          },
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
