import { AccountingExpenseJournalPreviewService } from './accounting-expense-journal-preview.service';

const confirmedExpense = (overrides: Record<string, unknown> = {}) => ({
  documentStableId: 'expense_1',
  occurredAt: new Date('2026-09-21T04:00:00.000Z'),
  subtotalCents: 7495,
  taxCents: 974,
  totalCents: 8469,
  currency: 'CAD',
  memo: 'Bell',
  paymentAllocations: [
    {
      amountCents: 8469,
      account: { accountStableId: 'account_primary_bank' },
    },
  ],
  transactions: [
    {
      amountCents: 7495,
      taxCents: 974,
      category: { categoryStableId: 'expense_telecom' },
    },
  ],
  ...overrides,
});

const makeService = (params: {
  documents?: Array<Record<string, unknown>>;
  journals?: Array<Record<string, unknown>>;
} = {}) => {
  const prisma = {
    accountingExpenseDocument: {
      findMany: jest.fn().mockResolvedValue(params.documents ?? []),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockResolvedValue(params.journals ?? []),
    },
  };
  const period = {
    requireCanonicalFinancialPostingStartAt: jest
      .fn()
      .mockResolvedValue(new Date('2026-01-01T05:00:00.000Z')),
    getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
  };
  return {
    service: new AccountingExpenseJournalPreviewService(
      prisma as never,
      period as never,
    ),
    prisma,
  };
};

const input = {
  fromDate: '2026-09-01',
  toDateExclusive: '2026-10-01',
};

describe('AccountingExpenseJournalPreviewService', () => {
  it('builds deterministic READY preview and plan hashes', async () => {
    const { service } = makeService({ documents: [confirmedExpense()] });

    const first = await service.previewRange(input);
    const second = await service.previewRange(input);

    expect(first.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.planHash).toBe(first.planHash);
    expect(first.counts).toEqual({
      candidates: 1,
      ready: 1,
      blocked: 0,
      alreadyPosted: 0,
      byClassification: { READY: 1 },
    });
    expect(first.entries[0]).toEqual(
      expect.objectContaining({
        documentStableId: 'expense_1',
        status: 'READY',
        classification: 'READY',
        draftHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
        debitCents: 8469,
        creditCents: 8469,
      }),
    );
  });

  it('blocks a confirmed Expense with no reviewed payment allocation', async () => {
    const { service } = makeService({
      documents: [confirmedExpense({ paymentAllocations: [] })],
    });

    const report = await service.previewRange(input);

    expect(report.counts).toEqual({
      candidates: 1,
      ready: 0,
      blocked: 1,
      alreadyPosted: 0,
      byClassification: { MISSING_PAYMENT_ALLOCATION: 1 },
    });
    expect(report.entries[0]).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        classification: 'MISSING_PAYMENT_ALLOCATION',
        draftJournal: null,
        draftHash: null,
      }),
    );
  });

  it('reports an existing canonical Expense Journal without planning a duplicate', async () => {
    const { service } = makeService({
      documents: [confirmedExpense()],
      journals: [
        {
          entryStableId: 'journal_expense_1',
          idempotencyKey: 'canonical-expense:expense_1:v1',
          sourceFactStableId: 'expense_1',
        },
      ],
    });

    const report = await service.previewRange(input);

    expect(report.counts).toEqual({
      candidates: 1,
      ready: 0,
      blocked: 0,
      alreadyPosted: 1,
      byClassification: { ALREADY_POSTED: 1 },
    });
    expect(report.entries[0]).toEqual(
      expect.objectContaining({
        status: 'ALREADY_POSTED',
        classification: 'ALREADY_POSTED',
        existingJournal: {
          entryStableId: 'journal_expense_1',
          idempotencyKey: 'canonical-expense:expense_1:v1',
        },
        draftJournal: null,
      }),
    );
  });
});
