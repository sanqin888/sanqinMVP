import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
} from './accounting-contracts';
import { AccountingTrialBalanceService } from './accounting-trial-balance.service';

const journalRow = (params: {
  entryStableId: string;
  occurredAt: string;
  accountStableId: string;
  accountName: string;
  accountClass: AccountingAccountClass;
  accountType?: AccountingAccountType | null;
  isActive?: boolean;
  debitCents?: number;
  creditCents?: number;
  kind?: AccountingJournalEntryKind;
}) => ({
  debitCents: params.debitCents ?? 0,
  creditCents: params.creditCents ?? 0,
  entry: {
    entryStableId: params.entryStableId,
    kind: params.kind ?? AccountingJournalEntryKind.STANDARD,
    occurredAt: new Date(params.occurredAt),
  },
  account: {
    accountStableId: params.accountStableId,
    name: params.accountName,
    accountClass: params.accountClass,
    type: params.accountType ?? null,
    currency: 'CAD',
    isActive: params.isActive ?? true,
  },
});

const makeService = (options?: {
  accountingStartDate?: string | null;
  rows?: ReturnType<typeof journalRow>[];
}) => {
  const prisma = {
    accountingJournalLine: {
      findMany: jest.fn().mockResolvedValue(
        options?.rows ?? [
          journalRow({
            entryStableId: 'sale_before',
            occurredAt: '2026-06-15T16:00:00.000Z',
            accountStableId: 'account_store_cash',
            accountName: 'Store Cash',
            accountClass: AccountingAccountClass.ASSET,
            accountType: AccountingAccountType.CASH,
            debitCents: 1000,
          }),
          journalRow({
            entryStableId: 'sale_before',
            occurredAt: '2026-06-15T16:00:00.000Z',
            accountStableId: 'account_sales_revenue',
            accountName: 'Sales Revenue',
            accountClass: AccountingAccountClass.REVENUE,
            creditCents: 1000,
          }),
          journalRow({
            entryStableId: 'excluded_expense_v2',
            occurredAt: '2026-07-10T16:00:00.000Z',
            accountStableId: 'account_general_operating_expense',
            accountName: 'General Operating Expense',
            accountClass: AccountingAccountClass.EXPENSE,
            debitCents: 500,
          }),
          journalRow({
            entryStableId: 'excluded_expense_v2',
            occurredAt: '2026-07-10T16:00:00.000Z',
            accountStableId: 'account_hst_recoverable',
            accountName: 'HST Recoverable',
            accountClass: AccountingAccountClass.ASSET,
            debitCents: 65,
          }),
          journalRow({
            entryStableId: 'excluded_expense_v2',
            occurredAt: '2026-07-10T16:00:00.000Z',
            accountStableId: 'account_old_bank',
            accountName: 'Historical Bank',
            accountClass: AccountingAccountClass.ASSET,
            accountType: AccountingAccountType.BANK,
            isActive: false,
            creditCents: 565,
          }),
        ],
      ),
    },
  };
  const period = {
    getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    getAccountingStartDate: jest
      .fn()
      .mockResolvedValue(
        options && 'accountingStartDate' in options
          ? options.accountingStartDate
          : '2026-06-01',
      ),
    listPeriodCloseStatus: jest.fn().mockResolvedValue([
      {
        periodType: 'MONTH',
        periodKey: '2026-06',
        startAt: new Date('2026-06-01T04:00:00.000Z'),
        endAt: new Date('2026-07-01T03:59:59.999Z'),
        closedByUserStableId: 'user_admin',
        closedAt: new Date('2026-07-02T12:00:00.000Z'),
      },
    ]),
    listYearCloseStatus: jest.fn().mockResolvedValue([]),
  };

  return {
    service: new AccountingTrialBalanceService(
      prisma as never,
      period as never,
    ),
    prisma,
    period,
  };
};

