/** Durable device fence for POS terminal interactions; not a financial fact. */
export type TerminalOperationState =
  | 'RESERVED'
  | 'SALE_IN_FLIGHT'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_ACKED'
  | 'FINALIZED'
  | 'NEEDS_REVIEW';

export type TerminalOperation = {
  terminalId: string;
  storeStableId: string;
  attemptId: string;
  paymentTransactionId: string | null;
  externalPaymentId: string | null;
  state: TerminalOperationState;
  cancelRequestedAt: Date | null;
};

export type TerminalCancelClaim = {
  operation: TerminalOperation | null;
  sendDeviceCancel: boolean;
  requested: boolean;
};

export interface PaymentTerminalOperationRepository {
  /** An existing unresolved owner blocks every other attempt, even after process restart. */
  reserve(terminalId: string, storeStableId: string, attemptId: string): Promise<boolean>;
  findByAttemptId(attemptId: string): Promise<TerminalOperation | null>;
  /** Single CAS transition before sending the provider Sale. */
  claimDispatch(attemptId: string, paymentTransactionId: string, externalPaymentId: string): Promise<boolean>;
  requestCancel(attemptId: string, storeStableId: string): Promise<TerminalCancelClaim>;
  acknowledgeCancel(attemptId: string): Promise<void>;
  /** Release the device fence only after financial finality and safe device recovery. */
  complete(attemptId: string): Promise<void>;
}

export const PAYMENT_TERMINAL_OPERATION_REPOSITORY = Symbol(
  'PAYMENT_TERMINAL_OPERATION_REPOSITORY',
);
