import type { PaymentExceptionCase } from '../payments/public-api';
import { toPaymentExceptionPublicView } from './payment-exception-public-view';

describe('PEM public case contract', () => {
  it('exposes stable business identities but never the internal PaymentTransaction UUID', () => {
    const row: PaymentExceptionCase = {
      caseStableId: 'case-business-1',
      attemptId: 'attempt-123',
      storeStableId: '4750_Yonge_Street',
      paymentTransactionId: 'd1fac0eb-1f7b-42d8-97e1-011111111111',
      externalPaymentId: 'sq_external',
      amountCents: 1695,
      currency: 'CAD',
      action: 'SANDBOX_CONFIRM_UNPAID',
      mode: 'SANDBOX',
      status: 'APPROVED',
      requestedByStableId: 'staff',
      operatorNote: 'Verified original unpaid terminal attempt',
      cloverOrderId: 'CLOVER-ORDER',
      approvedByStableId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const output = toPaymentExceptionPublicView(row);
    expect(output).toMatchObject({
      caseStableId: row.caseStableId,
      attemptId: row.attemptId,
      storeStableId: row.storeStableId,
    });
    expect(Object.keys(output)).not.toContain('paymentTransactionId');
  });
});
