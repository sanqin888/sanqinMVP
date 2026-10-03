import { ConflictException } from '@nestjs/common';

import type { AccountingDb } from './accounting-db';
import type {
  CreateAccountingExternalSaleSettlementInputV1,
} from './accounting-external-sales.contract';
import {
  hashAccountingExternalSaleSettlementFact,
  normalizeAccountingExternalSaleSettlement,
} from './accounting-external-sales.policy';
import {
  AccountingExternalSaleSettlementService,
} from './accounting-external-sale-settlement.service';
import type { AccountingJournalService } from './accounting-journal.service';
import type { AccountingPeriodService } from './accounting-period.service';

const input = (
  overrides: Partial<CreateAccountingExternalSaleSettlementInputV1> = {},
): CreateAccountingExternalSaleSettlementInputV1 => ({
  requestId: '22222222-2222-4222-8222-222222222222',
  storeStableId: '4750_Yonge_Street',
  settlementOn: '2026-06-20',
  counterpartyName: 'Supermarket A',
  currency: 'CAD',
  allocations: [
    {
      externalSaleStableId: 'extsale_11111111111141118111111111111111',
      amountCents: 10_000,
    },
  ],
  components: [
    {
      accountStableId: 'account_primary_bank',
      amountCents: 10_000,
      label: 'Bank receipt',
    },
  ],
  ...overrides,
});

const settlementFact = () =>
  normalizeAccountingExternalSaleSettlement(input());

const settlementRow = (journalEntryStableId: string | null) => {
  const fact = settlementFact();
  return {
    settlementStableId: fact.settlementStableId,
    idempotencyKey:
      'external-sale-settlement:extsettlement_22222222222242228222222222222222:v1',
    storeStableId: fact.storeStableId,
    settlementOn: new Date('2026-06-20T00:00:00.000Z'),
    counterpartyName: fact.counterpartyName,
    reference: fact.reference,
    currency: fact.currency,
    factHash: hashAccountingExternalSaleSettlementFact(fact),
    journalEntryStableId,
    reversalStableId: null,
    reversalJournalEntryStableId: null,
    reversedAt: null,
    note: fact.note,
    createdByActorRef: 'user_admin',
    createdAt: new Date('2026-06-20T12:00:00.000Z'),
    replacementForSettlement: null,
    allocations: [
      {
        allocationStableId:
          'extsettlement_22222222222242228222222222222222_allocation_1',
        amountCents: 10_000,
        sortOrder: 0,
        externalSale: {
          externalSaleStableId:
            'extsale_11111111111141118111111111111111',
        },
      },
    ],
    components: [
      {
        componentStableId:
          'extsettlement_22222222222242228222222222222222_component_1',
        amountCents: 10_000,
        label: 'Bank receipt',
        sortOrder: 0,
        account: { accountStableId: 'account_primary_bank' },
      },
    ],
  };
};

const saleJournal = () => ({
  entryStableId: 'journal_sale_1',
  source: 'EXTERNAL_SALE',
  sourceFactType: 'accounting.external_sale.v1',
  sourceFactStableId: 'extsale_11111111111141118111111111111111',
  deletedAt: null,
  lines: [
    {
      debitCents: 10_000,
      creditCents: 0,
      account: { accountStableId: 'account_accounts_receivable' },
    },
    {
      debitCents: 0,
      creditCents: 10_000,
      account: { accountStableId: 'account_sales_revenue' },
    },
  ],
});

const saleRow = (priorSettledCents = 0) => ({
  id: '11111111-1111-4111-8111-111111111111',
  externalSaleStableId: 'extsale_11111111111141118111111111111111',
  storeStableId: '4750_Yonge_Street',
  occurredOn: new Date('2026-06-15T00:00:00.000Z'),
  counterpartyName: 'Supermarket A',
  currency: 'CAD',
  factHash: 'sale_fact_hash_1',
  journalEntryStableId: 'journal_sale_1',
  reversalStableId: null,
  reversedAt: null,
  lines: [{ lineAmountCents: 10_000 }],
  adjustments: [],
  taxes: [],
  settlementAllocations:
    priorSettledCents > 0
      ? [
          {
            amountCents: priorSettledCents,
            settlement: {
              settlementStableId: 'extsettlement_prior',
              journalEntryStableId: 'journal_prior_settlement',
              reversalStableId: null,
              reversedAt: null,
            },
          },
        ]
      : [],
});

