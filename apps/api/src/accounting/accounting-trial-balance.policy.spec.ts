import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
} from './accounting-contracts';
import {
  projectAccountingTrialBalance,
  type AccountingTrialBalanceJournalLineV1,
} from './accounting-trial-balance.policy';

const FROM = new Date('2026-07-01T04:00:00.000Z');
const TO_EXCLUSIVE = new Date('2026-08-01T04:00:00.000Z');

const line = (params: {
  entryStableId: string;
  kind?: AccountingJournalEntryKind;
  occurredAt: string;
  accountStableId: string;
  accountName: string;
  accountClass: AccountingAccountClass;
  accountType?: AccountingAccountType | null;
  isActive?: boolean;
  debitCents?: number;
  creditCents?: number;
}): AccountingTrialBalanceJournalLineV1 => ({
  entryStableId: params.entryStableId,
  kind: params.kind ?? AccountingJournalEntryKind.STANDARD,
  occurredAt: new Date(params.occurredAt),
  debitCents: params.debitCents ?? 0,
  creditCents: params.creditCents ?? 0,
  account: {
    accountStableId: params.accountStableId,
    accountName: params.accountName,
    accountClass: params.accountClass,
    accountType: params.accountType ?? null,
    currency: 'CAD',
    isActive: params.isActive ?? true,
  },
});