describe('AccountingTrialBalanceService B3-A canonical core', () => {
  it('clamps to accountingStartDate and reads the whole canonical ledger without Management filtering', async () => {
    const { service, prisma, period } = makeService();

    const report = await service.project({
      from: '2026-05-01',
      to: '2026-07-31',
      currency: 'cad',
    });

    expect(report).toMatchObject({
      version: 1,
      scope: 'WHOLE_LEDGER',
      currency: 'CAD',
      timezone: 'America/Toronto',
      accountingStartDate: '2026-06-01',
      requestedFrom: '2026-05-01',
      requestedTo: '2026-07-31',
      effectiveFrom: '2026-06-01',
      effectiveTo: '2026-07-31',
      totals: {
        openingDebitBalanceCents: 0,
        openingCreditBalanceCents: 0,
        periodDebitCents: 1565,
        periodCreditCents: 1565,
        closingDebitBalanceCents: 1565,
        closingCreditBalanceCents: 1565,
      },
      closeStatus: {
        months: [
          { periodKey: '2026-06', isClosed: true },
          { periodKey: '2026-07', isClosed: false },
        ],
        years: [{ periodKey: '2026', isClosed: false }],
        allMonthsClosed: false,
      },
    });
    expect(
      report.accounts.find((row) => row.accountStableId === 'account_old_bank'),
    ).toMatchObject({
      isActive: false,
      closingCreditBalanceCents: 565,
    });
    expect(
      report.accounts.find(
        (row) => row.accountStableId === 'account_general_operating_expense',
      ),
    ).toMatchObject({
      periodDebitCents: 500,
      closingNormalBalanceCents: 500,
    });

    expect(prisma.accountingJournalLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entry: {
            deletedAt: null,
            currency: 'CAD',
            occurredAt: {
              gte: new Date('2026-06-01T04:00:00.000Z'),
              lt: new Date('2026-08-01T04:00:00.000Z'),
            },
          },
        },
      }),
    );
    expect(
      JSON.stringify(prisma.accountingJournalLine.findMany.mock.calls),
    ).not.toContain('includeFundedExpensesInManagementReports');
    expect(period.listPeriodCloseStatus).toHaveBeenCalledWith([
      '2026-06',
      '2026-07',
    ]);
    expect(period.listYearCloseStatus).toHaveBeenCalledWith(['2026']);
  });

  it('defaults omitted currency to CAD inside the canonical service', async () => {
    const { service, prisma } = makeService();

    const report = await service.project({
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.currency).toBe('CAD');
    expect(
      JSON.stringify(prisma.accountingJournalLine.findMany.mock.calls),
    ).toContain('"currency":"CAD"');
  });

  it('requires an explicit accounting start date before projecting balances', async () => {
    const { service, prisma } = makeService({ accountingStartDate: null });

    await expect(
      service.project({ from: '2026-06-01', to: '2026-06-30' }),
    ).rejects.toThrow(
      'accountingStartDate must be configured before Trial Balance reporting',
    );
    expect(prisma.accountingJournalLine.findMany).not.toHaveBeenCalled();
  });

  it('rejects a report range ending before accountingStartDate', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.project({ from: '2026-05-01', to: '2026-05-31' }),
    ).rejects.toThrow('to is before accounting start date 2026-06-01');
    expect(prisma.accountingJournalLine.findMany).not.toHaveBeenCalled();
  });

  it('surfaces canonical Journal imbalance as a fail-closed conflict', async () => {
    const { service } = makeService({
      rows: [
        journalRow({
          entryStableId: 'broken',
          occurredAt: '2026-06-15T16:00:00.000Z',
          accountStableId: 'account_store_cash',
          accountName: 'Store Cash',
          accountClass: AccountingAccountClass.ASSET,
          accountType: AccountingAccountType.CASH,
          debitCents: 1000,
        }),
        journalRow({
          entryStableId: 'broken',
          occurredAt: '2026-06-15T16:00:00.000Z',
          accountStableId: 'account_sales_revenue',
          accountName: 'Sales Revenue',
          accountClass: AccountingAccountClass.REVENUE,
          creditCents: 999,
        }),
      ],
    });

    await expect(
      service.project({ from: '2026-06-01', to: '2026-06-30' }),
    ).rejects.toThrow(
      'Unbalanced Journal entry in Trial Balance projection: broken',
    );
  });
});
