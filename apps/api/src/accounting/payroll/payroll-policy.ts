import {
  PAYROLL_CALCULATED_REQUIRED_FIELDS,
  PAYROLL_CALCULATION_EVIDENCE_VERSION,
  PAYROLL_CALCULATION_PROFILE_VERSION,
  PAYROLL_SUPPORTED_PROVINCE_OF_EMPLOYMENT,
  PayrollCppTreatment,
  PayrollEiTreatment,
  PayrollRunStatus,
  PayrollTd1Mode,
  PayrollVacationTreatment,
  type PayrollCalculatedEvidencePolicyInput,
  type PayrollEmployeeConfigPolicyInput,
  type PayrollEmployerConfigPolicyInput,
  type PayrollRunDraftPolicyInput,
  type PayrollYearOpeningPolicyInput,
} from './payroll-contracts';

const assertNonNegativeInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
};

const assertPositiveInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer`);
  }
};

const assertNonBlank = (value: string | null, field: string): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be non-blank`);
  }
};

const assertTd1Claim = (
  mode: PayrollTd1Mode,
  claimCents: number | null,
  field: string,
): void => {
  if (mode === PayrollTd1Mode.FILED_TOTAL_CLAIM) {
    if (claimCents === null) {
      throw new Error(`${field} is required for FILED_TOTAL_CLAIM`);
    }
    assertNonNegativeInteger(claimCents, field);
    return;
  }

  if (claimCents !== null) {
    throw new Error(`${field} must be null for NO_FORM_DEFAULT`);
  }
};

export const assertPayrollEmployerConfig = (
  input: PayrollEmployerConfigPolicyInput,
): void => {
  assertPositiveInteger(input.version, 'version');
  assertPositiveInteger(
    input.eiEmployerMultiplierMicros,
    'eiEmployerMultiplierMicros',
  );
};

export const assertPayrollEmployeeConfig = (
  input: PayrollEmployeeConfigPolicyInput,
): void => {
  assertPositiveInteger(input.version, 'version');

  if (input.provinceOfEmployment !== PAYROLL_SUPPORTED_PROVINCE_OF_EMPLOYMENT) {
    throw new Error(
      `unsupported payroll province of employment: ${input.provinceOfEmployment}`,
    );
  }

  assertNonNegativeInteger(
    input.defaultHourlyRateCents,
    'defaultHourlyRateCents',
  );
  assertNonNegativeInteger(
    input.additionalTaxPerPayCents,
    'additionalTaxPerPayCents',
  );
  assertNonNegativeInteger(
    input.vacationRateBasisPoints,
    'vacationRateBasisPoints',
  );

  assertTd1Claim(
    input.federalTd1Mode,
    input.federalTd1TotalClaimCents,
    'federalTd1TotalClaimCents',
  );
  assertTd1Claim(
    input.ontarioTd1Mode,
    input.ontarioTd1TotalClaimCents,
    'ontarioTd1TotalClaimCents',
  );

  if (input.cppTreatment === PayrollCppTreatment.EXEMPT_REVIEWED) {
    assertNonBlank(input.cppExceptionCode, 'cppExceptionCode');
    assertNonBlank(input.cppExceptionNote, 'cppExceptionNote');
  } else if (
    input.cppExceptionCode !== null ||
    input.cppExceptionNote !== null
  ) {
    throw new Error(
      'CPP exception evidence must be null for STANDARD treatment',
    );
  }

  if (input.eiTreatment === PayrollEiTreatment.NON_INSURABLE_REVIEWED) {
    assertNonBlank(input.eiExceptionCode, 'eiExceptionCode');
    assertNonBlank(input.eiExceptionNote, 'eiExceptionNote');
  } else if (input.eiExceptionCode !== null || input.eiExceptionNote !== null) {
    throw new Error(
      'EI exception evidence must be null for INSURABLE treatment',
    );
  }

  if (
    input.vacationTreatment === PayrollVacationTreatment.PAID_EACH_RUN &&
    input.vacationAgreementConfirmedAt === null
  ) {
    throw new Error(
      'vacationAgreementConfirmedAt is required for PAID_EACH_RUN',
    );
  }

  if (input.calculationProfileVersion !== PAYROLL_CALCULATION_PROFILE_VERSION) {
    throw new Error(
      `unsupported payroll calculation profile: ${input.calculationProfileVersion}`,
    );
  }
};

export const assertPayrollRunDraft = (
  input: PayrollRunDraftPolicyInput,
): void => {
  assertNonNegativeInteger(input.correctionSequence, 'correctionSequence');
  assertNonBlank(input.storeStableId, 'storeStableId');
  assertNonNegativeInteger(input.regularMinutes, 'regularMinutes');
  assertNonNegativeInteger(
    input.regularHourlyRateCents,
    'regularHourlyRateCents',
  );
  assertNonNegativeInteger(input.overtimeMinutes, 'overtimeMinutes');
  assertNonNegativeInteger(
    input.overtimeHourlyRateCents,
    'overtimeHourlyRateCents',
  );
  assertNonNegativeInteger(input.vacationTopUpCents, 'vacationTopUpCents');

  if (input.periodEnd < input.periodStart) {
    throw new Error('periodEnd cannot be before periodStart');
  }
};

