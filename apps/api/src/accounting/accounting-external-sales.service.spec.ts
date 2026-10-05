import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { AccountingDb } from './accounting-db';
import {
  AccountingExternalSaleGranularity,
  type CreateAccountingExternalSaleInputV1,
} from './accounting-external-sales.contract';
import {
  hashAccountingExternalSaleFact,
  normalizeAccountingExternalSale,
} from './accounting-external-sales.policy';
import { AccountingExternalSalesService } from './accounting-external-sales.service';
import type { AccountingJournalService } from './accounting-journal.service';
import type { AccountingPeriodService } from './accounting-period.service';

const input = (
  overrides: Partial<CreateAccountingExternalSaleInputV1> = {},
): CreateAccountingExternalSaleInputV1 => ({
  requestId: '11111111-1111-4111-8111-111111111111',
  storeStableId: '4750_Yonge_Street',
  classificationStableId: 'external_wholesale',
  granularity: AccountingExternalSaleGranularity.TRANSACTION,
  occurredOn: '2026-06-15',
  counterpartyName: 'Supermarket A',
  currency: 'CAD',
  lines: [
    {
      description: 'Liangpi',
      quantity: '40',
      unit: '份',
      unitPriceCents: 550,
      lineAmountCents: 22_000,
      revenueAccountStableId: 'account_sales_revenue',
    },
  ],
  taxes: [
    {
      taxCode: 'HST',
      label: 'HST',
      rateBasisPoints: 1300,
      amountCents: 2860,
      liabilityAccountStableId: 'account_hst_payable',
    },
  ],
  ...overrides,
});

const makeRow = (
  journalEntryStableId: string | null,
  factHash = hashAccountingExternalSaleFact(
    normalizeAccountingExternalSale(input()),
  ),
) => ({
  externalSaleStableId: 'extsale_11111111111141118111111111111111',
  storeStableId: '4750_Yonge_Street',
  classificationStableId: 'external_wholesale',
  granularity: 'TRANSACTION' as const,
  occurredOn: new Date('2026-06-15T00:00:00.000Z'),
  periodStartOn: null,
  periodEndOn: null,
  counterpartyName: 'Supermarket A',
  reference: null,
  currency: 'CAD',
  idempotencyKey: 'external-sale:extsale_11111111111141118111111111111111:v1',
  factHash,
  journalEntryStableId,
  reversalStableId: null,
  reversalJournalEntryStableId: null,
  reversedAt: null,
  note: null,
  createdByActorRef: 'user_admin',
  createdAt: new Date('2026-06-15T12:00:00.000Z'),
  replacementForExternalSale: null,
  lines: [
    {
      lineStableId: 'extsale_11111111111141118111111111111111_line_1',
      description: 'Liangpi',
      productReference: null,
      quantity: new Prisma.Decimal('40'),
      unit: '份',
      unitPriceCents: 550,
      lineAmountCents: 22_000,
      sortOrder: 0,
      revenueAccount: { accountStableId: 'account_sales_revenue' },
    },
  ],
  adjustments: [],
  taxes: [
    {
      taxStableId: 'extsale_11111111111141118111111111111111_tax_1',
      taxCode: 'HST',
      label: 'HST',
      rateBasisPoints: 1300,
      amountCents: 2860,
      sortOrder: 0,
      liabilityAccount: { accountStableId: 'account_hst_payable' },
    },
  ],
  evidence: [],
});

