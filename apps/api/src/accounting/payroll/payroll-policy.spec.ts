import {
  PAYROLL_CALCULATION_EVIDENCE_VERSION,
  PAYROLL_CALCULATION_PROFILE_VERSION,
  PayrollCppTreatment,
  PayrollEiTreatment,
  PayrollIncomeTaxTreatment,
  PayrollPayFrequency,
  PayrollRemitterType,
  PayrollRunStatus,
  PayrollTd1Mode,
  PayrollVacationTreatment,
  type PayrollCalculatedEvidencePolicyInput,
  type PayrollEmployeeConfigPolicyInput,
  type PayrollEmployerConfigPolicyInput,
  type PayrollRunDraftPolicyInput,
  type PayrollYearOpeningPolicyInput,
} from './payroll-contracts';
import {
  assertPayrollCalculatedEvidenceComplete,
  assertPayrollEmployeeConfig,
  assertPayrollEmployerConfig,
  assertPayrollRunDraft,
  assertPayrollRunStatusTransition,
  assertPayrollYearOpening,
  canTransitionPayrollRunStatus,
} from './payroll-policy';

const employerConfig = (
  overrides: Partial<PayrollEmployerConfigPolicyInput> = {},
): PayrollEmployerConfigPolicyInput => ({
  version: 1,
  remitterType: PayrollRemitterType.REGULAR,
  eiEmployerMultiplierMicros: 1_400_000,
  ...overrides,
});

const employeeConfig = (
  overrides: Partial<PayrollEmployeeConfigPolicyInput> = {},
): PayrollEmployeeConfigPolicyInput => ({
  version: 1,
  provinceOfEmployment: 'ON',
  payFrequency: PayrollPayFrequency.BIWEEKLY,
  defaultHourlyRateCents: 2_000,
  federalTd1Mode: PayrollTd1Mode.NO_FORM_DEFAULT,
  federalTd1TotalClaimCents: null,
  ontarioTd1Mode: PayrollTd1Mode.NO_FORM_DEFAULT,
  ontarioTd1TotalClaimCents: null,
  incomeTaxTreatment: PayrollIncomeTaxTreatment.STANDARD,
  additionalTaxPerPayCents: 0,
  cppTreatment: PayrollCppTreatment.STANDARD,
  cppExceptionCode: null,
  cppExceptionNote: null,
  eiTreatment: PayrollEiTreatment.INSURABLE,
  eiExceptionCode: null,
  eiExceptionNote: null,
  vacationTreatment: PayrollVacationTreatment.ACCRUED,
  vacationRateBasisPoints: 400,
  vacationAgreementConfirmedAt: null,
  calculationProfileVersion: PAYROLL_CALCULATION_PROFILE_VERSION,
  ...overrides,
});

const runDraft = (
  overrides: Partial<PayrollRunDraftPolicyInput> = {},
): PayrollRunDraftPolicyInput => ({
  correctionSequence: 0,
  periodStart: new Date('2026-09-01T00:00:00.000Z'),
  periodEnd: new Date('2026-09-14T00:00:00.000Z'),
  payDate: new Date('2026-09-18T00:00:00.000Z'),
  storeStableId: '4750_Yonge_Street',
  regularMinutes: 4_800,
  regularHourlyRateCents: 2_000,
  overtimeMinutes: 0,
  overtimeHourlyRateCents: 3_000,
  vacationTopUpCents: 0,
  ...overrides,
});

const yearOpening = (
  overrides: Partial<PayrollYearOpeningPolicyInput> = {},
): PayrollYearOpeningPolicyInput => ({
  taxYear: 2026,
  grossEarningsYtdCents: 2_000_000,
  netPayYtdCents: 1_600_000,
  periodicEarningsYtdCents: 1_900_000,
  nonPeriodicEarningsYtdCents: 100_000,
  pensionableEarningsYtdCents: 2_000_000,
  employeeCppYtdCents: 100_000,
  employeeCpp2YtdCents: 0,
  insurableEarningsYtdCents: 2_000_000,
  employeeEiYtdCents: 40_000,
  incomeTaxYtdCents: 260_000,
  vacationPayPaidYtdCents: 80_000,
  vacationPayAccruedYtdCents: 0,
  sourceNote: 'Reviewed prior payroll register',
  version: 1,
  ...overrides,
});