describe('AccountingExternalSaleSettlementService C2', () => {
  it('atomically persists, posts, anchors, and audits a settlement', async () => {
    let persisted: ReturnType<typeof settlementRow> | null = null;
    const tx = {
      accountingExternalSaleSettlement: {
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve(persisted)),
        create: jest.fn().mockImplementation(() => {
          persisted = settlementRow(null);
          return Promise.resolve(persisted);
        }),
        update: jest.fn().mockImplementation(() => {
          persisted = settlementRow('journal_settlement_1');
          return Promise.resolve(persisted);
        }),
      },
      accountingExternalSale: {
        findMany: jest.fn().mockResolvedValue([saleRow()]),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '22222222-2222-4222-8222-222222222222',
            accountStableId: 'account_accounts_receivable',
            accountClass: 'ASSET',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            accountStableId: 'account_primary_bank',
            accountClass: 'ASSET',
            type: 'BANK',
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingJournalEntry: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([saleJournal()]),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleSettlementJournalInTx: jest.fn().mockResolvedValue({
        entryStableId: 'journal_settlement_1',
      }),
    } as unknown as AccountingJournalService;
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    } as unknown as AccountingPeriodService;
    const service = new AccountingExternalSaleSettlementService(
      prisma,
      journal,
      period,
    );

    const result = await service.createSettlement(input(), 'user_admin');

    expect(result).toMatchObject({
      settlementStableId:
        'extsettlement_22222222222242228222222222222222',
      journalEntryStableId: 'journal_settlement_1',
      appliedReceivableCents: 10_000,
    });
    expect(tx.accountingExternalSaleSettlement.create).toHaveBeenCalledTimes(1);
    expect(
      (
        journal as unknown as {
          createExternalSaleSettlementJournalInTx: jest.Mock;
        }
      ).createExternalSaleSettlementJournalInTx,
    ).toHaveBeenCalledTimes(1);
    expect(tx.accountingExternalSaleSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { journalEntryStableId: 'journal_settlement_1' },
      }),
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tx.accountingAuditLog.create.mock.calls)).toContain(
      'EXTERNAL_SALE_SETTLEMENT_POST',
    );
  });

  it('fails closed on an unexpected persisted settlement without a Journal anchor', async () => {
    const unanchored = settlementRow(null);
    const tx = {
      accountingExternalSaleSettlement: {
        findUnique: jest.fn().mockResolvedValue(unanchored),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const service = new AccountingExternalSaleSettlementService(
      prisma,
      {} as AccountingJournalService,
      {
        getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      } as unknown as AccountingPeriodService,
    );

    await expect(service.createSettlement(input(), 'user_admin')).rejects.toThrow(
      'External Sale settlement exists without a canonical Journal anchor; review is required',
    );
  });

  it('replays an identical anchored settlement without posting twice', async () => {
    const anchored = settlementRow('journal_settlement_1');
    const tx = {
      accountingExternalSaleSettlement: {
        findUnique: jest.fn().mockResolvedValue(anchored),
      },
      accountingJournalEntry: {
        findUnique: jest.fn().mockResolvedValue({
          source: 'EXTERNAL_SALE',
          sourceFactType: 'accounting.external_sale_settlement.v1',
          sourceFactStableId: anchored.settlementStableId,
          deletedAt: null,
        }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleSettlementJournalInTx: jest.fn(),
    } as unknown as AccountingJournalService;
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    } as unknown as AccountingPeriodService;
    const service = new AccountingExternalSaleSettlementService(
      prisma,
      journal,
      period,
    );

    const result = await service.createSettlement(input(), 'user_admin');

    expect(result.journalEntryStableId).toBe('journal_settlement_1');
    expect(tx.accountingJournalEntry.findUnique).toHaveBeenCalledTimes(1);
    expect(
      (
        journal as unknown as {
          createExternalSaleSettlementJournalInTx: jest.Mock;
        }
      ).createExternalSaleSettlementJournalInTx,
    ).not.toHaveBeenCalled();
  });

  it('fails closed before persistence when prior settlements leave insufficient receivable', async () => {
    const tx = {
      accountingExternalSaleSettlement: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      accountingExternalSale: {
        findMany: jest.fn().mockResolvedValue([saleRow(6000)]),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([saleJournal()]),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleSettlementJournalInTx: jest.fn(),
    } as unknown as AccountingJournalService;
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    } as unknown as AccountingPeriodService;
    const service = new AccountingExternalSaleSettlementService(
      prisma,
      journal,
      period,
    );

    await expect(service.createSettlement(input(), 'user_admin')).rejects.toThrow(
      new ConflictException(
        'External Sale settlement allocation exceeds outstanding receivable: extsale_11111111111141118111111111111111',
      ),
    );
    expect(tx.accountingExternalSaleSettlement.create).not.toHaveBeenCalled();
  });

  it('fails closed when an allocated sale is not an active recognized receivable', async () => {
    const reversedSale = {
      ...saleRow(),
      reversalStableId: 'extsale_reversal_1',
    };
    const tx = {
      accountingExternalSaleSettlement: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingExternalSale: {
        findMany: jest.fn().mockResolvedValue([reversedSale]),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([saleJournal()]),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const service = new AccountingExternalSaleSettlementService(
      prisma,
      {} as AccountingJournalService,
      {
        getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      } as unknown as AccountingPeriodService,
    );

    await expect(service.createSettlement(input(), 'user_admin')).rejects.toThrow(
      'External Sale is not an active recognized receivable',
    );
  });

  it('rejects replacement settlement input before opening a transaction', async () => {
    const prisma = {
      $transaction: jest.fn(),
    } as unknown as AccountingDb;
    const service = new AccountingExternalSaleSettlementService(
      prisma,
      {} as AccountingJournalService,
      {} as AccountingPeriodService,
    );

    await expect(
      service.createSettlement(
        input({
          replacementForSettlementStableId: 'extsettlement_original',
        }),
        'user_admin',
      ),
    ).rejects.toThrow(
      'External Sale settlement replacement is not enabled until C3 reversal/correction authority',
    );
    expect(
      (prisma as unknown as { $transaction: jest.Mock }).$transaction,
    ).not.toHaveBeenCalled();
  });
});
