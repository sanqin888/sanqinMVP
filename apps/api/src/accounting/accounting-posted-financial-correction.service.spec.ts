import { ConflictException } from '@nestjs/common';

import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStatus,
  AccountingPostedCorrectionStrategy,
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';
import { buildPostedFinancialCorrectionPreviewPlan } from './accounting-posted-financial-correction.policy';
import { AccountingPostedFinancialCorrectionService } from './accounting-posted-financial-correction.service';

const sha = (char: string) => char.repeat(64);

const targetJson = { amountCents: 1_000 };

const originalJournal = {
  entryStableId: 'journal_original_1',
  idempotencyKey: 'expense:document:1',
  idempotencyHash: sha('1'),
  version: 1,
  kind: AccountingJournalEntryKind.STANDARD,
  source: AccountingJournalSource.EXPENSE_DOCUMENT,
  sourceFactType: 'accounting.expense.v2',
  sourceFactStableId: 'expense_1',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-09-15T16:00:00.000Z',
  currency: 'CAD',
  memo: 'Expense',
  lines: [
    {
      lineNo: 1,
      accountStableId: 'account_expense',
      categoryStableId: 'expense_food',
      debitCents: 1_000,
      creditCents: 0,
      memo: null,
    },
    {
      lineNo: 2,
      accountStableId: 'account_cash',
      categoryStableId: null,
      debitCents: 0,
      creditCents: 1_000,
      memo: null,
    },
  ],
};

const targetJournal = {
  idempotencyKey: originalJournal.idempotencyKey,
  kind: originalJournal.kind,
  source: originalJournal.source,
  sourceFactType: originalJournal.sourceFactType,
  sourceFactStableId: originalJournal.sourceFactStableId,
  sourceFactVersion: originalJournal.sourceFactVersion,
  storeStableId: originalJournal.storeStableId,
  occurredAt: originalJournal.occurredAt,
  currency: 'CAD',
  memo: originalJournal.memo,
  lines: originalJournal.lines.map((line) => ({
    accountStableId: line.accountStableId,
    categoryStableId: line.categoryStableId,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
  })),
};

const revision = {
  id: 'revision-db-id',
  correctionRevisionStableId: 'revision_1',
  correctionCaseId: 'case-db-id',
  revision: 1,
  targetAuthoritySchema: 'accounting.expense.correction-target.v1',
  targetAuthorityHash: sha('b'),
  targetJson,
  createdByActorRef: 'user_1',
  createdAt: new Date('2026-10-06T20:00:00.000Z'),
};

const baseCase = {
  id: 'case-db-id',
  correctionStableId: 'correction_1',
  version: 1,
  targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
  targetStableId: 'expense_1',
  targetVersion: 1,
  status: AccountingPostedCorrectionStatus.DRAFT,
  reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
  note: null,
  strategy: null,
  baseAuthoritySchema: null,
  baseAuthorityHash: null,
  baseJournalSetHash: null,
  readyRevisionId: null,
  targetAuthoritySchema: null,
  targetAuthorityHash: null,
  readyPreviewSchema: null,
  readyPreviewJson: null,
  planHash: null,
  createdByActorRef: 'user_1',
  readyByActorRef: null,
  readyAt: null,
  postedByActorRef: null,
  postedAt: null,
  cancelledByActorRef: null,
  cancelledAt: null,
  createdAt: new Date('2026-10-06T20:00:00.000Z'),
  updatedAt: new Date('2026-10-06T20:00:00.000Z'),
  readyRevision: null,
  revisions: [revision],
  journalOutputs: [],
};

