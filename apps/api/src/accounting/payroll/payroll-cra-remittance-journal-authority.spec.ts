import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalSource,
} from '../accounting-contracts';
import { normalizeJournalCreate } from '../accounting-journal-policy';
import {
  assertPayrollCraRemittanceJournalAuthority,
  buildPayrollCraRemittanceWritePlan,
  type PayrollCraRemittanceAccountFact,
  type PayrollCraRemittanceFactV1,
} from './payroll-cra-remittance-journal-authority';
import { buildPayrollCraRemittancePreview } from './payroll-cra-remittance-evidence';
import { PAYROLL_ACCOUNT_IDS } from './payroll-journal-write-authority';
import { PayrollRemitterType } from './payroll-contracts';

const preview = () =>
  buildPayrollCraRemittancePreview({
    employerStableId: 'employer_sanq',
    remitterType: PayrollRemitterType.REGULAR,
    remittancePolicyVersion: 'CA-CRA-REMIT-2026-V1',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    dueDate: '2026-10-15',
    includedRuns: [
      {
        runStableId: 'payroll_run_1',
        employerConfigStableId: 'config_regular',
        calculationHash: 'sha256:' + 'a'.repeat(64),
        postedAccrualJournalEntryStableId: 'journal_payroll_accrual_1',
        payDate: '2026-09-18',
        incomeTaxCents: 20_000,
        employeeCppCents: 8_000,
        employeeCpp2Cents: 1_000,
        employerCppCents: 8_000,
        employerCpp2Cents: 1_000,
        employeeEiCents: 3_000,
        employerEiCents: 4_200,
        craRemittanceCents: 45_200,
      },
    ],
  });

const fact = (): PayrollCraRemittanceFactV1 => ({
  remittanceStableId: 'cra_remittance_1',
  ...preview(),
  paymentAccountStableId: 'account_primary_bank',
  paymentDate: '2026-10-20',
});

const accountFacts = (
  paymentType: 'BANK' | 'CASH' | 'PLATFORM_WALLET' = AccountingAccountType.BANK,
): PayrollCraRemittanceAccountFact[] => [
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    accountClass: AccountingAccountClass.LIABILITY,
    accountType: null,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
    accountClass: AccountingAccountClass.LIABILITY,
    accountType: null,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
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

describe('Payroll CRA remittance Journal authority', () => {
  it('clears only Payroll statutory liabilities against the selected bank account', () => {
    const plan = buildPayrollCraRemittanceWritePlan({
      fact: fact(),
      accountFacts: accountFacts(),
    });

    expect(plan.journal).toEqual(
      expect.objectContaining({
        source: AccountingJournalSource.PAYROLL,
        sourceFactType: 'payroll.cra_remittance.v1',
        sourceFactStableId: 'cra_remittance_1',
        storeStableId: null,
        occurredAt: '2026-10-20',
        currency: 'CAD',
        lines: [
          {
            accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
            debitCents: 20_000,
            memo: 'Clear payroll income tax payable',
          },
          {
            accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
            debitCents: 18_000,
            memo: 'Clear CPP/CPP2 payable',
          },
          {
            accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
            debitCents: 7_200,
            memo: 'Clear EI payable',
          },
          {
            accountStableId: 'account_primary_bank',
            creditCents: 45_200,
            memo: 'CRA payroll remittance payment',
          },
        ],
      }),
    );
    expect(plan.journal.lines.some((line) => line.categoryStableId)).toBe(
      false,
    );
    expect(
      plan.journal.lines.some(
        (line) =>
          line.accountStableId === PAYROLL_ACCOUNT_IDS.wagesExpense ||
          line.accountStableId ===
            PAYROLL_ACCOUNT_IDS.employerContributionsExpense,
      ),
    ).toBe(false);
  });

  it('allows a payment after the due date but requires a BANK source', () => {
    expect(() =>
      buildPayrollCraRemittanceWritePlan({
        fact: fact(),
        accountFacts: accountFacts(AccountingAccountType.BANK),
      }),
    ).not.toThrow();

    expect(() =>
      buildPayrollCraRemittanceWritePlan({
        fact: fact(),
        accountFacts: accountFacts(AccountingAccountType.CASH),
      }),
    ).toThrow(
      'Payroll CRA remittance source must be an active CAD BANK asset account',
    );
    expect(() =>
      buildPayrollCraRemittanceWritePlan({
        fact: fact(),
        accountFacts: accountFacts(AccountingAccountType.PLATFORM_WALLET),
      }),
    ).toThrow(
      'Payroll CRA remittance source must be an active CAD BANK asset account',
    );
  });

  it('rejects a payment date before the latest included Payroll pay date', () => {
    expect(() =>
      buildPayrollCraRemittanceWritePlan({
        fact: { ...fact(), paymentDate: '2026-09-17' },
        accountFacts: accountFacts(),
      }),
    ).toThrow(
      'CRA remittance paymentDate cannot be before the latest included Payroll payDate',
    );
  });

  it('rejects parent totals that do not match canonical frozen run evidence', () => {
    expect(() =>
      buildPayrollCraRemittanceWritePlan({
        fact: { ...fact(), totalAmountCents: 45_199 },
        accountFacts: accountFacts(),
      }),
    ).toThrow('does not match its canonical frozen evidence');
  });

  it('rejects a Journal payload changed after authority was frozen', () => {
    const plan = buildPayrollCraRemittanceWritePlan({
      fact: fact(),
      accountFacts: accountFacts(),
    });
    const tampered = normalizeJournalCreate({
      ...plan.journal,
      lines: [
        {
          accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
          debitCents: 19_999,
        },
        {
          accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
          debitCents: 18_000,
        },
        {
          accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
          debitCents: 7_200,
        },
        {
          accountStableId: 'account_primary_bank',
          creditCents: 45_199,
        },
      ],
    });

    expect(() =>
      assertPayrollCraRemittanceJournalAuthority(tampered, plan.authority),
    ).toThrow(
      'Payroll CRA remittance Journal does not match its frozen Payroll authority',
    );
  });
});
