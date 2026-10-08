import { AccountingArtifactKind } from '@prisma/client';
import {
  listAccountingExpenseDocuments,
  listAccountingExpenseRecords,
} from './accounting-expense.query';
import {
  ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
  hashAccountingExpenseCorrectionTarget,
  type AccountingExpenseCorrectionTargetV1,
} from './accounting-expense-correction-target.policy';

describe('Accounting expense source evidence query', () => {
  it('projects the materialized inbox artifact as stable source evidence', async () => {
    const db = {
      accountingExpenseDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            documentStableId: 'expense_1',
            source: 'GMAIL',
            status: 'CONFIRMED',
            occurredAt: new Date('2026-09-20T00:00:00.000Z'),
            subtotalCents: 1000,
            taxCents: 130,
            totalCents: 1130,
            currency: 'CAD',
            emailSubject: 'Invoice',
            attachmentUrls: ['/api/v1/accounting/files/inbox/invoice.pdf'],
            extractedText: 'invoice',
            extractionJson: null,
            memo: null,
            createdAt: new Date('2026-09-20T01:00:00.000Z'),
            confirmedAt: new Date('2026-09-20T02:00:00.000Z'),
            paymentAllocations: [],
            splits: [
              {
                splitStableId: 'expensesplit_1',
                amountCents: 1000,
                taxCents: 130,
                sortOrder: 0,
                category: {
                  categoryStableId: 'expense_telecom',
                  name: 'Telecom',
                },
              },
            ],
          },
        ]),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            sourceFactStableId: 'expense_1',
            sourceFactType: 'accounting.expense_document.v1',
            sourceFactVersion: 1,
          },
        ]),
      },
      accountingCorrectionCase: {
        findMany: jest.fn().mockResolvedValue([
          {
            correctionStableId: 'correction_expense_1',
            targetKind: 'EXPENSE',
            targetStableId: 'expense_1',
            targetVersion: 1,
            status: 'DRAFT',
            reasonCode: 'AMOUNT_ERROR',
            note: null,
            strategy: null,
            targetAuthoritySchema: null,
            targetAuthorityHash: null,
            postedByActorRef: null,
            postedAt: null,
            createdAt: new Date('2026-09-21T00:00:00.000Z'),
            readyRevision: null,
          },
        ]),
      },
      accountingInboxItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            materializedEntityStableId: 'expense_1',
            artifact: {
              artifactStableId: 'acctart_1',
              kind: AccountingArtifactKind.PDF,
              originalFilename: 'invoice.pdf',
              storedUrl: '/api/v1/accounting/files/inbox/invoice.pdf',
              binaryRetention: null,
            },
          },
        ]),
      },
    };

    const result = await listAccountingExpenseDocuments(db as never, {
      status: 'CONFIRMED' as never,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        documentStableId: 'expense_1',
        sourceEvidence: {
          artifactStableId: 'acctart_1',
          kind: AccountingArtifactKind.PDF,
          originalFilename: 'invoice.pdf',
        },
        correctionState: {
          canonicalPosted: true,
          activeCorrectionStatus: 'DRAFT',
          hasPostedCorrections: false,
          correctionCount: 1,
        },
        splits: [
          {
            splitStableId: 'expensesplit_1',
            categoryStableId: 'expense_telecom',
            categoryName: 'Telecom',
            amountCents: 1000,
            taxCents: 130,
            paidFromAccountStableId: null,
            paidFromAccountName: null,
            sortOrder: 0,
          },
        ],
      }),
    );
    expect(db.accountingInboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          materializedEntityStableId: { in: ['expense_1'] },
        }) as unknown,
      }),
    );
  });

  it('defers mutable amount/payment filters until after current-effective projection', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = {
      accountingExpenseDocument: { findMany },
    };

    const result = await listAccountingExpenseRecords(db as never, {
      status: 'CONFIRMED' as never,
      startAt: new Date('2026-06-01T04:00:00.000Z'),
      toExclusive: new Date('2026-07-01T04:00:00.000Z'),
      minTotalCents: 5000,
      paymentAccountStableId: 'account_cibc',
      limit: 10,
      offset: 20,
    });

    expect(result).toEqual({
      items: [],
      total: 0,
      limit: 10,
      offset: 20,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'CONFIRMED',
        occurredAt: {
          gte: new Date('2026-06-01T04:00:00.000Z'),
          lt: new Date('2026-07-01T04:00:00.000Z'),
        },
      },
      select: expect.any(Object) as unknown,
      orderBy: [{ createdAt: 'desc' }, { documentStableId: 'desc' }],
    });
  });

  it('does not push UNASSIGNED funding semantics into persisted Expense filters', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = {
      accountingExpenseDocument: { findMany },
    };

    const result = await listAccountingExpenseRecords(db as never, {
      status: 'CONFIRMED' as never,
      paymentState: 'UNASSIGNED',
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(0);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMED' },
      }),
    );
  });

  it('does not push ASSIGNED funding semantics into persisted Expense filters', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = {
      accountingExpenseDocument: { findMany },
    };

    await listAccountingExpenseRecords(db as never, {
      status: 'CONFIRMED' as never,
      paymentState: 'ASSIGNED',
      limit: 10,
      offset: 0,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMED' },
      }),
    );
  });

  it('projects and filters from latest POSTED Expense authority', async () => {
    const target: AccountingExpenseCorrectionTargetV1 = {
      version: 1,
      document: {
        documentStableId: 'expense_corrected',
        fundingAttributionVersion: 2,
        occurredAt: '2026-09-20T00:00:00.000Z',
        currency: 'CAD',
        subtotalCents: 2000,
        taxCents: 260,
        totalCents: 2260,
        memo: 'corrected memo',
        sourcePostingAuthorityHash: 'a'.repeat(64),
      },
      basedOnAuthorityHash: 'b'.repeat(64),
      splits: [
        {
          splitStableId: 'expensesplit_corrected',
          categoryStableId: 'expense_vehicle',
          amountCents: 2000,
          taxCents: 260,
          paidFromAccountStableId: 'account_new',
        },
      ],
      paymentAllocations: [],
    };
    const authorityHash = hashAccountingExpenseCorrectionTarget(target);
    const db = {
      accountingExpenseDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            documentStableId: 'expense_corrected',
            source: 'MANUAL',
            status: 'CONFIRMED',
            fundingAttributionVersion: 2,
            occurredAt: new Date('2026-09-20T00:00:00.000Z'),
            subtotalCents: 1000,
            taxCents: 130,
            totalCents: 1130,
            currency: 'CAD',
            emailSubject: null,
            attachmentUrls: [],
            extractedText: null,
            extractionJson: null,
            memo: 'original memo',
            createdAt: new Date('2026-09-20T01:00:00.000Z'),
            confirmedAt: new Date('2026-09-20T02:00:00.000Z'),
            paymentAllocations: [],
            splits: [
              {
                splitStableId: 'expensesplit_corrected',
                amountCents: 1000,
                taxCents: 130,
                sortOrder: 0,
                category: {
                  categoryStableId: 'expense_food',
                  name: 'Food',
                },
                paidFromAccount: {
                  accountStableId: 'account_old',
                  name: 'Old Bank',
                },
              },
            ],
          },
        ]),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            sourceFactStableId: 'expense_corrected',
            sourceFactType: 'accounting.expense_document.v2',
            sourceFactVersion: 2,
          },
        ]),
      },
      accountingCorrectionCase: {
        findMany: jest.fn().mockResolvedValue([
          {
            correctionStableId: 'correction_expense_corrected',
            targetKind: 'EXPENSE',
            targetStableId: 'expense_corrected',
            targetVersion: 2,
            status: 'POSTED',
            reasonCode: 'AMOUNT_ERROR',
            note: 'correct amount and funding',
            strategy: 'DELTA',
            targetAuthoritySchema: ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
            targetAuthorityHash: authorityHash,
            postedByActorRef: 'user_admin_1',
            postedAt: new Date('2026-10-07T12:00:00.000Z'),
            createdAt: new Date('2026-10-07T11:00:00.000Z'),
            readyRevision: {
              targetAuthoritySchema:
                ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
              targetAuthorityHash: authorityHash,
              targetJson: target,
            },
          },
        ]),
      },
      accountingInboxItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            categoryStableId: 'expense_vehicle',
            name: 'Vehicle / Transportation',
          },
        ]),
      },
      accountingAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { accountStableId: 'account_new', name: 'New Bank' },
          ]),
      },
    };

    const result = await listAccountingExpenseRecords(db as never, {
      status: 'CONFIRMED' as never,
      minTotalCents: 2000,
      paymentAccountStableId: 'account_new',
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(1);
    const item = result.items[0];
    expect(item.totalCents).toBe(2260);
    expect(item.memo).toBe('corrected memo');
    expect(item.originalPersisted.totalCents).toBe(1130);
    expect(item.originalPersisted.memo).toBe('original memo');
    expect(item.currentEffective.source).toBe('POSTED_CORRECTION');
    expect(item.currentEffective.correctionStableId).toBe(
      'correction_expense_corrected',
    );
    expect(item.currentEffective.targetAuthorityHash).toBe(authorityHash);
    expect(item.currentEffective.totalCents).toBe(2260);
    expect(item.splits[0]).toEqual(
      expect.objectContaining({
        categoryStableId: 'expense_vehicle',
        categoryName: 'Vehicle / Transportation',
        paidFromAccountStableId: 'account_new',
        paidFromAccountName: 'New Bank',
        amountCents: 2000,
        taxCents: 260,
      }),
    );
  });

  it('does not expose source evidence when the artifact has no retained binary', async () => {
    const db = {
      accountingExpenseDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            documentStableId: 'expense_2',
            source: 'GMAIL',
            status: 'CONFIRMED',
            occurredAt: null,
            subtotalCents: 500,
            taxCents: 0,
            totalCents: 500,
            currency: 'CAD',
            emailSubject: null,
            attachmentUrls: [],
            extractedText: null,
            extractionJson: null,
            memo: null,
            createdAt: new Date('2026-09-20T01:00:00.000Z'),
            confirmedAt: new Date('2026-09-20T02:00:00.000Z'),
            paymentAllocations: [],
            splits: [],
          },
        ]),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      accountingCorrectionCase: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      accountingInboxItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            materializedEntityStableId: 'expense_2',
            artifact: {
              artifactStableId: 'acctart_2',
              kind: AccountingArtifactKind.IMAGE,
              originalFilename: 'receipt.jpg',
              storedUrl: null,
              binaryRetention: { retainedStoredUrl: null },
            },
          },
        ]),
      },
    };

    const result = await listAccountingExpenseDocuments(db as never, {});

    expect(result[0]).toEqual(
      expect.objectContaining({
        documentStableId: 'expense_2',
        sourceEvidence: null,
      }),
    );
  });
});
