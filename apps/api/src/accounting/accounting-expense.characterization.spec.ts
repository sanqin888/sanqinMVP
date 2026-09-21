import { ConflictException } from '@nestjs/common';
import {
  AccountingArtifactKind,
  AccountingDocumentSource,
  AccountingDocumentStatus,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingSourceType,
  AccountingTxType,
} from '@prisma/client';
import { AccountingExpenseService } from './accounting-expense.service';

describe('AccountingExpenseService expense-write characterization', () => {
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
    paymentAllocations: [],
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
    type TransactionCreateManyArgs = {
      data: Array<Record<string, unknown>>;
    };
    type PaymentAllocationCreateManyArgs = {
      data: Array<{
        paymentAllocationStableId: string;
        expenseDocumentId: string;
        accountId: string;
        amountCents: number;
        sortOrder: number;
      }>;
    };
    type ExpenseSplitCreateManyArgs = {
      data: Array<{
        splitStableId: string;
        expenseDocumentId: string;
        categoryId: string;
        amountCents: number;
        taxCents: number;
        sortOrder: number;
      }>;
    };
    const createMany = jest.fn((args: TransactionCreateManyArgs) =>
      Promise.resolve({ count: args.data.length }),
    );
    const createExpenseSplitMany = jest.fn(
      (args: ExpenseSplitCreateManyArgs) =>
        Promise.resolve({ count: args.data.length }),
    );
    const createAllocationMany = jest.fn(
      (args: PaymentAllocationCreateManyArgs) =>
        Promise.resolve({ count: args.data.length }),
    );
    const createAuditMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-rbc-db-id',
            accountStableId: 'account_rbc',
            currency: 'CAD',
            isActive: true,
          },
          {
            id: 'account-cash-db-id',
            accountStableId: 'account_cash',
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingExpenseDocument: { create: createDocument },
      accountingExpensePaymentAllocation: { createMany: createAllocationMany },
      accountingExpenseSplit: { createMany: createExpenseSplitMany },
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
      accountingInboxItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: transaction,
    };
    const service = new AccountingExpenseService(
      prisma as never,
      accounting as never,
    );

    const result = await service.createExpense(
      {
        occurredAt: '2026-09-11T14:00:00.000Z',
        totalCents: 1130,
        memo: 'ingredients',
        paymentAllocations: [
          { accountStableId: 'account_rbc', amountCents: 600 },
          { accountStableId: 'account_cash', amountCents: 530 },
        ],
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
        confirmedByUserStableId: 'user_stable_1',
      }) as unknown as Record<string, unknown>,
    });
    const allocationCreateArgs = createAllocationMany.mock.calls[0]?.[0];
    expect(allocationCreateArgs).toBeDefined();
    expect(allocationCreateArgs?.data).toHaveLength(2);
    expect(allocationCreateArgs?.data[0]?.paymentAllocationStableId).toMatch(
      /^expensepay_/,
    );
    expect(allocationCreateArgs?.data[0]).toMatchObject({
      expenseDocumentId: 'expense-document-db-id',
      accountId: 'account-rbc-db-id',
      amountCents: 600,
      sortOrder: 0,
    });
    expect(allocationCreateArgs?.data[1]?.paymentAllocationStableId).toMatch(
      /^expensepay_/,
    );
    expect(allocationCreateArgs?.data[1]).toMatchObject({
      expenseDocumentId: 'expense-document-db-id',
      accountId: 'account-cash-db-id',
      amountCents: 530,
      sortOrder: 1,
    });
    expect(createExpenseSplitMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          splitStableId: expect.stringMatching(/^expensesplit_/) as unknown,
          expenseDocumentId: 'expense-document-db-id',
          categoryId: 'category-food-db-id',
          amountCents: 600,
          taxCents: 78,
          sortOrder: 0,
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          splitStableId: expect.stringMatching(/^expensesplit_/) as unknown,
          expenseDocumentId: 'expense-document-db-id',
          categoryId: 'category-packaging-db-id',
          amountCents: 400,
          taxCents: 52,
          sortOrder: 1,
        }) as unknown as Record<string, unknown>,
      ],
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
          createdByUserStableId: 'user_stable_1',
          updatedByUserStableId: 'user_stable_1',
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          amountCents: 400,
          taxCents: 52,
          categoryId: 'category-packaging-db-id',
          idempotencyKey: `expense:${generatedDocumentStableId}:1`,
        }) as unknown as Record<string, unknown>,
      ],
    });
    const transactionCreateArgs = createMany.mock.calls[0]?.[0];
    expect(transactionCreateArgs?.data[0]).not.toHaveProperty('accountId');
    expect(transactionCreateArgs?.data[1]).not.toHaveProperty('accountId');
    expect(createAuditMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          operatorActorRef: 'user_stable_1',
          afterJson: expect.objectContaining({
            categoryStableId: 'expense_food',
            documentStableId: generatedDocumentStableId,
          }) as unknown as Record<string, unknown>,
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          operatorActorRef: 'user_stable_1',
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

  it('rejects duplicate payment accounts before touching persistence', async () => {
    const service = new AccountingExpenseService(
      {} as never,
      accounting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 1000,
          paymentAllocations: [
            { accountStableId: 'account_rbc', amountCents: 500 },
            { accountStableId: 'account_rbc', amountCents: 500 },
          ],
          splits: [
            {
              categoryStableId: 'expense_food',
              amountCents: 1000,
              taxCents: 0,
            },
          ],
        },
        'user_stable_3',
      ),
    ).rejects.toThrow('paymentAllocations must not repeat an account');
  });

  it('rejects the retired single-account Expense payload instead of silently ignoring it', async () => {
    const service = new AccountingExpenseService(
      {} as never,
      accounting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 1000,
          accountStableId: 'account_rbc',
          splits: [
            {
              categoryStableId: 'expense_food',
              amountCents: 1000,
              taxCents: 0,
            },
          ],
        } as never,
        'user_stable_3',
      ),
    ).rejects.toThrow(
      'accountStableId is no longer supported for expenses; use paymentAllocations',
    );
  });

  it('rejects payment allocations that do not close to the CAD booking total', async () => {
    const service = new AccountingExpenseService(
      {} as never,
      accounting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 1000,
          paymentAllocations: [
            { accountStableId: 'account_rbc', amountCents: 900 },
          ],
          splits: [
            {
              categoryStableId: 'expense_food',
              amountCents: 1000,
              taxCents: 0,
            },
          ],
        },
        'user_stable_3',
      ),
    ).rejects.toThrow('payment allocations do not match CAD booking total');
  });

  it('rejects inactive or missing payment accounts before creating the expense', async () => {
    const createDocument = jest.fn();
    const tx = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inactive-db-id',
            accountStableId: 'account_inactive',
            currency: 'CAD',
            isActive: false,
          },
        ]),
      },
      accountingExpenseDocument: { create: createDocument },
    };
    const prisma = {
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-food-db-id',
            categoryStableId: 'expense_food',
            type: AccountingTxType.EXPENSE,
          },
        ]),
      },
      $transaction: jest.fn(
        (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      accounting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 1000,
          paymentAllocations: [
            { accountStableId: 'account_inactive', amountCents: 1000 },
          ],
          splits: [
            {
              categoryStableId: 'expense_food',
              amountCents: 1000,
              taxCents: 0,
            },
          ],
        },
        'user_stable_3',
      ),
    ).rejects.toThrow('payment account is invalid: account_inactive');
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('rejects a non-CAD payment allocation before creating the expense', async () => {
    const createDocument = jest.fn();
    const tx = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'usd-bank-db-id',
            accountStableId: 'account_usd_bank',
            currency: 'USD',
            isActive: true,
          },
        ]),
      },
      accountingExpenseDocument: { create: createDocument },
    };
    const transaction = jest.fn(
      (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const prisma = {
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-software-db-id',
            categoryStableId: 'expense_software',
            type: AccountingTxType.EXPENSE,
          },
        ]),
      },
      $transaction: transaction,
    };
    const service = new AccountingExpenseService(
      prisma as never,
      accounting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 2746,
          paymentAllocations: [
            { accountStableId: 'account_usd_bank', amountCents: 2746 },
          ],
          splits: [
            {
              categoryStableId: 'expense_software',
              amountCents: 2746,
              taxCents: 0,
            },
          ],
        },
        'user_stable_3',
      ),
    ).rejects.toThrow(
      'expense payment accounts must use CAD functional currency',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('atomically confirms an Inbox expense in CAD while preserving foreign source-currency evidence', async () => {
    let createdDocumentStableId = '';
    const createDocument = jest.fn(
      (args: {
        data: {
          documentStableId: string;
          extractionJson: Record<string, unknown>;
        };
      }) => {
        createdDocumentStableId = args.data.documentStableId;
        return Promise.resolve({ id: 'expense-document-db-id' });
      },
    );
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const createExpenseSplitMany = jest.fn().mockResolvedValue({ count: 1 });
    const createAllocationMany = jest.fn().mockResolvedValue({ count: 1 });
    const createAuditMany = jest.fn().mockResolvedValue({ count: 1 });
    const updateInbox = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      accountingInboxItem: {
        findUnique: jest.fn().mockResolvedValue({
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          artifact: {
            artifactStableId: 'acctart_cloudflare',
            acquisitionMode: 'EMAIL',
            kind: AccountingArtifactKind.PDF,
            contentHash: 'source-hash',
            storedUrl: '/api/v1/accounting/files/inbox/cloudflare.pdf',
            bodyText: null,
            emailSubject: 'Cloudflare invoice',
            metadataJson: {
              gmailMessageId: 'gmail-message-1',
              gmailAttachmentId: 'gmail-attachment-1',
            },
            parseRuns: [
              {
                resultJson: {
                  date: '2026-09-15',
                  sourceCurrency: 'USD',
                  sourceCurrencyEvidence: 'EXPLICIT_TEXT',
                  totalCents: 2000,
                  financialConsistency: 'MISMATCH',
                  suggestedCategoryStableId: 'expense_other',
                  extractedText: 'Amount due USD 20.00',
                },
              },
            ],
          },
        }),
        updateMany: updateInbox,
      },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-software-db-id',
            categoryStableId: 'expense_software',
          },
        ]),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'bank-db-id',
            accountStableId: 'account_primary_bank',
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingExpenseDocument: { create: createDocument },
      accountingExpensePaymentAllocation: { createMany: createAllocationMany },
      accountingExpenseSplit: { createMany: createExpenseSplitMany },
      accountingTransaction: { createMany },
      accountingAuditLog: { createMany: createAuditMany },
    };
    const transaction = jest.fn(
      (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    const prisma = {
      accountingExpenseDocument: {
        findUnique: jest.fn((args: { where: { documentStableId: string } }) =>
          Promise.resolve({
            ...documentRow(args.where.documentStableId),
            source: AccountingDocumentSource.GMAIL,
            totalCents: 2746,
            subtotalCents: 2746,
            taxCents: 0,
            currency: 'CAD',
          }),
        ),
      },
      accountingInboxItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: transaction,
    };
    const service = new AccountingExpenseService(
      prisma as never,
      accounting as never,
    );

    const result = await service.confirmUnifiedInboxExpense(
      'acctinbox_cloudflare',
      {
        occurredAt: '2026-09-16',
        totalCents: 2746,
        sourceCurrency: 'USD',
        paymentAllocations: [
          { accountStableId: 'account_primary_bank', amountCents: 2746 },
        ],
        splits: [
          {
            categoryStableId: 'expense_software',
            amountCents: 2746,
            taxCents: 0,
          },
        ],
      },
      'user_stable_3',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createdDocumentStableId).toMatch(/^expense_/);
    expect(createExpenseSplitMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          expenseDocumentId: 'expense-document-db-id',
          categoryId: 'category-software-db-id',
          amountCents: 2746,
          taxCents: 0,
          sortOrder: 0,
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(createDocument).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentStableId: createdDocumentStableId,
        status: AccountingDocumentStatus.CONFIRMED,
        currency: 'CAD',
        subtotalCents: 2746,
        taxCents: 0,
        totalCents: 2746,
        fileHash: 'source-hash',
        extractionJson: expect.objectContaining({
          sourceCurrency: 'USD',
          reviewedSourceCurrency: 'USD',
          bookedCurrency: 'CAD',
          bookedTotalCents: 2746,
          bookingReview: expect.objectContaining({
            machineFinancialConsistency: 'MISMATCH',
            machine: expect.objectContaining({
              date: '2026-09-15',
              totalCents: 2000,
              sourceCurrency: 'USD',
              suggestedCategoryStableId: 'expense_other',
            }) as unknown,
            reviewedBooking: expect.objectContaining({
              occurredAt: '2026-09-16',
              totalCents: 2746,
              currency: 'CAD',
              sourceCurrency: 'USD',
              categoryStableIds: ['expense_software'],
            }) as unknown,
            correctedFields: ['occurredAt', 'categoryStableId'],
            operatorUserStableId: 'user_stable_3',
          }) as unknown,
        }) as unknown,
      }) as unknown as Record<string, unknown>,
      select: { id: true },
    });
    expect(createAllocationMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          expenseDocumentId: 'expense-document-db-id',
          accountId: 'bank-db-id',
          amountCents: 2746,
          sortOrder: 0,
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          currency: 'CAD',
          amountCents: 2746,
          taxCents: 0,
          documentId: 'expense-document-db-id',
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(createAuditMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: 'CONFIRM_EXPENSE_BOOKING',
          entityType: 'ACCOUNTING_EXPENSE_DOCUMENT',
          entityId: createdDocumentStableId,
          operatorActorRef: 'user_stable_3',
          afterJson: expect.objectContaining({
            machineFinancialConsistency: 'MISMATCH',
            correctedFields: ['occurredAt', 'categoryStableId'],
          }) as unknown,
        }) as unknown as Record<string, unknown>,
      ]) as unknown as Record<string, unknown>[],
    });
    expect(updateInbox).toHaveBeenCalledWith({
      where: expect.objectContaining({
        inboxItemStableId: 'acctinbox_cloudflare',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
      }) as unknown as Record<string, unknown>,
      data: expect.objectContaining({
        status: AccountingInboxStatus.CONFIRMED,
        materializedEntityType:
          AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
        materializedEntityStableId: createdDocumentStableId,
        reviewedByUserStableId: 'user_stable_3',
      }) as unknown as Record<string, unknown>,
    });
    expect(accounting.assertOnOrAfterAccountingStartDate).toHaveBeenCalledWith(
      expect.any(Date),
      tx,
    );
    expect(accounting.assertEditableForPeriod).toHaveBeenCalledWith(
      expect.any(Date),
      AccountingTxType.EXPENSE,
      tx,
    );
    expect(result.documentStableId).toBe(createdDocumentStableId);
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
    const deleteExpenseSplits = jest.fn().mockResolvedValue({ count: 0 });
    const deletePaymentAllocations = jest.fn().mockResolvedValue({ count: 0 });
    const updateDocument = jest.fn().mockResolvedValue({});
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const createExpenseSplitMany = jest.fn().mockResolvedValue({ count: 1 });
    const createAuditMany = jest.fn().mockResolvedValue({ count: 2 });
    const currentDocument = jest.fn().mockResolvedValue({
      status: AccountingDocumentStatus.PENDING_REVIEW,
      attachmentUrls: ['/api/v1/accounting/files/bills/original.pdf'],
    });
    const tx = {
      accountingTransaction: { findMany: replacedRows, deleteMany, createMany },
      accountingExpenseSplit: {
        deleteMany: deleteExpenseSplits,
        createMany: createExpenseSplitMany,
      },
      accountingExpenseDocument: {
        findUnique: currentDocument,
        update: updateDocument,
      },
      accountingExpensePaymentAllocation: {
        deleteMany: deletePaymentAllocations,
      },
      accountingInboxItem: { findFirst: jest.fn().mockResolvedValue(null) },
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
      accountingInboxItem: { findMany: jest.fn().mockResolvedValue([]) },
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
    const service = new AccountingExpenseService(
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
    expect(deleteExpenseSplits).toHaveBeenCalledWith({
      where: { expenseDocumentId: 'inbox-document-db-id' },
    });
    expect(deletePaymentAllocations).toHaveBeenCalledWith({
      where: { expenseDocumentId: 'inbox-document-db-id' },
    });
    expect(createExpenseSplitMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          expenseDocumentId: 'inbox-document-db-id',
          categoryId: 'category-food-db-id',
          amountCents: 1000,
          taxCents: 130,
          sortOrder: 0,
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(updateDocument).toHaveBeenCalledWith({
      where: { id: 'inbox-document-db-id' },
      data: expect.objectContaining({
        status: AccountingDocumentStatus.CONFIRMED,
        subtotalCents: 1000,
        taxCents: 130,
        totalCents: 1130,
        confirmedByUserStableId: 'user_stable_2',
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
          createdByUserStableId: 'user_stable_2',
          updatedByUserStableId: 'user_stable_2',
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
          operatorActorRef: 'user_stable_2',
          beforeJson: expect.objectContaining({
            documentStableId: 'inbox_doc_1',
            idempotencyKey: 'expense:inbox_doc_1:old',
          }) as unknown as Record<string, unknown>,
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_TRANSACTION',
          operatorActorRef: 'user_stable_2',
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
    const service = new AccountingExpenseService(
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