describe('AccountingExternalSalesService C1', () => {
  it('persists the sale, posts its purpose-specific Journal, anchors it, and audits in one transaction', async () => {
    let persisted: ReturnType<typeof makeRow> | null = null;
    const tx = {
      accountingExternalSale: {
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve(persisted)),
        create: jest.fn().mockImplementation(() => {
          persisted = makeRow(null);
          return Promise.resolve(persisted);
        }),
        update: jest.fn().mockImplementation(() => {
          persisted = makeRow('journal_external_sale_1');
          return Promise.resolve(persisted);
        }),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '11111111-1111-4111-8111-111111111111',
            accountStableId: 'account_accounts_receivable',
            accountClass: 'ASSET',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            accountStableId: 'account_sales_revenue',
            accountClass: 'REVENUE',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            accountStableId: 'account_hst_payable',
            accountClass: 'LIABILITY',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingJournalEntry: {
        findUnique: jest.fn(),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleJournalInTx: jest.fn().mockResolvedValue({
        entryStableId: 'journal_external_sale_1',
      }),
    } as unknown as AccountingJournalService;
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    } as unknown as AccountingPeriodService;
    const service = new AccountingExternalSalesService(prisma, journal, period);

    const result = await service.createSale(input(), 'user_admin');

    expect(result).toMatchObject({
      externalSaleStableId: 'extsale_11111111111141118111111111111111',
      journalEntryStableId: 'journal_external_sale_1',
      totals: {
        lineSubtotalCents: 22_000,
        adjustmentTotalCents: 0,
        taxTotalCents: 2860,
        totalReceivableCents: 24_860,
      },
    });
    expect(tx.accountingExternalSale.create).toHaveBeenCalledTimes(1);
    expect(
      (journal as unknown as { createExternalSaleJournalInTx: jest.Mock })
        .createExternalSaleJournalInTx,
    ).toHaveBeenCalledTimes(1);
    expect(tx.accountingExternalSale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { journalEntryStableId: 'journal_external_sale_1' },
      }),
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tx.accountingAuditLog.create.mock.calls)).toContain(
      'EXTERNAL_SALE_POST',
    );
  });

  it('binds reviewed evidence atomically when reconstruction calls the existing C1 authority', async () => {
    let persisted: ReturnType<typeof makeRow> | null = null;
    const tx = {
      accountingSourceArtifact: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'artifact-db-id',
          artifactStableId: 'acctart_statement',
          contentHash: 'a'.repeat(64),
          inboxItem: {
            status: 'CONFIRMED',
            classification: 'OTHER_DOCUMENT',
            selectedProvider: null,
            materializedEntityType: null,
            materializedEntityStableId: null,
          },
        }),
      },
      accountingExternalSale: {
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve(persisted)),
        create: jest.fn().mockImplementation(() => {
          persisted = makeRow(null);
          return Promise.resolve(persisted);
        }),
        update: jest.fn().mockImplementation(() => {
          persisted = makeRow('journal_external_sale_1');
          return Promise.resolve(persisted);
        }),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '11111111-1111-4111-8111-111111111111',
            accountStableId: 'account_accounts_receivable',
            accountClass: 'ASSET',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            accountStableId: 'account_sales_revenue',
            accountClass: 'REVENUE',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            accountStableId: 'account_hst_payable',
            accountClass: 'LIABILITY',
            type: null,
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingJournalEntry: {
        findUnique: jest.fn(),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleJournalInTx: jest.fn().mockResolvedValue({
        entryStableId: 'journal_external_sale_1',
      }),
    } as unknown as AccountingJournalService;
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    } as unknown as AccountingPeriodService;
    const service = new AccountingExternalSalesService(prisma, journal, period);

    await service.createSaleFromEvidence(input(), 'user_admin', {
      artifactStableId: 'acctart_statement',
      contentHash: 'a'.repeat(64),
    });

    const createCallJson = JSON.stringify(
      tx.accountingExternalSale.create.mock.calls,
    );
    expect(createCallJson).toContain('"evidence"');
    expect(createCallJson).toContain('"artifact-db-id"');
    expect(createCallJson).toContain('"linkedByActorRef":"user_admin"');
    expect(tx.accountingAuditLog.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(tx.accountingAuditLog.create.mock.calls)).toContain(
      'EXTERNAL_SALE_EVIDENCE_LINK',
    );
  });

  it('replays an identical anchored fact without posting a second Journal', async () => {
    const anchored = makeRow('journal_external_sale_1');
    const tx = {
      accountingExternalSale: {
        findUnique: jest.fn().mockResolvedValue(anchored),
      },
      accountingJournalEntry: {
        findUnique: jest.fn().mockResolvedValue({
          source: 'EXTERNAL_SALE',
          sourceFactType: 'accounting.external_sale.v1',
          sourceFactStableId: anchored.externalSaleStableId,
          deletedAt: null,
        }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleJournalInTx: jest.fn(),
    } as unknown as AccountingJournalService;
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    } as unknown as AccountingPeriodService;
    const service = new AccountingExternalSalesService(prisma, journal, period);

    const result = await service.createSale(input(), 'user_admin');

    expect(result.journalEntryStableId).toBe('journal_external_sale_1');
    expect(tx.accountingJournalEntry.findUnique).toHaveBeenCalledTimes(1);
    expect(
      (journal as unknown as { createExternalSaleJournalInTx: jest.Mock })
        .createExternalSaleJournalInTx,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when a stable ID is replayed with different facts', async () => {
    const tx = {
      accountingExternalSale: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            makeRow('journal_external_sale_1', 'different-frozen-fact-hash'),
          ),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
        ),
    } as unknown as AccountingDb;
    const journal = {
      createExternalSaleJournalInTx: jest.fn(),
    } as unknown as AccountingJournalService;
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    } as unknown as AccountingPeriodService;
    const service = new AccountingExternalSalesService(prisma, journal, period);

    await expect(service.createSale(input(), 'user_admin')).rejects.toThrow(
      new ConflictException(
        'External Sale stable ID is already bound to different facts',
      ),
    );
  });

  it('requires a replacement predecessor to be fully reversed first', async () => {
    const tx = {
      accountingExternalSale: {
        findUnique: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { externalSaleStableId: string } }) =>
              Promise.resolve(
                where.externalSaleStableId === 'extsale_original'
                  ? {
                      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                      storeStableId: '4750_Yonge_Street',
                      currency: 'CAD',
                      reversalStableId: null,
                      reversalFactHash: null,
                      reversalJournalEntryStableId: null,
                      reversedAt: null,
                      replacedByExternalSale: null,
                    }
                  : null,
              ),
          ),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    } as unknown as AccountingDb;
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    } as unknown as AccountingPeriodService;
    const service = new AccountingExternalSalesService(
      prisma,
      {} as AccountingJournalService,
      period,
    );

    await expect(
      service.createSale(
        input({ replacementForExternalSaleStableId: 'extsale_original' }),
        'user_admin',
      ),
    ).rejects.toThrow(
      'External Sale replacement predecessor must be fully reversed first',
    );
  });
});