export const assertPayrollYearOpening = (
  input: PayrollYearOpeningPolicyInput,
): void => {
  assertPositiveInteger(input.taxYear, 'taxYear');
  assertPositiveInteger(input.version, 'version');
  assertNonBlank(input.sourceNote, 'sourceNote');

  const moneyFields: Array<[string, number]> = [
    ['grossEarningsYtdCents', input.grossEarningsYtdCents],
    ['netPayYtdCents', input.netPayYtdCents],
    ['periodicEarningsYtdCents', input.periodicEarningsYtdCents],
    ['nonPeriodicEarningsYtdCents', input.nonPeriodicEarningsYtdCents],
    ['pensionableEarningsYtdCents', input.pensionableEarningsYtdCents],
    ['employeeCppYtdCents', input.employeeCppYtdCents],
    ['employeeCpp2YtdCents', input.employeeCpp2YtdCents],
    ['insurableEarningsYtdCents', input.insurableEarningsYtdCents],
    ['employeeEiYtdCents', input.employeeEiYtdCents],
    ['incomeTaxYtdCents', input.incomeTaxYtdCents],
    [
      'nonPeriodicCppBaseContributionYtdCents',
      input.nonPeriodicCppBaseContributionYtdCents,
    ],
    [
      'nonPeriodicCppAdditionalDeductionYtdCents',
      input.nonPeriodicCppAdditionalDeductionYtdCents,
    ],
    ['nonPeriodicEiPremiumYtdCents', input.nonPeriodicEiPremiumYtdCents],
    ['vacationPayPaidYtdCents', input.vacationPayPaidYtdCents],
    ['vacationPayAccruedYtdCents', input.vacationPayAccruedYtdCents],
  ];

  for (const [field, value] of moneyFields) {
    assertNonNegativeInteger(value, field);
  }

  if (
    input.nonPeriodicEarningsYtdCents === 0 &&
    (input.nonPeriodicCppBaseContributionYtdCents !== 0 ||
      input.nonPeriodicCppAdditionalDeductionYtdCents !== 0 ||
      input.nonPeriodicEiPremiumYtdCents !== 0)
  ) {
    throw new Error(
      'non-periodic contribution evidence must be zero when nonPeriodicEarningsYtdCents is zero',
    );
  }
};

export const assertPayrollCalculatedEvidenceComplete = (
  input: PayrollCalculatedEvidencePolicyInput,
): void => {
  for (const field of PAYROLL_CALCULATED_REQUIRED_FIELDS) {
    const value = input[field];
    if (value === null || value === undefined) {
      throw new Error(`${field} is required for calculated payroll evidence`);
    }
  }

  assertPositiveInteger(input.payPeriodsPerYear as number, 'payPeriodsPerYear');
  assertPayrollCalculationEvidenceVersion(
    input.calculationEvidenceVersion as number,
  );
  assertNonBlank(
    input.statutoryPolicyVersion as string,
    'statutoryPolicyVersion',
  );
  assertNonBlank(
    input.employeeConfigStableId as string,
    'employeeConfigStableId',
  );
  assertNonBlank(
    input.employerConfigStableId as string,
    'employerConfigStableId',
  );
  assertNonBlank(
    input.calculationProfileVersion as string,
    'calculationProfileVersion',
  );
  if (input.calculationProfileVersion !== PAYROLL_CALCULATION_PROFILE_VERSION) {
    throw new Error(
      `unsupported payroll calculation profile: ${String(
        input.calculationProfileVersion,
      )}`,
    );
  }
  assertNonBlank(input.calculationHash as string, 'calculationHash');

  const calculatedMoneyFields = PAYROLL_CALCULATED_REQUIRED_FIELDS.filter(
    (field) => field.endsWith('Cents'),
  );
  for (const field of calculatedMoneyFields) {
    assertNonNegativeInteger(input[field] as number, field);
  }
};

const ALLOWED_PAYROLL_RUN_TRANSITIONS: Readonly<
  Record<PayrollRunStatus, readonly PayrollRunStatus[]>
> = {
  [PayrollRunStatus.DRAFT]: [PayrollRunStatus.CALCULATED],
  [PayrollRunStatus.CALCULATED]: [
    PayrollRunStatus.DRAFT,
    PayrollRunStatus.CALCULATED,
    PayrollRunStatus.APPROVED,
  ],
  [PayrollRunStatus.APPROVED]: [
    PayrollRunStatus.POSTED,
    PayrollRunStatus.VOIDED,
  ],
  [PayrollRunStatus.POSTED]: [PayrollRunStatus.REVERSED],
  [PayrollRunStatus.REVERSED]: [],
  [PayrollRunStatus.VOIDED]: [],
};

export const canTransitionPayrollRunStatus = (
  from: PayrollRunStatus,
  to: PayrollRunStatus,
): boolean => ALLOWED_PAYROLL_RUN_TRANSITIONS[from].includes(to);

export const assertPayrollRunStatusTransition = (
  from: PayrollRunStatus,
  to: PayrollRunStatus,
): void => {
  if (!canTransitionPayrollRunStatus(from, to)) {
    throw new Error(`invalid payroll run status transition: ${from} -> ${to}`);
  }
};

export const assertPayrollCalculationEvidenceVersion = (
  version: number,
): void => {
  if (version !== PAYROLL_CALCULATION_EVIDENCE_VERSION) {
    throw new Error(
      `unsupported payroll calculation evidence version: ${version}`,
    );
  }
};
