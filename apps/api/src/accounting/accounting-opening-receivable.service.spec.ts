import { AccountingOpeningReceivableService } from './accounting-opening-receivable.service';
import {
  hashAccountingOpeningReceivableFact,
  normalizeAccountingOpeningReceivable,
} from './accounting-opening-receivable.policy';
import {
  hashAccountingOpeningReceivableSettlementFact,
  normalizeAccountingOpeningReceivableSettlement,
} from './accounting-opening-receivable-settlement.policy';

const createInput = {
  requestId: '11111111-1111-4111-8111-111111111111',
  storeStableId: '4750_Yonge_Street',
  counterpartyName: 'Pre-start supermarket receivables',
  reference: 'Cutover AR',
  amountCents: 50_500,
  currency: 'CAD',
  note: 'Opening balance only; no June revenue',
};

const openingFact = normalizeAccountingOpeningReceivable(
  createInput,
  '2026-06-01',
);
const openingFactHash = hashAccountingOpeningReceivableFact(openingFact);

describe('AccountingOpeningReceivableService', () => {
  it('posts one immutable Opening Receivable and canonical Opening Balance Journal atomically', async () => {
    const openingStableId = 'openingrecv_11111111111141118111111111111111';
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
          factHash: openingFactHash,
          journalEntryStableId: null,
          reversalStableId: null,
          reversalFactHash: null,
          reversalJournalEntryStableId: null,
          reversedAt: null,
          reversedByActorRef: null,
          replacementForOpeningReceivable: null,
          replacedByOpeningReceivable: null,
          note: 'Opening balance only; no June revenue',
          createdByActorRef: 'user_accountant',
          createdAt: new Date('2026-10-05T14:00:00.000Z'),
          settlements: [],
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
          factHash: openingFactHash,
          journalEntryStableId: 'journal_opening_receivable_1',
          reversalStableId: null,
          reversalFactHash: null,
          reversalJournalEntryStableId: null,
          reversedAt: null,
          reversedByActorRef: null,
          replacementForOpeningReceivable: null,
          replacedByOpeningReceivable: null,
          note: 'Opening balance only; no June revenue',
          createdByActorRef: 'user_accountant',
          createdAt: new Date('2026-10-05T14:00:00.000Z'),
          settlements: [],
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
        findMany: jest.fn().mockResolvedValue([
          {
            entryStableId: 'journal_opening_receivable_1',
            kind: 'OPENING_BALANCE',
            source: 'MANUAL',
            sourceFactType: 'accounting.opening_receivable.v1',
            sourceFactStableId: openingStableId,
            sourceFactVersion: 1,
            storeStableId: '4750_Yonge_Street',
            currency: 'CAD',
            deletedAt: null,
            lines: [
              {
                debitCents: 50_500,
                creditCents: 0,
                account: { accountStableId: 'account_accounts_receivable' },
              },
              {
                debitCents: 0,
                creditCents: 50_500,
                account: { accountStableId: 'account_opening_balance_equity' },
              },
            ],
          },
        ]),
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
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
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
      openingAmountCents: 50_500,
      settledAmountCents: 0,
      outstandingAmountCents: 50_500,
      settlements: [],
      journalEntryStableId: 'journal_opening_receivable_1',
    });
  });

  it('derives settled/outstanding and settlement history from canonical G1/G2 Journals', async () => {
    const openingStableId = openingFact.openingReceivableStableId;
    const settlementFact = normalizeAccountingOpeningReceivableSettlement(
      {
        requestId: '22222222-2222-4222-8222-222222222222',
        openingReceivableStableId: openingStableId,
        settlementOn: '2026-06-20',
        amountCents: 12_500,
        collectionAccountStableId: 'account_primary_bank',
        currency: 'CAD',
        reference: 'Cheque 1001',
        note: 'Partial collection',
      },
      {
        storeStableId: openingFact.storeStableId,
        counterpartyName: openingFact.counterpartyName,
      },
    );

    const row = {
      openingReceivableStableId: openingStableId,
      storeStableId: openingFact.storeStableId,
      openingDate: new Date('2026-06-01T00:00:00.000Z'),
      counterpartyName: openingFact.counterpartyName,
      reference: openingFact.reference,
      amountCents: openingFact.amountCents,
      currency: 'CAD',
      idempotencyKey: `opening-receivable:${openingStableId}:v1`,
      factHash: openingFactHash,
      journalEntryStableId: 'journal_opening_receivable_1',
      reversalStableId: null,
      reversalFactHash: null,
      reversalJournalEntryStableId: null,
      reversedAt: null,
      reversedByActorRef: null,
      replacementForOpeningReceivable: null,
      replacedByOpeningReceivable: null,
      note: openingFact.note,
      createdByActorRef: 'user_accountant',
      createdAt: new Date('2026-10-05T14:00:00.000Z'),
      settlements: [
        {
          settlementStableId: settlementFact.settlementStableId,
          idempotencyKey: `opening-receivable-settlement:${settlementFact.settlementStableId}:v1`,
          storeStableId: settlementFact.storeStableId,
          settlementOn: new Date('2026-06-20T00:00:00.000Z'),
          counterpartyName: settlementFact.counterpartyName,
          amountCents: settlementFact.amountCents,
          currency: 'CAD',
          collectionAccount: {
            accountStableId: settlementFact.collectionAccountStableId,
          },
          reference: settlementFact.reference,
          factHash:
            hashAccountingOpeningReceivableSettlementFact(settlementFact),
          journalEntryStableId: 'journal_opening_settlement_1',
          reversalStableId: null,
          reversalFactHash: null,
          reversalJournalEntryStableId: null,
          reversedAt: null,
          reversedByActorRef: null,
          replacementForSettlement: null,
          replacedBySettlement: null,
          note: settlementFact.note,
          createdByActorRef: 'user_accountant',
          createdAt: new Date('2026-10-05T15:00:00.000Z'),
        },
      ],
    };

    const prisma = {
      accountingOpeningReceivable: {
        findUnique: jest.fn().mockResolvedValue(row),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            entryStableId: 'journal_opening_receivable_1',
            kind: 'OPENING_BALANCE',
            source: 'MANUAL',
            sourceFactType: 'accounting.opening_receivable.v1',
            sourceFactStableId: openingStableId,
            sourceFactVersion: 1,
            storeStableId: openingFact.storeStableId,
            currency: 'CAD',
            deletedAt: null,
            lines: [
              {
                debitCents: 50_500,
                creditCents: 0,
                account: { accountStableId: 'account_accounts_receivable' },
              },
              {
                debitCents: 0,
                creditCents: 50_500,
                account: { accountStableId: 'account_opening_balance_equity' },
              },
            ],
          },
          {
            entryStableId: 'journal_opening_settlement_1',
            kind: 'STANDARD',
            source: 'MANUAL',
            sourceFactType: 'accounting.opening_receivable_settlement.v1',
            sourceFactStableId: settlementFact.settlementStableId,
            sourceFactVersion: 1,
            storeStableId: openingFact.storeStableId,
            currency: 'CAD',
            deletedAt: null,
            lines: [
              {
                debitCents: 12_500,
                creditCents: 0,
                account: { accountStableId: 'account_primary_bank' },
              },
              {
                debitCents: 0,
                creditCents: 12_500,
                account: { accountStableId: 'account_accounts_receivable' },
              },
            ],
          },
        ]),
      },
    };

    const service = new AccountingOpeningReceivableService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.get(openingStableId);

    expect(result).toMatchObject({
      openingReceivableStableId: openingStableId,
      openingAmountCents: 50_500,
      settledAmountCents: 12_500,
      outstandingAmountCents: 38_000,
      settlements: [
        expect.objectContaining({
          settlementStableId: settlementFact.settlementStableId,
          amountCents: 12_500,
          collectionAccountStableId: 'account_primary_bank',
          journalEntryStableId: 'journal_opening_settlement_1',
        }),
      ],
    });
  });

  it('excludes a fully reversed G2 settlement from canonical settled/outstanding', async () => {
    const openingStableId = openingFact.openingReceivableStableId;
    const settlementFact = normalizeAccountingOpeningReceivableSettlement(
      {
        requestId: '33333333-3333-4333-8333-333333333333',
        openingReceivableStableId: openingStableId,
        settlementOn: '2026-06-20',
        amountCents: 12_500,
        collectionAccountStableId: 'account_primary_bank',
        currency: 'CAD',
        reference: 'Cheque 1002',
        note: 'Reversed collection',
      },
      {
        storeStableId: openingFact.storeStableId,
        counterpartyName: openingFact.counterpartyName,
      },
    );
    const reversalStableId = 'openingrecvsettlereversal_test';
    const row = {
      openingReceivableStableId: openingStableId,
      storeStableId: openingFact.storeStableId,
      openingDate: new Date('2026-06-01T00:00:00.000Z'),
      counterpartyName: openingFact.counterpartyName,
      reference: openingFact.reference,
      amountCents: openingFact.amountCents,
      currency: 'CAD',
      idempotencyKey: `opening-receivable:${openingStableId}:v1`,
      factHash: openingFactHash,
      journalEntryStableId: 'journal_opening_receivable_1',
      reversalStableId: null,
      reversalFactHash: null,
      reversalJournalEntryStableId: null,
      reversedAt: null,
      reversedByActorRef: null,
      replacementForOpeningReceivable: null,
      replacedByOpeningReceivable: null,
      note: openingFact.note,
      createdByActorRef: 'user_accountant',
      createdAt: new Date('2026-10-05T14:00:00.000Z'),
      settlements: [
        {
          settlementStableId: settlementFact.settlementStableId,
          idempotencyKey: `opening-receivable-settlement:${settlementFact.settlementStableId}:v1`,
          storeStableId: settlementFact.storeStableId,
          settlementOn: new Date('2026-06-20T00:00:00.000Z'),
          counterpartyName: settlementFact.counterpartyName,
          amountCents: settlementFact.amountCents,
          currency: 'CAD',
          collectionAccount: {
            accountStableId: settlementFact.collectionAccountStableId,
          },
          reference: settlementFact.reference,
          factHash:
            hashAccountingOpeningReceivableSettlementFact(settlementFact),
          journalEntryStableId: 'journal_opening_settlement_2',
          reversalStableId,
          reversalFactHash: 'reversal_fact_hash',
          reversalJournalEntryStableId: 'journal_opening_settlement_reversal_2',
          reversedAt: new Date('2026-10-05T16:00:00.000Z'),
          reversedByActorRef: 'user_accountant',
          replacementForSettlement: null,
          replacedBySettlement: null,
          note: settlementFact.note,
          createdByActorRef: 'user_accountant',
          createdAt: new Date('2026-10-05T15:00:00.000Z'),
        },
      ],
    };
    const openingLines = [
      {
        lineNo: 1,
        debitCents: 50_500,
        creditCents: 0,
        memo: 'Opening Accounts Receivable',
        account: { accountStableId: 'account_accounts_receivable' },
        category: null,
      },
      {
        lineNo: 2,
        debitCents: 0,
        creditCents: 50_500,
        memo: 'Opening Balance Equity',
        account: { accountStableId: 'account_opening_balance_equity' },
        category: null,
      },
    ];
    const settlementLines = [
      {
        lineNo: 1,
        debitCents: 12_500,
        creditCents: 0,
        memo: 'Collection',
        account: { accountStableId: 'account_primary_bank' },
        category: null,
      },
      {
        lineNo: 2,
        debitCents: 0,
        creditCents: 12_500,
        memo: 'Opening Receivable settlement',
        account: { accountStableId: 'account_accounts_receivable' },
        category: null,
      },
    ];
    const prisma = {
      accountingOpeningReceivable: {
        findUnique: jest.fn().mockResolvedValue(row),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            entryStableId: 'journal_opening_receivable_1',
            kind: 'OPENING_BALANCE',
            source: 'MANUAL',
            sourceFactType: 'accounting.opening_receivable.v1',
            sourceFactStableId: openingStableId,
            sourceFactVersion: 1,
            storeStableId: openingFact.storeStableId,
            currency: 'CAD',
            deletedAt: null,
            lines: openingLines,
          },
          {
            entryStableId: 'journal_opening_settlement_2',
            kind: 'STANDARD',
            source: 'MANUAL',
            sourceFactType: 'accounting.opening_receivable_settlement.v1',
            sourceFactStableId: settlementFact.settlementStableId,
            sourceFactVersion: 1,
            storeStableId: openingFact.storeStableId,
            currency: 'CAD',
            deletedAt: null,
            lines: settlementLines,
          },
          {
            entryStableId: 'journal_opening_settlement_reversal_2',
            kind: 'ADJUSTMENT',
            source: 'MANUAL',
            sourceFactType:
              'accounting.opening_receivable_settlement_reversal.v1',
            sourceFactStableId: reversalStableId,
            sourceFactVersion: 1,
            storeStableId: openingFact.storeStableId,
            currency: 'CAD',
            deletedAt: null,
            lines: settlementLines.map((line) => ({
              ...line,
              debitCents: line.creditCents,
              creditCents: line.debitCents,
            })),
          },
        ]),
      },
    };
    const service = new AccountingOpeningReceivableService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.get(openingStableId);

    expect(result).toMatchObject({
      status: 'OPEN',
      openingAmountCents: 50_500,
      settledAmountCents: 0,
      outstandingAmountCents: 50_500,
      settlements: [
        expect.objectContaining({
          settlementStableId: settlementFact.settlementStableId,
          reversedAt: '2026-10-05T16:00:00.000Z',
          reversalJournalEntryStableId:
            'journal_opening_settlement_reversal_2',
        }),
      ],
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