const makeService = () => {
  const tx = {
    accountingCorrectionCase: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    accountingCorrectionRevision: {
      create: jest.fn().mockResolvedValue({}),
    },
    accountingCorrectionJournalOutput: {
      create: jest.fn().mockResolvedValue({}),
    },
    accountingJournalEntry: {
      findUnique: jest.fn(),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const journal = {
    createPostedCorrectionJournalEntryInTx: jest.fn(),
  };
  const service = new AccountingPostedFinancialCorrectionService(
    prisma as never,
    journal as never,
  );
  return { service, prisma, tx, journal };
};

describe('AccountingPostedFinancialCorrectionService', () => {
  it('invalidates READY through an appended Revision before returning to DRAFT', async () => {
    const { service, tx } = makeService();
    const readyCase = {
      ...baseCase,
      version: 2,
      status: AccountingPostedCorrectionStatus.READY,
      strategy: AccountingPostedCorrectionStrategy.DELTA,
      baseAuthoritySchema: 'accounting.expense.correction-target.v1',
      baseAuthorityHash: sha('a'),
      baseJournalSetHash: sha('c'),
      readyRevisionId: revision.id,
      targetAuthoritySchema: revision.targetAuthoritySchema,
      targetAuthorityHash: revision.targetAuthorityHash,
      readyPreviewSchema: 'accounting.posted_financial_correction_preview.v1',
      readyPreviewJson: { version: 1 },
      planHash: sha('d'),
      readyByActorRef: 'user_1',
      readyAt: new Date('2026-10-06T21:00:00.000Z'),
      readyRevision: revision,
    };
    const revised = {
      ...baseCase,
      version: 3,
      revisions: [
        revision,
        {
          ...revision,
          id: 'revision-db-id-2',
          correctionRevisionStableId: 'revision_2',
          revision: 2,
          createdByActorRef: 'user_2',
        },
      ],
    };
    tx.accountingCorrectionCase.findUnique
      .mockResolvedValueOnce(readyCase)
      .mockResolvedValueOnce(revised);
    const adapter = {
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      normalizeRevisionTarget: jest.fn().mockResolvedValue({
        version: 1,
        targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
        targetStableId: 'expense_1',
        targetVersion: 1,
        targetAuthoritySchema: revision.targetAuthoritySchema,
        targetAuthorityHash: revision.targetAuthorityHash,
        targetJson,
      }),
      resolveReadyTarget: jest.fn(),
      activateTargetInTx: jest.fn(),
    };

    await service.reviseDraft(
      'correction_1',
      {
        expectedVersion: 2,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson,
      },
      'user_2',
      adapter as never,
    );

    expect(tx.accountingCorrectionRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correctionCaseId: 'case-db-id',
        revision: 2,
        createdByActorRef: 'user_2',
      }) as unknown,
    });
    expect(tx.accountingCorrectionCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountingPostedCorrectionStatus.DRAFT,
          readyRevisionId: null,
          readyPreviewSchema: null,
          planHash: null,
          readyByActorRef: null,
          readyAt: null,
        }) as unknown,
      }),
    );
  });

  it('replays a POSTED Case without repeating owner or Journal writes', async () => {
    const { service, tx, journal } = makeService();
    const postedCase = {
      ...baseCase,
      version: 3,
      status: AccountingPostedCorrectionStatus.POSTED,
      planHash: sha('d'),
      postedByActorRef: 'user_1',
      postedAt: new Date('2026-10-06T22:00:00.000Z'),
    };
    tx.accountingCorrectionCase.findUnique.mockResolvedValue(postedCase);
    const adapter = {
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      normalizeRevisionTarget: jest.fn(),
      resolveReadyTarget: jest.fn(),
      activateTargetInTx: jest.fn(),
    };

    await expect(
      service.executeCase(
        'correction_1',
        { expectedPlanHash: sha('d') },
        'user_2',
        adapter as never,
      ),
    ).resolves.toEqual({
      correction: postedCase,
      replayed: true,
    });
    expect(adapter.resolveReadyTarget).not.toHaveBeenCalled();
    expect(adapter.activateTargetInTx).not.toHaveBeenCalled();
    expect(
      journal.createPostedCorrectionJournalEntryInTx,
    ).not.toHaveBeenCalled();
    expect(tx.accountingCorrectionJournalOutput.create).not.toHaveBeenCalled();
  });

  it('posts an authority-only READY correction atomically with zero Journal outputs', async () => {
    const { service, tx, journal } = makeService();
    const plan = buildPostedFinancialCorrectionPreviewPlan({
      correctionStableId: 'correction_1',
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      targetStableId: 'expense_1',
      targetVersion: 1,
      strategy: AccountingPostedCorrectionStrategy.DELTA,
      reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
      baseAuthoritySchema: revision.targetAuthoritySchema,
      baseAuthorityHash: sha('a'),
      targetAuthoritySchema: revision.targetAuthoritySchema,
      targetAuthorityHash: revision.targetAuthorityHash,
      currency: 'CAD',
      originalJournals: [originalJournal],
      priorCorrectionJournals: [],
      targetJournals: [targetJournal],
    });
    expect(plan.status).toBe('READY');
    expect(plan.deltaPosting.lines).toEqual([]);

    const readyCase = {
      ...baseCase,
      version: 2,
      status: AccountingPostedCorrectionStatus.READY,
      strategy: AccountingPostedCorrectionStrategy.DELTA,
      baseAuthoritySchema: plan.authority.baseAuthoritySchema,
      baseAuthorityHash: plan.authority.baseAuthorityHash,
      baseJournalSetHash: plan.authority.baseJournalSetHash,
      readyRevisionId: revision.id,
      targetAuthoritySchema: plan.authority.targetAuthoritySchema,
      targetAuthorityHash: plan.authority.targetAuthorityHash,
      readyPreviewSchema: 'accounting.posted_financial_correction_preview.v1',
      readyPreviewJson: plan,
      planHash: plan.planHash,
      readyByActorRef: 'user_1',
      readyAt: new Date('2026-10-06T21:00:00.000Z'),
      readyRevision: revision,
    };
    const postedCase = {
      ...readyCase,
      version: 3,
      status: AccountingPostedCorrectionStatus.POSTED,
      postedByActorRef: 'user_2',
      postedAt: new Date('2026-10-06T22:00:00.000Z'),
    };
    tx.accountingCorrectionCase.findUnique
      .mockResolvedValueOnce(readyCase)
      .mockResolvedValueOnce(postedCase);
    const adapter = {
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      normalizeRevisionTarget: jest.fn(),
      resolveReadyTarget: jest.fn().mockResolvedValue({
        version: 1,
        targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
        targetStableId: 'expense_1',
        targetVersion: 1,
        targetAuthoritySchema: revision.targetAuthoritySchema,
        targetAuthorityHash: revision.targetAuthorityHash,
        targetJson,
        strategy: AccountingPostedCorrectionStrategy.DELTA,
        baseAuthoritySchema: revision.targetAuthoritySchema,
        baseAuthorityHash: sha('a'),
        currency: 'CAD',
        originalJournals: [originalJournal],
        targetJournals: [targetJournal],
      }),
      activateTargetInTx: jest.fn().mockResolvedValue(undefined),
    };

    const result = await service.executeCase(
      'correction_1',
      { expectedPlanHash: plan.planHash },
      'user_2',
      adapter as never,
    );

    expect(result.replayed).toBe(false);
    expect(result.correction.status).toBe(
      AccountingPostedCorrectionStatus.POSTED,
    );
    expect(
      journal.createPostedCorrectionJournalEntryInTx,
    ).not.toHaveBeenCalled();
    expect(tx.accountingCorrectionJournalOutput.create).not.toHaveBeenCalled();
    expect(adapter.resolveReadyTarget).toHaveBeenCalledTimes(1);
    expect(adapter.activateTargetInTx).toHaveBeenCalledTimes(1);
    expect(tx.accountingCorrectionCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: AccountingPostedCorrectionStatus.READY,
          planHash: plan.planHash,
        }) as unknown,
        data: expect.objectContaining({
          status: AccountingPostedCorrectionStatus.POSTED,
          postedByActorRef: 'user_2',
        }) as unknown,
      }),
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'POSTED_CORRECTION_POST',
        entityType: 'ACCOUNTING_CORRECTION_CASE',
        entityId: 'correction_1',
        operatorActorRef: 'user_2',
      }) as unknown,
    });
  });

  it('links a financial DELTA Journal before activating and posting the Case', async () => {
    const { service, tx, journal } = makeService();
    const financialTargetJournal = {
      ...targetJournal,
      lines: [
        {
          ...targetJournal.lines[0],
          debitCents: 1_200,
        },
        {
          ...targetJournal.lines[1],
          creditCents: 1_200,
        },
      ],
    };
    const plan = buildPostedFinancialCorrectionPreviewPlan({
      correctionStableId: 'correction_1',
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      targetStableId: 'expense_1',
      targetVersion: 1,
      strategy: AccountingPostedCorrectionStrategy.DELTA,
      reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
      baseAuthoritySchema: revision.targetAuthoritySchema,
      baseAuthorityHash: sha('a'),
      targetAuthoritySchema: revision.targetAuthoritySchema,
      targetAuthorityHash: revision.targetAuthorityHash,
      currency: 'CAD',
      originalJournals: [originalJournal],
      priorCorrectionJournals: [],
      targetJournals: [financialTargetJournal],
    });
    const readyCase = {
      ...baseCase,
      version: 2,
      status: AccountingPostedCorrectionStatus.READY,
      strategy: AccountingPostedCorrectionStrategy.DELTA,
      baseAuthoritySchema: plan.authority.baseAuthoritySchema,
      baseAuthorityHash: plan.authority.baseAuthorityHash,
      baseJournalSetHash: plan.authority.baseJournalSetHash,
      readyRevisionId: revision.id,
      targetAuthoritySchema: plan.authority.targetAuthoritySchema,
      targetAuthorityHash: plan.authority.targetAuthorityHash,
      readyPreviewSchema: 'accounting.posted_financial_correction_preview.v1',
      readyPreviewJson: plan,
      planHash: plan.planHash,
      readyByActorRef: 'user_1',
      readyAt: new Date('2026-10-06T21:00:00.000Z'),
      readyRevision: revision,
    };
    const postedCase = {
      ...readyCase,
      version: 3,
      status: AccountingPostedCorrectionStatus.POSTED,
      postedByActorRef: 'user_2',
      postedAt: new Date('2026-10-06T22:00:00.000Z'),
    };
    tx.accountingCorrectionCase.findUnique
      .mockResolvedValueOnce(readyCase)
      .mockResolvedValueOnce(postedCase);
    tx.accountingJournalEntry.findUnique.mockResolvedValue({
      id: 'journal-db-id',
    });
    journal.createPostedCorrectionJournalEntryInTx.mockResolvedValue({
      entryStableId: 'correction_journal_1',
    });
    const adapter = {
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      normalizeRevisionTarget: jest.fn(),
      resolveReadyTarget: jest.fn().mockResolvedValue({
        version: 1,
        targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
        targetStableId: 'expense_1',
        targetVersion: 1,
        targetAuthoritySchema: revision.targetAuthoritySchema,
        targetAuthorityHash: revision.targetAuthorityHash,
        targetJson,
        strategy: AccountingPostedCorrectionStrategy.DELTA,
        baseAuthoritySchema: revision.targetAuthoritySchema,
        baseAuthorityHash: sha('a'),
        currency: 'CAD',
        originalJournals: [originalJournal],
        targetJournals: [financialTargetJournal],
      }),
      activateTargetInTx: jest.fn().mockResolvedValue(undefined),
    };

    const result = await service.executeCase(
      'correction_1',
      { expectedPlanHash: plan.planHash },
      'user_2',
      adapter as never,
    );

    expect(result.replayed).toBe(false);
    expect(journal.createPostedCorrectionJournalEntryInTx).toHaveBeenCalledTimes(1);
    expect(journal.createPostedCorrectionJournalEntryInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AccountingJournalEntryKind.ADJUSTMENT,
        sourceFactType: 'accounting.posted_financial_correction.v1',
        sourceFactStableId: 'correction_1',
      }),
      'user_2',
      expect.objectContaining({
        outputRole: 'DELTA',
        sequence: 1,
        planHash: plan.planHash,
      }),
      tx,
    );
    expect(tx.accountingCorrectionJournalOutput.create).toHaveBeenCalledWith({
      data: {
        correctionCaseId: 'case-db-id',
        role: 'DELTA',
        sequence: 1,
        journalEntryId: 'journal-db-id',
      },
    });
    expect(adapter.resolveReadyTarget).toHaveBeenCalledTimes(1);
    expect(adapter.activateTargetInTx).toHaveBeenCalledTimes(1);
    expect(tx.accountingCorrectionCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountingPostedCorrectionStatus.POSTED,
        }) as unknown,
      }),
    );
  });

  it('rejects a replay attempt that supplies a different planHash', async () => {
    const { service, tx } = makeService();
    tx.accountingCorrectionCase.findUnique.mockResolvedValue({
      ...baseCase,
      status: AccountingPostedCorrectionStatus.POSTED,
      planHash: sha('d'),
    });
    const adapter = {
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      normalizeRevisionTarget: jest.fn(),
      resolveReadyTarget: jest.fn(),
      activateTargetInTx: jest.fn(),
    };

    await expect(
      service.executeCase(
        'correction_1',
        { expectedPlanHash: sha('e') },
        'user_2',
        adapter as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
