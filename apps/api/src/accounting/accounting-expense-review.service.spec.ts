import { ConflictException } from '@nestjs/common';
import {
  AccountingExpenseReviewStatus,
  AccountingInboxClassification,
  AccountingInboxStatus,
} from './accounting-contracts';
import { AccountingExpenseReviewService } from './accounting-expense-review.service';

const effectiveJson = {
  version: 1,
  occurredAt: '2026-06-28',
  totalCents: 8469,
  sourceCurrency: 'CAD',
  paymentAllocations: [
    { accountStableId: 'account_primary_bank', amountCents: 8469 },
  ],
  memo: 'Bell June bill',
  splits: [
    {
      categoryStableId: 'expense_telecom',
      amountCents: 7495,
      taxCents: 974,
    },
  ],
};

const inboxRow = {
  id: 'inbox-db-id',
  inboxItemStableId: 'acctinbox_bell_june',
  version: 3,
  status: AccountingInboxStatus.PENDING_REVIEW,
  classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
  selectedProvider: null,
  materializedEntityType: null,
  materializedEntityStableId: null,
  artifact: {
    acquisitionMode: 'MANUAL_UPLOAD',
    parseRuns: [
      {
        parseRunStableId: 'acctparse_bell_june',
        resultHash: 'b'.repeat(64),
      },
    ],
  },
};

