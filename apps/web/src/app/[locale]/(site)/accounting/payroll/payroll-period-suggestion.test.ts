import { suggestNextPayrollPeriod } from './payroll-period-suggestion';
import type { PayrollEmployeeConfig, PayrollRun } from './payroll-types';

const monthlyConfig: PayrollEmployeeConfig = {
  configStableId: 'config-monthly',
  version: 1,
  effectiveFrom: '2026-06-01',
  provinceOfEmployment: 'ON',
  payFrequency: 'MONTHLY',
  payScheduleAnchorDate: '2026-07-07',
  defaultHourlyRateCents: 2500,
  federalTd1Mode: 'NO_FORM_DEFAULT',
  federalTd1TotalClaimCents: null,
  ontarioTd1Mode: 'NO_FORM_DEFAULT',
  ontarioTd1TotalClaimCents: null,
  incomeTaxTreatment: 'STANDARD',
  additionalTaxPerPayCents: 0,
  cppTreatment: 'STANDARD',
  cppExceptionCode: null,
  cppExceptionNote: null,
  eiTreatment: 'INSURABLE',
  eiExceptionCode: null,
  eiExceptionNote: null,
  vacationTreatment: 'ACCRUED',
  vacationRateBasisPoints: 400,
  vacationAgreementConfirmedAt: null,
  vacationAgreementNote: null,
  calculationProfileVersion: 'ON_HOURLY_SIMPLE_V1',
};

const baseRun: PayrollRun = {
  runStableId: 'run-base',
  employerStableId: 'employer-1',
  employeeStableId: 'employee-1',
  status: 'POSTED',
  correctionOfRunStableId: null,
  correctionSequence: 0,
  version: 1,
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  payDate: '2026-09-19',
  storeStableId: '4750_Yonge_Street',
  employeeConfigStableId: 'config-monthly',
  employerConfigStableId: 'employer-config',
  statutoryPolicyVersion: 'CA-ON-2026-07',
  payPeriodsPerYear: 12,
  calculationProfileVersion: 'ON_HOURLY_SIMPLE_V1',
  regularMinutes: 9600,
  regularHourlyRateCents: 2500,
  overtimeMinutes: 0,
  overtimeHourlyRateCents: 0,
  vacationTopUpCents: 0,
  regularPayCents: 400000,
  overtimePayCents: 0,
  vacationPayPaidCents: 0,
  vacationPayAccruedCents: 16000,
  grossPayCents: 400000,
  periodicTaxableEarningsCents: 400000,
  nonPeriodicTaxableEarningsCents: 0,
  pensionableEarningsCents: 400000,
  insurableEarningsCents: 400000,
  incomeTaxCents: 0,
  employeeCppCents: 0,
  employeeCpp2Cents: 0,
  employeeEiCents: 0,
  employerCppCents: 0,
  employerCpp2Cents: 0,
  employerEiCents: 0,
  totalEmployeeDeductionsCents: 0,
  netPayCents: 400000,
  craRemittanceCents: 0,
  compensationExpenseCents: 416000,
  supportedEmployerPayrollCostCents: 0,
  calculationEvidenceVersion: 1,
  calculationHash: 'sha256:test',
  payStatementTemplateVersion: 'PAY_STATEMENT_V1',
  postedJournalEntryStableId: 'journal-1',
  postedAt: '2026-09-19T00:00:00.000Z',
  reversalJournalEntryStableId: null,
  reversedByActorRef: null,
  reversalReason: null,
  reversedAt: null,
  ytdBefore: null,
  ytdAfter: null,
  approvedByActorRef: 'user-1',
  approvedAt: '2026-09-19T00:00:00.000Z',
  voidedAt: null,
};

function run(overrides: Partial<PayrollRun>): PayrollRun {
  return { ...baseRun, ...overrides };
}

describe('suggestNextPayrollPeriod', () => {
  it('prefills the next calendar month from the latest non-voided run', () => {
    const suggestion = suggestNextPayrollPeriod(
      'employee-1',
      monthlyConfig,
      [
        run({
          runStableId: 'run-july',
          periodStart: '2026-07-01',
          periodEnd: '2026-07-31',
        }),
        run({
          runStableId: 'run-august',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        }),
      ],
    );

    expect(suggestion).toEqual({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      previousPeriodEnd: '2026-08-31',
    });
  });

  it('handles a December to January boundary', () => {
    const suggestion = suggestNextPayrollPeriod(
      'employee-1',
      monthlyConfig,
      [
        run({
          periodStart: '2026-12-01',
          periodEnd: '2026-12-31',
        }),
      ],
    );

    expect(suggestion).toEqual({
      periodStart: '2027-01-01',
      periodEnd: '2027-01-31',
      previousPeriodEnd: '2026-12-31',
    });
  });

  it('ignores voided and other-employee runs', () => {
    const suggestion = suggestNextPayrollPeriod(
      'employee-1',
      monthlyConfig,
      [
        run({
          runStableId: 'valid',
          periodEnd: '2026-08-31',
        }),
        run({
          runStableId: 'voided',
          status: 'VOIDED',
          periodEnd: '2026-10-31',
        }),
        run({
          runStableId: 'other-employee',
          employeeStableId: 'employee-2',
          periodEnd: '2026-11-30',
        }),
      ],
    );

    expect(suggestion?.previousPeriodEnd).toBe('2026-08-31');
  });

  it('does not advance past an unfinished latest payroll run', () => {
    const suggestion = suggestNextPayrollPeriod(
      'employee-1',
      monthlyConfig,
      [
        run({
          runStableId: 'posted-august',
          periodEnd: '2026-08-31',
        }),
        run({
          runStableId: 'draft-september',
          status: 'DRAFT',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
        }),
      ],
    );

    expect(suggestion).toBeNull();
  });

  it('does not guess periods for unsupported pay frequencies', () => {
    const suggestion = suggestNextPayrollPeriod(
      'employee-1',
      { ...monthlyConfig, payFrequency: 'BIWEEKLY' },
      [baseRun],
    );

    expect(suggestion).toBeNull();
  });
});