const calculatedEvidence = (
  overrides: Partial<PayrollCalculatedEvidencePolicyInput> = {},
): PayrollCalculatedEvidencePolicyInput => ({
  employeeConfigStableId: 'employee-config-stable-id',
  employerConfigStableId: 'employer-config-stable-id',
  statutoryPolicyVersion: 'CA-ON-2026-07',
  payPeriodsPerYear: 26,
  calculationProfileVersion: PAYROLL_CALCULATION_PROFILE_VERSION,
  regularPayCents: 160_000,
  overtimePayCents: 0,
  vacationPayPaidCents: 6_400,
  vacationPayAccruedCents: 0,
  grossPayCents: 166_400,
  periodicTaxableEarningsCents: 160_000,
  nonPeriodicTaxableEarningsCents: 6_400,
  pensionableEarningsCents: 166_400,
  insurableEarningsCents: 166_400,
  incomeTaxCents: 20_000,
  employeeCppCents: 8_000,
  employeeCpp2Cents: 0,
  employeeEiCents: 3_000,
  employerCppCents: 8_000,
  employerCpp2Cents: 0,
  employerEiCents: 4_200,
  totalEmployeeDeductionsCents: 31_000,
  netPayCents: 135_400,
  craRemittanceCents: 43_200,
  compensationExpenseCents: 166_400,
  supportedEmployerPayrollCostCents: 178_600,
  calculationEvidenceVersion: PAYROLL_CALCULATION_EVIDENCE_VERSION,
  calculationInputJson: {},
  calculationOutputJson: {},
  calculationHash: 'sha256:test',
  ytdBeforeJson: {},
  ytdAfterJson: {},
  ...overrides,
});

