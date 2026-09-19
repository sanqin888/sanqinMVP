import { createHash } from 'node:crypto';
import {
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
import {
  buildPayrollAccountPrerequisites,
  normalizePayrollRunAccrualFact,
  PAYROLL_ACCOUNT_IDS,
  PAYROLL_LABOR_CATEGORY_STABLE_ID,
  type PayrollAccountFact,
  type PayrollAccountPrerequisiteV1,
  type PayrollRunAccrualFactV1,
} from './payroll-journal-write-authority';

export const PAYROLL_RUN_REVERSAL_SOURCE_FACT_TYPE = 'payroll.run.reversal.v1';
export const PAYROLL_RUN_REVERSAL_SOURCE_FACT_VERSION = 1;

export type PayrollRunReversalFactV1 = PayrollRunAccrualFactV1 & {
  postedAccrualJournalEntryStableId: string;
  reversedAt: string;
  reversedByActorRef: string;
  reversalReason: string;
};

export type PayrollRunReversalJournalWriteAuthorityV1 = {
  version: 1;
  role: 'RUN_REVERSAL';
  fact: PayrollRunReversalFactV1;
  accountPrerequisites: PayrollAccountPrerequisiteV1[];
};

export type PayrollRunReversalWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: PayrollRunReversalJournalWriteAuthorityV1;
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
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

const sumMoney = (field: string, ...values: number[]): number => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new AccountingJournalPolicyError(
      `${field} exceeds the safe integer range`,
    );
  }
  return total;
};

export const normalizePayrollRunReversalFact = (
  fact: PayrollRunReversalFactV1,
): PayrollRunReversalFactV1 => ({
  ...normalizePayrollRunAccrualFact(fact),
  postedAccrualJournalEntryStableId: requireValue(
    fact.postedAccrualJournalEntryStableId,
    'postedAccrualJournalEntryStableId',
  ),
  reversedAt: requireIsoDateTime(fact.reversedAt, 'reversedAt'),
  reversedByActorRef: requireValue(
    fact.reversedByActorRef,
    'reversedByActorRef',
  ),
  reversalReason: requireValue(fact.reversalReason, 'reversalReason'),
});

const pushDebit = (
  lines: AccountingJournalCreateInput['lines'],
  accountStableId: string,
  debitCents: number,
  memo: string,
): void => {
  if (debitCents <= 0) return;
  lines.push({ accountStableId, debitCents, memo });
};

const buildPayrollRunReversalJournalFromFact = (
  factRaw: PayrollRunReversalFactV1,
): AccountingJournalCreateInput => {
  const fact = normalizePayrollRunReversalFact(factRaw);
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
      creditCents: fact.compensationExpenseCents,
      memo: 'Reverse Payroll compensation expense',
    },
  ];
  if (employerContributions > 0) {
    lines.push({
      accountStableId: PAYROLL_ACCOUNT_IDS.employerContributionsExpense,
      categoryStableId: PAYROLL_LABOR_CATEGORY_STABLE_ID,
      creditCents: employerContributions,
      memo: 'Reverse employer CPP/CPP2/EI contributions',
    });
  }
  pushDebit(
    lines,
    PAYROLL_ACCOUNT_IDS.netPayPayable,
    fact.netPayCents,
    'Reverse employee net pay payable',
  );
  pushDebit(
    lines,
    PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    fact.incomeTaxCents,
    'Reverse income tax withheld payable',
  );
  pushDebit(
    lines,
    PAYROLL_ACCOUNT_IDS.cppPayable,
    cppPayable,
    'Reverse CPP/CPP2 payable',
  );
  pushDebit(
    lines,
    PAYROLL_ACCOUNT_IDS.eiPayable,
    eiPayable,
    'Reverse EI payable',
  );
  pushDebit(
    lines,
    PAYROLL_ACCOUNT_IDS.vacationPayable,
    fact.vacationPayAccruedCents,
    'Reverse accrued vacation payable',
  );

  return {
    idempotencyKey: `payroll-run-reversal:${fact.runStableId}:v1`,
    kind: AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.PAYROLL,
    sourceFactType: PAYROLL_RUN_REVERSAL_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.runStableId,
    sourceFactVersion: PAYROLL_RUN_REVERSAL_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredAt: fact.accrualDate,
    currency: 'CAD',
    memo: `Payroll reversal ${fact.runStableId}: ${fact.reversalReason}`,
    lines,
  };
};

export const buildPayrollRunReversalWritePlan = (input: {
  fact: PayrollRunReversalFactV1;
  accountFacts: PayrollAccountFact[];
}): PayrollRunReversalWritePlanV1 => {
  const fact = normalizePayrollRunReversalFact(input.fact);
  return {
    journal: buildPayrollRunReversalJournalFromFact(fact),
    authority: {
      version: 1,
      role: 'RUN_REVERSAL',
      fact,
      accountPrerequisites: buildPayrollAccountPrerequisites(
        input.accountFacts,
      ),
    },
  };
};

export const normalizePayrollRunReversalWriteAuthority = (
  authority: PayrollRunReversalJournalWriteAuthorityV1,
): PayrollRunReversalJournalWriteAuthorityV1 => {
  if (authority.version !== 1 || authority.role !== 'RUN_REVERSAL') {
    throw new AccountingJournalPolicyError(
      'Payroll reversal write authority must be RUN_REVERSAL v1',
    );
  }
  const fact = normalizePayrollRunReversalFact(authority.fact);
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
    role: 'RUN_REVERSAL',
    fact,
    accountPrerequisites,
  };
};

export const assertPayrollRunReversalJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: PayrollRunReversalJournalWriteAuthorityV1,
): void => {
  const authority = normalizePayrollRunReversalWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildPayrollRunReversalJournalFromFact(authority.fact),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll reversal Journal does not match its frozen Payroll authority',
    );
  }
};

export const hashPayrollRunReversalJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: PayrollRunReversalJournalWriteAuthorityV1,
): string => {
  const authority = normalizePayrollRunReversalWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
