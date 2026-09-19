import { payrollDateOnly } from './payroll-lifecycle-input';

export type PayrollEmployeePaymentViewRecord = {
  paymentStableId: string;
  paymentAccountStableId: string;
  amountCents: number;
  currency: string;
  paymentDate: Date;
  reference: string | null;
  journalEntryStableId: string | null;
  createdByActorRef: string;
  createdAt: Date;
  run: { runStableId: string };
};

export const payrollEmployeePaymentDto = (
  row: PayrollEmployeePaymentViewRecord,
) => ({
  paymentStableId: row.paymentStableId,
  runStableId: row.run.runStableId,
  paymentAccountStableId: row.paymentAccountStableId,
  amountCents: row.amountCents,
  currency: row.currency,
  paymentDate: payrollDateOnly(row.paymentDate),
  reference: row.reference,
  journalEntryStableId: row.journalEntryStableId,
  createdByActorRef: row.createdByActorRef,
  createdAt: row.createdAt.toISOString(),
});
