import { createHash } from 'node:crypto';
import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  type AccountingAccountClass as AccountingAccountClassValue,
  type AccountingAccountType as AccountingAccountTypeValue,
} from '../accounting-contracts';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from '../accounting-journal-policy';
import { PAYROLL_ACCOUNT_IDS } from './payroll-journal-write-authority';

export const PAYROLL_EMPLOYEE_PAYMENT_SOURCE_FACT_TYPE =
  'payroll.employee-payment.v1';
export const PAYROLL_EMPLOYEE_PAYMENT_SOURCE_FACT_VERSION = 1;
export const PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID =
  PAYROLL_ACCOUNT_IDS.netPayPayable;

export type PayrollEmployeePaymentAccountFact = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type PayrollEmployeePaymentFactV1 = {
  paymentStableId: string;
  runStableId: string;
  calculationHash: string;
  postedAccrualJournalEntryStableId: string;
  storeStableId: string;
  paymentDate: string;
  paymentAccountStableId: string;
  amountCents: number;
};

export type PayrollEmployeePaymentAccountPrerequisiteV1 = {
  role: 'NET_PAY_PAYABLE' | 'PAYMENT_SOURCE';
  accountStableId: string;
  expected: {
    accountClass: AccountingAccountClassValue;
    accountType: AccountingAccountTypeValue | null;
    currency: 'CAD';
    isActive: true;
  };
  actual: {
    accountClass: string;
    accountType: string | null;
    currency: string;
    isActive: boolean;
  };
};

export type PayrollEmployeePaymentJournalWriteAuthorityV1 = {
  version: 1;
  role: 'EMPLOYEE_PAYMENT';
  fact: PayrollEmployeePaymentFactV1;
  accountPrerequisites: PayrollEmployeePaymentAccountPrerequisiteV1[];
};

export type PayrollEmployeePaymentWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: PayrollEmployeePaymentJournalWriteAuthorityV1;
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  return value;
};

const requireDateOnly = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  const parsed = new Date(`${value}T00:00:00.000Z`);
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

const requireSha256 = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new AccountingJournalPolicyError(
      `${field} must use the frozen sha256:<hex> Payroll evidence format`,
    );
  }
  return value;
};

const requirePositiveMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a positive safe integer`,
    );
  }
  return value;
};

export const normalizePayrollEmployeePaymentFact = (
  fact: PayrollEmployeePaymentFactV1,
): PayrollEmployeePaymentFactV1 => ({
  paymentStableId: requireValue(fact.paymentStableId, 'paymentStableId'),
  runStableId: requireValue(fact.runStableId, 'runStableId'),
  calculationHash: requireSha256(fact.calculationHash, 'calculationHash'),
  postedAccrualJournalEntryStableId: requireValue(
    fact.postedAccrualJournalEntryStableId,
    'postedAccrualJournalEntryStableId',
  ),
  storeStableId: requireValue(fact.storeStableId, 'storeStableId'),
  paymentDate: requireDateOnly(fact.paymentDate, 'paymentDate'),
  paymentAccountStableId: requireValue(
    fact.paymentAccountStableId,
    'paymentAccountStableId',
  ),
  amountCents: requirePositiveMoney(fact.amountCents, 'amountCents'),
});

const findAccount = (
  accountFacts: PayrollEmployeePaymentAccountFact[],
  accountStableId: string,
): PayrollEmployeePaymentAccountFact => {
  const account = accountFacts.find(
    (candidate) => candidate.accountStableId === accountStableId,
  );
  if (!account) {
    throw new AccountingJournalPolicyError(
      `Payroll employee payment account is not provisioned: ${accountStableId}`,
    );
  }
  return account;
};

export const buildPayrollEmployeePaymentAccountPrerequisites = (
  paymentAccountStableId: string,
  accountFacts: PayrollEmployeePaymentAccountFact[],
): PayrollEmployeePaymentAccountPrerequisiteV1[] => {
  const payable = findAccount(
    accountFacts,
    PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
  );
  if (
    payable.accountClass !== AccountingAccountClass.LIABILITY ||
    payable.accountType !== null ||
    payable.currency !== 'CAD' ||
    !payable.isActive
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll net-pay payable account prerequisite is not READY',
    );
  }

  const payment = findAccount(accountFacts, paymentAccountStableId);
  if (
    payment.accountClass !== AccountingAccountClass.ASSET ||
    (payment.accountType !== AccountingAccountType.BANK &&
      payment.accountType !== AccountingAccountType.CASH) ||
    payment.currency !== 'CAD' ||
    !payment.isActive
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll employee payment source must be an active CAD BANK or CASH asset account',
    );
  }

  return [
    {
      role: 'NET_PAY_PAYABLE',
      accountStableId: payable.accountStableId,
      expected: {
        accountClass: AccountingAccountClass.LIABILITY,
        accountType: null,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: payable.accountClass,
        accountType: payable.accountType,
        currency: payable.currency,
        isActive: payable.isActive,
      },
    },
    {
      role: 'PAYMENT_SOURCE',
      accountStableId: payment.accountStableId,
      expected: {
        accountClass: AccountingAccountClass.ASSET,
        accountType: payment.accountType as AccountingAccountTypeValue,
        currency: 'CAD',
        isActive: true,
      },
      actual: {
        accountClass: payment.accountClass,
        accountType: payment.accountType,
        currency: payment.currency,
        isActive: payment.isActive,
      },
    },
  ];
};

const buildPayrollEmployeePaymentJournalFromFact = (
  factRaw: PayrollEmployeePaymentFactV1,
): AccountingJournalCreateInput => {
  const fact = normalizePayrollEmployeePaymentFact(factRaw);
  return {
    idempotencyKey: `payroll-employee-payment:${fact.paymentStableId}:v1`,
    kind: AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.PAYROLL,
    sourceFactType: PAYROLL_EMPLOYEE_PAYMENT_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.paymentStableId,
    sourceFactVersion: PAYROLL_EMPLOYEE_PAYMENT_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredAt: fact.paymentDate,
    currency: 'CAD',
    memo: `Payroll employee payment ${fact.runStableId}`,
    lines: [
      {
        accountStableId: PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
        debitCents: fact.amountCents,
        memo: 'Clear employee net pay payable',
      },
      {
        accountStableId: fact.paymentAccountStableId,
        creditCents: fact.amountCents,
        memo: 'Employee payroll payment',
      },
    ],
  };
};

export const buildPayrollEmployeePaymentWritePlan = (input: {
  fact: PayrollEmployeePaymentFactV1;
  accountFacts: PayrollEmployeePaymentAccountFact[];
}): PayrollEmployeePaymentWritePlanV1 => {
  const fact = normalizePayrollEmployeePaymentFact(input.fact);
  return {
    journal: buildPayrollEmployeePaymentJournalFromFact(fact),
    authority: {
      version: 1,
      role: 'EMPLOYEE_PAYMENT',
      fact,
      accountPrerequisites: buildPayrollEmployeePaymentAccountPrerequisites(
        fact.paymentAccountStableId,
        input.accountFacts,
      ),
    },
  };
};

export const normalizePayrollEmployeePaymentWriteAuthority = (
  authority: PayrollEmployeePaymentJournalWriteAuthorityV1,
): PayrollEmployeePaymentJournalWriteAuthorityV1 => {
  if (authority.version !== 1 || authority.role !== 'EMPLOYEE_PAYMENT') {
    throw new AccountingJournalPolicyError(
      'Payroll employee payment authority must be EMPLOYEE_PAYMENT v1',
    );
  }
  const fact = normalizePayrollEmployeePaymentFact(authority.fact);
  const accountPrerequisites = buildPayrollEmployeePaymentAccountPrerequisites(
    fact.paymentAccountStableId,
    authority.accountPrerequisites.map((item) => ({
      accountStableId: item.accountStableId,
      accountClass: item.actual.accountClass,
      accountType: item.actual.accountType,
      currency: item.actual.currency,
      isActive: item.actual.isActive,
    })),
  );
  return {
    version: 1,
    role: 'EMPLOYEE_PAYMENT',
    fact,
    accountPrerequisites,
  };
};

export const assertPayrollEmployeePaymentJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: PayrollEmployeePaymentJournalWriteAuthorityV1,
): void => {
  const authority = normalizePayrollEmployeePaymentWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildPayrollEmployeePaymentJournalFromFact(authority.fact),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll employee payment Journal does not match its frozen Payroll authority',
    );
  }
};

export const hashPayrollEmployeePaymentJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: PayrollEmployeePaymentJournalWriteAuthorityV1,
): string => {
  const authority = normalizePayrollEmployeePaymentWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
