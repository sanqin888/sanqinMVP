import {
  PAYROLL_CALCULATION_PROFILE_VERSION,
  PAYROLL_SUPPORTED_PROVINCE_OF_EMPLOYMENT,
  PayrollIncomeTaxTreatment,
  PayrollPayFrequency,
  PayrollTd1Mode,
} from './payroll-contracts';
import {
  PayrollCalculationFailureCode,
  type OntarioHourlyPayrollCalculationInput,
  type PayrollCalculationFailure,
  type PayrollNonPeriodicTaxEvidenceYtd,
} from './payroll-calculator.contracts';
import type { OntarioPayrollStatutoryPolicy } from './payroll-statutory-policy';

const PAY_PERIODS_BY_FREQUENCY: Readonly<
  Record<PayrollPayFrequency, readonly number[]>
> = {
  [PayrollPayFrequency.WEEKLY]: [52, 53],
  [PayrollPayFrequency.BIWEEKLY]: [26, 27],
  [PayrollPayFrequency.SEMIMONTHLY]: [24],
  [PayrollPayFrequency.MONTHLY]: [12],
};

export const payrollCalculationFailure = (
  code: PayrollCalculationFailureCode,
  message: string,
  field?: string,
): PayrollCalculationFailure => ({
  ok: false,
  reason: { code, message, ...(field ? { field } : {}) },
});

const isNonNegativeSafeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

const validateNonNegativeIntegers = (
  values: ReadonlyArray<readonly [string, number]>,
): PayrollCalculationFailure | null => {
  for (const [field, value] of values) {
    if (!isNonNegativeSafeInteger(value)) {
      return payrollCalculationFailure(
        PayrollCalculationFailureCode.INVALID_INPUT,
        `${field} must be a non-negative safe integer`,
        field,
      );
    }
  }
  return null;
};

const validateTd1 = (
  mode: PayrollTd1Mode,
  claimCents: number | null,
  field: string,
): PayrollCalculationFailure | null => {
  if (mode === PayrollTd1Mode.FILED_TOTAL_CLAIM) {
    if (claimCents === null || !isNonNegativeSafeInteger(claimCents)) {
      return payrollCalculationFailure(
        PayrollCalculationFailureCode.INVALID_INPUT,
        `${field} is required for FILED_TOTAL_CLAIM`,
        field,
      );
    }
    return null;
  }

  if (claimCents !== null) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.INVALID_INPUT,
      `${field} must be null for NO_FORM_DEFAULT`,
      field,
    );
  }

  return null;
};

export const validateOntarioHourlyPayrollInput = (
  input: OntarioHourlyPayrollCalculationInput,
): PayrollCalculationFailure | null => {
  if (input.provinceOfEmployment !== PAYROLL_SUPPORTED_PROVINCE_OF_EMPLOYMENT) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.UNSUPPORTED_PROVINCE,
      `unsupported payroll province of employment: ${input.provinceOfEmployment}`,
      'provinceOfEmployment',
    );
  }

  if (input.calculationProfileVersion !== PAYROLL_CALCULATION_PROFILE_VERSION) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.UNSUPPORTED_CALCULATION_PROFILE,
      `unsupported payroll calculation profile: ${input.calculationProfileVersion}`,
      'calculationProfileVersion',
    );
  }

  if (
    !PAY_PERIODS_BY_FREQUENCY[input.payFrequency]?.includes(
      input.payPeriodsPerYear,
    )
  ) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.UNSUPPORTED_PAY_PERIOD_COUNT,
      `payPeriodsPerYear=${input.payPeriodsPerYear} is not supported for ${input.payFrequency}`,
      'payPeriodsPerYear',
    );
  }

  const invalid = validateNonNegativeIntegers([
    ['regularMinutes', input.regularMinutes],
    ['regularHourlyRateCents', input.regularHourlyRateCents],
    ['overtimeMinutes', input.overtimeMinutes],
    ['overtimeHourlyRateCents', input.overtimeHourlyRateCents],
    ['vacationTopUpCents', input.vacationTopUpCents],
    ['additionalTaxPerPayCents', input.additionalTaxPerPayCents],
    ['vacationRateBasisPoints', input.vacationRateBasisPoints],
    ['eiEmployerMultiplierMicros', input.eiEmployerMultiplierMicros],
    ['ytd.grossEarningsYtdCents', input.ytd.grossEarningsYtdCents],
    ['ytd.netPayYtdCents', input.ytd.netPayYtdCents],
    ['ytd.periodicEarningsYtdCents', input.ytd.periodicEarningsYtdCents],
    ['ytd.nonPeriodicEarningsYtdCents', input.ytd.nonPeriodicEarningsYtdCents],
    ['ytd.pensionableEarningsYtdCents', input.ytd.pensionableEarningsYtdCents],
    ['ytd.employeeCppYtdCents', input.ytd.employeeCppYtdCents],
    ['ytd.employeeCpp2YtdCents', input.ytd.employeeCpp2YtdCents],
    ['ytd.insurableEarningsYtdCents', input.ytd.insurableEarningsYtdCents],
    ['ytd.employeeEiYtdCents', input.ytd.employeeEiYtdCents],
    ['ytd.incomeTaxYtdCents', input.ytd.incomeTaxYtdCents],
    ['ytd.vacationPayPaidYtdCents', input.ytd.vacationPayPaidYtdCents],
    ['ytd.vacationPayAccruedYtdCents', input.ytd.vacationPayAccruedYtdCents],
  ]);
  if (invalid) {
    return invalid;
  }

  if (input.eiEmployerMultiplierMicros <= 0) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.INVALID_INPUT,
      'eiEmployerMultiplierMicros must be positive',
      'eiEmployerMultiplierMicros',
    );
  }

  const federalTd1 = validateTd1(
    input.federalTd1Mode,
    input.federalTd1TotalClaimCents,
    'federalTd1TotalClaimCents',
  );
  if (federalTd1) {
    return federalTd1;
  }

  const ontarioTd1 = validateTd1(
    input.ontarioTd1Mode,
    input.ontarioTd1TotalClaimCents,
    'ontarioTd1TotalClaimCents',
  );
  if (ontarioTd1) {
    return ontarioTd1;
  }

  if (
    input.incomeTaxTreatment ===
      PayrollIncomeTaxTreatment.TD1_CLAIM_CODE_E_REVIEWED &&
    input.additionalTaxPerPayCents > 0
  ) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.CLAIM_CODE_E_WITH_ADDITIONAL_TAX_UNSUPPORTED,
      'claim code E combined with an additional per-pay tax request is outside ON_HOURLY_SIMPLE_V1',
      'additionalTaxPerPayCents',
    );
  }

  return null;
};

