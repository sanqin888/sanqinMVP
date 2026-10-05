import { AccountingOpeningReceivableService } from './accounting-opening-receivable.service';

const createInput = {
  requestId: '11111111-1111-4111-8111-111111111111',
  storeStableId: '4750_Yonge_Street',
  counterpartyName: 'Pre-start supermarket receivables',
  reference: 'Cutover AR',
  amountCents: 50_500,
  currency: 'CAD',
  note: 'Opening balance only; no June revenue',
};

describe('AccountingOpeningReceivableService', () => {
  it('posts one immutable Opening Receivable and canonical Opening Balance Journal atomically', async () => {
    const openingStableId =
      'openingrecv_11111111111141118111111111111111';
    const tx = {
      accountingOpeningReceivable: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          openingReceivableStableId: openingStableId,
          storeStableId: '4750_Yonge_Street',
          openingDate: new Date('2026-06-01T00:00:00.000Z'),
          counterpartyName: 'Pre-start supermarket receivables',
          reference: 'Cutover AR',
          amountCents: 50_500,
          currency: 'CAD',
          idempotencyKey: `opening-receivable:${openingStableId}:v1`,
          factHash: 'fact-hash',
          journalEntryStableId: null,
          note: 'Opening balance only; no June revenue',
          createdByActorRef: 'user_accountant',
          createdAt: new Date('2026-10-05T14:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({
          openingReceivableStableId: openingStableId,
          storeStableId: '4750_Yonge_Street',
          openingDate: new Date('2026-06-01T00:00:00.000Z'),
          counterpartyName: 'Pre-start supermarket receivables',
          reference: 'Cutover AR',
          amountCents: 50_500,
          currency: 'CAD',
          idempotencyKey: `opening-receivable:${openingStableId}:v1`,
          factHash: 'fact-hash',
          journalEntryStableId: 'journal_opening_receivable_1',
          note: 'Opening balance only; no June revenue',
          createdByActorRef: 'user_accountant',
          createdAt: new Date('2026-10-05T14:00:00.000Z'),
        }),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            accountStableId: 'account_accounts_receivable',
            accountClass: 'ASSET',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
          {
            accountStableId: 'account_opening_balance_equity',
            accountClass: 'EQUITY',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingJournalEntry: {
        findUnique: jest.fn(),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      accountingOpeningReceivable: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(
        (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const journal = {
      createOpeningReceivableJournalInTx: jest.fn().mockResolvedValue({
        entryStableId: 'journal_opening_receivable_1',
      }),
    };
    const period = {
      getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    };
    const storeConfig = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        storeStableId: '4750_Yonge_Street',
        storeName: 'SanQ Roujiamo',
        timezone: 'America/Toronto',
      }),
    };
    const service = new AccountingOpeningReceivableService(
      prisma as never,
      journal as never,
      period as never,
      storeConfig as never,
    );

    const result = await service.create(createInput, 'user_accountant');

    const createCalls = JSON.stringify(
      tx.accountingOpeningReceivable.create.mock.calls,
    );
    expect(createCalls).toContain('"amountCents":50500');
    expect(createCalls).toContain('"currency":"CAD"');
    expect(createCalls).toContain('"openingDate":"2026-06-01T00:00:00.000Z"');
    expect(journal.createOpeningReceivableJournalInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'OPENING_BALANCE',
        source: 'MANUAL',
        sourceFactType: 'accounting.opening_receivable.v1',
        lines: [
          expect.objectContaining({
            accountStableId: 'account_accounts_receivable',
            debitCents: 50_500,
          }),
          expect.objectContaining({
            accountStableId: 'account_opening_balance_equity',
            creditCents: 50_500,
          }),
        ],
      }),
      'user_accountant',
      expect.objectContaining({
        role: 'OPENING_RECEIVABLE_RECOGNITION',
      }),
      tx,
    );
    expect(tx.accountingOpeningReceivable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          journalEntryStableId: 'journal_opening_receivable_1',
        },
      }),
    );
    expect(result).toMatchObject({
      openingReceivableStableId: openingStableId,
      openingDate: '2026-06-01',
      amountCents: 50_500,
      journalEntryStableId: 'journal_opening_receivable_1',
    });
  });

  it('rejects a store outside the configured Accounting store', async () => {
    const service = new AccountingOpeningReceivableService(
      {} as never,
      {} as never,
      {
        getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
      } as never,
      {
        getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
          storeStableId: '4750_Yonge_Street',
          storeName: 'SanQ Roujiamo',
          timezone: 'America/Toronto',
        }),
      } as never,
    );

    await expect(
      service.create(
        { ...createInput, storeStableId: 'other_store' },
        'user_accountant',
      ),
    ).rejects.toThrow(
      'Opening Receivable storeStableId must match the configured Accounting store',
    );
  });
});
