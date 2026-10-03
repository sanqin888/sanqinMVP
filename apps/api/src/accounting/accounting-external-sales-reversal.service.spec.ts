import { ConflictException } from '@nestjs/common';

import { AccountingJournalSource } from './accounting-contracts';
import type { AccountingDb } from './accounting-db';
import { AccountingExternalSaleReversalService } from './accounting-external-sales-reversal.service';
import {
  buildAccountingExternalSaleReversalStableId,
  buildAccountingExternalSaleReversalWritePlan,
  type AccountingExternalSaleOriginalJournalV1,
} from './accounting-external-sales-reversal-journal-authority';
import type { AccountingJournalService } from './accounting-journal.service';

const saleJournal = (): AccountingExternalSaleOriginalJournalV1 => ({
  entryStableId: 'journal_sale_1',
  source: AccountingJournalSource.EXTERNAL_SALE,
  sourceFactType: 'accounting.external_sale.v1',
  sourceFactStableId: 'extsale_1',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-06-15T04:00:00.000Z',
  currency: 'CAD',
  memo: 'External Sale extsale_1',
  lines: [
    {
      lineNo: 1,
      accountStableId: 'account_accounts_receivable',
      categoryStableId: null,
      debitCents: 11_300,
      creditCents: 0,
      memo: 'Accounts Receivable',
    },
    {
      lineNo: 2,
      accountStableId: 'account_sales_revenue',
      categoryStableId: null,
      debitCents: 0,
      creditCents: 10_000,
      memo: 'Sale',
    },
    {
      lineNo: 3,
      accountStableId: 'account_hst_payable',
      categoryStableId: null,
      debitCents: 0,
      creditCents: 1300,
      memo: 'HST',
    },
  ],
});

const settlementJournal = (): AccountingExternalSaleOriginalJournalV1 => ({
  entryStableId: 'journal_settlement_1',
  source: AccountingJournalSource.EXTERNAL_SALE,
  sourceFactType: 'accounting.external_sale_settlement.v1',
  sourceFactStableId: 'extsettlement_1',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-06-20T04:00:00.000Z',
  currency: 'CAD',
  memo: 'External Sale settlement',
  lines: [
    {
      lineNo: 1,
      accountStableId: 'account_primary_bank',
      categoryStableId: null,
      debitCents: 10_000,
      creditCents: 0,
      memo: 'Bank receipt',
    },
    {
      lineNo: 2,
      accountStableId: 'account_accounts_receivable',
      categoryStableId: null,
      debitCents: 0,
      creditCents: 10_000,
      memo: 'Receivable settlement',
    },
  ],
});

const journalRow = (snapshot: AccountingExternalSaleOriginalJournalV1) => ({
  entryStableId: snapshot.entryStableId,
  source: snapshot.source,
  sourceFactType: snapshot.sourceFactType,
  sourceFactStableId: snapshot.sourceFactStableId,
  sourceFactVersion: snapshot.sourceFactVersion,
  storeStableId: snapshot.storeStableId,
  occurredAt: new Date(snapshot.occurredAt),
  currency: snapshot.currency,
  memo: snapshot.memo,
  deletedAt: null,
  lines: snapshot.lines.map((line) => ({
    lineNo: line.lineNo,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
    account: { accountStableId: line.accountStableId },
    category: line.categoryStableId
      ? { categoryStableId: line.categoryStableId }
      : null,
  })),
});

const activeSale = () => ({
  id: '11111111-1111-4111-8111-111111111111',
  externalSaleStableId: 'extsale_1',
  storeStableId: '4750_Yonge_Street',
  currency: 'CAD',
  factHash: 'sale_fact_hash_1',
  journalEntryStableId: 'journal_sale_1',
  reversalStableId: null as string | null,
  reversalFactHash: null as string | null,
  reversalJournalEntryStableId: null as string | null,
  reversedAt: null as Date | null,
  reversedByActorRef: null as string | null,
  replacedByExternalSale: null as {
    externalSaleStableId: string;
  } | null,
  settlementAllocations: [] as Array<{
    settlement: {
      settlementStableId: string;
      journalEntryStableId: string | null;
      reversalStableId: string | null;
      reversalFactHash: string | null;
      reversalJournalEntryStableId: string | null;
      reversedAt: Date | null;
    };
  }>,
});

const activeSettlement = () => ({
  id: '22222222-2222-4222-8222-222222222222',
  settlementStableId: 'extsettlement_1',
  storeStableId: '4750_Yonge_Street',
  currency: 'CAD',
  factHash: 'settlement_fact_hash_1',
  journalEntryStableId: 'journal_settlement_1',
  reversalStableId: null as string | null,
  reversalFactHash: null as string | null,
  reversalJournalEntryStableId: null as string | null,
  reversedAt: null as Date | null,
  reversedByActorRef: null as string | null,
  replacedBySettlement: null,
});