export const validateOntarioPayrollYtdAgainstPolicy = (
  input: OntarioHourlyPayrollCalculationInput,
  policy: OntarioPayrollStatutoryPolicy,
): PayrollCalculationFailure | null => {
  const maximums: ReadonlyArray<readonly [string, number, number]> = [
    [
      'ytd.employeeCppYtdCents',
      input.ytd.employeeCppYtdCents,
      policy.cpp.maximumTotalContributionCents,
    ],
    [
      'ytd.employeeCpp2YtdCents',
      input.ytd.employeeCpp2YtdCents,
      policy.cpp.maximumCpp2ContributionCents,
    ],
    [
      'ytd.employeeEiYtdCents',
      input.ytd.employeeEiYtdCents,
      policy.ei.maximumEmployeePremiumCents,
    ],
  ];

  for (const [field, actual, maximum] of maximums) {
    if (actual > maximum) {
      return payrollCalculationFailure(
        PayrollCalculationFailureCode.YTD_EXCEEDS_STATUTORY_MAXIMUM,
        `${field} exceeds the supported 2026 statutory maximum`,
        field,
      );
    }
  }

  return null;
};

export const resolvePriorNonPeriodicTaxEvidence = (
  input: OntarioHourlyPayrollCalculationInput,
): PayrollNonPeriodicTaxEvidenceYtd | PayrollCalculationFailure => {
  const evidence = input.ytd.nonPeriodicTaxEvidenceYtd;

  if (input.ytd.nonPeriodicEarningsYtdCents > 0 && evidence === null) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.PRIOR_NON_PERIODIC_EVIDENCE_REQUIRED,
      'prior non-periodic earnings require CPP/EI allocation evidence before an exact T4127 calculation can continue',
      'ytd.nonPeriodicTaxEvidenceYtd',
    );
  }

  const resolved =
    evidence ??
    ({
      cppBaseContributionCents: 0,
      cppAdditionalDeductionCents: 0,
      eiPremiumCents: 0,
    } satisfies PayrollNonPeriodicTaxEvidenceYtd);

  const invalid = validateNonNegativeIntegers([
    [
      'ytd.nonPeriodicTaxEvidenceYtd.cppBaseContributionCents',
      resolved.cppBaseContributionCents,
    ],
    [
      'ytd.nonPeriodicTaxEvidenceYtd.cppAdditionalDeductionCents',
      resolved.cppAdditionalDeductionCents,
    ],
    [
      'ytd.nonPeriodicTaxEvidenceYtd.eiPremiumCents',
      resolved.eiPremiumCents,
    ],
  ]);
  if (invalid) {
    return invalid;
  }

  if (
    input.ytd.nonPeriodicEarningsYtdCents === 0 &&
    (resolved.cppBaseContributionCents > 0 ||
      resolved.cppAdditionalDeductionCents > 0 ||
      resolved.eiPremiumCents > 0)
  ) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.INVALID_INPUT,
      'non-periodic contribution evidence must be zero when nonPeriodicEarningsYtdCents is zero',
      'ytd.nonPeriodicTaxEvidenceYtd',
    );
  }

  if (
    resolved.cppBaseContributionCents > input.ytd.employeeCppYtdCents ||
    resolved.cppAdditionalDeductionCents >
      input.ytd.employeeCppYtdCents + input.ytd.employeeCpp2YtdCents ||
    resolved.eiPremiumCents > input.ytd.employeeEiYtdCents
  ) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.INVALID_INPUT,
      'prior non-periodic contribution evidence cannot exceed the corresponding YTD deductions',
      'ytd.nonPeriodicTaxEvidenceYtd',
    );
  }

  return resolved;
};
