import {
  AccountingAccountClass,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '../accounting-contracts';
import {
  buildPayrollRunReversalWritePlan,
  PAYROLL_RUN_REVERSAL_SOURCE_FACT_TYPE,
  type PayrollRunReversalFactV1,
} from './payroll-reversal-journal-authority';
import {
  PAYROLL_ACCOUNT_IDS,
  type PayrollAccountFact,
} from './payroll-journal-write-authority';

const accountFacts = (): PayrollAccountFact[] => [
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.wagesExpense,
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.employerContributionsExpense,
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  ...[
    PAYROLL_ACCOUNT_IDS.netPayPayable,
    PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    PAYROLL_ACCOUNT_IDS.cppPayable,
    PAYROLL_ACCOUNT_IDS.eiPayable,
    PAYROLL_ACCOUNT_IDS.vacationPayable,
  ].map((accountStableId) => ({
    accountStableId,
    accountClass: AccountingAccountClass.LIABILITY,
    currency: 'CAD',
    isActive: true,
  })),
];

const reversalFact = (): PayrollRunReversalFactV1 => ({
  runStableId: 'payroll_run_1',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  approvedAt: '2026-09-18T13:00:00.000Z',
  postedAccrualJournalEntryStableId: 'journal_payroll_accrual_1',
  storeStableId: '4750_Yonge_Street',
  payDate: '2026-09-18',
  grossPayCents: 160_000,
  totalEmployeeDeductionsCents: 30_000,
  netPayCents: 130_000,
  incomeTaxCents: 20_000,
  employeeCppCents: 8_000,
  employeeCpp2Cents: 0,
  employeeEiCents: 2_000,
  employerCppCents: 8_000,
  employerCpp2Cents: 0,
  employerEiCents: 2_800,
  vacationPayAccruedCents: 6_400,
  compensationExpenseCents: 166_400,
  craRemittanceCents: 40_800,
  supportedEmployerPayrollCostCents: 177_200,
  reversedAt: '2026-09-18T22:00:00.000Z',
  reversedByActorRef: 'actor_reverse',
  reversalReason: 'Incorrect regular hours',
});

describe('Payroll run reversal Journal authority', () => {
  it('builds an exact STANDARD inverse of the D1 Payroll accrual', () => {
    const plan = buildPayrollRunReversalWritePlan({
      fact: reversalFact(),
      accountFacts: accountFacts(),
    });

    expect(plan.journal).toEqual(
      expect.objectContaining({
        idempotencyKey: 'payroll-run-reversal:payroll_run_1:v1',
        kind: AccountingJournalEntryKind.STANDARD,
        source: AccountingJournalSource.PAYROLL,
        sourceFactType: PAYROLL_RUN_REVERSAL_SOURCE_FACT_TYPE,
        sourceFactStableId: 'payroll_run_1',
        sourceFactVersion: 1,
        occurredAt: '2026-09-18',
        storeStableId: '4750_Yonge_Street',
      }),
    );
    expect(plan.journal.lines).toEqual([
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.wagesExpense,
        categoryStableId: 'expense_labor',
        creditCents: 166_400,
        memo: 'Reverse Payroll compensation expense',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.employerContributionsExpense,
        categoryStableId: 'expense_labor',
        creditCents: 10_800,
        memo: 'Reverse employer CPP/CPP2/EI contributions',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.netPayPayable,
        debitCents: 130_000,
        memo: 'Reverse employee net pay payable',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
        debitCents: 20_000,
        memo: 'Reverse income tax withheld payable',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
        debitCents: 16_000,
        memo: 'Reverse CPP/CPP2 payable',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
        debitCents: 4_800,
        memo: 'Reverse EI payable',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.vacationPayable,
        debitCents: 6_400,
        memo: 'Reverse accrued vacation payable',
      },
    ]);
    expect(plan.authority).toEqual(
      expect.objectContaining({
        version: 1,
        role: 'RUN_REVERSAL',
        fact: expect.objectContaining({
          postedAccrualJournalEntryStableId: 'journal_payroll_accrual_1',
          reversalReason: 'Incorrect regular hours',
        }) as unknown,
      }),
    );
  });

  it('rejects incoherent frozen Payroll amounts before producing a reversal', () => {
    expect(() =>
      buildPayrollRunReversalWritePlan({
        fact: {
          ...reversalFact(),
          netPayCents: 129_999,
        },
        accountFacts: accountFacts(),
      }),
    ).toThrow('Payroll net pay plus deductions does not match grossPayCents');
  });

  it('fails closed when a required Payroll control account is unavailable', () => {
    expect(() =>
      buildPayrollRunReversalWritePlan({
        fact: reversalFact(),
        accountFacts: accountFacts().filter(
          (item) => item.accountStableId !== PAYROLL_ACCOUNT_IDS.cppPayable,
        ),
      }),
    ).toThrow(
      'Payroll account prerequisite is not READY: account_payroll_cpp_payable',
    );
  });
});
