import type { PaymentExceptionCase } from '../payments/public-api';

/** Do not send the internal PaymentTransaction UUID through browser contracts. */
export const toPaymentExceptionPublicView = (record: PaymentExceptionCase) => ({
  caseStableId: record.caseStableId,
  attemptId: record.attemptId,
  storeStableId: record.storeStableId,
  externalPaymentId: record.externalPaymentId,
  amountCents: record.amountCents,
  currency: record.currency,
  action: record.action,
  mode: record.mode,
  status: record.status,
  requestedByStableId: record.requestedByStableId,
  operatorNote: record.operatorNote,
  cloverOrderId: record.cloverOrderId,
  approvedByStableId: record.approvedByStableId,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
