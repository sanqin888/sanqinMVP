import type {
  PayrollCppTreatment,
  PayrollEiTreatment,
  PayrollIncomeTaxTreatment,
  PayrollPayFrequency,
  PayrollTd1Mode,
  PayrollVacationTreatment,
} from './payroll-contracts';

export const PayrollCalculationFailureCode = {
  INVALID_INPUT: 'INVALID_INPUT',
  UNSUPPORTED_PAY_DATE: 'UNSUPPORTED_PAY_DATE',
  UNSUPPORTED_PROVINCE: 'UNSUPPORTED_PROVINCE',
  UNSUPPORTED_CALCULATION_PROFILE: 'UNSUPPORTED_CALCULATION_PROFILE',
  UNSUPPORTED_PAY_PERIOD_COUNT: 'UNSUPPORTED_PAY_PERIOD_COUNT',
  YTD_EXCEEDS_STATUTORY_MAXIMUM: 'YTD_EXCEEDS_STATUTORY_MAXIMUM',
  PRIOR_NON_PERIODIC_EVIDENCE_REQUIRED: 'PRIOR_NON_PERIODIC_EVIDENCE_REQUIRED',
  NON_PERIODIC_WITHOUT_PERIODIC_BASE: 'NON_PERIODIC_WITHOUT_PERIODIC_BASE',
  CLAIM_CODE_E_WITH_ADDITIONAL_TAX_UNSUPPORTED:
    'CLAIM_CODE_E_WITH_ADDITIONAL_TAX_UNSUPPORTED',
  DEDUCTIONS_EXCEED_GROSS: 'DEDUCTIONS_EXCEED_GROSS',
} as const;

export type PayrollCalculationFailureCode =
  (typeof PayrollCalculationFailureCode)[keyof typeof PayrollCalculationFailureCode];

export type PayrollNonPeriodicTaxEvidenceYtd = {
  cppBaseContributionCents: number;
  cppAdditionalDeductionCents: number;
  eiPremiumCents: number;
};

export type PayrollCalculationYtdInput = {
  grossEarningsYtdCents: number;
  netPayYtdCents: number;
  periodicEarningsYtdCents: number;
  nonPeriodicEarningsYtdCents: number;
  pensionableEarningsYtdCents: number;
  employeeCppYtdCents: number;
  employeeCpp2YtdCents: number;
  insurableEarningsYtdCents: number;
  employeeEiYtdCents: number;
  incomeTaxYtdCents: number;
  vacationPayPaidYtdCents: number;
  vacationPayAccruedYtdCents: number;
  nonPeriodicTaxEvidenceYtd: PayrollNonPeriodicTaxEvidenceYtd | null;
};

export type OntarioHourlyPayrollCalculationInput = {
  provinceOfEmployment: string;
  calculationProfileVersion: string;
  payDate: Date;
  payFrequency: PayrollPayFrequency;
  payPeriodsPerYear: number;

  regularMinutes: number;
  regularHourlyRateCents: number;
  overtimeMinutes: number;
  overtimeHourlyRateCents: number;
  vacationTopUpCents: number;

  federalTd1Mode: PayrollTd1Mode;
  federalTd1TotalClaimCents: number | null;
  ontarioTd1Mode: PayrollTd1Mode;
  ontarioTd1TotalClaimCents: number | null;
  incomeTaxTreatment: PayrollIncomeTaxTreatment;
  additionalTaxPerPayCents: number;

  cppTreatment: PayrollCppTreatment;
  eiTreatment: PayrollEiTreatment;
  eiEmployerMultiplierMicros: number;

  vacationTreatment: PayrollVacationTreatment;
  vacationRateBasisPoints: number;

  ytd: PayrollCalculationYtdInput;
};

export type PayrollContributionEvidence = {
  cppContributionMonths: 12;
  employeeCppRegularCents: number;
  employeeCppNonPeriodicCents: number;
  employeeCppBaseRegularCents: number;
  employeeCppBaseNonPeriodicCents: number;
  cppTaxDeductionRegularCents: number;
  cppTaxDeductionNonPeriodicCents: number;
  employeeCpp2RegularCents: number;
  employeeCpp2NonPeriodicCents: number;
  employeeEiRegularCents: number;
  employeeEiNonPeriodicCents: number;
};

export type PayrollTaxEvidence = {
  periodicAnnualTaxableIncomeCents: number;
  annualTaxableIncomeWithNonPeriodicCents: number;
  periodicIncomeTaxCents: number;
  nonPeriodicIncomeTaxCents: number;
  federalPeriodicAnnualTaxCents: number;
  ontarioPeriodicAnnualTaxCents: number;
  federalAnnualTaxBeforeCurrentNonPeriodicCents: number;
  ontarioAnnualTaxBeforeCurrentNonPeriodicCents: number;
  federalAnnualTaxWithCurrentNonPeriodicCents: number;
  ontarioAnnualTaxWithCurrentNonPeriodicCents: number;
  ontarioHealthPremiumPeriodicCents: number;
  ontarioHealthPremiumBeforeCurrentNonPeriodicCents: number;
  ontarioHealthPremiumWithCurrentNonPeriodicCents: number;
  ontarioTaxReductionDependentFactorCents: 0;
};

export type PayrollCalculationYtdOutput = {
  grossEarningsYtdCents: number;
  netPayYtdCents: number;
  periodicEarningsYtdCents: number;
  nonPeriodicEarningsYtdCents: number;
  pensionableEarningsYtdCents: number;
  employeeCppYtdCents: number;
  employeeCpp2YtdCents: number;
  insurableEarningsYtdCents: number;
  employeeEiYtdCents: number;
  incomeTaxYtdCents: number;
  vacationPayPaidYtdCents: number;
  vacationPayAccruedYtdCents: number;
  nonPeriodicTaxEvidenceYtd: PayrollNonPeriodicTaxEvidenceYtd;
};

export type OntarioHourlyPayrollCalculationOutput = {
  statutoryPolicyVersion: string;
  calculationProfileVersion: string;
  payPeriodsPerYear: number;

  regularPayCents: number;
  overtimePayCents: number;
  vacationPayPaidCents: number;
  vacationPayAccruedCents: number;
  grossPayCents: number;
  periodicTaxableEarningsCents: number;
  nonPeriodicTaxableEarningsCents: number;
  pensionableEarningsCents: number;
  insurableEarningsCents: number;

  incomeTaxCents: number;
  employeeCppCents: number;
  employeeCpp2Cents: number;
  employeeEiCents: number;
  employerCppCents: number;
  employerCpp2Cents: number;
  employerEiCents: number;
  totalEmployeeDeductionsCents: number;
  netPayCents: number;

  craRemittanceCents: number;
  compensationExpenseCents: number;
  supportedEmployerPayrollCostCents: number;

  contributionEvidence: PayrollContributionEvidence;
  taxEvidence: PayrollTaxEvidence;
  ytdAfter: PayrollCalculationYtdOutput;
};

export type PayrollCalculationFailure = {
  ok: false;
  reason: {
    code: PayrollCalculationFailureCode;
    message: string;
    field?: string;
  };
};

export type PayrollCalculationSuccess = {
  ok: true;
  output: OntarioHourlyPayrollCalculationOutput;
};

export type PayrollCalculationResult =
  | PayrollCalculationSuccess
  | PayrollCalculationFailure;
