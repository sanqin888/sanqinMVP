import { payrollDateOnly } from './payroll-lifecycle-input';

export type PayrollRunViewRecord = {
  runStableId: string;
  status: string;
  correctionSequence: number;
  version: number;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
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
  postedAt: Date | null;
  reversalJournalEntryStableId: string | null;
  reversedByActorRef: string | null;
  reversalReason: string | null;
  reversedAt: Date | null;
  ytdBeforeJson: unknown;
  ytdAfterJson: unknown;
  approvedByActorRef: string | null;
  approvedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee: { employeeStableId: string };
  employer: { employerStableId: string };
  correctionOfRun: { runStableId: string } | null;
};

export const payrollRunDto = (row: PayrollRunViewRecord) => ({
  runStableId: row.runStableId,
  employerStableId: row.employer.employerStableId,
  employeeStableId: row.employee.employeeStableId,
  status: row.status,
  correctionOfRunStableId: row.correctionOfRun?.runStableId ?? null,
  correctionSequence: row.correctionSequence,
  version: row.version,
  periodStart: payrollDateOnly(row.periodStart),
  periodEnd: payrollDateOnly(row.periodEnd),
  payDate: payrollDateOnly(row.payDate),
  storeStableId: row.storeStableId,
  employeeConfigStableId: row.employeeConfigStableId,
  employerConfigStableId: row.employerConfigStableId,
  statutoryPolicyVersion: row.statutoryPolicyVersion,
  payPeriodsPerYear: row.payPeriodsPerYear,
  calculationProfileVersion: row.calculationProfileVersion,
  regularMinutes: row.regularMinutes,
  regularHourlyRateCents: row.regularHourlyRateCents,
  overtimeMinutes: row.overtimeMinutes,
  overtimeHourlyRateCents: row.overtimeHourlyRateCents,
  vacationTopUpCents: row.vacationTopUpCents,
  regularPayCents: row.regularPayCents,
  overtimePayCents: row.overtimePayCents,
  vacationPayPaidCents: row.vacationPayPaidCents,
  vacationPayAccruedCents: row.vacationPayAccruedCents,
  grossPayCents: row.grossPayCents,
  periodicTaxableEarningsCents: row.periodicTaxableEarningsCents,
  nonPeriodicTaxableEarningsCents: row.nonPeriodicTaxableEarningsCents,
  pensionableEarningsCents: row.pensionableEarningsCents,
  insurableEarningsCents: row.insurableEarningsCents,
  incomeTaxCents: row.incomeTaxCents,
  employeeCppCents: row.employeeCppCents,
  employeeCpp2Cents: row.employeeCpp2Cents,
  employeeEiCents: row.employeeEiCents,
  employerCppCents: row.employerCppCents,
  employerCpp2Cents: row.employerCpp2Cents,
  employerEiCents: row.employerEiCents,
  totalEmployeeDeductionsCents: row.totalEmployeeDeductionsCents,
  netPayCents: row.netPayCents,
  craRemittanceCents: row.craRemittanceCents,
  compensationExpenseCents: row.compensationExpenseCents,
  supportedEmployerPayrollCostCents: row.supportedEmployerPayrollCostCents,
  calculationEvidenceVersion: row.calculationEvidenceVersion,
  calculationHash: row.calculationHash,
  payStatementTemplateVersion: row.payStatementTemplateVersion,
  postedJournalEntryStableId: row.postedJournalEntryStableId,
  postedAt: row.postedAt?.toISOString() ?? null,
  reversalJournalEntryStableId: row.reversalJournalEntryStableId,
  reversedByActorRef: row.reversedByActorRef,
  reversalReason: row.reversalReason,
  reversedAt: row.reversedAt?.toISOString() ?? null,
  ytdBefore: row.ytdBeforeJson ?? null,
  ytdAfter: row.ytdAfterJson ?? null,
  approvedByActorRef: row.approvedByActorRef,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  voidedAt: row.voidedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
