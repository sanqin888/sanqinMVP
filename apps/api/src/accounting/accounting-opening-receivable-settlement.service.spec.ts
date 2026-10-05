import { AccountingOpeningReceivableSettlementService } from './accounting-opening-receivable-settlement.service';
import {
  hashAccountingOpeningReceivableSettlementFact,
  normalizeAccountingOpeningReceivableSettlement,
} from './accounting-opening-receivable-settlement.policy';
import {
  hashAccountingOpeningReceivableFact,
  normalizeAccountingOpeningReceivable,
} from './accounting-opening-receivable.policy';

const openingInput = {
  requestId: '11111111-1111-4111-8111-111111111111',
  storeStableId: '4750_Yonge_Street',
  counterpartyName: 'Pre-start supermarket receivables',
  reference: 'Cutover AR',
  amountCents: 50_500,
  currency: 'CAD',
  note: 'Opening balance only; no June revenue',
};

const createInput = {
  requestId: '22222222-2222-4222-8222-222222222222',
  openingReceivableStableId: 'openingrecv_11111111111141118111111111111111',
  settlementOn: '2026-06-20',
  amountCents: 12_500,
  collectionAccountStableId: 'account_primary_bank',
  currency: 'CAD',
  reference: 'Cheque 1001',
  note: 'Partial collection',
};

const priorInput = {
  requestId: '33333333-3333-4333-8333-333333333333',
  openingReceivableStableId: 'openingrecv_11111111111141118111111111111111',
  settlementOn: '2026-06-10',
  amountCents: 20_000,
  collectionAccountStableId: 'account_primary_bank',
  currency: 'CAD',
  reference: 'Cheque 1000',
  note: 'First partial collection',
};

const openingFact = normalizeAccountingOpeningReceivable(
  openingInput,
  '2026-06-01',
);

const openingRow = {
  id: 'opening-db-id',
  openingReceivableStableId: openingFact.openingReceivableStableId,
  idempotencyKey: `opening-receivable:${openingFact.openingReceivableStableId}:v1`,
  storeStableId: openingFact.storeStableId,
  openingDate: new Date('2026-06-01T00:00:00.000Z'),
  counterpartyName: openingFact.counterpartyName,
  reference: openingFact.reference,
  amountCents: openingFact.amountCents,
  currency: 'CAD',
  factHash: hashAccountingOpeningReceivableFact(openingFact),
  journalEntryStableId: 'journal_opening_1',
  note: openingFact.note,
};

const openingJournal = {
  entryStableId: 'journal_opening_1',
  kind: 'OPENING_BALANCE',
  source: 'MANUAL',
  sourceFactType: 'accounting.opening_receivable.v1',
  sourceFactStableId: openingFact.openingReceivableStableId,
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
};

const settlementRow = (
  fact: ReturnType<typeof normalizeAccountingOpeningReceivableSettlement>,
  journalEntryStableId: string | null,
  createdAt = new Date('2026-10-05T15:00:00.000Z'),
) => ({
  settlementStableId: fact.settlementStableId,
  idempotencyKey: `opening-receivable-settlement:${fact.settlementStableId}:v1`,
  openingReceivable: {
    openingReceivableStableId: fact.openingReceivableStableId,
  },
  storeStableId: fact.storeStableId,
  settlementOn: new Date(`${fact.settlementOn}T00:00:00.000Z`),
  counterpartyName: fact.counterpartyName,
  amountCents: fact.amountCents,
  currency: 'CAD',
  collectionAccount: {
    accountStableId: fact.collectionAccountStableId,
  },
  reference: fact.reference,
  factHash: hashAccountingOpeningReceivableSettlementFact(fact),
  journalEntryStableId,
  note: fact.note,
  createdByActorRef: 'user_accountant',
  createdAt,
});

const settlementJournal = (row: ReturnType<typeof settlementRow>) => ({
  entryStableId: row.journalEntryStableId as string,
  kind: 'STANDARD',
  source: 'MANUAL',
  sourceFactType: 'accounting.opening_receivable_settlement.v1',
  sourceFactStableId: row.settlementStableId,
  sourceFactVersion: 1,
  storeStableId: row.storeStableId,
  currency: 'CAD',
  deletedAt: null,
  lines: [
    {
      debitCents: row.amountCents,
      creditCents: 0,
      account: {
        accountStableId: row.collectionAccount.accountStableId,
      },
    },
    {
      debitCents: 0,
      creditCents: row.amountCents,
      account: { accountStableId: 'account_accounts_receivable' },
    },
  ],
});