describe('Payroll B1 invariant policy', () => {
  it('accepts reviewed employer config without applying remittance formulas', () => {
    expect(() => assertPayrollEmployerConfig(employerConfig())).not.toThrow();
    expect(() =>
      assertPayrollEmployerConfig(
        employerConfig({ remitterType: PayrollRemitterType.QUARTERLY }),
      ),
    ).not.toThrow();
  });

  it('rejects invalid employer multiplier evidence', () => {
    expect(() =>
      assertPayrollEmployerConfig(
        employerConfig({ eiEmployerMultiplierMicros: 0 }),
      ),
    ).toThrow('eiEmployerMultiplierMicros');
  });

  it('accepts the Ontario hourly simple calculation profile', () => {
    expect(() => assertPayrollEmployeeConfig(employeeConfig())).not.toThrow();
  });

  it('fails closed for unsupported province/profile', () => {
    expect(() =>
      assertPayrollEmployeeConfig(
        employeeConfig({ provinceOfEmployment: 'BC' }),
      ),
    ).toThrow('unsupported payroll province');

    expect(() =>
      assertPayrollEmployeeConfig(
        employeeConfig({ calculationProfileVersion: 'UNSUPPORTED' }),
      ),
    ).toThrow('unsupported payroll calculation profile');
  });

  it('requires TD1 claim amounts only for filed-total-claim mode', () => {
    expect(() =>
      assertPayrollEmployeeConfig(
        employeeConfig({
          federalTd1Mode: PayrollTd1Mode.FILED_TOTAL_CLAIM,
          federalTd1TotalClaimCents: null,
        }),
      ),
    ).toThrow('federalTd1TotalClaimCents');

    expect(() =>
      assertPayrollEmployeeConfig(
        employeeConfig({
          federalTd1Mode: PayrollTd1Mode.FILED_TOTAL_CLAIM,
          federalTd1TotalClaimCents: 1_600_000,
        }),
      ),
    ).not.toThrow();
  });

  it('requires reviewed CPP/EI exception evidence instead of role inference', () => {
    expect(() =>
      assertPayrollEmployeeConfig(
        employeeConfig({
          cppTreatment: PayrollCppTreatment.EXEMPT_REVIEWED,
          cppExceptionCode: null,
          cppExceptionNote: null,
        }),
      ),
    ).toThrow('cppExceptionCode');

    expect(() =>
      assertPayrollEmployeeConfig(
        employeeConfig({
          eiTreatment: PayrollEiTreatment.NON_INSURABLE_REVIEWED,
          eiExceptionCode: 'CRA_REVIEWED',
          eiExceptionNote: 'Reviewed external evidence',
        }),
      ),
    ).not.toThrow();
  });

  it('requires paid-each-run vacation agreement evidence', () => {
    expect(() =>
      assertPayrollEmployeeConfig(
        employeeConfig({
          vacationTreatment: PayrollVacationTreatment.PAID_EACH_RUN,
          vacationAgreementConfirmedAt: null,
        }),
      ),
    ).toThrow('vacationAgreementConfirmedAt');

    expect(() =>
      assertPayrollEmployeeConfig(
        employeeConfig({
          vacationTreatment: PayrollVacationTreatment.PAID_EACH_RUN,
          vacationAgreementConfirmedAt: new Date(
            '2026-01-01T00:00:00.000Z',
          ),
        }),
      ),
    ).not.toThrow();
  });

  it('validates draft integer/date identity without calculating payroll', () => {
    expect(() => assertPayrollRunDraft(runDraft())).not.toThrow();
    expect(() =>
      assertPayrollRunDraft(runDraft({ regularMinutes: -1 })),
    ).toThrow('regularMinutes');
    expect(() =>
      assertPayrollRunDraft(
        runDraft({
          periodStart: new Date('2026-09-15T00:00:00.000Z'),
          periodEnd: new Date('2026-09-14T00:00:00.000Z'),
        }),
      ),
    ).toThrow('periodEnd');
  });

  it('validates non-negative same-employer YTD opening evidence', () => {
    expect(() => assertPayrollYearOpening(yearOpening())).not.toThrow();
    expect(() =>
      assertPayrollYearOpening(
        yearOpening({ employeeCppYtdCents: -1 }),
      ),
    ).toThrow('employeeCppYtdCents');
  });

  it('requires complete versioned evidence before CALCULATED is meaningful', () => {
    expect(() =>
      assertPayrollCalculatedEvidenceComplete(calculatedEvidence()),
    ).not.toThrow();

    expect(() =>
      assertPayrollCalculatedEvidenceComplete(
        calculatedEvidence({ ytdBeforeJson: null }),
      ),
    ).toThrow('ytdBeforeJson');

    expect(() =>
      assertPayrollCalculatedEvidenceComplete(
        calculatedEvidence({ calculationProfileVersion: 'UNSUPPORTED' }),
      ),
    ).toThrow('unsupported payroll calculation profile');
  });

  it('pins the immutable PayrollRun lifecycle', () => {
    expect(
      canTransitionPayrollRunStatus(
        PayrollRunStatus.DRAFT,
        PayrollRunStatus.CALCULATED,
      ),
    ).toBe(true);
    expect(
      canTransitionPayrollRunStatus(
        PayrollRunStatus.CALCULATED,
        PayrollRunStatus.APPROVED,
      ),
    ).toBe(true);
    expect(
      canTransitionPayrollRunStatus(
        PayrollRunStatus.APPROVED,
        PayrollRunStatus.POSTED,
      ),
    ).toBe(true);
    expect(
      canTransitionPayrollRunStatus(
        PayrollRunStatus.POSTED,
        PayrollRunStatus.REVERSED,
      ),
    ).toBe(true);

    expect(() =>
      assertPayrollRunStatusTransition(
        PayrollRunStatus.POSTED,
        PayrollRunStatus.DRAFT,
      ),
    ).toThrow('invalid payroll run status transition');
  });
});
