/**
 * Payments-owned durable operational cases. This is not provider financial truth.
 * Other contexts coordinate their own side-effects after an approved action.
 */
export type PaymentExceptionAction =
  | 'SANDBOX_CONFIRM_UNPAID'
  | 'RELEASE_CONFIRMED_FAILURE'
  | 'INVESTIGATE_ONLY';

export type PaymentExceptionStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTING'
  | 'NEEDS_REVIEW'
  | 'COMPLETED';

export type PaymentExceptionMode = 'SANDBOX' | 'PRODUCTION';

export type PaymentExceptionCase = {
  caseStableId: string;
  attemptId: string;
  storeStableId: string;
  paymentTransactionId: string;
  externalPaymentId: string;
  amountCents: number;
  currency: string;
  action: PaymentExceptionAction;
  mode: PaymentExceptionMode;
  status: PaymentExceptionStatus;
  requestedByStableId: string;
  operatorNote: string;
  cloverOrderId: string | null;
  approvedByStableId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentExceptionOpenInput = Omit<
  PaymentExceptionCase,
  'caseStableId' | 'status' | 'approvedByStableId' | 'createdAt' | 'updatedAt'
> & {
  evidenceCode: string;
};

export type PaymentExceptionDecisionInput = {
  caseStableId: string;
  actorStableId: string;
  decision: 'APPROVED' | 'REJECTED';
  note: string;
};

export interface PaymentExceptionCaseRepository {
  open(input: PaymentExceptionOpenInput): Promise<PaymentExceptionCase>;
  get(caseStableId: string): Promise<PaymentExceptionCase | null>;
  findByAttempt(attemptId: string): Promise<PaymentExceptionCase | null>;
  list(storeStableId?: string): Promise<PaymentExceptionCase[]>;
  appendEvidence(
    caseStableId: string,
    source: string,
    resultCode: string,
    description: string,
  ): Promise<void>;
  decide(
    input: PaymentExceptionDecisionInput,
  ): Promise<PaymentExceptionCase | null>;
  claimExecution(caseStableId: string): Promise<'CLAIMED' | 'BUSY' | 'DONE'>;
  finishExecution(
    caseStableId: string,
    complete: boolean,
    failureCode?: string,
  ): Promise<void>;
}

export const PAYMENT_EXCEPTION_CASE_REPOSITORY = Symbol(
  'PAYMENT_EXCEPTION_CASE_REPOSITORY',
);
