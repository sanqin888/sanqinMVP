import { AccountingJournalSource } from './accounting-contracts';
import type { AccountingDb } from './accounting-db';
import { AccountingOpeningReceivableReversalService } from './accounting-opening-receivable-reversal.service';
import {
  buildAccountingOpeningReceivableReversalStableId,
  buildAccountingOpeningReceivableReversalWritePlan,
  type AccountingOpeningReceivableOriginalJournalV1,
} from './accounting-opening-receivable-reversal-journal-authority';
import type { AccountingJournalService } from './accounting-journal.service';

const settlementOriginal =
  (): AccountingOpeningReceivableOriginalJournalV1 => ({
    entryStableId: 'journal_opening_settlement_1',
    source: AccountingJournalSource.MANUAL,
    sourceFactType: 'accounting.opening_receivable_settlement.v1',
    sourceFactStableId: 'openingrecvsettle_1',
    sourceFactVersion: 1,
    storeStableId: '4750_Yonge_Street',
    occurredAt: '2026-06-20T04:00:00.000Z',
    currency: 'CAD',
    memo: 'Opening Receivable settlement',
    lines: [
      {
        lineNo: 1,
        accountStableId: 'account_primary_bank',
        categoryStableId: null,
        debitCents: 12_500,
        creditCents: 0,
        memo: 'Collection',
      },
      {
        lineNo: 2,
        accountStableId: 'account_accounts_receivable',
        categoryStableId: null,
        debitCents: 0,
        creditCents: 12_500,
        memo: 'Opening Receivable settlement',
      },
    ],
  });

const journalRow = (
  snapshot: AccountingOpeningReceivableOriginalJournalV1,
) => ({
  entryStableId: snapshot.entryStableId,
  kind: 'STANDARD',
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

describe('AccountingOpeningReceivableReversalService G3', () => {
  it('posts and anchors a Settlement exact-inverse reversal atomically', async () => {
    const settlement = {
      id: '22222222-2222-4222-8222-222222222222',
      settlementStableId: 'openingrecvsettle_1',
      storeStableId: '4750_Yonge_Street',
      currency: 'CAD',
      factHash: 'settlement_fact_hash',
      journalEntryStableId: 'journal_opening_settlement_1',
      reversalStableId: null,
      reversalFactHash: null,
      reversalJournalEntryStableId: null,
      reversedAt: null,
      reversedByActorRef: null,
      replacedBySettlement: null,
      collectionAccount: { accountStableId: 'account_primary_bank' },
    };
    const original = settlementOriginal();
    const reversalStableId = buildAccountingOpeningReceivableReversalStableId(
      'SETTLEMENT',
      settlement.settlementStableId,
    );
    const expected = buildAccountingOpeningReceivableReversalWritePlan({
      fact: {
        version: 1,
        target: 'SETTLEMENT',
        targetStableId: settlement.settlementStableId,
        originalFactHash: settlement.factHash,
        originalJournalEntryStableId: settlement.journalEntryStableId,
        reversalStableId,
        reversalReason: 'Wrong collection account',
      },
      originalJournal: original,
    });
    const tx = {
      accountingOpeningReceivableSettlement: {
        findUnique: jest.fn().mockResolvedValue(settlement),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              settlementStableId: settlement.settlementStableId,
              reversalStableId: data.reversalStableId ?? reversalStableId,
              reversalFactHash:
                data.reversalFactHash ?? expected.authority.reversalFactHash,
              reversalJournalEntryStableId:
                data.reversalJournalEntryStableId ??
                'journal_opening_settlement_reversal_1',
              reversedAt:
                data.reversedAt ?? new Date('2026-10-05T20:00:00.000Z'),
              reversedByActorRef: data.reversedByActorRef ?? 'actor_accountant',
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
    const createOpeningReceivableReversalJournalInTx = jest
      .fn()
      .mockResolvedValue({
        entryStableId: 'journal_opening_settlement_reversal_1',
      });
    const journal = {
      createOpeningReceivableReversalJournalInTx,
    } as unknown as AccountingJournalService;
    const service = new AccountingOpeningReceivableReversalService(
      prisma,
      journal,
    );

    const result = await service.reverseSettlement(
      settlement.settlementStableId,
      { reason: 'Wrong collection account' },
      'actor_accountant',
    );

    expect(result).toMatchObject({
      target: 'SETTLEMENT',
      targetStableId: settlement.settlementStableId,
      reversalStableId,
      reversalJournalEntryStableId: 'journal_opening_settlement_reversal_1',
      reversalReason: 'Wrong collection account',
    });
    expect(createOpeningReceivableReversalJournalInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ADJUSTMENT',
        source: 'MANUAL',
        sourceFactType: 'accounting.opening_receivable_settlement_reversal.v1',
        occurredAt: original.occurredAt,
      }),
      'actor_accountant',
      expect.objectContaining({
        reversalFactHash: expected.authority.reversalFactHash,
      }),
      tx,
    );
    expect(
      tx.accountingOpeningReceivableSettlement.update,
    ).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(tx.accountingAuditLog.create.mock.calls)).toContain(
      'OPENING_RECEIVABLE_SETTLEMENT_REVERSE',
    );
  });

  it('blocks Opening Receivable reversal while a live G2 settlement remains', async () => {
    const opening = {
      id: '11111111-1111-4111-8111-111111111111',
      openingReceivableStableId: 'openingrecv_1',
      storeStableId: '4750_Yonge_Street',
      currency: 'CAD',
      factHash: 'opening_fact_hash',
      journalEntryStableId: 'journal_opening_1',
      reversalStableId: null,
      reversalFactHash: null,
      reversalJournalEntryStableId: null,
      reversedAt: null,
      reversedByActorRef: null,
      replacedByOpeningReceivable: null,
      settlements: [
        {
          settlementStableId: 'openingrecvsettle_live',
          journalEntryStableId: 'journal_opening_settlement_live',
          reversalStableId: null,
          reversalFactHash: null,
          reversalJournalEntryStableId: null,
          reversedAt: null,
          reversedByActorRef: null,
          collectionAccount: { accountStableId: 'account_primary_bank' },
        },
      ],
    };
    const tx = {
      accountingOpeningReceivable: {
        findUnique: jest.fn().mockResolvedValue(opening),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as unknown as AccountingDb;
    const createOpeningReceivableReversalJournalInTx = jest.fn();
    const journal = {
      createOpeningReceivableReversalJournalInTx,
    } as unknown as AccountingJournalService;
    const service = new AccountingOpeningReceivableReversalService(
      prisma,
      journal,
    );

    await expect(
      service.reverseOpeningReceivable(
        opening.openingReceivableStableId,
        { reason: 'Opening amount was incorrect' },
        'actor_accountant',
      ),
    ).rejects.toThrow(
      'Opening Receivable has active settlement openingrecvsettle_live; reverse settlement first',
    );
    expect(createOpeningReceivableReversalJournalInTx).not.toHaveBeenCalled();
  });
});
