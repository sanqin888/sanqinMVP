import { createHash } from 'node:crypto';
import {
  AccountingAccountClass,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '../accounting-contracts';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from '../accounting-journal-policy';

export const PAYROLL_RUN_ACCRUAL_SOURCE_FACT_TYPE = 'payroll.run.accrual.v1';
export const PAYROLL_RUN_ACCRUAL_SOURCE_FACT_VERSION = 1;
export const PAYROLL_LABOR_CATEGORY_STABLE_ID = 'expense_labor';

export const PAYROLL_ACCOUNT_IDS = {
  wagesExpense: 'account_payroll_wages_expense',
  employerContributionsExpense:
    'account_payroll_employer_contributions_expense',
  netPayPayable: 'account_payroll_net_pay_payable',
  incomeTaxPayable: 'account_payroll_income_tax_payable',
  cppPayable: 'account_payroll_cpp_payable',
  eiPayable: 'account_payroll_ei_payable',
  vacationPayable: 'account_payroll_vacation_payable',
} as const;

type PayrollAccountStableId =
  (typeof PAYROLL_ACCOUNT_IDS)[keyof typeof PAYROLL_ACCOUNT_IDS];

export type PayrollAccountFact = {
  accountStableId: string;
  accountClass: string;
  currency: string;
  isActive: boolean;
};

export type PayrollAccountPrerequisiteV1 = {
  accountStableId: PayrollAccountStableId;
  expected: {
    accountClass: AccountingAccountClass;
    currency: 'CAD';
    isActive: true;
  };
  actual: {
    accountClass: string;
    currency: string;
    isActive: boolean;
  };
};

export type PayrollRunAccrualFactV1 = {
  runStableId: string;
  calculationHash: string;
  approvedAt: string;
  storeStableId: string;
  payDate: string;
  grossPayCents: number;
  totalEmployeeDeductionsCents: number;
  netPayCents: number;
  incomeTaxCents: number;
  employeeCppCents: number;
  employeeCpp2Cents: number;
  employeeEiCents: number;
  employerCppCents: number;
  employerCpp2Cents: number;
  employerEiCents: number;
  vacationPayAccruedCents: number;
  compensationExpenseCents: number;
  craRemittanceCents: number;
  supportedEmployerPayrollCostCents: number;
};

export type PayrollRunAccrualJournalWriteAuthorityV1 = {
  version: 1;
  role: 'RUN_ACCRUAL';
  fact: PayrollRunAccrualFactV1;
  accountPrerequisites: PayrollAccountPrerequisiteV1[];
};

export type PayrollRunAccrualWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: PayrollRunAccrualJournalWriteAuthorityV1;
};

const ACCOUNT_REQUIREMENTS: ReadonlyArray<{
  accountStableId: PayrollAccountStableId;
  accountClass: AccountingAccountClass;
}> = [
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.wagesExpense,
    accountClass: AccountingAccountClass.EXPENSE,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.employerContributionsExpense,
    accountClass: AccountingAccountClass.EXPENSE,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.netPayPayable,
    accountClass: AccountingAccountClass.LIABILITY,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    accountClass: AccountingAccountClass.LIABILITY,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
    accountClass: AccountingAccountClass.LIABILITY,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
    accountClass: AccountingAccountClass.LIABILITY,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.vacationPayable,
    accountClass: AccountingAccountClass.LIABILITY,
  },
];

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  return value;
};

const requireDateOnly = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new AccountingJournalPolicyError(
      `${field} must be a valid ISO date-only value`,
    );
  }
  return value;
};

const requireIsoDateTime = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountingJournalPolicyError(
      `${field} must be an ISO date-time value`,
    );
  }
  return parsed.toISOString();
};

const requireSha256 = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new AccountingJournalPolicyError(
      `${field} must use the frozen sha256:<hex> Payroll evidence format`,
    );
  }
  return value;
};

const requireMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a non-negative safe integer`,
    );
  }
  return value;
};

const sumMoney = (field: string, ...values: number[]): number => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new AccountingJournalPolicyError(
      `${field} exceeds the safe integer range`,
    );
  }
  return total;
};

export const normalizePayrollRunAccrualFact = (
  fact: PayrollRunAccrualFactV1,
): PayrollRunAccrualFactV1 => {
  const normalized: PayrollRunAccrualFactV1 = {
    runStableId: requireValue(fact.runStableId, 'runStableId'),
    calculationHash: requireSha256(fact.calculationHash, 'calculationHash'),
    approvedAt: requireIsoDateTime(fact.approvedAt, 'approvedAt'),
    storeStableId: requireValue(fact.storeStableId, 'storeStableId'),
    payDate: requireDateOnly(fact.payDate, 'payDate'),
    grossPayCents: requireMoney(fact.grossPayCents, 'grossPayCents'),
    totalEmployeeDeductionsCents: requireMoney(
      fact.totalEmployeeDeductionsCents,
      'totalEmployeeDeductionsCents',
    ),
    netPayCents: requireMoney(fact.netPayCents, 'netPayCents'),
    incomeTaxCents: requireMoney(fact.incomeTaxCents, 'incomeTaxCents'),
    employeeCppCents: requireMoney(fact.employeeCppCents, 'employeeCppCents'),
    employeeCpp2Cents: requireMoney(
      fact.employeeCpp2Cents,
      'employeeCpp2Cents',
    ),
    employeeEiCents: requireMoney(fact.employeeEiCents, 'employeeEiCents'),
    employerCppCents: requireMoney(fact.employerCppCents, 'employerCppCents'),
    employerCpp2Cents: requireMoney(
      fact.employerCpp2Cents,
      'employerCpp2Cents',
    ),
    employerEiCents: requireMoney(fact.employerEiCents, 'employerEiCents'),
    vacationPayAccruedCents: requireMoney(
      fact.vacationPayAccruedCents,
      'vacationPayAccruedCents',
    ),
    compensationExpenseCents: requireMoney(
      fact.compensationExpenseCents,
      'compensationExpenseCents',
    ),
    craRemittanceCents: requireMoney(
      fact.craRemittanceCents,
      'craRemittanceCents',
    ),
    supportedEmployerPayrollCostCents: requireMoney(
      fact.supportedEmployerPayrollCostCents,
      'supportedEmployerPayrollCostCents',
    ),
  };

  const employeeDeductions = sumMoney(
    'employee deductions',
    normalized.incomeTaxCents,
    normalized.employeeCppCents,
    normalized.employeeCpp2Cents,
    normalized.employeeEiCents,
  );
  if (employeeDeductions !== normalized.totalEmployeeDeductionsCents) {
    throw new AccountingJournalPolicyError(
      'Payroll employee deduction components do not match totalEmployeeDeductionsCents',
    );
  }
  if (
    sumMoney(
      'gross reconciliation',
      normalized.netPayCents,
      employeeDeductions,
    ) !== normalized.grossPayCents
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll net pay plus deductions does not match grossPayCents',
    );
  }

  const employerContributions = sumMoney(
    'employer contributions',
    normalized.employerCppCents,
    normalized.employerCpp2Cents,
    normalized.employerEiCents,
  );
  const craRemittance = sumMoney(
    'CRA remittance',
    employeeDeductions,
    employerContributions,
  );
  if (craRemittance !== normalized.craRemittanceCents) {
    throw new AccountingJournalPolicyError(
      'Payroll CRA components do not match craRemittanceCents',
    );
  }
  if (
    sumMoney(
      'supported employer payroll cost',
      normalized.compensationExpenseCents,
      employerContributions,
    ) !== normalized.supportedEmployerPayrollCostCents
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll expense components do not match supportedEmployerPayrollCostCents',
    );
  }
  if (
    normalized.compensationExpenseCents !==
    sumMoney(
      'compensation expense',
      normalized.grossPayCents,
      normalized.vacationPayAccruedCents,
    )
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll gross pay plus accrued vacation does not match compensationExpenseCents',
    );
  }
  if (normalized.compensationExpenseCents === 0) {
    throw new AccountingJournalPolicyError(
      'Zero-value Payroll compensation cannot create an accrual Journal',
    );
  }

  return normalized;
};

export const buildPayrollAccountPrerequisites = (
  accountFacts: PayrollAccountFact[],
): PayrollAccountPrerequisiteV1[] => {
  const byStableId = new Map(
    accountFacts.map((fact) => [fact.accountStableId, fact] as const),
  );

  return ACCOUNT_REQUIREMENTS.map((requirement) => {
    const actual = byStableId.get(requirement.accountStableId);
    if (
      !actual ||
      actual.accountClass !== requirement.accountClass ||
      actual.currency !== 'CAD' ||
      !actual.isActive
    ) {
      throw new AccountingJournalPolicyError(
        `Payroll account prerequisite is not READY: ${requirement.accountStableId}`,
      );
    }
    return {
      accountStableId: requirement.accountStableId,
      expected: {
        accountClass: requirement.accountClass,
        currency: 'CAD' as const,
        isActive: true as const,
      },
      actual: {
        accountClass: actual.accountClass,
        currency: actual.currency,
        isActive: actual.isActive,
      },
    };
  }).sort((left, right) =>
    left.accountStableId.localeCompare(right.accountStableId),
  );
};

const pushCredit = (
  lines: AccountingJournalCreateInput['lines'],
  accountStableId: PayrollAccountStableId,
  creditCents: number,
  memo: string,
): void => {
  if (creditCents <= 0) return;
  lines.push({ accountStableId, creditCents, memo });
};

const buildPayrollRunAccrualJournalFromFact = (
  factRaw: PayrollRunAccrualFactV1,
): AccountingJournalCreateInput => {
  const fact = normalizePayrollRunAccrualFact(factRaw);
  const employerContributions = sumMoney(
    'employer contributions',
    fact.employerCppCents,
    fact.employerCpp2Cents,
    fact.employerEiCents,
  );
  const cppPayable = sumMoney(
    'CPP payable',
    fact.employeeCppCents,
    fact.employeeCpp2Cents,
    fact.employerCppCents,
    fact.employerCpp2Cents,
  );
  const eiPayable = sumMoney(
    'EI payable',
    fact.employeeEiCents,
    fact.employerEiCents,
  );

  const lines: AccountingJournalCreateInput['lines'] = [
    {
      accountStableId: PAYROLL_ACCOUNT_IDS.wagesExpense,
      categoryStableId: PAYROLL_LABOR_CATEGORY_STABLE_ID,
      debitCents: fact.compensationExpenseCents,
      memo: 'Payroll compensation expense',
    },
  ];
  if (employerContributions > 0) {
    lines.push({
      accountStableId: PAYROLL_ACCOUNT_IDS.employerContributionsExpense,
      categoryStableId: PAYROLL_LABOR_CATEGORY_STABLE_ID,
      debitCents: employerContributions,
      memo: 'Employer CPP/CPP2/EI contributions',
    });
  }
  pushCredit(
    lines,
    PAYROLL_ACCOUNT_IDS.netPayPayable,
    fact.netPayCents,
    'Employee net pay payable',
  );
  pushCredit(
    lines,
    PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    fact.incomeTaxCents,
    'Income tax withheld payable',
  );
  pushCredit(
    lines,
    PAYROLL_ACCOUNT_IDS.cppPayable,
    cppPayable,
    'CPP/CPP2 payable',
  );
  pushCredit(lines, PAYROLL_ACCOUNT_IDS.eiPayable, eiPayable, 'EI payable');
  pushCredit(
    lines,
    PAYROLL_ACCOUNT_IDS.vacationPayable,
    fact.vacationPayAccruedCents,
    'Accrued vacation payable',
  );

  return {
    idempotencyKey: `payroll-run-accrual:${fact.runStableId}:v1`,
    kind: AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.PAYROLL,
    sourceFactType: PAYROLL_RUN_ACCRUAL_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.runStableId,
    sourceFactVersion: PAYROLL_RUN_ACCRUAL_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredAt: fact.payDate,
    currency: 'CAD',
    memo: `Payroll accrual ${fact.runStableId}`,
    lines,
  };
};

export const buildPayrollRunAccrualWritePlan = (input: {
  fact: PayrollRunAccrualFactV1;
  accountFacts: PayrollAccountFact[];
}): PayrollRunAccrualWritePlanV1 => {
  const fact = normalizePayrollRunAccrualFact(input.fact);
  const accountPrerequisites = buildPayrollAccountPrerequisites(
    input.accountFacts,
  );
  return {
    journal: buildPayrollRunAccrualJournalFromFact(fact),
    authority: {
      version: 1,
      role: 'RUN_ACCRUAL',
      fact,
      accountPrerequisites,
    },
  };
};

export const normalizePayrollRunAccrualWriteAuthority = (
  authority: PayrollRunAccrualJournalWriteAuthorityV1,
): PayrollRunAccrualJournalWriteAuthorityV1 => {
  if (authority.version !== 1 || authority.role !== 'RUN_ACCRUAL') {
    throw new AccountingJournalPolicyError(
      'Payroll accrual write authority must be RUN_ACCRUAL v1',
    );
  }
  const fact = normalizePayrollRunAccrualFact(authority.fact);
  const accountPrerequisites = buildPayrollAccountPrerequisites(
    authority.accountPrerequisites.map((item) => ({
      accountStableId: item.accountStableId,
      accountClass: item.actual.accountClass,
      currency: item.actual.currency,
      isActive: item.actual.isActive,
    })),
  );
  return {
    version: 1,
    role: 'RUN_ACCRUAL',
    fact,
    accountPrerequisites,
  };
};

export const assertPayrollRunAccrualJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: PayrollRunAccrualJournalWriteAuthorityV1,
): void => {
  const authority = normalizePayrollRunAccrualWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildPayrollRunAccrualJournalFromFact(authority.fact),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll accrual Journal does not match its frozen Payroll authority',
    );
  }
};

export const hashPayrollRunAccrualJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: PayrollRunAccrualJournalWriteAuthorityV1,
): string => {
  const authority = normalizePayrollRunAccrualWriteAuthority(authorityRaw);
  const payload = {
    journal: hashJournalCreatePayload(journal),
    authority,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};
