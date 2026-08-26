import type { PaymentStatus } from './payment.types';

const ALLOWED_TRANSITIONS: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = {
  CREATED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SUCCEEDED', 'DECLINED', 'CANCELLED', 'UNKNOWN', 'FAILED'],
  SUCCEEDED: [],
  DECLINED: [],
  CANCELLED: [],
  UNKNOWN: ['RECONCILING', 'SUCCEEDED', 'DECLINED', 'CANCELLED', 'FAILED'],
  RECONCILING: ['SUCCEEDED', 'DECLINED', 'CANCELLED', 'FAILED'],
  FAILED: [],
};

export class InvalidPaymentStateTransitionError extends Error {
  constructor(from: PaymentStatus, to: PaymentStatus) {
    super(`Invalid payment status transition: ${from} -> ${to}`);
    this.name = 'InvalidPaymentStateTransitionError';
  }
}

export const canTransitionPaymentStatus = (
  from: PaymentStatus,
  to: PaymentStatus,
): boolean => ALLOWED_TRANSITIONS[from].includes(to);

export const assertPaymentStatusTransition = (
  from: PaymentStatus,
  to: PaymentStatus,
): void => {
  if (!canTransitionPaymentStatus(from, to)) {
    throw new InvalidPaymentStateTransitionError(from, to);
  }
};

export const isTerminalPaymentStatus = (status: PaymentStatus): boolean =>
  ALLOWED_TRANSITIONS[status].length === 0;
