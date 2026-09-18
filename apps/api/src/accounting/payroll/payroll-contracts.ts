// Payroll-owned application/domain contracts for the Accounting context.
// Keep these values independent from Prisma-generated types so later transport
// and calculation code can depend on stable owner contracts rather than ORM
// implementation details.

type ValueOf<T> = T[keyof T];

export const PayrollRunStatus = {
  DRAFT: 'DRAFT',
  CALCULATED: 'CALCULATED',
  APPROVED: 'APPROVED',
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
  VOIDED: 'VOIDED',
} as const;
export type PayrollRunStatus = ValueOf<typeof PayrollRunStatus>;

export const PayrollPayFrequency = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  SEMIMONTHLY: 'SEMIMONTHLY',
  MONTHLY: 'MONTHLY',
} as const;
export type PayrollPayFrequency = ValueOf<typeof PayrollPayFrequency>;

export const PayrollTd1Mode = {
  FILED_TOTAL_CLAIM: 'FILED_TOTAL_CLAIM',
  NO_FORM_DEFAULT: 'NO_FORM_DEFAULT',
} as const;
export type PayrollTd1Mode = ValueOf<typeof PayrollTd1Mode>;

export const PayrollIncomeTaxTreatment = {
  STANDARD: 'STANDARD',
  TD1_CLAIM_CODE_E_REVIEWED: 'TD1_CLAIM_CODE_E_REVIEWED',
} as const;
export type PayrollIncomeTaxTreatment = ValueOf<
  typeof PayrollIncomeTaxTreatment
>;

export const PayrollCppTreatment = {
  STANDARD: 'STANDARD',
  EXEMPT_REVIEWED: 'EXEMPT_REVIEWED',
} as const;
export type PayrollCppTreatment = ValueOf<typeof PayrollCppTreatment>;

export const PayrollEiTreatment = {
  INSURABLE: 'INSURABLE',
  NON_INSURABLE_REVIEWED: 'NON_INSURABLE_REVIEWED',
} as const;
export type PayrollEiTreatment = ValueOf<typeof PayrollEiTreatment>;

export const PayrollVacationTreatment = {
  PAID_EACH_RUN: 'PAID_EACH_RUN',
  ACCRUED: 'ACCRUED',
} as const;
export type PayrollVacationTreatment = ValueOf<
  typeof PayrollVacationTreatment
>;

export const PayrollRemitterType = {
  QUARTERLY: 'QUARTERLY',
  REGULAR: 'REGULAR',
  ACCELERATED_THRESHOLD_1: 'ACCELERATED_THRESHOLD_1',
  ACCELERATED_THRESHOLD_2: 'ACCELERATED_THRESHOLD_2',
} as const;
export type PayrollRemitterType = ValueOf<typeof PayrollRemitterType>;

export const PAYROLL_SUPPORTED_PROVINCE_OF_EMPLOYMENT = 'ON' as const;
export const PAYROLL_CALCULATION_PROFILE_VERSION = 'ON_HOURLY_SIMPLE_V1';
export const PAYROLL_CALCULATION_EVIDENCE_VERSION = 1;

export type PayrollEmployerConfigPolicyInput = {
  version: number;
  remitterType: PayrollRemitterType;
  eiEmployerMultiplierMicros: number;
};

export type PayrollEmployeeConfigPolicyInput = {
  version: number;
  provinceOfEmployment: string;
  payFrequency: PayrollPayFrequency;
  defaultHourlyRateCents: number;
  federalTd1Mode: PayrollTd1Mode;
  federalTd1TotalClaimCents: number | null;
  ontarioTd1Mode: PayrollTd1Mode;
  ontarioTd1TotalClaimCents: number | null;
  incomeTaxTreatment: PayrollIncomeTaxTreatment;
  additionalTaxPerPayCents: number;
  cppTreatment: PayrollCppTreatment;
  cppExceptionCode: string | null;
  cppExceptionNote: string | null;
  eiTreatment: PayrollEiTreatment;
  eiExceptionCode: string | null;
  eiExceptionNote: string | null;
  vacationTreatment: PayrollVacationTreatment;
  vacationRateBasisPoints: number;
  vacationAgreementConfirmedAt: Date | null;
  calculationProfileVersion: string;
};

export type PayrollRunDraftPolicyInput = {
  correctionSequence: number;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  storeStableId: string;
  regularMinutes: number;
  regularHourlyRateCents: number;
  overtimeMinutes: number;
  overtimeHourlyRateCents: number;
  vacationTopUpCents: number;
};

export type PayrollYearOpeningPolicyInput = {
  taxYear: number;
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
  sourceNote: string;
  version: number;
};

export const PAYROLL_CALCULATED_REQUIRED_FIELDS = [
  'employeeConfigStableId',
  'employerConfigStableId',
  'statutoryPolicyVersion',
  'payPeriodsPerYear',
  'calculationProfileVersion',
  'regularPayCents',
  'overtimePayCents',
  'vacationPayPaidCents',
  'vacationPayAccruedCents',
  'grossPayCents',
  'periodicTaxableEarningsCents',
  'nonPeriodicTaxableEarningsCents',
  'pensionableEarningsCents',
  'insurableEarningsCents',
  'incomeTaxCents',
  'employeeCppCents',
  'employeeCpp2Cents',
  'employeeEiCents',
  'employerCppCents',
  'employerCpp2Cents',
  'employerEiCents',
  'totalEmployeeDeductionsCents',
  'netPayCents',
  'craRemittanceCents',
  'compensationExpenseCents',
  'supportedEmployerPayrollCostCents',
  'calculationEvidenceVersion',
  'calculationInputJson',
  'calculationOutputJson',
  'calculationHash',
  'ytdBeforeJson',
  'ytdAfterJson',
] as const;

export type PayrollCalculatedRequiredField =
  (typeof PAYROLL_CALCULATED_REQUIRED_FIELDS)[number];

export type PayrollCalculatedEvidencePolicyInput = Partial<
  Record<PayrollCalculatedRequiredField, unknown>
>;
