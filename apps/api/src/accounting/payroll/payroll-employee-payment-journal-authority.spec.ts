import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalSource,
} from '../accounting-contracts';
import { normalizeJournalCreate } from '../accounting-journal-policy';
import {
  assertPayrollEmployeePaymentJournalAuthority,
  buildPayrollEmployeePaymentWritePlan,
  PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
  type PayrollEmployeePaymentAccountFact,
  type PayrollEmployeePaymentFactV1,
} from './payroll-employee-payment-journal-authority';

const fact = (): PayrollEmployeePaymentFactV1 => ({
  paymentStableId: 'payroll_payment_1',
  runStableId: 'payroll_run_1',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  postedAccrualJournalEntryStableId: 'journal_payroll_accrual_1',
  storeStableId: '4750_Yonge_Street',
  paymentDate: '2026-09-18',
  paymentAccountStableId: 'account_primary_bank',
  amountCents: 130_000,
});

const accountFacts = (
  paymentType: 'BANK' | 'CASH' | 'PLATFORM_WALLET' = AccountingAccountType.BANK,
): PayrollEmployeePaymentAccountFact[] => [
  {
    accountStableId: PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
    accountClass: AccountingAccountClass.LIABILITY,
    accountType: null,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: 'account_primary_bank',
    accountClass: AccountingAccountClass.ASSET,
    accountType: paymentType,
    currency: 'CAD',
    isActive: true,
  },
];

describe('Payroll employee payment Journal authority', () => {
  it('clears only net-pay payable against the selected bank account', () => {
    const plan = buildPayrollEmployeePaymentWritePlan({
      fact: fact(),
      accountFacts: accountFacts(),
    });

    expect(plan.journal).toEqual(
      expect.objectContaining({
        source: AccountingJournalSource.PAYROLL,
        sourceFactType: 'payroll.employee-payment.v1',
        sourceFactStableId: 'payroll_payment_1',
        occurredAt: '2026-09-18',
        currency: 'CAD',
        lines: [
          {
            accountStableId: PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
            debitCents: 130_000,
            memo: 'Clear employee net pay payable',
          },
          {
            accountStableId: 'account_primary_bank',
            creditCents: 130_000,
            memo: 'Employee payroll payment',
          },
        ],
      }),
    );
    expect(plan.journal.lines.some((line) => line.categoryStableId)).toBe(false);
    expect(
      plan.journal.lines.some((line) =>
        line.accountStableId.includes('wages_expense'),
      ),
    ).toBe(false);
  });

  it('accepts CASH but rejects PLATFORM_WALLET as a payroll payment source', () => {
    expect(() =>
      buildPayrollEmployeePaymentWritePlan({
        fact: fact(),
        accountFacts: accountFacts(AccountingAccountType.CASH),
      }),
    ).not.toThrow();

    expect(() =>
      buildPayrollEmployeePaymentWritePlan({
        fact: fact(),
        accountFacts: accountFacts(AccountingAccountType.PLATFORM_WALLET),
      }),
    ).toThrow(
      'Payroll employee payment source must be an active CAD BANK or CASH asset account',
    );
  });

  it('requires a positive full-settlement amount', () => {
    expect(() =>
      buildPayrollEmployeePaymentWritePlan({
        fact: { ...fact(), amountCents: 0 },
        accountFacts: accountFacts(),
      }),
    ).toThrow('amountCents must be a positive safe integer');
  });

  it('rejects a Journal payload changed after authority was frozen', () => {
    const plan = buildPayrollEmployeePaymentWritePlan({
      fact: fact(),
      accountFacts: accountFacts(),
    });
    const tampered = normalizeJournalCreate({
      ...plan.journal,
      lines: [
        {
          accountStableId: PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
          debitCents: 129_999,
        },
        {
          accountStableId: 'account_primary_bank',
          creditCents: 129_999,
        },
      ],
    });

    expect(() =>
      assertPayrollEmployeePaymentJournalAuthority(tampered, plan.authority),
    ).toThrow(
      'Payroll employee payment Journal does not match its frozen Payroll authority',
    );
  });
});
