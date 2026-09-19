export type PayrollRemitterType =
  | 'QUARTERLY'
  | 'REGULAR'
  | 'ACCELERATED_THRESHOLD_1'
  | 'ACCELERATED_THRESHOLD_2';

export type PayrollPayFrequency =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'SEMIMONTHLY'
  | 'MONTHLY';

export type PayrollTd1Mode = 'FILED_TOTAL_CLAIM' | 'NO_FORM_DEFAULT';
export type PayrollIncomeTaxTreatment =
  | 'STANDARD'
  | 'TD1_CLAIM_CODE_E_REVIEWED';
export type PayrollCppTreatment = 'STANDARD' | 'EXEMPT_REVIEWED';
export type PayrollEiTreatment =
  | 'INSURABLE'
  | 'NON_INSURABLE_REVIEWED';
export type PayrollVacationTreatment = 'PAID_EACH_RUN' | 'ACCRUED';

export type PayrollEmployer = {
  employerStableId: string;
  legalName: string;
  displayName: string | null;
  defaultStoreStableId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PayrollEmployerConfig = {
  configStableId: string;
  version: number;
  effectiveFrom: string;
  remitterType: PayrollRemitterType;
  eiEmployerMultiplierMicros: number;
  createdAt: string;
};

export type PayrollEmployee = {
  employeeStableId: string;
  legalName: string;
  displayName: string | null;
  userStableId: string | null;
  storeStableId: string | null;
  employmentStartDate: string;
  employmentEndDate: string | null;
  vacationServiceStartDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PayrollEmployeeConfig = {
  configStableId: string;
  version: number;
  effectiveFrom: string;
  provinceOfEmployment: string;
  payFrequency: PayrollPayFrequency;
  payScheduleAnchorDate: string;
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
  vacationAgreementConfirmedAt: string | null;
  vacationAgreementNote: string | null;
  calculationProfileVersion: string;
  createdAt: string;
};

export type PayrollNonPeriodicTaxEvidenceYtd = {
  cppBaseContributionCents: number;
  cppAdditionalDeductionCents: number;
  eiPremiumCents: number;
};

export type PayrollYtd = {
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

export type PayrollEmployeeYtdResponse = {
  employeeStableId: string;
  taxYear: number;
  ytd: PayrollYtd;
};

export type PayrollRunStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'APPROVED'
  | 'POSTED'
  | 'REVERSED'
  | 'VOIDED';

export type PayrollRun = {
  runStableId: string;
  employerStableId: string;
  employeeStableId: string;
  status: PayrollRunStatus;
  correctionOfRunStableId: string | null;
  correctionSequence: number;
  version: number;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  storeStableId: string;
  employeeConfigStableId: string | null;
  employerConfigStableId: string | null;
  statutoryPolicyVersion: string | null;
  payPeriodsPerYear: number | null;
  calculationProfileVersion: string | null;
  regularMinutes: number;
  regularHourlyRateCents: number;
  overtimeMinutes: number;
  overtimeHourlyRateCents: number;
  vacationTopUpCents: number;
  regularPayCents: number | null;
  overtimePayCents: number | null;
  vacationPayPaidCents: number | null;
  vacationPayAccruedCents: number | null;
  grossPayCents: number | null;
  periodicTaxableEarningsCents: number | null;
  nonPeriodicTaxableEarningsCents: number | null;
  pensionableEarningsCents: number | null;
  insurableEarningsCents: number | null;
  incomeTaxCents: number | null;
  employeeCppCents: number | null;
  employeeCpp2Cents: number | null;
  employeeEiCents: number | null;
  employerCppCents: number | null;
  employerCpp2Cents: number | null;
  employerEiCents: number | null;
  totalEmployeeDeductionsCents: number | null;
  netPayCents: number | null;
  craRemittanceCents: number | null;
  compensationExpenseCents: number | null;
  supportedEmployerPayrollCostCents: number | null;
  calculationEvidenceVersion: number | null;
  calculationHash: string | null;
  payStatementTemplateVersion: string | null;
  postedJournalEntryStableId: string | null;
  postedAt: string | null;
  reversalJournalEntryStableId: string | null;
  reversedByActorRef: string | null;
  reversalReason: string | null;
  reversedAt: string | null;
  ytdBefore: PayrollYtd | null;
  ytdAfter: PayrollYtd | null;
  approvedByActorRef: string | null;
  approvedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollCalculationResponse =
  | { ok: true; run: PayrollRun }
  | {
      ok: false;
      reason: {
        code: string;
        message: string;
        field?: string;
      };
    };

export type PayrollYearOpening = {
  openingStableId: string;
  taxYear: number;
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
  version: number;
  confirmedByActorRef: string;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PayrollEmployeePayment = {
  paymentStableId: string;
  runStableId: string;
  paymentAccountStableId: string;
  amountCents: number;
  currency: string;
  paymentDate: string;
  reference: string | null;
  journalEntryStableId: string | null;
  createdByActorRef: string;
  createdAt: string;
};

export type PayrollCraRemittanceRunEvidence = {
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

export type PayrollCraRemittancePreview = {
  employerStableId: string;
  remitterType: PayrollRemitterType;
  remittancePolicyVersion: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  includedRuns: PayrollCraRemittanceRunEvidence[];
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

export type PayrollCraRemittance = PayrollCraRemittancePreview & {
  remittanceStableId: string;
  paymentAccountStableId: string | null;
  paymentDate: string | null;
  reference: string | null;
  journalEntryStableId: string | null;
  createdByActorRef: string;
  createdAt: string;
};
