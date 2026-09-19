import {
  AccountingAccountClass,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '../accounting-contracts';
import { normalizeJournalCreate } from '../accounting-journal-policy';
import {
  assertPayrollRunAccrualJournalAuthority,
  buildPayrollRunAccrualWritePlan,
  PAYROLL_ACCOUNT_IDS,
  PAYROLL_RUN_ACCRUAL_SOURCE_FACT_TYPE,
  type PayrollAccountFact,
  type PayrollRunAccrualFactV1,
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

const fact = (
  overrides: Partial<PayrollRunAccrualFactV1> = {},
): PayrollRunAccrualFactV1 => ({
  runStableId: 'payroll_run_1',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  approvedAt: '2026-09-18T13:00:00.000Z',
  storeStableId: '4750_Yonge_Street',
  payDate: '2026-07-03',
  accrualDate: '2026-06-30',
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
  ...overrides,
});

describe('Payroll accrual Journal write authority', () => {
  it('maps one frozen Payroll run to the balanced permitted accrual accounts', () => {
    const plan = buildPayrollRunAccrualWritePlan({
      fact: fact(),
      accountFacts: accountFacts(),
    });

    expect(plan.journal).toMatchObject({
      idempotencyKey: 'payroll-run-accrual:payroll_run_1:v1',
      kind: AccountingJournalEntryKind.STANDARD,
      source: AccountingJournalSource.PAYROLL,
      sourceFactType: PAYROLL_RUN_ACCRUAL_SOURCE_FACT_TYPE,
      sourceFactStableId: 'payroll_run_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-06-30',
      currency: 'CAD',
    });
    expect(plan.journal.lines).toEqual([
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.wagesExpense,
        categoryStableId: 'expense_labor',
        debitCents: 166_400,
        memo: 'Payroll compensation expense',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.employerContributionsExpense,
        categoryStableId: 'expense_labor',
        debitCents: 10_800,
        memo: 'Employer CPP/CPP2/EI contributions',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.netPayPayable,
        creditCents: 130_000,
        memo: 'Employee net pay payable',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
        creditCents: 20_000,
        memo: 'Income tax withheld payable',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
        creditCents: 16_000,
        memo: 'CPP/CPP2 payable',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
        creditCents: 4_800,
        memo: 'EI payable',
      },
      {
        accountStableId: PAYROLL_ACCOUNT_IDS.vacationPayable,
        creditCents: 6_400,
        memo: 'Accrued vacation payable',
      },
    ]);
    expect(plan.authority.accountPrerequisites).toHaveLength(7);

    expect(() =>
      assertPayrollRunAccrualJournalAuthority(
        normalizeJournalCreate(plan.journal),
        plan.authority,
      ),
    ).not.toThrow();
  });

  it('fails closed when a required Payroll control account is not READY', () => {
    expect(() =>
      buildPayrollRunAccrualWritePlan({
        fact: fact(),
        accountFacts: accountFacts().filter(
          (item) => item.accountStableId !== PAYROLL_ACCOUNT_IDS.cppPayable,
        ),
      }),
    ).toThrow(
      'Payroll account prerequisite is not READY: account_payroll_cpp_payable',
    );
  });

  it('rejects incoherent frozen Payroll totals before Journal creation', () => {
    expect(() =>
      buildPayrollRunAccrualWritePlan({
        fact: fact({ supportedEmployerPayrollCostCents: 185_200 }),
        accountFacts: accountFacts(),
      }),
    ).toThrow(
      'Payroll expense components do not match supportedEmployerPayrollCostCents',
    );
  });

  it('rejects a Journal payload that differs from its frozen authority', () => {
    const plan = buildPayrollRunAccrualWritePlan({
      fact: fact(),
      accountFacts: accountFacts(),
    });
    const tampered = {
      ...plan.journal,
      memo: 'tampered payroll accrual',
    };

    expect(() =>
      assertPayrollRunAccrualJournalAuthority(
        normalizeJournalCreate(tampered),
        plan.authority,
      ),
    ).toThrow(
      'Payroll accrual Journal does not match its frozen Payroll authority',
    );
  });
});
