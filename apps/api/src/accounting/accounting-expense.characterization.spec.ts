import {
  AccountingDocumentSource,
  AccountingDocumentStatus,
  AccountingSourceType,
  AccountingTxType,
} from '@prisma/client';
import { AccountingOperationsService } from './accounting-operations.service';

describe('AccountingOperationsService expense-write characterization', () => {
  const documentRow = (documentStableId: string) => ({
    documentStableId,
    source: AccountingDocumentSource.MANUAL,
    status: AccountingDocumentStatus.CONFIRMED,
    occurredAt: new Date('2026-09-11T14:00:00.000Z'),
    subtotalCents: 1000,
    taxCents: 130,
    totalCents: 1130,
    currency: 'CAD',
    emailSubject: null,
    attachmentUrls: [],
    extractedText: null,
    extractionJson: null,
    memo: 'ingredients',
    createdAt: new Date('2026-09-11T14:01:00.000Z'),
    confirmedAt: new Date('2026-09-11T14:01:00.000Z'),
    account: null,
    transactions: [],
  });

  const accounting = {
    assertOnOrAfterAccountingStartDate: jest.fn().mockResolvedValue(undefined),
    assertEditableForPeriod: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the expense document and all split ledger rows inside one Prisma transaction', async () => {
    let generatedDocumentStableId = '';
    const createDocument = jest.fn(
      (args: { data: { documentStableId: string } }) => {
        generatedDocumentStableId = args.data.documentStableId;
        return Promise.resolve({
          id: 'expense-document-db-id',
          documentStableId: args.data.documentStableId,
        });
      },
    );
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      accountingExpenseDocument: { create: createDocument },
      accountingTransaction: { createMany },
    };
    const transaction = jest.fn(
      (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const prisma = {
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-food-db-id',
            categoryStableId: 'expense_food',
            type: AccountingTxType.EXPENSE,
          },
          {
            id: 'category-packaging-db-id',
            categoryStableId: 'expense_packaging',
            type: AccountingTxType.EXPENSE,
          },
        ]),
      },
      accountingAccount: { findUnique: jest.fn() },
      accountingExpenseDocument: {
        findUnique: jest.fn((args: { where: { documentStableId: string } }) =>
          Promise.resolve(documentRow(args.where.documentStableId)),
        ),
      },
      $transaction: transaction,
    };
    const service = new AccountingOperationsService(
      prisma as never,
      accounting as never,
    );

    const result = await service.createExpense(
      {
        occurredAt: '2026-09-11T14:00:00.000Z',
        totalCents: 1130,
        memo: 'ingredients',
        splits: [
          {
            categoryStableId: 'expense_food',
            amountCents: 600,
            taxCents: 78,
          },
          {
            categoryStableId: 'expense_packaging',
            amountCents: 400,
            taxCents: 52,
          },
        ],
      },
      'user_stable_1',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(generatedDocumentStableId).toMatch(/^expense_/);
    expect(createDocument).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentStableId: generatedDocumentStableId,
        source: AccountingDocumentSource.MANUAL,
        status: AccountingDocumentStatus.CONFIRMED,
        subtotalCents: 1000,
        taxCents: 130,
        totalCents: 1130,
        currency: 'CAD',
        confirmedByUserId: 'user_stable_1',
      }) as unknown as Record<string, unknown>,
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: AccountingTxType.EXPENSE,
          source: AccountingSourceType.MANUAL,
          amountCents: 600,
          taxCents: 78,
          categoryId: 'category-food-db-id',
          documentId: 'expense-document-db-id',
          idempotencyKey: `expense:${generatedDocumentStableId}:0`,
          externalRef: generatedDocumentStableId,
          createdByUserId: 'user_stable_1',
          updatedByUserId: 'user_stable_1',
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          amountCents: 400,
          taxCents: 52,
          categoryId: 'category-packaging-db-id',
          idempotencyKey: `expense:${generatedDocumentStableId}:1`,
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(result.documentStableId).toBe(generatedDocumentStableId);
  });

  it('confirms an inbox document by replacing active splits inside the same transaction and preserving existing attachments', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const updateDocument = jest.fn().mockResolvedValue({});
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      accountingTransaction: { deleteMany, createMany },
      accountingExpenseDocument: { update: updateDocument },
    };
    const transaction = jest.fn(
      (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'inbox-document-db-id',
        status: AccountingDocumentStatus.PENDING_REVIEW,
        attachmentUrls: ['/api/v1/accounting/files/bills/original.pdf'],
      })
      .mockImplementation((args: { where: { documentStableId: string } }) =>
        Promise.resolve({
          ...documentRow(args.where.documentStableId),
          attachmentUrls: [
            '/api/v1/accounting/files/bills/original.pdf',
            '/api/v1/accounting/files/receipts/new.jpg',
          ],
        }),
      );
    const prisma = {
      accountingExpenseDocument: { findUnique },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-food-db-id',
            categoryStableId: 'expense_food',
          },
        ]),
      },
      accountingAccount: { findUnique: jest.fn() },
      $transaction: transaction,
    };
    const service = new AccountingOperationsService(
      prisma as never,
      accounting as never,
    );

    const result = await service.confirmInboxDocument(
      'inbox_doc_1',
      {
        occurredAt: '2026-09-11T14:00:00.000Z',
        totalCents: 1130,
        attachmentUrls: [
          '/api/v1/accounting/files/bills/original.pdf',
          '/api/v1/accounting/files/receipts/new.jpg',
        ],
        memo: 'ingredients',
        splits: [
          {
            categoryStableId: 'expense_food',
            amountCents: 1000,
            taxCents: 130,
          },
        ],
      },
      'user_stable_2',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'inbox-document-db-id', deletedAt: null },
    });
    expect(updateDocument).toHaveBeenCalledWith({
      where: { id: 'inbox-document-db-id' },
      data: expect.objectContaining({
        status: AccountingDocumentStatus.CONFIRMED,
        subtotalCents: 1000,
        taxCents: 130,
        totalCents: 1130,
        confirmedByUserId: 'user_stable_2',
        attachmentUrls: [
          '/api/v1/accounting/files/bills/original.pdf',
          '/api/v1/accounting/files/receipts/new.jpg',
        ],
      }) as unknown as Record<string, unknown>,
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          documentId: 'inbox-document-db-id',
          idempotencyKey: 'expense:inbox_doc_1:0',
          externalRef: 'inbox_doc_1',
          createdByUserId: 'user_stable_2',
          updatedByUserId: 'user_stable_2',
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(result.documentStableId).toBe('inbox_doc_1');
  });
});