describe('AccountingOpeningReceivableSettlementService', () => {
  const target = {
    storeStableId: openingFact.storeStableId,
    counterpartyName: openingFact.counterpartyName,
  };

  it('supports a partial settlement using canonical opening/prior Journal authority', async () => {
    const priorFact = normalizeAccountingOpeningReceivableSettlement(
      priorInput,
      target,
    );
    const priorRow = settlementRow(priorFact, 'journal_prior_settlement_1');
    const newFact = normalizeAccountingOpeningReceivableSettlement(
      createInput,
      target,
    );
    const newUnanchored = settlementRow(newFact, null);
    const newAnchored = settlementRow(
      newFact,
      'journal_opening_settlement_2',
      newUnanchored.createdAt,
    );

    const tx = {
      accountingOpeningReceivable: {
        findUnique: jest.fn().mockResolvedValue(openingRow),
      },
      accountingOpeningReceivableSettlement: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([priorRow]),
        create: jest.fn().mockResolvedValue(newUnanchored),
        update: jest.fn().mockResolvedValue(newAnchored),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-ar-db-id',
            accountStableId: 'account_accounts_receivable',
            accountClass: 'ASSET',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
          {
            id: 'account-bank-db-id',
            accountStableId: 'account_primary_bank',
            accountClass: 'ASSET',
            type: 'BANK',
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingJournalEntry: {
        findUnique: jest.fn().mockResolvedValue(openingJournal),
        findMany: jest.fn().mockResolvedValue([settlementJournal(priorRow)]),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    const journal = {
      createOpeningReceivableSettlementJournalInTx: jest
        .fn()
        .mockResolvedValue({
          entryStableId: 'journal_opening_settlement_2',
        }),
    };
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
    };
    const service = new AccountingOpeningReceivableSettlementService(
      prisma as never,
      journal as never,
      period as never,
    );

    const result = await service.create(createInput, 'user_accountant');

    expect(
      journal.createOpeningReceivableSettlementJournalInTx,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'STANDARD',
        source: 'MANUAL',
        sourceFactType: 'accounting.opening_receivable_settlement.v1',
        lines: [
          expect.objectContaining({
            accountStableId: 'account_primary_bank',
            debitCents: 12_500,
            creditCents: 0,
          }),
          expect.objectContaining({
            accountStableId: 'account_accounts_receivable',
            debitCents: 0,
            creditCents: 12_500,
          }),
        ],
      }),
      'user_accountant',
      expect.objectContaining({
        role: 'OPENING_RECEIVABLE_SETTLEMENT',
        receivablePrerequisite: expect.objectContaining({
          openingAmountCents: 50_500,
          settledBeforeCents: 20_000,
          outstandingBeforeCents: 30_500,
        }) as unknown,
      }),
      tx,
    );
    expect(
      tx.accountingOpeningReceivableSettlement.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { journalEntryStableId: 'journal_opening_settlement_2' },
      }),
    );
    expect(result).toMatchObject({
      settlementStableId: newFact.settlementStableId,
      openingReceivableStableId: openingFact.openingReceivableStableId,
      amountCents: 12_500,
      collectionAccountStableId: 'account_primary_bank',
      journalEntryStableId: 'journal_opening_settlement_2',
    });
  });

  it('fails closed when the requested amount exceeds canonical outstanding AR', async () => {
    const priorFact = normalizeAccountingOpeningReceivableSettlement(
      { ...priorInput, amountCents: 50_000 },
      target,
    );
    const priorRow = settlementRow(priorFact, 'journal_prior_settlement_1');
    const tx = {
      accountingOpeningReceivable: {
        findUnique: jest.fn().mockResolvedValue(openingRow),
      },
      accountingOpeningReceivableSettlement: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([priorRow]),
        create: jest.fn(),
        update: jest.fn(),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-ar-db-id',
            accountStableId: 'account_accounts_receivable',
            accountClass: 'ASSET',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
          {
            id: 'account-bank-db-id',
            accountStableId: 'account_primary_bank',
            accountClass: 'ASSET',
            type: 'BANK',
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingJournalEntry: {
        findUnique: jest.fn().mockResolvedValue(openingJournal),
        findMany: jest.fn().mockResolvedValue([settlementJournal(priorRow)]),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    const service = new AccountingOpeningReceivableSettlementService(
      prisma as never,
      { createOpeningReceivableSettlementJournalInTx: jest.fn() } as never,
      {
        getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
        getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
      } as never,
    );

    await expect(
      service.create({ ...createInput, amountCents: 501 }, 'user_accountant'),
    ).rejects.toThrow(
      'Opening Receivable settlement exceeds outstanding receivable',
    );
    expect(
      tx.accountingOpeningReceivableSettlement.create,
    ).not.toHaveBeenCalled();
  });

  it('requires manual review when an idempotent source fact exists without a Journal anchor', async () => {
    const fact = normalizeAccountingOpeningReceivableSettlement(
      createInput,
      target,
    );
    const existing = settlementRow(fact, null);
    const tx = {
      accountingOpeningReceivable: {
        findUnique: jest.fn().mockResolvedValue(openingRow),
      },
      accountingOpeningReceivableSettlement: {
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    const service = new AccountingOpeningReceivableSettlementService(
      prisma as never,
      {} as never,
      {
        getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
        getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
      } as never,
    );

    await expect(
      service.create(createInput, 'user_accountant'),
    ).rejects.toThrow(
      'Opening Receivable settlement exists without a canonical Journal anchor; review is required',
    );
  });
});
