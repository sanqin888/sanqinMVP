import { AccountingArtifactKind } from '@prisma/client';
import { listAccountingExpenseDocuments } from './accounting-expense.query';

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