describe('B3-A canonical Trial Balance projection', () => {
  it('builds balanced opening, period and closing columns across every account class', () => {
    const result = projectAccountingTrialBalance({
      currency: 'CAD',
      fromInclusive: FROM,
      toExclusive: TO_EXCLUSIVE,
      lines: [
        line({
          entryStableId: 'sale_before_period',
          occurredAt: '2026-06-15T16:00:00.000Z',
          accountStableId: 'account_store_cash',
          accountName: 'Store Cash',
          accountClass: AccountingAccountClass.ASSET,
          accountType: AccountingAccountType.CASH,
          debitCents: 1000,
        }),
        line({
          entryStableId: 'sale_before_period',
          occurredAt: '2026-06-15T16:00:00.000Z',
          accountStableId: 'account_sales_revenue',
          accountName: 'Sales Revenue',
          accountClass: AccountingAccountClass.REVENUE,
          creditCents: 1000,
        }),
        line({
          entryStableId: 'formal_opening',
          kind: AccountingJournalEntryKind.OPENING_BALANCE,
          occurredAt: '2026-07-01T04:00:00.000Z',
          accountStableId: 'account_store_cash',
          accountName: 'Store Cash',
          accountClass: AccountingAccountClass.ASSET,
          accountType: AccountingAccountType.CASH,
          debitCents: 500,
        }),
        line({
          entryStableId: 'formal_opening',
          kind: AccountingJournalEntryKind.OPENING_BALANCE,
          occurredAt: '2026-07-01T04:00:00.000Z',
          accountStableId: 'account_opening_balance_equity',
          accountName: 'Opening Balance Equity',
          accountClass: AccountingAccountClass.EQUITY,
          creditCents: 500,
        }),
        line({
          entryStableId: 'sale_in_period',
          occurredAt: '2026-07-10T16:00:00.000Z',
          accountStableId: 'account_store_cash',
          accountName: 'Store Cash',
          accountClass: AccountingAccountClass.ASSET,
          accountType: AccountingAccountType.CASH,
          debitCents: 900,
        }),
        line({
          entryStableId: 'sale_in_period',
          occurredAt: '2026-07-10T16:00:00.000Z',
          accountStableId: 'account_sales_discounts',
          accountName: 'Sales Discounts',
          accountClass: AccountingAccountClass.REVENUE,
          debitCents: 100,
        }),
        line({
          entryStableId: 'sale_in_period',
          occurredAt: '2026-07-10T16:00:00.000Z',
          accountStableId: 'account_sales_revenue',
          accountName: 'Sales Revenue',
          accountClass: AccountingAccountClass.REVENUE,
          creditCents: 1000,
        }),
        line({
          entryStableId: 'expense_in_period',
          occurredAt: '2026-07-20T16:00:00.000Z',
          accountStableId: 'account_general_operating_expense',
          accountName: 'General Operating Expense',
          accountClass: AccountingAccountClass.EXPENSE,
          debitCents: 500,
        }),
        line({
          entryStableId: 'expense_in_period',
          occurredAt: '2026-07-20T16:00:00.000Z',
          accountStableId: 'account_hst_recoverable',
          accountName: 'HST Recoverable',
          accountClass: AccountingAccountClass.ASSET,
          debitCents: 65,
        }),
        line({
          entryStableId: 'expense_in_period',
          occurredAt: '2026-07-20T16:00:00.000Z',
          accountStableId: 'account_old_bank',
          accountName: 'Historical Bank',
          accountClass: AccountingAccountClass.ASSET,
          accountType: AccountingAccountType.BANK,
          isActive: false,
          creditCents: 565,
        }),
        line({
          entryStableId: 'store_balance_topup',
          occurredAt: '2026-07-25T16:00:00.000Z',
          accountStableId: 'account_store_cash',
          accountName: 'Store Cash',
          accountClass: AccountingAccountClass.ASSET,
          accountType: AccountingAccountType.CASH,
          debitCents: 200,
        }),
        line({
          entryStableId: 'store_balance_topup',
          occurredAt: '2026-07-25T16:00:00.000Z',
          accountStableId: 'account_store_balance_liability',
          accountName: 'Store Balance Liability',
          accountClass: AccountingAccountClass.LIABILITY,
          creditCents: 200,
        }),
      ],
    });

    expect(result.totals).toEqual({
      openingDebitBalanceCents: 1500,
      openingCreditBalanceCents: 1500,
      periodDebitCents: 1765,
      periodCreditCents: 1765,
      closingDebitBalanceCents: 3265,
      closingCreditBalanceCents: 3265,
    });
    expect(result.openingBalanceJournal).toEqual({
      entryCount: 1,
      debitCents: 500,
      creditCents: 500,
    });

    expect(
      result.accounts.find(
        (row) => row.accountStableId === 'account_sales_discounts',
      ),
    ).toMatchObject({
      normalSide: 'CREDIT',
      periodDebitCents: 100,
      periodCreditCents: 0,
      periodNormalMovementCents: -100,
      closingDebitBalanceCents: 100,
      closingCreditBalanceCents: 0,
      closingNormalBalanceCents: -100,
    });
    expect(
      result.accounts.find((row) => row.accountStableId === 'account_old_bank'),
    ).toMatchObject({
      accountClass: AccountingAccountClass.ASSET,
      isActive: false,
      normalSide: 'DEBIT',
      closingDebitBalanceCents: 0,
      closingCreditBalanceCents: 565,
      closingNormalBalanceCents: -565,
    });
    expect(
      result.accounts.find(
        (row) => row.accountStableId === 'account_opening_balance_equity',
      ),
    ).toMatchObject({
      openingCreditBalanceCents: 500,
      periodCreditCents: 0,
    });
    expect(
      result.accounts.find(
        (row) => row.accountStableId === 'account_store_balance_liability',
      ),
    ).toMatchObject({
      normalSide: 'CREDIT',
      closingCreditBalanceCents: 200,
      closingNormalBalanceCents: 200,
    });
  });

  it('fails closed when an individual Journal entry is unbalanced', () => {
    expect(() =>
      projectAccountingTrialBalance({
        currency: 'CAD',
        fromInclusive: FROM,
        toExclusive: TO_EXCLUSIVE,
        lines: [
          line({
            entryStableId: 'broken_entry',
            occurredAt: '2026-07-10T16:00:00.000Z',
            accountStableId: 'account_store_cash',
            accountName: 'Store Cash',
            accountClass: AccountingAccountClass.ASSET,
            accountType: AccountingAccountType.CASH,
            debitCents: 1000,
          }),
          line({
            entryStableId: 'broken_entry',
            occurredAt: '2026-07-10T16:00:00.000Z',
            accountStableId: 'account_sales_revenue',
            accountName: 'Sales Revenue',
            accountClass: AccountingAccountClass.REVENUE,
            creditCents: 999,
          }),
        ],
      }),
    ).toThrow(
      'Unbalanced Journal entry in Trial Balance projection: broken_entry',
    );
  });

  it('fails closed on mixed-currency account input', () => {
    const mixedCurrency = line({
      entryStableId: 'mixed_currency',
      occurredAt: '2026-07-10T16:00:00.000Z',
      accountStableId: 'account_store_cash',
      accountName: 'Store Cash',
      accountClass: AccountingAccountClass.ASSET,
      accountType: AccountingAccountType.CASH,
      debitCents: 1000,
    });
    mixedCurrency.account.currency = 'USD';

    expect(() =>
      projectAccountingTrialBalance({
        currency: 'CAD',
        fromInclusive: FROM,
        toExclusive: TO_EXCLUSIVE,
        lines: [mixedCurrency],
      }),
    ).toThrow('Trial Balance account currency mismatch: account_store_cash');
  });
});
