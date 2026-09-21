import { AccountingArtifactKind } from '@prisma/client';
import {
  listAccountingExpenseDocuments,
  listAccountingExpenseRecords,
} from './accounting-expense.query';

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
            transactions: [],
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

  it('applies record filters before pagination and returns the full match count', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(37);
    const db = {
      accountingExpenseDocument: { findMany, count },
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
      total: 37,
      limit: 10,
      offset: 20,
    });
    const where = expect.objectContaining({
      status: 'CONFIRMED',
      occurredAt: {
        gte: new Date('2026-06-01T04:00:00.000Z'),
        lt: new Date('2026-07-01T04:00:00.000Z'),
      },
      totalCents: { gte: 5000 },
      paymentAllocations: {
        some: { account: { accountStableId: 'account_cibc' } },
      },
    }) as unknown;
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 20,
        take: 10,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('filters the full record set for expenses with no payment allocation', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(4);
    const db = {
      accountingExpenseDocument: { findMany, count },
    };

    const result = await listAccountingExpenseRecords(db as never, {
      status: 'CONFIRMED' as never,
      paymentState: 'UNASSIGNED',
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(4);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentAllocations: { none: {} },
        }) as unknown,
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
            transactions: [],
          },
        ]),
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
