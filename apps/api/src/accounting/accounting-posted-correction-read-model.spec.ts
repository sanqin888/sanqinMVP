import { ConflictException } from '@nestjs/common';

import {
  accountingPostedCorrectionTargetKey,
  readAccountingPostedCorrectionHistories,
  readAccountingPostedCorrectionProjections,
} from './accounting-posted-correction-read-model';
import {
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';

const providerRef = {
  targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
  targetStableId: 'provider_doc_1',
  targetVersion: 1,
} as const;

const expenseRef = {
  targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
  targetStableId: 'expense_1',
  targetVersion: 2,
} as const;

describe('Accounting posted correction read-model', () => {
  it('chooses the latest POSTED typed authority consistently', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        correctionStableId: 'correction_draft',
        targetKind: 'PROVIDER_SETTLEMENT',
        targetStableId: 'provider_doc_1',
        targetVersion: 1,
        status: 'DRAFT',
        reasonCode: 'AMOUNT_ERROR',
        note: null,
        strategy: null,
        targetAuthoritySchema: null,
        targetAuthorityHash: null,
        postedByActorRef: null,
        postedAt: null,
        createdAt: new Date('2026-10-07T09:00:00.000Z'),
        readyRevision: null,
      },
      {
        correctionStableId: 'correction_posted_old',
        targetKind: 'PROVIDER_SETTLEMENT',
        targetStableId: 'provider_doc_1',
        targetVersion: 1,
        status: 'POSTED',
        reasonCode: 'AMOUNT_ERROR',
        note: 'old',
        strategy: 'DELTA',
        targetAuthoritySchema: 'provider-schema-v1',
        targetAuthorityHash: 'a'.repeat(64),
        postedByActorRef: 'user_1',
        postedAt: new Date('2026-10-07T10:00:00.000Z'),
        createdAt: new Date('2026-10-07T08:00:00.000Z'),
        readyRevision: {
          targetAuthoritySchema: 'provider-schema-v1',
          targetAuthorityHash: 'a'.repeat(64),
          targetJson: { revision: 'old' },
        },
      },
      {
        correctionStableId: 'correction_posted_new',
        targetKind: 'PROVIDER_SETTLEMENT',
        targetStableId: 'provider_doc_1',
        targetVersion: 1,
        status: 'POSTED',
        reasonCode: 'CLASSIFICATION_ERROR',
        note: 'new',
        strategy: 'DELTA',
        targetAuthoritySchema: 'provider-schema-v1',
        targetAuthorityHash: 'b'.repeat(64),
        postedByActorRef: 'user_2',
        postedAt: new Date('2026-10-07T12:00:00.000Z'),
        createdAt: new Date('2026-10-07T11:00:00.000Z'),
        readyRevision: {
          targetAuthoritySchema: 'provider-schema-v1',
          targetAuthorityHash: 'b'.repeat(64),
          targetJson: { revision: 'new' },
        },
      },
    ]);
    const db = { accountingCorrectionCase: { findMany } };

    const result = await readAccountingPostedCorrectionProjections(
      db as never,
      [providerRef],
    );
    const projection = result.get(
      accountingPostedCorrectionTargetKey(providerRef),
    );

    expect(projection?.cases.map((item) => item.correctionStableId)).toEqual([
      'correction_draft',
      'correction_posted_old',
      'correction_posted_new',
    ]);
    expect(projection?.latestPostedAuthority).toEqual({
      correctionStableId: 'correction_posted_new',
      targetAuthoritySchema: 'provider-schema-v1',
      targetAuthorityHash: 'b'.repeat(64),
      targetJson: { revision: 'new' },
      postedAt: '2026-10-07T12:00:00.000Z',
      postedByActorRef: 'user_2',
    });
  });

  it('serializes Provider and Expense histories consistently', async () => {
    const historyRow = (
      targetKind: 'PROVIDER_SETTLEMENT' | 'EXPENSE',
      targetStableId: string,
      targetVersion: number,
      correctionStableId: string,
    ) => ({
      correctionStableId,
      version: 3,
      targetKind,
      targetStableId,
      targetVersion,
      status: 'POSTED',
      reasonCode: 'AMOUNT_ERROR',
      note: 'fixed',
      strategy: 'DELTA',
      planHash: 'c'.repeat(64),
      readyPreviewJson: null,
      targetAuthoritySchema: targetKind === 'EXPENSE' ? 'expense-v1' : 'provider-v1',
      targetAuthorityHash: 'd'.repeat(64),
      createdByActorRef: 'user_create',
      readyByActorRef: 'user_ready',
      readyAt: new Date('2026-10-07T10:00:00.000Z'),
      postedByActorRef: 'user_post',
      postedAt: new Date('2026-10-07T11:00:00.000Z'),
      cancelledByActorRef: null,
      cancelledAt: null,
      createdAt: new Date('2026-10-07T09:00:00.000Z'),
      updatedAt: new Date('2026-10-07T11:00:00.000Z'),
      readyRevision: {
        targetAuthoritySchema:
          targetKind === 'EXPENSE' ? 'expense-v1' : 'provider-v1',
        targetAuthorityHash: 'd'.repeat(64),
        targetJson: { targetKind },
      },
      revisions: [
        {
          correctionRevisionStableId: `${correctionStableId}_rev1`,
          revision: 1,
          targetAuthoritySchema:
            targetKind === 'EXPENSE' ? 'expense-v1' : 'provider-v1',
          targetAuthorityHash: 'd'.repeat(64),
          targetJson: { targetKind },
          createdByActorRef: 'user_create',
          createdAt: new Date('2026-10-07T09:05:00.000Z'),
        },
      ],
      journalOutputs: [
        {
          outputStableId: `${correctionStableId}_output1`,
          role: 'DELTA',
          sequence: 0,
          journalEntry: {
            entryStableId: `${correctionStableId}_journal1`,
            occurredAt: new Date('2026-09-30T00:00:00.000Z'),
            currency: 'CAD',
            memo: 'Correction',
            lines: [
              {
                lineNo: 1,
                debitCents: 100,
                creditCents: 0,
                account: { accountStableId: 'expense', name: 'Expense' },
                category: {
                  categoryStableId: 'expense_food',
                  name: 'Food',
                },
              },
              {
                lineNo: 2,
                debitCents: 0,
                creditCents: 100,
                account: { accountStableId: 'bank', name: 'Bank' },
                category: null,
              },
            ],
          },
        },
      ],
    });
    const findMany = jest.fn().mockResolvedValue([
      historyRow('EXPENSE', 'expense_1', 2, 'correction_expense'),
      historyRow(
        'PROVIDER_SETTLEMENT',
        'provider_doc_1',
        1,
        'correction_provider',
      ),
    ]);
    const db = { accountingCorrectionCase: { findMany } };

    const result = await readAccountingPostedCorrectionHistories(db as never, [
      providerRef,
      expenseRef,
    ]);

    const provider = result.get(
      accountingPostedCorrectionTargetKey(providerRef),
    )?.[0];
    const expense = result.get(
      accountingPostedCorrectionTargetKey(expenseRef),
    )?.[0];

    expect(provider?.postedAt).toBe('2026-10-07T11:00:00.000Z');
    expect(expense?.postedAt).toBe('2026-10-07T11:00:00.000Z');
    expect(provider?.journalOutputs[0]?.journal.lines[0]).toEqual(
      expense?.journalOutputs[0]?.journal.lines[0],
    );
    expect(provider?.revisions[0]?.createdAt).toBe(
      '2026-10-07T09:05:00.000Z',
    );
    expect(expense?.revisions[0]?.createdAt).toBe(
      '2026-10-07T09:05:00.000Z',
    );
  });

  it('fails closed on mismatched POSTED ready authority', async () => {
    const db = {
      accountingCorrectionCase: {
        findMany: jest.fn().mockResolvedValue([
          {
            correctionStableId: 'correction_bad',
            targetKind: 'EXPENSE',
            targetStableId: 'expense_1',
            targetVersion: 2,
            status: 'POSTED',
            reasonCode: 'AMOUNT_ERROR',
            note: null,
            strategy: 'DELTA',
            targetAuthoritySchema: 'expense-v1',
            targetAuthorityHash: 'a'.repeat(64),
            postedByActorRef: 'user_1',
            postedAt: new Date('2026-10-07T12:00:00.000Z'),
            createdAt: new Date('2026-10-07T11:00:00.000Z'),
            readyRevision: {
              targetAuthoritySchema: 'expense-v1',
              targetAuthorityHash: 'b'.repeat(64),
              targetJson: {},
            },
          },
        ]),
      },
    };

    await expect(
      readAccountingPostedCorrectionProjections(db as never, [expenseRef]),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
