import { payrollDateOnly } from './payroll-lifecycle-input';

export type PayrollCraRemittanceViewRunRecord = {
  employerConfigStableId: string;
  calculationHash: string;
  postedAccrualJournalEntryStableId: string;
  payDate: Date;
  incomeTaxCents: number;
  employeeCppCents: number;
  employeeCpp2Cents: number;
  employerCppCents: number;
  employerCpp2Cents: number;
  employeeEiCents: number;
  employerEiCents: number;
  craRemittanceCents: number;
  run: { runStableId: string };
};

export type PayrollCraRemittanceViewRecord = {
  remittanceStableId: string;
  remitterType: string;
  remittancePolicyVersion: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  incomeTaxCents: number;
  employeeCppCents: number;
  employeeCpp2Cents: number;
  employerCppCents: number;
  employerCpp2Cents: number;
  employeeEiCents: number;
  employerEiCents: number;
  totalAmountCents: number;
  currency: string;
  evidenceHash: string;
  paymentAccountStableId: string | null;
  paymentDate: Date | null;
  reference: string | null;
  journalEntryStableId: string | null;
  createdByActorRef: string;
  createdAt: Date;
  employer: { employerStableId: string };
  runs: PayrollCraRemittanceViewRunRecord[];
};

export const payrollCraRemittanceDto = (
  row: PayrollCraRemittanceViewRecord,
) => ({
  remittanceStableId: row.remittanceStableId,
  employerStableId: row.employer.employerStableId,
  remitterType: row.remitterType,
  remittancePolicyVersion: row.remittancePolicyVersion,
  periodStart: payrollDateOnly(row.periodStart),
  periodEnd: payrollDateOnly(row.periodEnd),
  dueDate: payrollDateOnly(row.dueDate),
  incomeTaxCents: row.incomeTaxCents,
  employeeCppCents: row.employeeCppCents,
  employeeCpp2Cents: row.employeeCpp2Cents,
  employerCppCents: row.employerCppCents,
  employerCpp2Cents: row.employerCpp2Cents,
  employeeEiCents: row.employeeEiCents,
  employerEiCents: row.employerEiCents,
  totalAmountCents: row.totalAmountCents,
  currency: row.currency,
  evidenceHash: row.evidenceHash,
  paymentAccountStableId: row.paymentAccountStableId,
  paymentDate: payrollDateOnly(row.paymentDate),
  reference: row.reference,
  journalEntryStableId: row.journalEntryStableId,
  createdByActorRef: row.createdByActorRef,
  createdAt: row.createdAt.toISOString(),
  includedRuns: row.runs.map((item) => ({
    runStableId: item.run.runStableId,
    employerConfigStableId: item.employerConfigStableId,
    calculationHash: item.calculationHash,
    postedAccrualJournalEntryStableId: item.postedAccrualJournalEntryStableId,
    payDate: payrollDateOnly(item.payDate),
    incomeTaxCents: item.incomeTaxCents,
    employeeCppCents: item.employeeCppCents,
    employeeCpp2Cents: item.employeeCpp2Cents,
    employerCppCents: item.employerCppCents,
    employerCpp2Cents: item.employerCpp2Cents,
    employeeEiCents: item.employeeEiCents,
    employerEiCents: item.employerEiCents,
    craRemittanceCents: item.craRemittanceCents,
  })),
});
