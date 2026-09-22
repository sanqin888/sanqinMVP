import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingDocumentStatus,
  AccountingJournalSource,
  AccountingTxType,
} from './accounting-contracts';
import { AccountingExpenseReportParityService } from './accounting-expense-report-parity.service';

const at = new Date('2026-09-21T16:00:00.000Z');

const confirmedExpense = (overrides: Record<string, unknown> = {}) => ({
  documentStableId: 'expense_1',
  status: AccountingDocumentStatus.CONFIRMED,
  occurredAt: at,
  currency: 'CAD',
  memo: 'ingredients',
  transactions: [
    {
      txStableId: 'accttx_1',
      type: AccountingTxType.EXPENSE,
      amountCents: 1000,
      taxCents: 130,
      memo: 'ingredients',
      category: {
        categoryStableId: 'expense_food',
        name: '食材',
        type: AccountingTxType.EXPENSE,
      },
    },
  ],
  splits: [
    {
      amountCents: 1000,
      taxCents: 130,
      category: { categoryStableId: 'expense_food' },
    },
  ],
  paymentAllocations: [
    {
      amountCents: 1130,
      account: {
        accountStableId: 'account_primary_bank',
        name: 'Primary bank',
        type: AccountingAccountType.BANK,
      },
    },
  ],
  ...overrides,
});

const expenseJournal = (overrides: Record<string, unknown> = {}) => ({
  entryStableId: 'journal_expense_1',
  sourceFactType: 'accounting.expense_document.v1',
  sourceFactStableId: 'expense_1',
  sourceFactVersion: 1,
  occurredAt: at,
  currency: 'CAD',
  memo: 'ingredients',
  lines: [
    {
      lineNo: 1,
      debitCents: 1000,
      creditCents: 0,
      memo: 'Expense expense_1',
      account: {
        accountStableId: 'account_general_operating_expense',
        name: '一般经营费用',
        type: null,
        accountClass: AccountingAccountClass.EXPENSE,
      },
      category: {
        categoryStableId: 'expense_food',
        name: '食材',
        type: AccountingTxType.EXPENSE,
      },
    },
    {
      lineNo: 2,
      debitCents: 130,
      creditCents: 0,
      memo: 'Recoverable HST/GST for expense_1',
      account: {
        accountStableId: 'account_hst_recoverable',
        name: 'HST/GST 待抵扣',
        type: null,
        accountClass: AccountingAccountClass.ASSET,
      },
      category: null,
    },
    {
      lineNo: 3,
      debitCents: 0,
      creditCents: 1130,
      memo: 'Expense payment for expense_1',
      account: {
        accountStableId: 'account_primary_bank',
        name: 'Primary bank',
        type: AccountingAccountType.BANK,
        accountClass: AccountingAccountClass.ASSET,
      },
      category: null,
    },
  ],
  ...overrides,
});

const makeService = (params: {
  documents?: Array<Record<string, unknown>>;
  journals?: Array<Record<string, unknown>>;
}) => {
  const prisma = {
    accountingExpenseDocument: {
      findMany: jest.fn().mockResolvedValue(params.documents ?? []),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockResolvedValue(params.journals ?? []),
    },
  };
  const period = {
    getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    requireCanonicalFinancialPostingStartAt: jest
      .fn()
      .mockResolvedValue(new Date('2026-06-01T04:00:00.000Z')),
  };
  return {
    service: new AccountingExpenseReportParityService(
      prisma as never,
      period as never,
    ),
    prisma,
  };
};

