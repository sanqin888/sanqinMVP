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

/** Operator assertion, not provider cancellation or settlement evidence. */
export type SandboxManualUnpaidDecision = {
  attemptId: string;
  paymentTransactionId: string;
  terminalId: string;
  storeStableId: string;
  externalPaymentId: string;
  actorUserStableId: string;
  cloverOrderId: string;
  operatorNote: string;
  originalResultCode: string;
  originalFailureCode: string;
  canonicalCheckedAt: Date;
  benefitsReleasedAt: Date | null;
  terminalFinalizedAt: Date | null;
  lateCanonicalAt: Date | null;
  lateProviderPaymentId: string | null;
};

export type SandboxManualUnpaidInput = Pick<
  SandboxManualUnpaidDecision,
  | 'attemptId'
  | 'paymentTransactionId'
  | 'terminalId'
  | 'storeStableId'
  | 'externalPaymentId'
  | 'actorUserStableId'
  | 'cloverOrderId'
  | 'operatorNote'
  | 'originalResultCode'
  | 'originalFailureCode'
  | 'canonicalCheckedAt'
>;

export interface PaymentTerminalOperationRepository {
  /** An existing unresolved owner blocks every other attempt, even after process restart. */
  reserve(
    terminalId: string,
    storeStableId: string,
    attemptId: string,
  ): Promise<boolean>;
  findByAttemptId(attemptId: string): Promise<TerminalOperation | null>;
  /** Single CAS transition before sending the provider Sale. */
  claimDispatch(
    attemptId: string,
    paymentTransactionId: string,
    externalPaymentId: string,
  ): Promise<boolean>;
  requestCancel(
    attemptId: string,
    storeStableId: string,
  ): Promise<TerminalCancelClaim>;
  acknowledgeCancel(attemptId: string): Promise<void>;
  /** Release the device fence only after financial finality and safe device recovery. */
  complete(attemptId: string): Promise<void>;
  getSandboxManualUnpaidDecision(
    attemptId: string,
  ): Promise<SandboxManualUnpaidDecision | null>;
  /** Atomic CAS: record immutable operator evidence, mark FAILED with an explicit
   * non-provider reason, and block the terminal in NEEDS_REVIEW. */
  claimSandboxManualUnpaid(
    input: SandboxManualUnpaidInput,
  ): Promise<'CLAIMED' | 'ALREADY_CLAIMED' | 'CONFLICT'>;
  checkpointSandboxBenefitsReleased(attemptId: string): Promise<void>;
  /** Records a late canonical success independently of the operator assertion. */
  noteSandboxLateCanonicalSuccess(
    attemptId: string,
    providerPaymentId: string | null,
  ): Promise<void>;
  /** Completes ONLY this audited Sandbox decision after owner RELEASE and idle. */
  finalizeSandboxManualUnpaid(attemptId: string): Promise<boolean>;
}

export const PAYMENT_TERMINAL_OPERATION_REPOSITORY = Symbol(
  'PAYMENT_TERMINAL_OPERATION_REPOSITORY',
);
