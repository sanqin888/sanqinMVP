import {
  AccountingFinancialProvider,
  AccountingJournalSource,
} from './accounting-contracts';
import { AccountingProviderPendingReconciliationService } from './accounting-provider-pending-reconciliation.service';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';
import { AccountingPeriodService } from './accounting-period.service';

type ProviderPendingFindManyArgs = {
  where: {
    account: {
      accountStableId: {
        in: string[];
      };
    };
    entry: {
      deletedAt: null;
      OR: Array<{ storeStableId: string | null }>;
      currency: string;
      occurredAt: {
        gte: Date;
        lt: Date;
      };
    };
  };
};

describe('AccountingProviderPendingReconciliationService', () => {
  it('reads only canonical Accounting Journal lines for the provider Pending roll-forward', async () => {
    const prisma = {
      accountingJournalLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            debitCents: 50_000,
            creditCents: 0,
            account: { accountStableId: 'account_uber_pending' },
            entry: {
              entryStableId: 'journal_statement',
              storeStableId: '4750_Yonge_Street',
              occurredAt: new Date('2026-06-30T23:59:59.999Z'),
              source: AccountingJournalSource.PLATFORM_STATEMENT,
              sourceFactType: 'accounting.provider_financial_document.v1',
            },
          },
          {
            debitCents: 0,
            creditCents: 10_000,
            account: { accountStableId: 'account_uber_pending' },
            entry: {
              entryStableId: 'journal_payout',
              storeStableId: '4750_Yonge_Street',
              occurredAt: new Date('2026-06-20T04:00:00.000Z'),
              source: AccountingJournalSource.PAYMENT,
              sourceFactType: 'accounting.provider_payout.v1',
            },
          },
        ]),
      },
    };
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
    };
    const settlementQuery = {
      readProviderFinancialCoverage: jest.fn().mockResolvedValue([
        {
          provider: AccountingFinancialProvider.UBER_EATS,
          financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
          financialCompleteThrough: new Date('2026-06-30T00:00:00.000Z'),
        },
      ]),
    };
    const service = new AccountingProviderPendingReconciliationService(
      prisma as never,
      period as unknown as AccountingPeriodService,
      settlementQuery as unknown as AccountingProviderSettlementQueryService,
    );

    const report = await service.reconcile({
      storeStableId: '4750_Yonge_Street',
      from: '2026-06-01',
      to: '2026-06-30',
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    const [findManyArgs] = prisma.accountingJournalLine.findMany.mock
      .calls[0] as unknown as [ProviderPendingFindManyArgs];
    expect(findManyArgs.where.account.accountStableId.in).toEqual([
      'account_uber_pending',
    ]);
    expect(findManyArgs.where.entry).toMatchObject({
      deletedAt: null,
      OR: [{ storeStableId: '4750_Yonge_Street' }, { storeStableId: null }],
      currency: 'CAD',
    });
    expect(settlementQuery.readProviderFinancialCoverage).toHaveBeenCalledWith({
      storeStableId: '4750_Yonge_Street',
      providers: [AccountingFinancialProvider.UBER_EATS],
    });
    expect(report.providers[0]).toMatchObject({
      provider: AccountingFinancialProvider.UBER_EATS,
      providerStatementMovementCents: 50_000,
      payoutReductionCents: 10_000,
      closingBalanceCents: 40_000,
      arithmeticDeltaCents: 0,
      coverage: { status: 'COMPLETE' },
    });
  });

  it('fails closed when unscoped Pending movement would make a store report incomplete', async () => {
    const prisma = {
      accountingJournalLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            debitCents: 100,
            creditCents: 0,
            account: { accountStableId: 'account_uber_pending' },
            entry: {
              entryStableId: 'journal_unscoped_pending',
              storeStableId: null,
              occurredAt: new Date('2026-06-15T12:00:00.000Z'),
              source: AccountingJournalSource.MANUAL,
              sourceFactType: 'manual.pending.adjustment',
            },
          },
        ]),
      },
    };
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
    };
    const settlementQuery = {
      readProviderFinancialCoverage: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingProviderPendingReconciliationService(
      prisma as never,
      period as unknown as AccountingPeriodService,
      settlementQuery as unknown as AccountingProviderSettlementQueryService,
    );

    await expect(
      service.reconcile({
        storeStableId: '4750_Yonge_Street',
        from: '2026-06-01',
        to: '2026-06-30',
      }),
    ).rejects.toThrow(
      'Unscoped Provider Pending Journal movement prevents store reconciliation: journal_unscoped_pending',
    );
  });

  it('fails closed on invalid ranges before querying Journal lines', async () => {
    const prisma = {
      accountingJournalLine: {
        findMany: jest.fn(),
      },
    };
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
    };
    const settlementQuery = {
      readProviderFinancialCoverage: jest.fn(),
    };
    const service = new AccountingProviderPendingReconciliationService(
      prisma as never,
      period as unknown as AccountingPeriodService,
      settlementQuery as unknown as AccountingProviderSettlementQueryService,
    );

    await expect(
      service.reconcile({
        storeStableId: '4750_Yonge_Street',
        from: '2026-07-01',
        to: '2026-06-30',
      }),
    ).rejects.toThrow('from must be on or before to');
    expect(prisma.accountingJournalLine.findMany).not.toHaveBeenCalled();
  });
});
