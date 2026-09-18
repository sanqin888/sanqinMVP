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
import {
  buildPayrollCraRemittancePreview,
  type PayrollCraRemittanceRunEvidenceV1,
} from './payroll-cra-remittance-evidence';
import { PAYROLL_ACCOUNT_IDS } from './payroll-journal-write-authority';
import type { PayrollRemitterType } from './payroll-contracts';

export const PAYROLL_CRA_REMITTANCE_SOURCE_FACT_TYPE =
  'payroll.cra_remittance.v1';
export const PAYROLL_CRA_REMITTANCE_SOURCE_FACT_VERSION = 1;

export type PayrollCraRemittanceAccountFact = {
  accountStableId: string;
  accountClass: string;
  accountType: string | null;
  currency: string;
  isActive: boolean;
};

export type PayrollCraRemittanceFactV1 = {
  remittanceStableId: string;
  employerStableId: string;
  remitterType: PayrollRemitterType;
  remittancePolicyVersion: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  includedRuns: PayrollCraRemittanceRunEvidenceV1[];
  incomeTaxCents: number;
  employeeCppCents: number;
  employeeCpp2Cents: number;
  employerCppCents: number;
  employerCpp2Cents: number;
  employeeEiCents: number;
  employerEiCents: number;
  totalAmountCents: number;
  currency: 'CAD';
  evidenceHash: string;
  paymentAccountStableId: string;
  paymentDate: string;
};

