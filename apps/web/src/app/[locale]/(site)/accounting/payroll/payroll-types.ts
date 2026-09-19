export type PayrollEmployer = {
  employerStableId: string;
  legalName: string;
  displayName: string | null;
  defaultStoreStableId: string | null;
  isActive: boolean;
};

export type PayrollEmployerConfig = {
  configStableId: string;
  version: number;
  effectiveFrom: string;
  remitterType:
    | 'QUARTERLY'
    | 'REGULAR'
    | 'ACCELERATED_THRESHOLD_1'
    | 'ACCELERATED_THRESHOLD_2';
  eiEmployerMultiplierMicros: number;
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
};

export type PayrollEmployeeConfig = {
  configStableId: string;
  version: number;
  effectiveFrom: string;
  provinceOfEmployment: string;
  payFrequency: 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
  payScheduleAnchorDate: string;
  defaultHourlyRateCents: number;
  federalTd1Mode: 'FILED_TOTAL_CLAIM' | 'NO_FORM_DEFAULT';
  federalTd1TotalClaimCents: number | null;
  ontarioTd1Mode: 'FILED_TOTAL_CLAIM' | 'NO_FORM_DEFAULT';
  ontarioTd1TotalClaimCents: number | null;
  incomeTaxTreatment: 'STANDARD' | 'TD1_CLAIM_CODE_E_REVIEWED';
  additionalTaxPerPayCents: number;
  cppTreatment: 'STANDARD' | 'EXEMPT_REVIEWED';
  cppExceptionCode: string | null;
  cppExceptionNote: string | null;
  eiTreatment: 'INSURABLE' | 'NON_INSURABLE_REVIEWED';
  eiExceptionCode: string | null;
  eiExceptionNote: string | null;
  vacationTreatment: 'PAID_EACH_RUN' | 'ACCRUED';
  vacationRateBasisPoints: number;
  vacationAgreementConfirmedAt: string | null;
  vacationAgreementNote: string | null;
  calculationProfileVersion: string;
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

export type PayrollPaymentAccount = {
  accountStableId: string;
  name: string;
  type: 'CASH' | 'BANK' | 'PLATFORM_WALLET';
  accountClass: 'ASSET';
  currency: string;
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
  remitterType: PayrollEmployerConfig['remitterType'];
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

export const payrollLocalDateToday = (): string => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};

export const payrollMoney = (cents: number | null | undefined): string =>
  cents == null ? '—' : '$' + (cents / 100).toFixed(2);

export const payrollHours = (minutes: number): string =>
  (minutes / 60).toFixed(2);

export const parseMoneyToCents = (raw: string, field: string): number => {
  const normalized = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(field + ' must be a non-negative amount with at most 2 decimals');
  }
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    throw new Error(field + ' is too large');
  }
  return cents;
};

export const parseHoursToMinutes = (raw: string, field: string): number => {
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error(field + ' must be a non-negative number');
  }
  const minutes = Math.round(hours * 60);
  if (!Number.isSafeInteger(minutes)) {
    throw new Error(field + ' is too large');
  }
  return minutes;
};
