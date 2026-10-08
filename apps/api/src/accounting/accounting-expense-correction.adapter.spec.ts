import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingDocumentStatus,
} from './accounting-contracts';
import type { AccountingExpenseCorrectionTargetV1 } from './accounting-expense-correction-target.policy';
import { AccountingExpenseCorrectionAdapter } from './accounting-expense-correction.adapter';
import {
  buildCanonicalExpenseJournalWritePlan,
  buildCanonicalExpenseJournalWritePlansV2,
  hashCanonicalExpenseJournalWrite,
} from './accounting-expense-journal-write-authority';
import { normalizeJournalCreate } from './accounting-journal-policy';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';
import { buildPostedFinancialCorrectionPreviewPlan } from './accounting-posted-financial-correction.policy';

const v2Fact = {
  version: 2 as const,
  documentStableId: 'expense_v2',
  occurredAt: '2026-09-22T04:00:00.000Z',
  currency: 'CAD',
  subtotalCents: 8000,
  taxCents: 1040,
  totalCents: 9040,
  memo: 'Kitchen receipt',
  splits: [
    {
      splitStableId: 'split_meat',
      categoryStableId: 'expense_meat',
      paidFromAccountStableId: 'account_cibc',
      amountCents: 6000,
      taxCents: 780,
    },
    {
      splitStableId: 'split_supplies',
      categoryStableId: 'expense_kitchen_supplies',
      paidFromAccountStableId: 'account_primary_bank',
      amountCents: 2000,
      taxCents: 260,
    },
  ],
};

const v1Fact = {
  version: 1 as const,
  documentStableId: 'expense_v1',
  occurredAt: '2026-07-01T04:00:00.000Z',
  currency: 'CAD',
  subtotalCents: 7495,
  taxCents: 974,
  totalCents: 8469,
  memo: 'Bell',
  splits: [
    {
      categoryStableId: 'expense_telecom',
      amountCents: 7495,
      taxCents: 974,
    },
  ],
  paymentAllocations: [
    {
      accountStableId: 'account_primary_bank',
      amountCents: 8469,
    },
  ],
};

const v2FundingFacts = [
  {
    accountStableId: 'account_cibc',
    accountClass: AccountingAccountClass.ASSET,
    accountType: AccountingAccountType.BANK,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: 'account_primary_bank',
    accountClass: AccountingAccountClass.ASSET,
    accountType: AccountingAccountType.BANK,
    currency: 'CAD',
    isActive: true,
  },
];

const journalRow = (
  plan: ReturnType<typeof buildCanonicalExpenseJournalWritePlansV2>[number],
  entryStableId: string,
) => ({
  entryStableId,
  idempotencyKey: plan.journal.idempotencyKey,
  idempotencyHash: hashCanonicalExpenseJournalWrite(
    normalizeJournalCreate(plan.journal),
    plan.authority,
  ),
  version: 1,
  kind: plan.journal.kind,
  source: plan.journal.source,
  sourceFactType: plan.journal.sourceFactType,
  sourceFactStableId: plan.journal.sourceFactStableId,
  sourceFactVersion: plan.journal.sourceFactVersion,
  storeStableId: plan.journal.storeStableId ?? null,
  occurredAt: new Date(plan.journal.occurredAt),
  currency: plan.journal.currency,
  memo: plan.journal.memo ?? null,
  deletedAt: null,
  lines: plan.journal.lines.map((line, index) => ({
    lineNo: index + 1,
    debitCents: line.debitCents ?? 0,
    creditCents: line.creditCents ?? 0,
    memo: line.memo ?? null,
    account: { accountStableId: line.accountStableId },
    category: line.categoryStableId
      ? { categoryStableId: line.categoryStableId }
      : null,
  })),
});