export type PayrollCraRemittanceAccountPrerequisiteV1 = {
  role:
    | 'INCOME_TAX_PAYABLE'
    | 'CPP_PAYABLE'
    | 'EI_PAYABLE'
    | 'PAYMENT_SOURCE';
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

export type PayrollCraRemittanceJournalWriteAuthorityV1 = {
  version: 1;
  role: 'CRA_REMITTANCE';
  fact: PayrollCraRemittanceFactV1;
  accountPrerequisites: PayrollCraRemittanceAccountPrerequisiteV1[];
};

export type PayrollCraRemittanceWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: PayrollCraRemittanceJournalWriteAuthorityV1;
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

const requirePositiveMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a positive safe integer`,
    );
  }
  return value;
};

export const normalizePayrollCraRemittanceFact = (
  fact: PayrollCraRemittanceFactV1,
): PayrollCraRemittanceFactV1 => {
  const remittanceStableId = requireValue(
    fact.remittanceStableId,
    'remittanceStableId',
  );
  const paymentAccountStableId = requireValue(
    fact.paymentAccountStableId,
    'paymentAccountStableId',
  );
  const paymentDate = requireDateOnly(fact.paymentDate, 'paymentDate');

  let preview: ReturnType<typeof buildPayrollCraRemittancePreview>;
  try {
    preview = buildPayrollCraRemittancePreview({
      employerStableId: fact.employerStableId,
      remitterType: fact.remitterType,
      remittancePolicyVersion: fact.remittancePolicyVersion,
      periodStart: fact.periodStart,
      periodEnd: fact.periodEnd,
      dueDate: fact.dueDate,
      includedRuns: fact.includedRuns,
    });
  } catch (error) {
    throw new AccountingJournalPolicyError(
      error instanceof Error
        ? error.message
        : 'CRA remittance evidence is invalid',
    );
  }

  if (preview.includedRuns.length === 0) {
    throw new AccountingJournalPolicyError(
      'CRA remittance requires at least one Payroll run',
    );
  }
  const firstIncludedRun = preview.includedRuns[0];
  if (!firstIncludedRun) {
    throw new AccountingJournalPolicyError(
      'CRA remittance requires Payroll run evidence',
    );
  }
  const latestPayDate = preview.includedRuns.reduce(
    (latest, run) => (run.payDate > latest ? run.payDate : latest),
    firstIncludedRun.payDate,
  );
  if (paymentDate < latestPayDate) {
    throw new AccountingJournalPolicyError(
      'CRA remittance paymentDate cannot be before the latest included Payroll payDate',
    );
  }
  requirePositiveMoney(preview.totalAmountCents, 'totalAmountCents');
  if (
    fact.currency !== 'CAD' ||
    fact.evidenceHash !== preview.evidenceHash ||
    fact.incomeTaxCents !== preview.incomeTaxCents ||
    fact.employeeCppCents !== preview.employeeCppCents ||
    fact.employeeCpp2Cents !== preview.employeeCpp2Cents ||
    fact.employerCppCents !== preview.employerCppCents ||
    fact.employerCpp2Cents !== preview.employerCpp2Cents ||
    fact.employeeEiCents !== preview.employeeEiCents ||
    fact.employerEiCents !== preview.employerEiCents ||
    fact.totalAmountCents !== preview.totalAmountCents
  ) {
    throw new AccountingJournalPolicyError(
      'CRA remittance fact does not match its canonical frozen evidence',
    );
  }

  return {
    remittanceStableId,
    ...preview,
    paymentAccountStableId,
    paymentDate,
  };
};

const findAccount = (
  accountFacts: PayrollCraRemittanceAccountFact[],
  accountStableId: string,
): PayrollCraRemittanceAccountFact => {
  const account = accountFacts.find(
    (candidate) => candidate.accountStableId === accountStableId,
  );
  if (!account) {
    throw new AccountingJournalPolicyError(
      `Payroll CRA remittance account is not provisioned: ${accountStableId}`,
    );
  }
  return account;
};

export const buildPayrollCraRemittanceAccountPrerequisites = (
  paymentAccountStableId: string,
  accountFacts: PayrollCraRemittanceAccountFact[],
): PayrollCraRemittanceAccountPrerequisiteV1[] => {
  const liabilityRequirements = [
    {
      role: 'INCOME_TAX_PAYABLE' as const,
      accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    },
    {
      role: 'CPP_PAYABLE' as const,
      accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
    },
    {
      role: 'EI_PAYABLE' as const,
      accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
    },
  ];
  const liabilities: PayrollCraRemittanceAccountPrerequisiteV1[] =
    liabilityRequirements.map((requirement) => {
      const account = findAccount(accountFacts, requirement.accountStableId);
      if (
        account.accountClass !== AccountingAccountClass.LIABILITY ||
        account.accountType !== null ||
        account.currency !== 'CAD' ||
        !account.isActive
      ) {
        throw new AccountingJournalPolicyError(
          `Payroll CRA liability account prerequisite is not READY: ${requirement.accountStableId}`,
        );
      }
      return {
        role: requirement.role,
        accountStableId: account.accountStableId,
        expected: {
          accountClass: AccountingAccountClass.LIABILITY,
          accountType: null,
          currency: 'CAD',
          isActive: true,
        },
        actual: {
          accountClass: account.accountClass,
          accountType: account.accountType,
          currency: account.currency,
          isActive: account.isActive,
        },
      };
    });

  const payment = findAccount(accountFacts, paymentAccountStableId);
  if (
    payment.accountClass !== AccountingAccountClass.ASSET ||
    payment.accountType !== AccountingAccountType.BANK ||
    payment.currency !== 'CAD' ||
    !payment.isActive
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll CRA remittance source must be an active CAD BANK asset account',
    );
  }

  const prerequisites: PayrollCraRemittanceAccountPrerequisiteV1[] = [
    ...liabilities,
    {
      role: 'PAYMENT_SOURCE',
      accountStableId: payment.accountStableId,
      expected: {
        accountClass: AccountingAccountClass.ASSET,
        accountType: AccountingAccountType.BANK,
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
  return prerequisites.sort((left, right) =>
    left.accountStableId.localeCompare(right.accountStableId),
  );
};

const pushDebit = (
  lines: AccountingJournalCreateInput['lines'],
  accountStableId: string,
  debitCents: number,
  memo: string,
): void => {
  if (debitCents <= 0) return;
  lines.push({ accountStableId, debitCents, memo });
};

const buildPayrollCraRemittanceJournalFromFact = (
  factRaw: PayrollCraRemittanceFactV1,
): AccountingJournalCreateInput => {
  const fact = normalizePayrollCraRemittanceFact(factRaw);
  const cppCents =
    fact.employeeCppCents +
    fact.employeeCpp2Cents +
    fact.employerCppCents +
    fact.employerCpp2Cents;
  const eiCents = fact.employeeEiCents + fact.employerEiCents;
  const lines: AccountingJournalCreateInput['lines'] = [];

  pushDebit(
    lines,
    PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    fact.incomeTaxCents,
    'Clear payroll income tax payable',
  );
  pushDebit(
    lines,
    PAYROLL_ACCOUNT_IDS.cppPayable,
    cppCents,
    'Clear CPP/CPP2 payable',
  );
  pushDebit(
    lines,
    PAYROLL_ACCOUNT_IDS.eiPayable,
    eiCents,
    'Clear EI payable',
  );
  lines.push({
    accountStableId: fact.paymentAccountStableId,
    creditCents: fact.totalAmountCents,
    memo: 'CRA payroll remittance payment',
  });

  return {
    idempotencyKey: `payroll-cra-remittance:${fact.remittanceStableId}:v1`,
    kind: AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.PAYROLL,
    sourceFactType: PAYROLL_CRA_REMITTANCE_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.remittanceStableId,
    sourceFactVersion: PAYROLL_CRA_REMITTANCE_SOURCE_FACT_VERSION,
    storeStableId: null,
    occurredAt: fact.paymentDate,
    currency: 'CAD',
    memo: `Payroll CRA remittance ${fact.periodStart} to ${fact.periodEnd}`,
    lines,
  };
};

export const buildPayrollCraRemittanceWritePlan = (input: {
  fact: PayrollCraRemittanceFactV1;
  accountFacts: PayrollCraRemittanceAccountFact[];
}): PayrollCraRemittanceWritePlanV1 => {
  const fact = normalizePayrollCraRemittanceFact(input.fact);
  return {
    journal: buildPayrollCraRemittanceJournalFromFact(fact),
    authority: {
      version: 1,
      role: 'CRA_REMITTANCE',
      fact,
      accountPrerequisites: buildPayrollCraRemittanceAccountPrerequisites(
        fact.paymentAccountStableId,
        input.accountFacts,
      ),
    },
  };
};

export const normalizePayrollCraRemittanceWriteAuthority = (
  authority: PayrollCraRemittanceJournalWriteAuthorityV1,
): PayrollCraRemittanceJournalWriteAuthorityV1 => {
  if (authority.version !== 1 || authority.role !== 'CRA_REMITTANCE') {
    throw new AccountingJournalPolicyError(
      'Payroll CRA remittance authority must be CRA_REMITTANCE v1',
    );
  }
  const fact = normalizePayrollCraRemittanceFact(authority.fact);
  const accountPrerequisites = buildPayrollCraRemittanceAccountPrerequisites(
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
    role: 'CRA_REMITTANCE',
    fact,
    accountPrerequisites,
  };
};

export const assertPayrollCraRemittanceJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: PayrollCraRemittanceJournalWriteAuthorityV1,
): void => {
  const authority = normalizePayrollCraRemittanceWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildPayrollCraRemittanceJournalFromFact(authority.fact),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'Payroll CRA remittance Journal does not match its frozen Payroll authority',
    );
  }
};

export const hashPayrollCraRemittanceJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: PayrollCraRemittanceJournalWriteAuthorityV1,
): string => {
  const authority = normalizePayrollCraRemittanceWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
