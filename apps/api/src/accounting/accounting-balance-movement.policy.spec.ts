import {
  AccountingAccountClass,
  AccountingAccountType,
} from './accounting-contracts';
import { projectAccountingBalanceMovement } from './accounting-balance-movement.policy';
import type {
  AccountingTrialBalanceAccountRowV1,
  AccountingTrialBalanceReportV1,
} from './accounting-trial-balance.contract';

const row = (
  params: Partial<AccountingTrialBalanceAccountRowV1> &
    Pick<
      AccountingTrialBalanceAccountRowV1,
      | 'accountStableId'
      | 'accountName'
      | 'accountClass'
      | 'normalSide'
      | 'openingNormalBalanceCents'
      | 'periodNormalMovementCents'
      | 'closingNormalBalanceCents'
    >,
): AccountingTrialBalanceAccountRowV1 => ({
  accountStableId: params.accountStableId,
  accountName: params.accountName,
  accountClass: params.accountClass,
  accountType: params.accountType ?? null,
  currency: params.currency ?? 'CAD',
  isActive: params.isActive ?? true,
  normalSide: params.normalSide,
  openingDebitBalanceCents: params.openingDebitBalanceCents ?? 0,
  openingCreditBalanceCents: params.openingCreditBalanceCents ?? 0,
  openingNormalBalanceCents: params.openingNormalBalanceCents,
  periodDebitCents: params.periodDebitCents ?? 0,
  periodCreditCents: params.periodCreditCents ?? 0,
  periodNormalMovementCents: params.periodNormalMovementCents,
  closingDebitBalanceCents: params.closingDebitBalanceCents ?? 0,
  closingCreditBalanceCents: params.closingCreditBalanceCents ?? 0,
  closingNormalBalanceCents: params.closingNormalBalanceCents,
});

const makeTrialBalance = (): AccountingTrialBalanceReportV1 => ({
  version: 1,
  scope: 'WHOLE_LEDGER',
  currency: 'CAD',
  timezone: 'America/Toronto',
  accountingStartDate: '2026-06-01',
  requestedFrom: '2026-07-01',
  requestedTo: '2026-07-31',
  effectiveFrom: '2026-07-01',
  effectiveTo: '2026-07-31',
  openingBalanceJournal: {
    entryCount: 0,
    debitCents: 0,
    creditCents: 0,
  },
  totals: {
    openingDebitBalanceCents: 1000,
    openingCreditBalanceCents: 1000,
    periodDebitCents: 2000,
    periodCreditCents: 2000,
    closingDebitBalanceCents: 2500,
    closingCreditBalanceCents: 2500,
  },
  accounts: [
    row({
      accountStableId: 'account_store_cash',
      accountName: 'Store Cash',
      accountClass: AccountingAccountClass.ASSET,
      accountType: AccountingAccountType.CASH,
      normalSide: 'DEBIT',
      openingDebitBalanceCents: 1000,
      openingNormalBalanceCents: 1000,
      periodDebitCents: 1400,
      periodCreditCents: 500,
      periodNormalMovementCents: 900,
      closingDebitBalanceCents: 1900,
      closingNormalBalanceCents: 1900,
    }),
    row({
      accountStableId: 'account_store_balance_liability',
      accountName: 'Store Balance Liability',
      accountClass: AccountingAccountClass.LIABILITY,
      normalSide: 'CREDIT',
      openingNormalBalanceCents: 0,
      periodCreditCents: 200,
      periodNormalMovementCents: 200,
      closingCreditBalanceCents: 200,
      closingNormalBalanceCents: 200,
    }),
    row({
      accountStableId: 'account_owner_equity',
      accountName: 'Owner Equity',
      accountClass: AccountingAccountClass.EQUITY,
      normalSide: 'CREDIT',
      openingNormalBalanceCents: 0,
      periodCreditCents: 300,
      periodNormalMovementCents: 300,
      closingCreditBalanceCents: 300,
      closingNormalBalanceCents: 300,
    }),
    row({
      accountStableId: 'account_sales_revenue',
      accountName: 'Sales Revenue',
      accountClass: AccountingAccountClass.REVENUE,
      normalSide: 'CREDIT',
      openingCreditBalanceCents: 1000,
      openingNormalBalanceCents: 1000,
      periodCreditCents: 1000,
      periodNormalMovementCents: 1000,
      closingCreditBalanceCents: 2000,
      closingNormalBalanceCents: 2000,
    }),
    row({
      accountStableId: 'account_sales_discounts',
      accountName: 'Sales Discounts',
      accountClass: AccountingAccountClass.REVENUE,
      normalSide: 'CREDIT',
      openingNormalBalanceCents: 0,
      periodDebitCents: 100,
      periodNormalMovementCents: -100,
      closingDebitBalanceCents: 100,
      closingNormalBalanceCents: -100,
    }),
    row({
      accountStableId: 'account_general_operating_expense',
      accountName: 'General Operating Expense',
      accountClass: AccountingAccountClass.EXPENSE,
      normalSide: 'DEBIT',
      openingNormalBalanceCents: 0,
      periodDebitCents: 500,
      periodNormalMovementCents: 500,
      closingDebitBalanceCents: 500,
      closingNormalBalanceCents: 500,
    }),
  ],
  closeStatus: {
    months: [{ periodKey: '2026-07', isClosed: false }],
    years: [{ periodKey: '2026', isClosed: false }],
    allMonthsClosed: false,
  },
});