describe('AccountingExternalSaleReversalService C3', () => {
  it('atomically reverses a Sale by posting the exact inverse Journal and freezing evidence', async () => {
    const sale = activeSale();
    const reversalStableId = buildAccountingExternalSaleReversalStableId(
      'SALE',
      sale.externalSaleStableId,
    );
    const original = saleJournal();
    const expectedPlan = buildAccountingExternalSaleReversalWritePlan({
      fact: {
        version: 1,
        target: 'SALE',
        targetStableId: sale.externalSaleStableId,
        originalFactHash: sale.factHash,
        originalJournalEntryStableId: sale.journalEntryStableId,
        reversalStableId,
        reversalReason: 'Incorrect quantity',
      },
      originalJournal: original,
    });
    const tx = {
      accountingExternalSale: {
        findUnique: jest.fn().mockResolvedValue(sale),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              externalSaleStableId: sale.externalSaleStableId,
              reversalStableId: data.reversalStableId ?? reversalStableId,
              reversalFactHash:
                data.reversalFactHash ??
                expectedPlan.authority.reversalFactHash,
              reversalJournalEntryStableId:
                data.reversalJournalEntryStableId ?? 'journal_sale_reversal_1',
              reversedAt: data.reversedAt ?? new Date('2026-10-02T20:00:00Z'),
              reversedByActorRef: data.reversedByActorRef ?? 'actor_admin',
            }),
          ),
      },
      accountingJournalEntry: {
        findUnique: jest.fn().mockResolvedValue(journalRow(original)),
        findMany: jest.fn(),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleReversalJournalInTx: jest.fn().mockResolvedValue({
        entryStableId: 'journal_sale_reversal_1',
      }),
    } as unknown as AccountingJournalService;
    const service = new AccountingExternalSaleReversalService(prisma, journal);

    const result = await service.reverseSale(
      sale.externalSaleStableId,
      { reason: 'Incorrect quantity' },
      'actor_admin',
    );

    expect(result).toMatchObject({
      target: 'SALE',
      targetStableId: 'extsale_1',
      reversalStableId,
      reversalJournalEntryStableId: 'journal_sale_reversal_1',
      reversalReason: 'Incorrect quantity',
    });
    expect(
      (
        journal as unknown as {
          createExternalSaleReversalJournalInTx: jest.Mock;
        }
      ).createExternalSaleReversalJournalInTx,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ADJUSTMENT',
        sourceFactType: 'accounting.external_sale_reversal.v1',
        occurredAt: original.occurredAt,
      }),
      'actor_admin',
      expect.objectContaining({
        reversalFactHash: expectedPlan.authority.reversalFactHash,
      }),
      tx,
    );
    expect(tx.accountingExternalSale.update).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(tx.accountingAuditLog.create.mock.calls)).toContain(
      'EXTERNAL_SALE_REVERSE',
    );
  });

  it('blocks Sale reversal until every active Settlement is reversed first', async () => {
    const sale = activeSale();
    sale.settlementAllocations = [
      {
        settlement: {
          settlementStableId: 'extsettlement_live',
          journalEntryStableId: 'journal_settlement_live',
          reversalStableId: null,
          reversalFactHash: null,
          reversalJournalEntryStableId: null,
          reversedAt: null,
        },
      },
    ];
    const tx = {
      accountingExternalSale: {
        findUnique: jest.fn().mockResolvedValue(sale),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleReversalJournalInTx: jest.fn(),
    } as unknown as AccountingJournalService;
    const service = new AccountingExternalSaleReversalService(prisma, journal);

    await expect(
      service.reverseSale(
        sale.externalSaleStableId,
        { reason: 'Incorrect quantity' },
        'actor_admin',
      ),
    ).rejects.toThrow(
      'External Sale has active settlement extsettlement_live; reverse settlement first',
    );
    expect(
      (
        journal as unknown as {
          createExternalSaleReversalJournalInTx: jest.Mock;
        }
      ).createExternalSaleReversalJournalInTx,
    ).not.toHaveBeenCalled();
  });

  it('posts and anchors a Settlement reversal through the purpose-specific writer', async () => {
    const settlement = activeSettlement();
    const original = settlementJournal();
    const tx = {
      accountingExternalSaleSettlement: {
        findUnique: jest.fn().mockResolvedValue(settlement),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              settlementStableId: settlement.settlementStableId,
              reversalStableId:
                data.reversalStableId ??
                buildAccountingExternalSaleReversalStableId(
                  'SETTLEMENT',
                  settlement.settlementStableId,
                ),
              reversalFactHash: data.reversalFactHash ?? 'reversal_hash',
              reversalJournalEntryStableId:
                data.reversalJournalEntryStableId ??
                'journal_settlement_reversal_1',
              reversedAt: data.reversedAt ?? new Date('2026-10-02T20:00:00Z'),
              reversedByActorRef: data.reversedByActorRef ?? 'actor_admin',
            }),
          ),
      },
      accountingJournalEntry: {
        findUnique: jest.fn().mockResolvedValue(journalRow(original)),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as unknown as AccountingDb;
    const createExternalSaleReversalJournalInTx = jest.fn().mockResolvedValue({
      entryStableId: 'journal_settlement_reversal_1',
    });
    const journal = {
      createExternalSaleReversalJournalInTx,
    } as unknown as AccountingJournalService;
    const service = new AccountingExternalSaleReversalService(prisma, journal);

    const result = await service.reverseSettlement(
      settlement.settlementStableId,
      { reason: 'Wrong bank account' },
      'actor_admin',
    );

    expect(result).toMatchObject({
      target: 'SETTLEMENT',
      targetStableId: 'extsettlement_1',
      reversalJournalEntryStableId: 'journal_settlement_reversal_1',
      reversalReason: 'Wrong bank account',
    });
    expect(createExternalSaleReversalJournalInTx).toHaveBeenCalledTimes(1);
  });

  it('replays the same frozen reversal even after a replacement exists', async () => {
    const sale = activeSale();
    const original = saleJournal();
    const originalPlan = buildAccountingExternalSaleReversalWritePlan({
      fact: {
        version: 1,
        target: 'SALE',
        targetStableId: sale.externalSaleStableId,
        originalFactHash: sale.factHash,
        originalJournalEntryStableId: sale.journalEntryStableId,
        reversalStableId: buildAccountingExternalSaleReversalStableId(
          'SALE',
          sale.externalSaleStableId,
        ),
        reversalReason: 'Original reason',
      },
      originalJournal: original,
    });
    sale.reversalStableId = originalPlan.authority.fact.reversalStableId;
    sale.reversalFactHash = originalPlan.authority.reversalFactHash;
    sale.reversalJournalEntryStableId = 'journal_sale_reversal_1';
    sale.reversedAt = new Date('2026-10-02T20:00:00Z');
    sale.reversedByActorRef = 'actor_original';
    sale.replacedByExternalSale = {
      externalSaleStableId: 'extsale_replacement_1',
    };

    const tx = {
      accountingExternalSale: {
        findUnique: jest.fn().mockResolvedValue(sale),
      },
      accountingJournalEntry: {
        findUnique: jest.fn().mockResolvedValue(journalRow(original)),
        findMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleReversalJournalInTx: jest.fn().mockResolvedValue({
        entryStableId: 'journal_sale_reversal_1',
      }),
    } as unknown as AccountingJournalService;
    const service = new AccountingExternalSaleReversalService(prisma, journal);

    const result = await service.reverseSale(
      sale.externalSaleStableId,
      { reason: 'Original reason' },
      'actor_retry',
    );

    expect(result.reversalJournalEntryStableId).toBe('journal_sale_reversal_1');
    expect(result.reversedByActorRef).toBe('actor_original');
    expect(
      (
        journal as unknown as {
          createExternalSaleReversalJournalInTx: jest.Mock;
        }
      ).createExternalSaleReversalJournalInTx,
    ).toHaveBeenCalledTimes(1);
  });

  it('rejects a different reason when replaying an already reversed target', async () => {
    const sale = activeSale();
    const original = saleJournal();
    const originalPlan = buildAccountingExternalSaleReversalWritePlan({
      fact: {
        version: 1,
        target: 'SALE',
        targetStableId: sale.externalSaleStableId,
        originalFactHash: sale.factHash,
        originalJournalEntryStableId: sale.journalEntryStableId,
        reversalStableId: buildAccountingExternalSaleReversalStableId(
          'SALE',
          sale.externalSaleStableId,
        ),
        reversalReason: 'Original reason',
      },
      originalJournal: original,
    });
    sale.reversalStableId = originalPlan.authority.fact.reversalStableId;
    sale.reversalFactHash = originalPlan.authority.reversalFactHash;
    sale.reversalJournalEntryStableId = 'journal_sale_reversal_1';
    sale.reversedAt = new Date('2026-10-02T20:00:00Z');
    sale.reversedByActorRef = 'actor_original';

    const tx = {
      accountingExternalSale: {
        findUnique: jest.fn().mockResolvedValue(sale),
      },
      accountingJournalEntry: {
        findUnique: jest.fn().mockResolvedValue(journalRow(original)),
        findMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleReversalJournalInTx: jest.fn(),
    } as unknown as AccountingJournalService;
    const service = new AccountingExternalSaleReversalService(prisma, journal);

    await expect(
      service.reverseSale(
        sale.externalSaleStableId,
        { reason: 'Different reason' },
        'actor_retry',
      ),
    ).rejects.toThrow(
      new ConflictException(
        'External Sale is already reversed with different frozen reversal facts',
      ),
    );
    expect(
      (
        journal as unknown as {
          createExternalSaleReversalJournalInTx: jest.Mock;
        }
      ).createExternalSaleReversalJournalInTx,
    ).not.toHaveBeenCalled();
  });
});
