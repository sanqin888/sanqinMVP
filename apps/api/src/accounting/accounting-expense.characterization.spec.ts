import { ConflictException } from '@nestjs/common';
import {
  AccountingArtifactKind,
  AccountingDocumentSource,
  AccountingDocumentStatus,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
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
    fundingAttributionVersion: 2,
    paymentAllocations: [],
    splits: [],
  });

  const accounting = {
    assertOnOrAfterAccountingStartDate: jest.fn().mockResolvedValue(undefined),
    assertEditableForPeriod: jest.fn().mockResolvedValue(undefined),
  };
  const expenseJournalPosting = {
    postConfirmedExpenseIfReadyInTx: jest.fn().mockResolvedValue(null),
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
        paidFromAccountId?: string | null;
        amountCents: number;
        taxCents: number;
        sortOrder: number;
      }>;
    };
    const createExpenseSplitMany = jest.fn((args: ExpenseSplitCreateManyArgs) =>
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
            accountClass: 'ASSET',
            type: 'BANK',
            currency: 'CAD',
            isActive: true,
          },
          {
            id: 'account-cash-db-id',
            accountStableId: 'account_cash',
            accountClass: 'ASSET',
            type: 'CASH',
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingExpenseDocument: { create: createDocument },
      accountingExpensePaymentAllocation: { createMany: createAllocationMany },
      accountingExpenseSplit: { createMany: createExpenseSplitMany },
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
      expenseJournalPosting as never,
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
            paidFromAccountStableId: 'account_rbc',
          },
          {
            categoryStableId: 'expense_packaging',
            amountCents: 400,
            taxCents: 52,
            paidFromAccountStableId: 'account_rbc',
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
        fundingAttributionVersion: 2,
        subtotalCents: 1000,
        taxCents: 130,
        totalCents: 1130,
        currency: 'CAD',
        confirmedByUserStableId: 'user_stable_1',
      }) as unknown as Record<string, unknown>,
    });
    expect(createAllocationMany).not.toHaveBeenCalled();
    expect(createExpenseSplitMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          splitStableId: expect.stringMatching(/^expensesplit_/) as unknown,
          expenseDocumentId: 'expense-document-db-id',
          categoryId: 'category-food-db-id',
          paidFromAccountId: 'account-rbc-db-id',
          amountCents: 600,
          taxCents: 78,
          sortOrder: 0,
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          splitStableId: expect.stringMatching(/^expensesplit_/) as unknown,
          expenseDocumentId: 'expense-document-db-id',
          categoryId: 'category-packaging-db-id',
          paidFromAccountId: 'account-rbc-db-id',
          amountCents: 400,
          taxCents: 52,
          sortOrder: 1,
        }) as unknown as Record<string, unknown>,
      ],
    });
    expect(createAuditMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_EXPENSE_SPLIT',
          operatorActorRef: 'user_stable_1',
          afterJson: expect.objectContaining({
            categoryStableId: 'expense_food',
            documentStableId: generatedDocumentStableId,
          }) as unknown as Record<string, unknown>,
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_EXPENSE_SPLIT',
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
    expect(
      expenseJournalPosting.postConfirmedExpenseIfReadyInTx,
    ).toHaveBeenCalledWith(tx, generatedDocumentStableId, 'user_stable_1');
    expect(result.documentStableId).toBe(generatedDocumentStableId);
  });

  it('rejects a stale v1 document-level payment allocation payload before persistence', async () => {
    const service = new AccountingExpenseService(
      {} as never,
      accounting as never,
      expenseJournalPosting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 1000,
          paymentAllocations: [
            { accountStableId: 'account_rbc', amountCents: 1000 },
          ],
          splits: [
            {
              categoryStableId: 'expense_food',
              amountCents: 1000,
              taxCents: 0,
              paidFromAccountStableId: 'account_rbc',
            },
          ],
        } as never,
        'user_stable_3',
      ),
    ).rejects.toThrow(
      'document-level paymentAllocations are not supported for Expense v2',
    );
  });

  it('rejects the retired single-account Expense payload instead of silently ignoring it', async () => {
    const service = new AccountingExpenseService(
      {} as never,
      accounting as never,
      expenseJournalPosting as never,
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
              paidFromAccountStableId: 'account_rbc',
            },
          ],
        } as never,
        'user_stable_3',
      ),
    ).rejects.toThrow(
      'document-level accountStableId is not supported for Expense v2',
    );
  });

  it('rejects an old client that omits split-level funding attribution entirely', async () => {
    const service = new AccountingExpenseService(
      {} as never,
      accounting as never,
      expenseJournalPosting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 1000,
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
      'each Expense v2 split must submit paidFromAccountStableId explicitly',
    );
  });

  it('rejects inactive or missing payment accounts before creating the expense', async () => {
    const createDocument = jest.fn();
    const tx = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inactive-db-id',
            accountStableId: 'account_inactive',
            accountClass: 'ASSET',
            type: 'BANK',
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
      expenseJournalPosting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 1000,
          splits: [
            {
              categoryStableId: 'expense_food',
              amountCents: 1000,
              taxCents: 0,
              paidFromAccountStableId: 'account_inactive',
            },
          ],
        },
        'user_stable_3',
      ),
    ).rejects.toThrow('expense funding account is invalid: account_inactive');
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
            accountClass: 'ASSET',
            type: 'BANK',
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
      expenseJournalPosting as never,
    );

    await expect(
      service.createExpense(
        {
          occurredAt: '2026-09-16',
          totalCents: 2746,
          splits: [
            {
              categoryStableId: 'expense_software',
              amountCents: 2746,
              taxCents: 0,
              paidFromAccountStableId: 'account_usd_bank',
            },
          ],
        },
        'user_stable_3',
      ),
    ).rejects.toThrow(
      'expense funding accounts must use CAD functional currency',
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
            accountClass: 'ASSET',
            type: 'BANK',
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingExpenseDocument: { create: createDocument },
      accountingExpensePaymentAllocation: { createMany: createAllocationMany },
      accountingExpenseSplit: { createMany: createExpenseSplitMany },
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
      expenseJournalPosting as never,
    );

    const result = await service.confirmUnifiedInboxExpense(
      'acctinbox_cloudflare',
      {
        occurredAt: '2026-09-16',
        totalCents: 2746,
        sourceCurrency: 'USD',
        splits: [
          {
            categoryStableId: 'expense_software',
            amountCents: 2746,
            taxCents: 0,
            paidFromAccountStableId: 'account_primary_bank',
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
          paidFromAccountId: 'bank-db-id',
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
        fundingAttributionVersion: 2,
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
    expect(createAllocationMany).not.toHaveBeenCalled();
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
    expect(
      expenseJournalPosting.postConfirmedExpenseIfReadyInTx,
    ).toHaveBeenCalledWith(tx, createdDocumentStableId, 'user_stable_3');
    expect(result.documentStableId).toBe(createdDocumentStableId);
  });

  it('confirms an inbox document by replacing active splits inside the same transaction and preserving existing attachments', async () => {
    const replacedRows = jest.fn().mockResolvedValue([
      {
        splitStableId: 'expensesplit_replaced',
        amountCents: 900,
        taxCents: 117,
        sortOrder: 0,
        category: { categoryStableId: 'expense_food' },
      },
    ]);
    const deleteExpenseSplits = jest.fn().mockResolvedValue({ count: 0 });
    const deletePaymentAllocations = jest.fn().mockResolvedValue({ count: 0 });
    const updateDocument = jest.fn().mockResolvedValue({});
    const createExpenseSplitMany = jest.fn().mockResolvedValue({ count: 1 });
    const createAuditMany = jest.fn().mockResolvedValue({ count: 2 });
    const currentDocument = jest.fn().mockResolvedValue({
      status: AccountingDocumentStatus.PENDING_REVIEW,
      attachmentUrls: ['/api/v1/accounting/files/bills/original.pdf'],
    });
    const tx = {
      accountingExpenseSplit: {
        findMany: replacedRows,
        deleteMany: deleteExpenseSplits,
        createMany: createExpenseSplitMany,
      },
      accountingExpenseDocument: {
        findUnique: currentDocument,
        update: updateDocument,
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-rbc-db-id',
            accountStableId: 'account_rbc',
            accountClass: 'ASSET',
            type: 'BANK',
            currency: 'CAD',
            isActive: true,
          },
        ]),
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
      expenseJournalPosting as never,
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
            paidFromAccountStableId: 'account_rbc',
          },
        ],
      },
      'user_stable_2',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
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
          paidFromAccountId: 'account-rbc-db-id',
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
        fundingAttributionVersion: 2,
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
    expect(currentDocument).toHaveBeenCalledWith({
      where: { id: 'inbox-document-db-id' },
      select: { status: true, attachmentUrls: true },
    });
    expect(replacedRows).toHaveBeenCalledWith({
      where: { expenseDocumentId: 'inbox-document-db-id' },
      select: {
        splitStableId: true,
        amountCents: true,
        taxCents: true,
        sortOrder: true,
        category: { select: { categoryStableId: true } },
      },
    });
    expect(createAuditMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: 'DELETE',
          entityType: 'ACCOUNTING_EXPENSE_SPLIT',
          entityId: 'expensesplit_replaced',
          operatorActorRef: 'user_stable_2',
          beforeJson: expect.objectContaining({
            splitStableId: 'expensesplit_replaced',
            categoryStableId: 'expense_food',
            documentStableId: 'inbox_doc_1',
          }) as unknown as Record<string, unknown>,
        }) as unknown as Record<string, unknown>,
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_EXPENSE_SPLIT',
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
    expect(
      expenseJournalPosting.postConfirmedExpenseIfReadyInTx,
    ).toHaveBeenCalledWith(tx, 'inbox_doc_1', 'user_stable_2');
    expect(result.documentStableId).toBe('inbox_doc_1');
  });

  it('rejects a concurrent second inbox confirmation before replacing ledger rows', async () => {
    const deleteExpenseSplits = jest.fn();
    const createExpenseSplits = jest.fn();
    const createAuditMany = jest.fn();
    const tx = {
      accountingExpenseSplit: {
        findMany: jest.fn(),
        deleteMany: deleteExpenseSplits,
        createMany: createExpenseSplits,
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
      expenseJournalPosting as never,
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
              paidFromAccountStableId: null,
            },
          ],
        },
        'user_stable_2',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(deleteExpenseSplits).not.toHaveBeenCalled();
    expect(createExpenseSplits).not.toHaveBeenCalled();
    expect(createAuditMany).not.toHaveBeenCalled();
  });
});