describe('B3-C Balance Movement projection', () => {
  it('bridges balance-sheet classes with recorded earnings from Trial Balance rows', () => {
    const result = projectAccountingBalanceMovement(makeTrialBalance());

    expect(result.openingBasis).toEqual({
      kind: 'ZERO_MANAGEMENT_OPENING',
      explicitOpeningJournalEntryCount: 0,
      zeroOpeningDisclaimerRequired: true,
      absoluteBalanceClaim: false,
    });
    expect(result.assets).toMatchObject({
      openingCumulativeCents: 1000,
      periodMovementCents: 900,
      closingCumulativeCents: 1900,
    });
    expect(result.liabilities).toMatchObject({
      openingCumulativeCents: 0,
      periodMovementCents: 200,
      closingCumulativeCents: 200,
    });
    expect(result.directEquity).toMatchObject({
      openingCumulativeCents: 0,
      periodMovementCents: 300,
      closingCumulativeCents: 300,
    });
    expect(result.earningsBridge).toEqual({
      revenue: {
        openingCumulativeCents: 1000,
        periodMovementCents: 900,
        closingCumulativeCents: 1900,
      },
      expense: {
        openingCumulativeCents: 0,
        periodMovementCents: 500,
        closingCumulativeCents: 500,
      },
      recordedEarnings: {
        openingCumulativeCents: 1000,
        periodMovementCents: 400,
        closingCumulativeCents: 1400,
      },
    });
    expect(result.bridge).toEqual({
      opening: {
        assetsCents: 1000,
        liabilitiesCents: 0,
        directEquityCents: 0,
        recordedEarningsCents: 1000,
        totalEquityCents: 1000,
        reconciliationCents: 0,
      },
      period: {
        assetsCents: 900,
        liabilitiesCents: 200,
        directEquityCents: 300,
        recordedEarningsCents: 400,
        totalEquityCents: 700,
        reconciliationCents: 0,
      },
      closing: {
        assetsCents: 1900,
        liabilitiesCents: 200,
        directEquityCents: 300,
        recordedEarningsCents: 1400,
        totalEquityCents: 1700,
        reconciliationCents: 0,
      },
    });
    expect(result.assets.accounts).toHaveLength(1);
    expect(result.assets.accounts[0]?.accountStableId).toBe(
      'account_store_cash',
    );
    expect(result.assets.accounts[0]?.accountType).toBe(
      AccountingAccountType.CASH,
    );
    expect(result.assets.accounts[0]?.closingCumulativeCents).toBe(1900);
  });

  it('keeps inactive historical balance-sheet accounts visible', () => {
    const trialBalance = makeTrialBalance();
    trialBalance.accounts[0] = {
      ...trialBalance.accounts[0],
      isActive: false,
    };

    const result = projectAccountingBalanceMovement(trialBalance);

    expect(result.assets.accounts[0]).toMatchObject({
      accountStableId: 'account_store_cash',
      isActive: false,
    });
  });

  it('marks explicit opening Journals without claiming absolute balances', () => {
    const trialBalance = makeTrialBalance();
    trialBalance.openingBalanceJournal = {
      entryCount: 1,
      debitCents: 500,
      creditCents: 500,
    };

    const result = projectAccountingBalanceMovement(trialBalance);

    expect(result.openingBasis).toEqual({
      kind: 'EXPLICIT_OPENING_JOURNAL',
      explicitOpeningJournalEntryCount: 1,
      zeroOpeningDisclaimerRequired: false,
      absoluteBalanceClaim: false,
    });
  });

  it('fails closed when a Trial Balance account no longer rolls forward', () => {
    const trialBalance = makeTrialBalance();
    trialBalance.accounts[0] = {
      ...trialBalance.accounts[0],
      closingNormalBalanceCents: 1901,
    };

    expect(() => projectAccountingBalanceMovement(trialBalance)).toThrow(
      'Balance Movement account roll-forward mismatch: account_store_cash',
    );
  });

  it('fails closed when the accounting bridge does not reconcile', () => {
    const trialBalance = makeTrialBalance();
    const expenseIndex = trialBalance.accounts.findIndex(
      (item) =>
        item.accountStableId === 'account_general_operating_expense',
    );
    trialBalance.accounts[expenseIndex] = {
      ...trialBalance.accounts[expenseIndex],
      periodDebitCents: 499,
      periodNormalMovementCents: 499,
      closingDebitBalanceCents: 499,
      closingNormalBalanceCents: 499,
    };

    expect(() => projectAccountingBalanceMovement(trialBalance)).toThrow(
      'Balance Movement period bridge does not reconcile: -1',
    );
  });
});