describe('AccountingExpenseReportParityService', () => {
  it('proves P&L, input tax, account movement and cashflow parity for a posted Expense', async () => {
    const { service } = makeService({
      documents: [confirmedExpense()],
      journals: [expenseJournal()],
    });

    const report = await service.preview({});

    expect(report.cutoverReady).toBe(true);
    expect(report.blockReasons).toEqual([]);
    expect(report.counts).toEqual({
      confirmedExpenses: 1,
      canonicalExpenseJournals: 1,
      blockingReasons: 0,
    });
    expect(report.pnl).toEqual({
      legacyByCategory: [{ key: 'expense_food', amountCents: 1000 }],
      journalByCategory: [{ key: 'expense_food', amountCents: 1000 }],
      deltas: [],
    });
    expect(report.inputTax).toEqual({
      legacyCents: 130,
      journalCents: 130,
      deltaCents: 0,
    });
    expect(report.accountMovement.deltas).toEqual([]);
    expect(report.cashflow.deltas).toEqual({
      operatingCents: 0,
      investingCents: 0,
      financingCents: 0,
    });
    expect(report.parityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps partial date ranges diagnostic-only instead of cutover-ready', async () => {
    const { service } = makeService({
      documents: [confirmedExpense()],
      journals: [expenseJournal()],
    });

    const report = await service.preview({
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(report.cutoverReady).toBe(false);
    expect(report.range.fullCutoverRange).toBe(false);
    expect(report.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PARTIAL_RANGE_NOT_CUTOVER_EVIDENCE',
          documentStableId: null,
        }),
      ]),
    );
  });

  it('does not accept an empty production population as cutover evidence', async () => {
    const { service } = makeService({ documents: [], journals: [] });

    const report = await service.preview({});

    expect(report.cutoverReady).toBe(false);
    expect(report.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NO_CONFIRMED_EXPENSE_EVIDENCE',
          documentStableId: null,
        }),
      ]),
    );
  });

  it('blocks cutover when a confirmed Expense is still intentionally unposted', async () => {
    const { service } = makeService({
      documents: [confirmedExpense({ paymentAllocations: [] })],
      journals: [],
    });

    const report = await service.preview({});

    expect(report.cutoverReady).toBe(false);
    expect(report.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_PAYMENT_ALLOCATION',
          documentStableId: 'expense_1',
        }),
        expect.objectContaining({
          code: 'MISSING_CANONICAL_JOURNAL',
          documentStableId: 'expense_1',
        }),
      ]),
    );
  });

  it('does not let opposite per-document P&L errors cancel in the aggregate', async () => {
    const journalOne = expenseJournal({
      entryStableId: 'journal_expense_1',
      sourceFactStableId: 'expense_1',
      lines: expenseJournal().lines.map((line, index) =>
        index === 0 ? { ...line, debitCents: 900 } : line,
      ),
    });
    const journalTwo = expenseJournal({
      entryStableId: 'journal_expense_2',
      sourceFactStableId: 'expense_2',
      lines: expenseJournal().lines.map((line, index) =>
        index === 0 ? { ...line, debitCents: 1100 } : line,
      ),
    });
    const { service } = makeService({
      documents: [
        confirmedExpense({ documentStableId: 'expense_1' }),
        confirmedExpense({ documentStableId: 'expense_2' }),
      ],
      journals: [journalOne, journalTwo],
    });

    const report = await service.preview({});

    expect(report.pnl.deltas).toEqual([]);
    expect(report.cutoverReady).toBe(false);
    expect(report.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PNL_MISMATCH',
          documentStableId: 'expense_1',
        }),
        expect.objectContaining({
          code: 'PNL_MISMATCH',
          documentStableId: 'expense_2',
        }),
      ]),
    );
  });

  it('surfaces account-movement drift instead of allowing a Journal cutover', async () => {
    const { service } = makeService({
      documents: [confirmedExpense()],
      journals: [
        expenseJournal({
          lines: expenseJournal().lines.map((line) =>
            line.account.accountStableId === 'account_primary_bank'
              ? {
                  ...line,
                  account: {
                    ...line.account,
                    accountStableId: 'account_other_bank',
                    name: 'Other bank',
                  },
                }
              : line,
          ),
        }),
      ],
    });

    const report = await service.preview({});

    expect(report.cutoverReady).toBe(false);
    expect(report.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ACCOUNT_MOVEMENT_MISMATCH' }),
      ]),
    );
    expect(report.accountMovement.deltas).toHaveLength(2);
  });

  it('blocks non-v1 Expense-document Journal authority from cutover evidence', async () => {
    const { service } = makeService({
      documents: [confirmedExpense()],
      journals: [
        expenseJournal({
          sourceFactType: 'accounting.expense_document.legacy',
          sourceFactVersion: 0,
        }),
      ],
    });

    const report = await service.preview({});

    expect(report.cutoverReady).toBe(false);
    expect(report.counts.canonicalExpenseJournals).toBe(0);
    expect(report.blockReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNEXPECTED_EXPENSE_JOURNAL_AUTHORITY',
          documentStableId: 'expense_1',
        }),
        expect.objectContaining({
          code: 'MISSING_CANONICAL_JOURNAL',
          documentStableId: 'expense_1',
        }),
      ]),
    );
  });

  it('queries all Expense-document Journals and validates canonical authority in memory', async () => {
    const { service, prisma } = makeService({
      documents: [confirmedExpense()],
      journals: [expenseJournal()],
    });

    await service.preview({});

    expect(prisma.accountingJournalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          source: AccountingJournalSource.EXPENSE_DOCUMENT,
        }) as unknown,
      }),
    );
  });
});
