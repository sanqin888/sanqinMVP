import { ConflictException } from '@nestjs/common';
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
    const createAuditMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      accountingExpenseDocument: { create: createDocument },
      accountingTransaction: { createMany },
      accountingAuditLog: { createMany: createAuditMany },
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
    expect(createAuditMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          operatorUserId: 'user_stable_1',
          afterJson: expect.objectContaining({
            categoryStableId: 'expense_food',
            documentStableId: generatedDocumentStableId,
          }) as unknown as Record<string, unknown>,
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          operatorUserId: 'user_stable_1',
          afterJson: expect.objectContaining({
            categoryStableId: 'expense_packaging',
            documentStableId: generatedDocumentStableId,
          }) as unknown as Record<string, unknown>,
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(accounting.assertOnOrAfterAccountingStartDate).toHaveBeenCalledWith(
      new Date('2026-09-11T14:00:00.000Z'),
      tx,
    );
    expect(accounting.assertEditableForPeriod).toHaveBeenCalledWith(
      new Date('2026-09-11T14:00:00.000Z'),
      AccountingTxType.EXPENSE,
      tx,
    );
    expect(result.documentStableId).toBe(generatedDocumentStableId);
  });

  it('confirms an inbox document by replacing active splits inside the same transaction and preserving existing attachments', async () => {
    const replacedRows = jest.fn().mockResolvedValue([
      {
        txStableId: 'accttx_replaced',
        type: AccountingTxType.EXPENSE,
        source: AccountingSourceType.MANUAL,
        amountCents: 900,
        taxCents: 117,
        currency: 'CAD',
        occurredAt: new Date('2026-09-10T14:00:00.000Z'),
        idempotencyKey: 'expense:inbox_doc_1:old',
        externalRef: 'inbox_doc_1',
        attachmentUrls: ['/api/v1/accounting/files/bills/original.pdf'],
      },
    ]);
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const updateDocument = jest.fn().mockResolvedValue({});
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const createAuditMany = jest.fn().mockResolvedValue({ count: 2 });
    const currentDocument = jest.fn().mockResolvedValue({
      status: AccountingDocumentStatus.PENDING_REVIEW,
      attachmentUrls: ['/api/v1/accounting/files/bills/original.pdf'],
    });
    const tx = {
      accountingTransaction: { findMany: replacedRows, deleteMany, createMany },
      accountingExpenseDocument: {
        findUnique: currentDocument,
        update: updateDocument,
      },
      accountingAuditLog: { createMany: createAuditMany },
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
    expect(currentDocument).toHaveBeenCalledWith({
      where: { id: 'inbox-document-db-id' },
      select: { status: true, attachmentUrls: true },
    });
    expect(replacedRows).toHaveBeenCalledWith({
      where: { documentId: 'inbox-document-db-id', deletedAt: null },
      select: {
        txStableId: true,
        type: true,
        source: true,
        amountCents: true,
        taxCents: true,
        currency: true,
        occurredAt: true,
        idempotencyKey: true,
        externalRef: true,
        attachmentUrls: true,
      },
    });
    expect(createAuditMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: 'DELETE',
          entityType: 'ACCOUNTING_TRANSACTION',
          entityId: 'accttx_replaced',
          operatorUserId: 'user_stable_2',
          beforeJson: expect.objectContaining({
            documentStableId: 'inbox_doc_1',
            idempotencyKey: 'expense:inbox_doc_1:old',
          }) as unknown as Record<string, unknown>,
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          operatorUserId: 'user_stable_2',
          afterJson: expect.objectContaining({
            categoryStableId: 'expense_food',
            documentStableId: 'inbox_doc_1',
          }) as unknown as Record<string, unknown>,
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(accounting.assertOnOrAfterAccountingStartDate).toHaveBeenCalledWith(
      new Date('2026-09-11T14:00:00.000Z'),
      tx,
    );
    expect(accounting.assertEditableForPeriod).toHaveBeenCalledWith(
      new Date('2026-09-11T14:00:00.000Z'),
      AccountingTxType.EXPENSE,
      tx,
    );
    expect(result.documentStableId).toBe('inbox_doc_1');
  });

  it('rejects a concurrent second inbox confirmation before replacing ledger rows', async () => {
    const deleteMany = jest.fn();
    const createMany = jest.fn();
    const createAuditMany = jest.fn();
    const tx = {
      accountingTransaction: {
        findMany: jest.fn(),
        deleteMany,
        createMany,
      },
      accountingExpenseDocument: {
        findUnique: jest.fn().mockResolvedValue({
          status: AccountingDocumentStatus.CONFIRMED,
          attachmentUrls: [],
        }),
        update: jest.fn(),
      },
      accountingAuditLog: { createMany: createAuditMany },
    };
    const transaction = jest.fn(
      (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const prisma = {
      accountingExpenseDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-document-db-id',
          status: AccountingDocumentStatus.PENDING_REVIEW,
          attachmentUrls: [],
        }),
      },
      accountingCategory: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'category-food-db-id', categoryStableId: 'expense_food' },
          ]),
      },
      accountingAccount: { findUnique: jest.fn() },
      $transaction: transaction,
    };
    const service = new AccountingOperationsService(
      prisma as never,
      accounting as never,
    );

    await expect(
      service.confirmInboxDocument(
        'inbox_doc_1',
        {
          occurredAt: '2026-09-11T14:00:00.000Z',
          totalCents: 1130,
          splits: [
            {
              categoryStableId: 'expense_food',
              amountCents: 1000,
              taxCents: 130,
            },
          ],
        },
        'user_stable_2',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(createAuditMany).not.toHaveBeenCalled();
  });
});