const v1JournalRow = (
  plan: ReturnType<typeof buildCanonicalExpenseJournalWritePlan>,
) => ({
  entryStableId: 'journal_expense_v1',
  idempotencyKey: plan.journal.idempotencyKey,
  idempotencyHash: hashCanonicalExpenseJournalWrite(
    normalizeJournalCreate(plan.journal),
    plan.authority,
  ),
  version: 1,
  kind: plan.journal.kind,
  source: plan.journal.source,
  sourceFactType: plan.journal.sourceFactType,
  sourceFactStableId: plan.journal.sourceFactStableId,
  sourceFactVersion: plan.journal.sourceFactVersion,
  storeStableId: plan.journal.storeStableId ?? null,
  occurredAt: new Date(plan.journal.occurredAt),
  currency: plan.journal.currency,
  memo: plan.journal.memo ?? null,
  deletedAt: null,
  lines: plan.journal.lines.map((line, index) => ({
    lineNo: index + 1,
    debitCents: line.debitCents ?? 0,
    creditCents: line.creditCents ?? 0,
    memo: line.memo ?? null,
    account: { accountStableId: line.accountStableId },
    category: line.categoryStableId
      ? { categoryStableId: line.categoryStableId }
      : null,
  })),
});

const makeV2Fixture = () => {
  const plans = buildCanonicalExpenseJournalWritePlansV2({
    fact: v2Fact,
    fundingAccountFacts: v2FundingFacts,
  });
  const journals = [
    journalRow(plans[0], 'journal_expense_v2_cibc'),
    journalRow(plans[1], 'journal_expense_v2_primary'),
  ];
  const auditByJournal = new Map(
    journals.map((journal, index) => [
      journal.entryStableId,
      { afterJson: { writeAuthority: plans[index].authority } },
    ]),
  );
  const document = {
    documentStableId: 'expense_v2',
    status: AccountingDocumentStatus.CONFIRMED,
    fundingAttributionVersion: 2,
    occurredAt: new Date(v2Fact.occurredAt),
    subtotalCents: v2Fact.subtotalCents,
    taxCents: v2Fact.taxCents,
    totalCents: v2Fact.totalCents,
    currency: v2Fact.currency,
    memo: v2Fact.memo,
    splits: v2Fact.splits.map((split) => ({
      splitStableId: split.splitStableId,
      amountCents: split.amountCents,
      taxCents: split.taxCents,
      category: { categoryStableId: split.categoryStableId },
      paidFromAccount: {
        accountStableId: split.paidFromAccountStableId,
        accountClass: AccountingAccountClass.ASSET,
        type: AccountingAccountType.BANK,
        currency: 'CAD',
        isActive: true,
      },
    })),
    paymentAllocations: [],
  };
  const accounts = new Map(
    v2FundingFacts.map((account) => [
      account.accountStableId,
      {
        accountStableId: account.accountStableId,
        accountClass: account.accountClass,
        type: account.accountType,
        currency: account.currency,
        isActive: account.isActive,
      },
    ]),
  );
  const db = {
    accountingExpenseDocument: {
      findUnique: jest.fn().mockResolvedValue(document),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockResolvedValue(journals),
    },
    accountingAuditLog: {
      findFirst: jest
        .fn()
        .mockImplementation((args: { where?: { entityId?: string } }) =>
          Promise.resolve(
            args.where?.entityId
              ? (auditByJournal.get(args.where.entityId) ?? null)
              : null,
          ),
        ),
    },
    accountingCorrectionCase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    accountingCategory: {
      findMany: jest
        .fn()
        .mockImplementation(
          (args: { where?: { categoryStableId?: { in?: string[] } } }) =>
            Promise.resolve(
              (args.where?.categoryStableId?.in ?? []).map(
                (categoryStableId) => ({
                  categoryStableId,
                  type: 'EXPENSE',
                  isActive: true,
                }),
              ),
            ),
        ),
    },
    accountingAccount: {
      findMany: jest
        .fn()
        .mockImplementation(
          (args: { where?: { accountStableId?: { in?: string[] } } }) =>
            Promise.resolve(
              (args.where?.accountStableId?.in ?? []).map(
                (accountStableId) =>
                  accounts.get(accountStableId) ?? {
                    accountStableId,
                    accountClass: AccountingAccountClass.ASSET,
                    type: AccountingAccountType.BANK,
                    currency: 'CAD',
                    isActive: true,
                  },
              ),
            ),
        ),
    },
  };
  return {
    adapter: new AccountingExpenseCorrectionAdapter(db as never),
    db,
    document,
    journals,
  };
};

