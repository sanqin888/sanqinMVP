import { ConflictException } from '@nestjs/common';

import { AccountingDocumentStatus } from './accounting-contracts';
import { AccountingExpenseCorrectionService } from './accounting-expense-correction.service';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

function makeService() {
  const db = {
    accountingExpenseDocument: {
      findUnique: jest.fn(),
    },
    accountingCorrectionCase: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    accountingJournalEntry: {
      findMany: jest.fn(),
    },
  };
  const lifecycle = {
    createDraft: jest.fn(),
    reviseDraft: jest.fn(),
    previewCase: jest.fn(),
    markReady: jest.fn(),
    executeCase: jest.fn(),
    cancelCase: jest.fn(),
  };
  const adapter = {
    readCurrentEffectiveTarget: jest.fn(),
  };
  return {
    db,
    lifecycle,
    adapter,
    service: new AccountingExpenseCorrectionService(
      db as never,
      lifecycle as never,
      adapter as never,
    ),
  };
}

const readyRecord = {
  version: 1 as const,
  status: 'READY' as const,
  blockReason: null,
  document: {
    documentStableId: 'expense_1',
    status: AccountingDocumentStatus.CONFIRMED,
    fundingAttributionVersion: 2 as const,
    occurredAt: '2026-09-01T00:00:00.000Z',
    currency: 'CAD',
    confirmedAt: '2026-09-01T00:05:00.000Z',
  },
  originalPersisted: {
    subtotalCents: 1000,
    taxCents: 130,
    totalCents: 1130,
    memo: null,
    splits: [],
    paymentAllocations: [],
  },
  originalJournals: [],
  corrections: [],
  currentEffective: {
    targetAuthorityHash: hashA,
    draftInput: {
      version: 1 as const,
      expectedBaseAuthorityHash: hashA,
      totalCents: 1130,
      memo: null,
      splits: [],
    },
  },
};

describe('AccountingExpenseCorrectionService C2 facade', () => {
  it('blocks confirmed-but-unposted Expense records before invoking current-effective authority', async () => {
    const { service, db, adapter } = makeService();
    db.accountingExpenseDocument.findUnique.mockResolvedValue({
      documentStableId: 'expense_1',
      status: AccountingDocumentStatus.CONFIRMED,
      fundingAttributionVersion: 1,
      occurredAt: new Date('2026-09-01T00:00:00.000Z'),
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
      currency: 'CAD',
      memo: null,
      confirmedAt: new Date('2026-09-01T00:05:00.000Z'),
      paymentAllocations: [],
      splits: [],
    });
    db.accountingCorrectionCase.findMany.mockResolvedValue([]);
    db.accountingJournalEntry.findMany.mockResolvedValue([]);

    await expect(service.readRecord('expense_1')).resolves.toMatchObject({
      status: 'BLOCKED',
      blockReason:
        'Expense correction requires an already-posted canonical Expense Journal',
      currentEffective: null,
    });
    expect(adapter.readCurrentEffectiveTarget).not.toHaveBeenCalled();
  });

  it('rejects a stale create request before A3 lifecycle persistence', async () => {
    const { service, lifecycle } = makeService();
    jest
      .spyOn(service, 'readRecord')
      .mockResolvedValue(readyRecord as never);

    await expect(
      service.createDraft(
        'expense_1',
        {
          reasonCode: 'AMOUNT_ERROR',
          target: {
            version: 1,
            expectedBaseAuthorityHash: hashB,
            totalCents: 1130,
            splits: [],
          },
        },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(lifecycle.createDraft).not.toHaveBeenCalled();
  });

  it('delegates a current Expense draft to A3 with C1 adapter ownership', async () => {
    const { service, lifecycle, adapter } = makeService();
    jest
      .spyOn(service, 'readRecord')
      .mockResolvedValue(readyRecord as never);
    lifecycle.createDraft.mockResolvedValue({});

    await service.createDraft(
      'expense_1',
      {
        reasonCode: 'CLASSIFICATION_ERROR',
        note: 'correct category',
        target: {
          version: 1,
          expectedBaseAuthorityHash: hashA,
          totalCents: 1130,
          splits: [
            {
              splitStableId: 'split_1',
              categoryStableId: 'cat_1',
              amountCents: 1000,
              taxCents: 130,
            },
          ],
        },
      },
      'user_1',
    );

    expect(lifecycle.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        targetStableId: 'expense_1',
        targetVersion: 2,
        reasonCode: 'CLASSIFICATION_ERROR',
        note: 'correct category',
      }),
      'user_1',
      adapter,
    );
  });
});
