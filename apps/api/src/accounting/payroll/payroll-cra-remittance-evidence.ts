import { createHash } from 'node:crypto';
import { canonicalPayrollJson } from './payroll-calculation-evidence';
import {
  PayrollRemitterType,
  type PayrollRemitterType as PayrollRemitterTypeValue,
} from './payroll-contracts';

export type PayrollCraRemittanceRunEvidenceV1 = {
  runStableId: string;
  employerConfigStableId: string;
  calculationHash: string;
  postedAccrualJournalEntryStableId: string;
  payDate: string;
  incomeTaxCents: number;
  employeeCppCents: number;
  employeeCpp2Cents: number;
  employerCppCents: number;
  employerCpp2Cents: number;
  employeeEiCents: number;
  employerEiCents: number;
  craRemittanceCents: number;
};

export type PayrollCraRemittancePreviewV1 = {
  employerStableId: string;
  remitterType: PayrollRemitterTypeValue;
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
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new Error(field + ' is required');
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
    throw new Error(field + ' must be a valid ISO date-only value');
  }
  return value;
};

const requireSha256 = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(field + ' must use sha256:<hex> format');
  }
  return value;
};

const requireMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative safe integer');
  }
  return value;
};

const sumMoney = (field: string, ...values: number[]): number => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error(field + ' exceeds the safe integer range');
  }
  return total;
};

const normalizeRun = (
  raw: PayrollCraRemittanceRunEvidenceV1,
): PayrollCraRemittanceRunEvidenceV1 => {
  const run = {
    runStableId: requireValue(raw.runStableId, 'runStableId'),
    employerConfigStableId: requireValue(
      raw.employerConfigStableId,
      'employerConfigStableId',
    ),
    calculationHash: requireSha256(raw.calculationHash, 'calculationHash'),
    postedAccrualJournalEntryStableId: requireValue(
      raw.postedAccrualJournalEntryStableId,
      'postedAccrualJournalEntryStableId',
    ),
    payDate: requireDateOnly(raw.payDate, 'payDate'),
    incomeTaxCents: requireMoney(raw.incomeTaxCents, 'incomeTaxCents'),
    employeeCppCents: requireMoney(raw.employeeCppCents, 'employeeCppCents'),
    employeeCpp2Cents: requireMoney(raw.employeeCpp2Cents, 'employeeCpp2Cents'),
    employerCppCents: requireMoney(raw.employerCppCents, 'employerCppCents'),
    employerCpp2Cents: requireMoney(raw.employerCpp2Cents, 'employerCpp2Cents'),
    employeeEiCents: requireMoney(raw.employeeEiCents, 'employeeEiCents'),
    employerEiCents: requireMoney(raw.employerEiCents, 'employerEiCents'),
    craRemittanceCents: requireMoney(
      raw.craRemittanceCents,
      'craRemittanceCents',
    ),
  };
  const componentTotal = sumMoney(
    'run CRA remittance components',
    run.incomeTaxCents,
    run.employeeCppCents,
    run.employeeCpp2Cents,
    run.employerCppCents,
    run.employerCpp2Cents,
    run.employeeEiCents,
    run.employerEiCents,
  );
  if (componentTotal !== run.craRemittanceCents) {
    throw new Error(
      'Payroll run CRA components do not match craRemittanceCents: ' +
        run.runStableId,
    );
  }
  return run;
};

export const buildPayrollCraRemittancePreview = (input: {
  employerStableId: string;
  remitterType: PayrollRemitterTypeValue;
  remittancePolicyVersion: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  includedRuns: PayrollCraRemittanceRunEvidenceV1[];
}): PayrollCraRemittancePreviewV1 => {
  const employerStableId = requireValue(
    input.employerStableId,
    'employerStableId',
  );
  if (!Object.values(PayrollRemitterType).includes(input.remitterType)) {
    throw new Error('remitterType is invalid');
  }
  const remittancePolicyVersion = requireValue(
    input.remittancePolicyVersion,
    'remittancePolicyVersion',
  );
  const periodStart = requireDateOnly(input.periodStart, 'periodStart');
  const periodEnd = requireDateOnly(input.periodEnd, 'periodEnd');
  const dueDate = requireDateOnly(input.dueDate, 'dueDate');
  if (periodStart > periodEnd) {
    throw new Error('remittance periodStart cannot be after periodEnd');
  }

  const includedRuns = input.includedRuns
    .map(normalizeRun)
    .sort((left, right) => left.runStableId.localeCompare(right.runStableId));
  const duplicateRun = includedRuns.find(
    (run, index) =>
      index > 0 && run.runStableId === includedRuns[index - 1]?.runStableId,
  );
  if (duplicateRun) {
    throw new Error(
      'duplicate Payroll run in CRA remittance evidence: ' +
        duplicateRun.runStableId,
    );
  }
  for (const run of includedRuns) {
    if (run.payDate < periodStart || run.payDate > periodEnd) {
      throw new Error(
        'Payroll run payDate is outside the CRA remittance period: ' +
          run.runStableId,
      );
    }
  }

  const sum = (field: keyof PayrollCraRemittanceRunEvidenceV1): number =>
    includedRuns.reduce((total, run) => {
      const value = run[field];
      if (typeof value !== 'number') {
        throw new Error(String(field) + ' is not a money component');
      }
      return sumMoney(String(field), total, value);
    }, 0);

  const totals = {
    incomeTaxCents: sum('incomeTaxCents'),
    employeeCppCents: sum('employeeCppCents'),
    employeeCpp2Cents: sum('employeeCpp2Cents'),
    employerCppCents: sum('employerCppCents'),
    employerCpp2Cents: sum('employerCpp2Cents'),
    employeeEiCents: sum('employeeEiCents'),
    employerEiCents: sum('employerEiCents'),
  };
  const totalAmountCents = sumMoney(
    'CRA remittance total',
    totals.incomeTaxCents,
    totals.employeeCppCents,
    totals.employeeCpp2Cents,
    totals.employerCppCents,
    totals.employerCpp2Cents,
    totals.employeeEiCents,
    totals.employerEiCents,
  );

  const evidence = {
    employerStableId,
    remitterType: input.remitterType,
    remittancePolicyVersion,
    periodStart,
    periodEnd,
    dueDate,
    includedRuns,
    ...totals,
    totalAmountCents,
    currency: 'CAD' as const,
  };
  return {
    ...evidence,
    evidenceHash:
      'sha256:' +
      createHash('sha256').update(canonicalPayrollJson(evidence)).digest('hex'),
  };
};