const makeV1Fixture = () => {
  const plan = buildCanonicalExpenseJournalWritePlan({
    fact: v1Fact,
    splitStableIds: ['split_telecom'],
    paymentAllocationStableIds: ['allocation_bank'],
  });
  const journal = v1JournalRow(plan);
  const document = {
    documentStableId: 'expense_v1',
    status: AccountingDocumentStatus.CONFIRMED,
    fundingAttributionVersion: 1,
    occurredAt: new Date(v1Fact.occurredAt),
    subtotalCents: v1Fact.subtotalCents,
    taxCents: v1Fact.taxCents,
    totalCents: v1Fact.totalCents,
    currency: v1Fact.currency,
    memo: v1Fact.memo,
    splits: [
      {
        splitStableId: 'split_telecom',
        amountCents: 7495,
        taxCents: 974,
        category: { categoryStableId: 'expense_telecom' },
        paidFromAccount: null,
      },
    ],
    paymentAllocations: [
      {
        paymentAllocationStableId: 'allocation_bank',
        amountCents: 8469,
        account: {
          accountStableId: 'account_primary_bank',
          currency: 'CAD',
          isActive: true,
        },
      },
    ],
  };
  const db = {
    accountingExpenseDocument: {
      findUnique: jest.fn().mockResolvedValue(document),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockResolvedValue([journal]),
    },
    accountingAuditLog: {
      findFirst: jest.fn().mockResolvedValue({
        afterJson: { writeAuthority: plan.authority },
      }),
    },
    accountingCorrectionCase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    accountingCategory: {
      findMany: jest
        .fn()
        .mockImplementation(
          (args: { where?: { categoryStableId?: { in?: string[] } } }) =>
            Promise.resolve(
              (args.where?.categoryStableId?.in ?? []).map(
                (categoryStableId) => ({
                  categoryStableId,
                  type: 'EXPENSE',
                  isActive: true,
                }),
              ),
            ),
        ),
    },
    accountingAccount: {
      findMany: jest
        .fn()
        .mockImplementation(
          (args: { where?: { accountStableId?: { in?: string[] } } }) =>
            Promise.resolve(
              (args.where?.accountStableId?.in ?? []).map(
                (accountStableId) => ({
                  accountStableId,
                  currency: 'CAD',
                  isActive: true,
                }),
              ),
            ),
        ),
    },
  };
  return {
    adapter: new AccountingExpenseCorrectionAdapter(db as never),
    db,
  };
};

