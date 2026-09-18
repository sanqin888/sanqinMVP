import type {
  PayrollCppTreatment,
  PayrollEiTreatment,
  PayrollIncomeTaxTreatment,
  PayrollPayFrequency,
  PayrollRemitterType,
  PayrollTd1Mode,
  PayrollVacationTreatment,
} from './payroll-contracts';

export type CreatePayrollEmployerInput = {
  legalName: string;
  displayName?: string | null;
  defaultStoreStableId?: string | null;
};

export type UpdatePayrollEmployerInput = {
  legalName?: string;
  displayName?: string | null;
  defaultStoreStableId?: string | null;
  isActive?: boolean;
};

export type CreatePayrollEmployerConfigInput = {
  effectiveFrom: string;
  remitterType: PayrollRemitterType;
  eiEmployerMultiplierMicros: number;
};

export type CreatePayrollEmployeeInput = {
  legalName: string;
  displayName?: string | null;
  userStableId?: string | null;
  storeStableId?: string | null;
  employmentStartDate: string;
  employmentEndDate?: string | null;
  vacationServiceStartDate?: string | null;
};

export type UpdatePayrollEmployeeInput = {
  legalName?: string;
  displayName?: string | null;
  userStableId?: string | null;
  storeStableId?: string | null;
  employmentStartDate?: string;
  employmentEndDate?: string | null;
  vacationServiceStartDate?: string | null;
  isActive?: boolean;
};

export type CreatePayrollEmployeeConfigInput = {
  effectiveFrom: string;
  provinceOfEmployment: string;
  payFrequency: PayrollPayFrequency;
  payScheduleAnchorDate: string;
  defaultHourlyRateCents: number;
  federalTd1Mode: PayrollTd1Mode;
  federalTd1TotalClaimCents?: number | null;
  ontarioTd1Mode: PayrollTd1Mode;
  ontarioTd1TotalClaimCents?: number | null;
  incomeTaxTreatment: PayrollIncomeTaxTreatment;
  additionalTaxPerPayCents?: number;
  cppTreatment: PayrollCppTreatment;
  cppExceptionCode?: string | null;
  cppExceptionNote?: string | null;
  eiTreatment: PayrollEiTreatment;
  eiExceptionCode?: string | null;
  eiExceptionNote?: string | null;
  vacationTreatment: PayrollVacationTreatment;
  vacationRateBasisPoints: number;
  vacationAgreementConfirmedAt?: string | null;
  vacationAgreementNote?: string | null;
};

export type UpsertPayrollYearOpeningInput = {
  asOfDate: string;
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
  nonPeriodicCppBaseContributionYtdCents: number;
  nonPeriodicCppAdditionalDeductionYtdCents: number;
  nonPeriodicEiPremiumYtdCents: number;
  vacationPayPaidYtdCents: number;
  vacationPayAccruedYtdCents: number;
  sourceNote: string;
};

export type CreatePayrollRunInput = {
  employeeStableId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  storeStableId?: string;
  regularMinutes: number;
  regularHourlyRateCents?: number;
  overtimeMinutes?: number;
  overtimeHourlyRateCents?: number;
  vacationTopUpCents?: number;
};

export type UpdatePayrollRunInput = {
  periodStart?: string;
  periodEnd?: string;
  payDate?: string;
  storeStableId?: string;
  regularMinutes?: number;
  regularHourlyRateCents?: number;
  overtimeMinutes?: number;
  overtimeHourlyRateCents?: number;
  vacationTopUpCents?: number;
};

export type CreatePayrollEmployeePaymentInput = {
  paymentAccountStableId: string;
  paymentDate: string;
  reference?: string | null;
};