const makeDb = () => {
  const db = {
    $transaction: jest.fn(),
    accountingInboxItem: {
      findUnique: jest.fn(),
    },
    accountingExpenseReviewRevision: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    accountingCategory: {
      findMany: jest.fn(),
    },
    accountingAccount: {
      findMany: jest.fn(),
    },
    accountingAuditLog: {
      create: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(
    async (work: (tx: typeof db) => Promise<unknown>) => work(db),
  );
  db.accountingCategory.findMany.mockResolvedValue([
    { categoryStableId: 'expense_telecom' },
  ]);
  db.accountingAccount.findMany.mockResolvedValue([
    {
      accountStableId: 'account_primary_bank',
      currency: 'CAD',
      isActive: true,
    },
  ]);
  db.accountingExpenseReviewRevision.updateMany.mockResolvedValue({ count: 0 });
  db.accountingAuditLog.create.mockResolvedValue({});
  return db;
};

describe('AccountingExpenseReviewService', () => {
  it('creates a draft bound to the current inbox version and machine parse hash', async () => {
    const db = makeDb();
    db.accountingInboxItem.findUnique.mockResolvedValue(inboxRow);
    db.accountingExpenseReviewRevision.findFirst.mockResolvedValue(null);
    db.accountingExpenseReviewRevision.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        reviewRevisionStableId: 'acctexpreview_1',
        revision: 1,
        status: AccountingExpenseReviewStatus.DRAFT,
        sourceInboxVersion: data.sourceInboxVersion,
        sourceParseRunStableId: data.sourceParseRunStableId,
        sourceResultHash: data.sourceResultHash,
        reviewHash: data.reviewHash,
        note: data.note,
        effectiveJson: data.effectiveJson,
        createdByUserStableId: 'user_admin_1',
        confirmedByUserStableId: null,
        confirmedAt: null,
        createdAt: new Date('2026-09-21T14:00:00.000Z'),
        updatedAt: new Date('2026-09-21T14:00:00.000Z'),
      }),
    );

    const service = new AccountingExpenseReviewService(db as never);
    const result = await service.createDraft(
      inboxRow.inboxItemStableId,
      {
        expectedInboxVersion: 3,
        note: 'Tax Summary confirms HST $9.74',
        effective: effectiveJson,
      },
      'user_admin_1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        revision: 1,
        status: AccountingExpenseReviewStatus.DRAFT,
        sourceInboxVersion: 3,
        sourceParseRunStableId: 'acctparse_bell_june',
        sourceResultHash: 'b'.repeat(64),
        reviewHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
      }),
    );
    expect(db.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_REVIEW_DRAFT',
        entityType: 'ACCOUNTING_EXPENSE_REVIEW_REVISION',
        entityId: 'acctexpreview_1',
        operatorActorRef: 'user_admin_1',
      }) as unknown,
    });
  });

  it('refuses to confirm a review after the machine parse has changed', async () => {
    const db = makeDb();
    const expectedHash = 'c'.repeat(64);
    db.accountingExpenseReviewRevision.findUnique.mockResolvedValue({
      id: 'review-db-id',
      inboxItemId: inboxRow.id,
      reviewRevisionStableId: 'acctexpreview_1',
      revision: 1,
      status: AccountingExpenseReviewStatus.DRAFT,
      sourceInboxVersion: 3,
      sourceParseRunStableId: 'acctparse_bell_june',
      sourceResultHash: 'b'.repeat(64),
      reviewHash: expectedHash,
      note: null,
      effectiveJson,
      createdByUserStableId: 'user_admin_1',
      confirmedByUserStableId: null,
      confirmedAt: null,
      createdAt: new Date('2026-09-21T14:00:00.000Z'),
      updatedAt: new Date('2026-09-21T14:00:00.000Z'),
      inboxItem: {
        ...inboxRow,
        artifact: {
          ...inboxRow.artifact,
          parseRuns: [
            {
              parseRunStableId: 'acctparse_bell_june_v2',
              resultHash: 'd'.repeat(64),
            },
          ],
        },
      },
    });

    const service = new AccountingExpenseReviewService(db as never);
    await expect(
      service.confirmRevision(
        inboxRow.inboxItemStableId,
        'acctexpreview_1',
        expectedHash,
        'user_admin_2',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(db.accountingExpenseReviewRevision.update).not.toHaveBeenCalled();
  });

  it('confirms only the latest draft with the same effective snapshot', async () => {
    const db = makeDb();
    const expectedHash = 'e'.repeat(64);
    const draft = {
      id: 'review-db-id',
      inboxItemId: inboxRow.id,
      reviewRevisionStableId: 'acctexpreview_2',
      revision: 2,
      status: AccountingExpenseReviewStatus.DRAFT,
      sourceInboxVersion: 3,
      sourceParseRunStableId: 'acctparse_bell_june',
      sourceResultHash: 'b'.repeat(64),
      reviewHash: expectedHash,
      note: 'Verified against Tax Summary',
      effectiveJson,
      createdByUserStableId: 'user_admin_1',
      confirmedByUserStableId: null,
      confirmedAt: null,
      createdAt: new Date('2026-09-21T14:00:00.000Z'),
      updatedAt: new Date('2026-09-21T14:00:00.000Z'),
      inboxItem: inboxRow,
    };
    db.accountingExpenseReviewRevision.findUnique.mockResolvedValue(draft);
    db.accountingExpenseReviewRevision.findFirst.mockResolvedValue({
      reviewRevisionStableId: draft.reviewRevisionStableId,
      revision: 2,
      status: AccountingExpenseReviewStatus.DRAFT,
    });
    db.accountingExpenseReviewRevision.update.mockResolvedValue({
      reviewRevisionStableId: draft.reviewRevisionStableId,
      revision: 2,
      status: AccountingExpenseReviewStatus.CONFIRMED,
      sourceInboxVersion: 3,
      sourceParseRunStableId: 'acctparse_bell_june',
      sourceResultHash: 'b'.repeat(64),
      reviewHash: expectedHash,
      note: draft.note,
      effectiveJson,
      createdByUserStableId: 'user_admin_1',
      confirmedByUserStableId: 'user_admin_2',
      confirmedAt: new Date('2026-09-21T14:05:00.000Z'),
      createdAt: draft.createdAt,
      updatedAt: new Date('2026-09-21T14:05:00.000Z'),
    });

    const service = new AccountingExpenseReviewService(db as never);
    const result = await service.confirmRevision(
      inboxRow.inboxItemStableId,
      draft.reviewRevisionStableId,
      expectedHash,
      'user_admin_2',
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: AccountingExpenseReviewStatus.CONFIRMED,
        reviewHash: expectedHash,
        effective: effectiveJson,
      }),
    );
    expect(db.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CONFIRM_REVIEW_REVISION',
        entityType: 'ACCOUNTING_EXPENSE_REVIEW_REVISION',
        entityId: draft.reviewRevisionStableId,
        operatorActorRef: 'user_admin_2',
      }) as unknown,
    });
  });
});