describe('AccountingExpenseCorrectionAdapter', () => {
  it('reconstructs current-effective Expense v2 authority from the immutable typed CREATE audits', async () => {
    const { adapter } = makeV2Fixture();

    const current = await adapter.readCurrentEffectiveTarget('expense_v2', 2);

    expect(current.targetKind).toBe(
      AccountingPostedCorrectionTargetKind.EXPENSE,
    );
    expect(current.targetVersion).toBe(2);
    expect(current.targetJson.document).toEqual(
      expect.objectContaining({
        documentStableId: 'expense_v2',
        fundingAttributionVersion: 2,
        totalCents: 9040,
      }),
    );
    expect(current.targetJson.splits).toHaveLength(2);
    expect(current.draftInput.expectedBaseAuthorityHash).toBe(
      current.targetAuthorityHash,
    );
  });

  it('builds a grouped v2 Target Journal Set and preserves unchanged funding', async () => {
    const { adapter, db } = makeV2Fixture();
    const current = await adapter.readCurrentEffectiveTarget('expense_v2', 2);
    const input = {
      ...current.draftInput,
      splits: current.draftInput.splits.map((split) =>
        split.splitStableId === 'split_supplies'
          ? {
              ...split,
              categoryStableId: 'expense_cleaning',
              paidFromAccountStableId: undefined,
            }
          : {
              ...split,
              paidFromAccountStableId: undefined,
            },
      ),
    };
    const revision = await adapter.normalizeRevisionTarget(
      {
        targetStableId: 'expense_v2',
        targetVersion: 2,
        reasonCode: AccountingPostedCorrectionReasonCode.CLASSIFICATION_ERROR,
        targetJson: input,
      },
      db as never,
    );

    const ready = await adapter.resolveReadyTarget(
      {
        targetStableId: 'expense_v2',
        targetVersion: 2,
        reasonCode: AccountingPostedCorrectionReasonCode.CLASSIFICATION_ERROR,
        targetJson: revision.targetJson,
      },
      db as never,
    );

    expect(ready.strategy).toBe('DELTA');
    expect(ready.originalJournals).toHaveLength(2);
    expect(ready.targetJournals).toHaveLength(2);
    expect(
      (ready.targetJson as unknown as AccountingExpenseCorrectionTargetV1)
        .splits,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          splitStableId: 'split_meat',
          paidFromAccountStableId: 'account_cibc',
        }),
        expect.objectContaining({
          splitStableId: 'split_supplies',
          paidFromAccountStableId: 'account_primary_bank',
          categoryStableId: 'expense_cleaning',
        }),
      ]),
    );

    const preview = buildPostedFinancialCorrectionPreviewPlan({
      correctionStableId: 'correction_expense_v2',
      targetKind: ready.targetKind,
      targetStableId: ready.targetStableId,
      targetVersion: ready.targetVersion,
      strategy: ready.strategy,
      reasonCode: AccountingPostedCorrectionReasonCode.CLASSIFICATION_ERROR,
      baseAuthoritySchema: ready.baseAuthoritySchema,
      baseAuthorityHash: ready.baseAuthorityHash,
      targetAuthoritySchema: ready.targetAuthoritySchema,
      targetAuthorityHash: ready.targetAuthorityHash,
      currency: ready.currency,
      originalJournals: ready.originalJournals,
      priorCorrectionJournals: [],
      targetJournals: ready.targetJournals,
    });
    expect(preview.status).toBe('READY');
    expect(preview.deltaPosting.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryStableId: 'expense_kitchen_supplies',
        }),
        expect.objectContaining({
          categoryStableId: 'expense_cleaning',
        }),
      ]),
    );
  });

  it('allows an unfunded corrected v2 business target to be saved as DRAFT but blocks READY', async () => {
    const { adapter, db } = makeV2Fixture();
    const current = await adapter.readCurrentEffectiveTarget('expense_v2', 2);
    const revision = await adapter.normalizeRevisionTarget(
      {
        targetStableId: 'expense_v2',
        targetVersion: 2,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: {
          ...current.draftInput,
          splits: current.draftInput.splits.map((split) =>
            split.splitStableId === 'split_meat'
              ? { ...split, paidFromAccountStableId: null }
              : split,
          ),
        },
      },
      db as never,
    );

    await expect(
      adapter.resolveReadyTarget(
        {
          targetStableId: 'expense_v2',
          targetVersion: 2,
          reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
          targetJson: revision.targetJson,
        },
        db as never,
      ),
    ).rejects.toThrow(
      'Expense v2 correction requires complete split funding before READY',
    );
  });

  it('fails closed when persisted Expense source facts drift from the immutable CREATE authority', async () => {
    const { adapter, db, document } = makeV2Fixture();
    db.accountingExpenseDocument.findUnique.mockResolvedValue({
      ...document,
      totalCents: document.totalCents + 1,
    });

    await expect(
      adapter.readCurrentEffectiveTarget('expense_v2', 2),
    ).rejects.toThrow('persisted Expense source authority');
  });

  it('fails closed when a v2 original funding-group Journal is missing', async () => {
    const { adapter, db, journals } = makeV2Fixture();
    db.accountingJournalEntry.findMany.mockResolvedValue([journals[0]]);

    await expect(
      adapter.readCurrentEffectiveTarget('expense_v2', 2),
    ).rejects.toThrow(
      'Expense v2 original Journal groups do not cover every funding account exactly once',
    );
  });

  it('uses the latest POSTED Expense Correction target as the next current-effective authority', async () => {
    const { adapter, db } = makeV2Fixture();
    const current = await adapter.readCurrentEffectiveTarget('expense_v2', 2);
    const revision = await adapter.normalizeRevisionTarget(
      {
        targetStableId: 'expense_v2',
        targetVersion: 2,
        reasonCode: AccountingPostedCorrectionReasonCode.CLASSIFICATION_ERROR,
        targetJson: {
          ...current.draftInput,
          splits: current.draftInput.splits.map((split) =>
            split.splitStableId === 'split_supplies'
              ? { ...split, categoryStableId: 'expense_cleaning' }
              : split,
          ),
        },
      },
      db as never,
    );
    db.accountingCorrectionCase.findMany.mockResolvedValue([
      {
        correctionStableId: 'correction_expense_posted_1',
        targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
        targetStableId: 'expense_v2',
        targetVersion: 2,
        status: 'POSTED',
        reasonCode: AccountingPostedCorrectionReasonCode.CLASSIFICATION_ERROR,
        note: null,
        strategy: 'DELTA',
        targetAuthoritySchema: revision.targetAuthoritySchema,
        targetAuthorityHash: revision.targetAuthorityHash,
        postedByActorRef: 'user_1',
        postedAt: new Date('2026-10-07T12:00:00.000Z'),
        createdAt: new Date('2026-10-07T11:00:00.000Z'),
        readyRevision: {
          targetAuthoritySchema: revision.targetAuthoritySchema,
          targetAuthorityHash: revision.targetAuthorityHash,
          targetJson: revision.targetJson,
        },
      },
    ]);

    const next = await adapter.readCurrentEffectiveTarget('expense_v2', 2);

    expect(next.targetAuthorityHash).toBe(revision.targetAuthorityHash);
    expect(
      next.targetJson.splits.find(
        (split) => split.splitStableId === 'split_supplies',
      )?.categoryStableId,
    ).toBe('expense_cleaning');
  });

  it('supports historical v1 correction authority without converting it to split funding', async () => {
    const { adapter, db } = makeV1Fixture();
    const current = await adapter.readCurrentEffectiveTarget('expense_v1', 1);

    expect(current.targetJson.document.fundingAttributionVersion).toBe(1);
    expect(current.targetJson.splits[0]?.paidFromAccountStableId).toBeNull();
    expect(current.targetJson.paymentAllocations).toEqual([
      expect.objectContaining({
        paymentAllocationStableId: 'allocation_bank',
        accountStableId: 'account_primary_bank',
        amountCents: 8469,
      }),
    ]);

    const revision = await adapter.normalizeRevisionTarget(
      {
        targetStableId: 'expense_v1',
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: current.draftInput,
      },
      db as never,
    );
    const ready = await adapter.resolveReadyTarget(
      {
        targetStableId: 'expense_v1',
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: revision.targetJson,
      },
      db as never,
    );
    expect(ready.targetJournals).toHaveLength(1);
  });

  it('rejects DUPLICATE_POSTING until an owner-approved REVERSAL_ONLY flow exists', async () => {
    const { adapter, db } = makeV2Fixture();
    const current = await adapter.readCurrentEffectiveTarget('expense_v2', 2);

    await expect(
      adapter.normalizeRevisionTarget(
        {
          targetStableId: 'expense_v2',
          targetVersion: 2,
          reasonCode: AccountingPostedCorrectionReasonCode.DUPLICATE_POSTING,
          targetJson: current.draftInput,
        },
        db as never,
      ),
    ).rejects.toThrow('does not support DUPLICATE_POSTING');
  });

  it('treats the POSTED Correction Case as activation authority without mutating the original Expense rows', async () => {
    const { adapter, db } = makeV2Fixture();
    const current = await adapter.readCurrentEffectiveTarget('expense_v2', 2);
    const revision = await adapter.normalizeRevisionTarget(
      {
        targetStableId: 'expense_v2',
        targetVersion: 2,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: current.draftInput,
      },
      db as never,
    );
    const target =
      revision.targetJson as unknown as AccountingExpenseCorrectionTargetV1;

    await expect(
      adapter.activateTargetInTx(
        {
          correctionStableId: 'correction_expense_1',
          correctionRevisionStableId: 'revision_expense_1',
          correctionRevision: 1,
          targetStableId: 'expense_v2',
          targetVersion: 2,
          targetAuthoritySchema: revision.targetAuthoritySchema,
          targetAuthorityHash: revision.targetAuthorityHash,
          targetJson: target as never,
          plan: {} as never,
        },
        db as never,
      ),
    ).resolves.toBeUndefined();

    expect(db.accountingExpenseDocument.findUnique).toHaveBeenCalled();
    expect(
      (db.accountingExpenseDocument as Record<string, unknown>).update,
    ).toBeUndefined();
  });
});
